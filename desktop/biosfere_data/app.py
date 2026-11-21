"""Tkinter photo grouping, local identification, review and BioSfere ZIP export."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from .archive import RANKS, open_photo, record_for_group, write_archive

COLORS = ("#ccebd9", "#d7e4ff", "#ffe3c2", "#ead9ff", "#ffdbe8", "#c5eeee")
LABELS = {"kingdom": "Âlem", "phylum": "Şube / bölüm", "className": "Sınıf", "orderName": "Takım",
          "family": "Familya", "genus": "Cins", "species": "Tür (bilimsel)", "commonName": "Türkçe ad",
          "city": "İl / bölge", "locality": "Yer / habitat", "lat": "Enlem", "lng": "Boylam",
          "createdAt": "Tarih (ISO 8601)", "username": "Kaynak kullanıcı adı"}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("BioSfere · Veri Atölyesi")
        self.geometry("1320x870")
        self.minsize(1050, 720)
        self.photos = []
        self.groups = []
        self.selected = set()
        self.tiles = {}
        self.images = {}
        self.current = None
        self.last_clicked = None
        self.columns = 4
        self.events = queue.Queue()
        self.cancelled = threading.Event()
        self.busy = False
        self.inputs = {key: tk.StringVar() for key in LABELS}
        self.use_description = tk.BooleanVar(value=False)
        self.analysis_mode = tk.StringVar(value="Çevrim içi BioCLIP 2")
        self.status = tk.StringVar(value="Fotoğrafları ekleyin. Aynı canlıya ait kareleri seçip bir gönderi oluşturun.")
        self._build()
        self.after(80, self._poll)
        self.protocol("WM_DELETE_WINDOW", self._quit)

    def _build(self):
        toolbar = ttk.Frame(self, padding=10)
        toolbar.pack(fill="x")
        for label, command in (("Fotoğraf ekle", self.add_photos), ("Projeyi aç", self.open_project),
                               ("Projeyi kaydet", self.save_project), ("Analiz et", self.analyze),
                               ("Durdur", self.cancelled.set), ("ZIP dışa aktar", self.export)):
            ttk.Button(toolbar, text=label, command=command).pack(side="left", padx=3)
        options = ttk.Frame(self, padding=(10, 0, 10, 8))
        options.pack(fill="x")
        ttk.Label(options, text="Analiz yöntemi:").pack(side="left", padx=4)
        ttk.Combobox(options, textvariable=self.analysis_mode, state="readonly", width=34, values=("Çevrim içi BioCLIP 2", "200M+ görselde ara", "Yerel BioCLIP 2 (isteğe bağlı)")).pack(side="left", padx=4)
        ttk.Checkbutton(options, text="Yerel yapay zekâyla açıklama (isteğe bağlı)", variable=self.use_description).pack(side="left", padx=8)
        ttk.Button(options, text="Açıklama modelini hazırla", command=self.install_description).pack(side="left")
        ttk.Label(self, text="Çevrim içi mod büyük model indirmez; konum bilgisi içermeyen görüntü kopyalarını Imageomics/Hugging Face'e gönderir. Ortak serviste sıra veya erişim sınırı olabilir.", wraplength=1250, padding=(14, 0, 10, 8)).pack(anchor="w")

        pane = ttk.Panedwindow(self, orient="horizontal")
        pane.pack(fill="both", expand=True, padx=10)
        left = ttk.Frame(pane)
        right = ttk.Frame(pane)
        pane.add(left, weight=3)
        pane.add(right, weight=2)
        groupbar = ttk.Frame(left)
        groupbar.pack(fill="x", pady=5)
        ttk.Button(groupbar, text="Seçileni yeni gönderi yap", command=self.new_group).pack(side="left")
        ttk.Button(groupbar, text="Seçileni açık gönderiye ekle", command=self.add_to_group).pack(side="left", padx=4)
        ttk.Button(groupbar, text="Seçimi temizle", command=self.clear_selection).pack(side="left")
        ttk.Label(left, text="Tıklayarak seçin; Shift ile aralık seçin. Yeşil çerçeve: seçili. Renkli zemin: aynı gönderi.").pack(anchor="w", pady=4)
        gallery = ttk.Frame(left)
        gallery.pack(fill="both", expand=True)
        self.canvas = tk.Canvas(gallery, background="#f5f6f8", highlightthickness=0)
        scroll = ttk.Scrollbar(gallery, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.grid_frame = ttk.Frame(self.canvas)
        self.gallery_window = self.canvas.create_window((0, 0), window=self.grid_frame, anchor="nw")
        self.grid_frame.bind("<Configure>", lambda _: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", self.resize_gallery)
        self.canvas.bind("<MouseWheel>", lambda event: self.canvas.yview_scroll(-1 if event.delta > 0 else 1, "units"))

        self.tree = ttk.Treeview(right, columns=("photos", "species", "state"), show="tree headings", height=6)
        for key, label, width in (("#0", "Gönderi", 70), ("photos", "Foto", 45), ("species", "Tür önerisi", 200), ("state", "Durum", 100)):
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, stretch=key in ("species", "state"))
        self.tree.pack(fill="x")
        self.tree.bind("<<TreeviewSelect>>", self.select_group)
        actions = ttk.Frame(right)
        actions.pack(fill="x", pady=4)
        ttk.Button(actions, text="Gönderi grubunu kaldır", command=self.remove_group).pack(side="left")
        ttk.Button(actions, text="Bu konumu tüm gruplara uygula", command=self.copy_location).pack(side="left", padx=4)

        form_host = ttk.Frame(right)
        form_host.pack(fill="both", expand=True)
        form_canvas = tk.Canvas(form_host, highlightthickness=0)
        form_scroll = ttk.Scrollbar(form_host, orient="vertical", command=form_canvas.yview)
        form_canvas.configure(yscrollcommand=form_scroll.set)
        form_scroll.pack(side="right", fill="y")
        form_canvas.pack(side="left", fill="both", expand=True)
        form = ttk.Frame(form_canvas)
        form_window = form_canvas.create_window((0, 0), window=form, anchor="nw")
        form.bind("<Configure>", lambda _: form_canvas.configure(scrollregion=form_canvas.bbox("all")))
        form_canvas.bind("<Configure>", lambda event: form_canvas.itemconfigure(form_window, width=event.width))
        form_canvas.bind("<MouseWheel>", lambda event: form_canvas.yview_scroll(-1 if event.delta > 0 else 1, "units"))
        self.entries = {}
        for index, (key, label) in enumerate(LABELS.items()):
            row, col = divmod(index, 2)
            ttk.Label(form, text=label).grid(row=row * 2, column=col, sticky="w", padx=4, pady=(5, 0))
            entry = ttk.Entry(form, textvariable=self.inputs[key])
            entry.grid(row=row * 2 + 1, column=col, sticky="ew", padx=4)
            self.entries[key] = entry
        form.columnconfigure(0, weight=1)
        form.columnconfigure(1, weight=1)
        ttk.Button(form, text="Haritadan konum seç", command=self.map_location).grid(row=14, column=0, sticky="ew", padx=4, pady=7)
        ttk.Button(form, text="Değişiklikleri kaydet", command=lambda: self.save_form(reviewed=True)).grid(row=14, column=1, sticky="ew", padx=4)
        ttk.Label(form, text="Adaylar (puan, kesinlik oranı değildir)").grid(row=15, column=0, columnspan=2, sticky="w", padx=4)
        candidates = ttk.Frame(form)
        candidates.grid(row=16, column=0, columnspan=2, sticky="ew", padx=4)
        self.candidates = ttk.Combobox(candidates, state="readonly")
        self.candidates.pack(side="left", fill="x", expand=True)
        ttk.Button(candidates, text="Adayı uygula", command=self.apply_candidate).pack(side="right", padx=4)
        ttk.Label(form, text="Açıklama · düzenlenebilir").grid(row=17, column=0, columnspan=2, sticky="w", padx=4, pady=(7, 0))
        self.description = tk.Text(form, height=6, wrap="word", font=("Arial", 12))
        self.description.grid(row=18, column=0, columnspan=2, sticky="nsew", padx=4)
        form.rowconfigure(18, weight=1)
        ttk.Label(self, textvariable=self.status, wraplength=1250, padding=10).pack(fill="x")
        self.progress = ttk.Progressbar(self, mode="indeterminate")
        self.progress.pack(fill="x", padx=10, pady=(0, 8))

    def available(self):
        if self.busy:
            messagebox.showinfo("İşlem sürüyor", "Çalışan işlemin bitmesini bekleyin veya Durdur'a basın.")
            return False
        return True

    def add_photos(self):
        if not self.available():
            return
        paths = filedialog.askopenfilenames(title="Canlı fotoğraflarını seçin", filetypes=[("Fotoğraflar", "*.jpg *.jpeg *.png *.webp *.heic *.heif *.tif *.tiff *.bmp *.avif"), ("Tüm dosyalar", "*")])
        self._add_paths(paths)

    def _add_paths(self, paths):
        fresh = [str(Path(path).resolve()) for path in paths if str(Path(path).resolve()) not in self.photos]
        self.photos.extend(fresh)
        # File decoding happens on a worker; Tk objects are created only in _poll.
        def thumbnails():
            for path in fresh:
                try:
                    image = open_photo(path)
                    image.thumbnail((138, 108))
                    self.events.put(("thumbnail", path, image))
                except Exception as error:
                    self.events.put(("thumbnail_error", path, str(error)))
        threading.Thread(target=thumbnails, daemon=True).start()

    def _tile(self, path, image):
        from PIL import ImageTk
        index = self.photos.index(path)
        frame = tk.Frame(self.grid_frame, width=158, height=154, borderwidth=3, relief="solid", background="white")
        frame.grid(row=index // self.columns, column=index % self.columns, padx=4, pady=4)
        frame.grid_propagate(False)
        picture = ImageTk.PhotoImage(image)
        image.close()
        self.images[path] = picture
        label = tk.Label(frame, image=picture, background="white")
        label.pack(fill="both", expand=True)
        caption = tk.Label(frame, text=str(index + 1) + " · " + Path(path).name[:19], background="white", font=("Arial", 10))
        caption.pack()
        for widget in (frame, label, caption):
            widget.bind("<Button-1>", lambda event, p=path: self.toggle_photo(p, bool(event.state & 1)))
        self.tiles[path] = (frame, label, caption)
        self.refresh_tiles()

    def resize_gallery(self, event):
        self.columns = max(1, event.width // 174)
        self.canvas.itemconfigure(self.gallery_window, width=event.width)
        for path, widgets in self.tiles.items():
            index = self.photos.index(path)
            widgets[0].grid(row=index // self.columns, column=index % self.columns, padx=4, pady=4)

    def toggle_photo(self, path, shift=False):
        if self.busy:
            return
        if shift and self.last_clicked in self.photos:
            first, last = sorted((self.photos.index(self.last_clicked), self.photos.index(path)))
            self.selected.update(self.photos[first:last + 1])
        elif path in self.selected:
            self.selected.remove(path)
        else:
            self.selected.add(path)
        self.last_clicked = path
        self.refresh_tiles()

    def refresh_tiles(self):
        assignments = {path: index for index, group in enumerate(self.groups) for path in group["paths"]}
        for path, widgets in self.tiles.items():
            color = COLORS[assignments[path] % len(COLORS)] if path in assignments else "white"
            for widget in widgets:
                widget.configure(background=color)
            widgets[0].configure(highlightthickness=3, highlightbackground="#0a9f50" if path in self.selected else color)

    def clear_selection(self):
        self.selected.clear()
        self.refresh_tiles()

    def _move_photos(self, target):
        for group in self.groups:
            if group is not target:
                group["paths"] = [path for path in group["paths"] if path not in self.selected]
        target["paths"] = list(dict.fromkeys(target["paths"] + [path for path in self.photos if path in self.selected]))
        self.groups = [group for group in self.groups if group["paths"]]
        self.current = self.groups.index(target)
        self.clear_selection()
        self.refresh_groups()

    def new_group(self):
        if not self.available() or not self.selected:
            return
        self.save_form()
        group = {"paths": [], "fields": {"createdAt": datetime.now(timezone.utc).isoformat()}, "analysis": {}}
        self.groups.append(group)
        self._move_photos(group)
        self.load_form()

    def add_to_group(self):
        if not self.available() or self.current is None or not self.selected:
            return
        self.save_form()
        self._move_photos(self.groups[self.current])

    def remove_group(self):
        if self.available() and self.current is not None:
            del self.groups[self.current]
            self.current = 0 if self.groups else None
            self.refresh_groups()
            self.refresh_tiles()
            self.load_form()

    def refresh_groups(self):
        self.tree.delete(*self.tree.get_children())
        for index, group in enumerate(self.groups):
            analysis = group.get("analysis", {})
            state = "Kontrol edildi" if analysis.get("reviewed") else "Öneri hazır" if analysis.get("candidates") else group.get("error", "Bekliyor")
            self.tree.insert("", "end", iid=str(index), text=str(index + 1), values=(len(group["paths"]), group["fields"].get("species", ""), state))
        if self.current is not None:
            self.tree.selection_set(str(self.current))

    def select_group(self, _=None):
        selection = self.tree.selection()
        if not selection:
            return
        target = int(selection[0])
        if target == self.current:
            return
        self.save_form()
        self.current = target
        self.load_form()

    def save_form(self, reviewed=False):
        if self.busy or self.current is None or self.current >= len(self.groups):
            return
        group = self.groups[self.current]
        group["fields"].update({key: variable.get().strip() for key, variable in self.inputs.items()})
        group["fields"]["description"] = self.description.get("1.0", "end-1c").strip()
        if reviewed:
            group.setdefault("analysis", {})["reviewed"] = True
            self.refresh_groups()
            self.status.set("Gönderi " + str(self.current + 1) + " değişiklikleri kaydedildi.")

    def load_form(self):
        group = self.groups[self.current] if self.current is not None else {"fields": {}}
        for key, variable in self.inputs.items():
            variable.set(str(group["fields"].get(key, "")))
        self.description.configure(state="normal")
        self.description.delete("1.0", "end")
        self.description.insert("1.0", group["fields"].get("description", ""))
        self.description.configure(state="disabled" if self.busy else "normal")
        candidates = group.get("analysis", {}).get("candidates", [])
        self.candidates["values"] = [candidate["fields"]["species"] + " · puan " + format(candidate["score"], ".4f") for candidate in candidates]
        self.candidates.set("")
        if candidates:
            self.candidates.current(0)

    def apply_candidate(self):
        if not self.available() or self.current is None or self.candidates.current() < 0:
            return
        candidate = self.groups[self.current]["analysis"]["candidates"][self.candidates.current()]
        for key in RANKS:
            self.inputs[key].set(candidate["fields"].get(key, ""))
        self.save_form(reviewed=True)

    def copy_location(self):
        if not self.available() or self.current is None:
            return
        self.save_form()
        fields = self.groups[self.current]["fields"]
        for group in self.groups:
            group["fields"].update({key: fields.get(key, "") for key in ("lat", "lng", "city", "locality")})
        self.status.set("Açık gönderinin konumu tüm gruplara uygulandı.")

    def map_location(self):
        if not self.available() or self.current is None:
            return
        import tkintermapview
        window = tk.Toplevel(self)
        window.title("Haritada sağ tıklayıp Gözlem konumunu seç seçeneğine basın")
        window.geometry("850x600")
        widget = tkintermapview.TkinterMapView(window, corner_radius=0)
        widget.pack(fill="both", expand=True)
        try:
            latitude, longitude = float(self.inputs["lat"].get()), float(self.inputs["lng"].get())
        except ValueError:
            latitude, longitude = 39.0, 35.0
        widget.set_position(latitude, longitude)
        widget.set_zoom(6)
        ttk.Label(window, text="© OpenStreetMap katkıcıları · Konum tahmin edilmez; doğru gözlem yerini seçin.").pack()
        def choose(position):
            self.inputs["lat"].set(format(position[0], ".7f"))
            self.inputs["lng"].set(format(position[1], ".7f"))
            self.save_form()
            window.destroy()
        widget.add_right_click_menu_command(label="Gözlem konumunu seç", command=choose, pass_coords=True)

    def _start(self, operation):
        self.busy = True
        for entry in self.entries.values():
            entry.configure(state="disabled")
        self.description.configure(state="disabled")
        self.cancelled.clear()
        self.progress.start(12)
        threading.Thread(target=operation, daemon=True).start()

    def analyze(self):
        if not self.available() or not self.groups:
            return
        self.save_form()
        descriptions = self.use_description.get()
        analysis_mode = self.analysis_mode.get()
        def worker():
            engine = None
            try:
                from .analysis import BioClipEngine, ollama_description
                progress = lambda text: self.events.put(("status", text))
                if analysis_mode.startswith("Yerel"):
                    try:
                        import torch
                    except ImportError as error:
                        raise ImportError("Yerel mod için requirements-local.txt bağımlılıklarını kurun veya çevrim içi modu seçin.") from error
                    engine = BioClipEngine(progress=progress)
                else:
                    from .remote_analysis import RemoteEngine
                    engine = RemoteEngine(progress=progress, mode="database" if analysis_mode.startswith("200M") else "online")
                for index, group in enumerate(self.groups):
                    if self.cancelled.is_set():
                        raise InterruptedError("Analiz durduruldu. Tamamlanan sonuçlar korundu.")
                    self.events.put(("status", "Gönderi " + str(index + 1) + " / " + str(len(self.groups)) + " analiz ediliyor…"))
                    try:
                        result = engine.analyze(group["paths"], self.cancelled.is_set)
                        self.events.put(("result", index, result))
                        # Descriptions below need classification fields before the UI queue is drained.
                        group["fields"].update(result["fields"])
                        group["analysis"] = result["analysis"]
                    except InterruptedError:
                        raise
                    except Exception as error:
                        self.events.put(("group_error", index, str(error)))
                        if not analysis_mode.startswith("Yerel"):
                            raise
                engine.close()
                engine = None
                if descriptions:
                    for index, group in enumerate(self.groups):
                        if self.cancelled.is_set():
                            raise InterruptedError("Açıklama üretimi durduruldu.")
                        self.events.put(("status", "Gönderi " + str(index + 1) + ": yerel açıklama modeli çalışıyor…"))
                        try:
                            text = ollama_description(group["paths"], group["fields"], cancelled=self.cancelled.is_set)
                            self.events.put(("description", index, text))
                        except InterruptedError:
                            raise
                        except Exception as error:
                            self.events.put(("status", "Açıklama modeli kullanılamadı; tür önerisi korundu. " + str(error)))
                            break
                self.events.put(("done", "Analiz tamamlandı. Her gönderinin türünü ve konumunu kontrol edin; ardından ZIP dışa aktarın."))
            except Exception as error:
                self.events.put(("failed", str(error)))
            finally:
                if engine is not None:
                    engine.close()
        self._start(worker)

    def install_description(self):
        if not self.available():
            return
        def worker():
            try:
                from .analysis import prepare_ollama_model
                prepare_ollama_model(progress=lambda text: self.events.put(("status", text)))
                self.events.put(("done", "Yerel açıklama modeli hazır. Analizde açıklama kutusunu işaretleyebilirsiniz."))
            except Exception as error:
                self.events.put(("failed", "Ollama uygulamasını açıp tekrar deneyin. " + str(error)))
        self._start(worker)

    def export(self):
        if not self.available():
            return
        self.save_form(reviewed=True)
        try:
            for index, group in enumerate(self.groups, 1):
                record_for_group(group, index)
        except ValueError as error:
            messagebox.showerror("Veriyi tamamlayın", str(error))
            return
        path = filedialog.asksaveasfilename(title="BioSfere ZIP verisi", defaultextension=".zip", initialfile="biosfere-veri.zip", filetypes=[("ZIP", "*.zip")])
        if not path:
            return
        def worker():
            try:
                count = write_archive(self.groups, path, progress=lambda text: self.events.put(("status", text)), cancelled=self.cancelled.is_set)
                self.events.put(("done", str(count) + " gönderi ZIP olarak kaydedildi: " + path))
            except Exception as error:
                self.events.put(("failed", str(error)))
        self._start(worker)

    def save_project(self):
        if not self.available():
            return
        self.save_form()
        path = filedialog.asksaveasfilename(defaultextension=".json", initialfile="biosfere-proje.json", filetypes=[("Proje JSON", "*.json")])
        if path:
            Path(path).write_text(json.dumps({"format": "biosfere-workshop-project", "version": 1, "groups": self.groups, "photos": self.photos}, ensure_ascii=False, indent=2), encoding="utf-8")
            self.status.set("Proje kaydedildi. Fotoğrafların özgün dosyalarını yerinde tutun.")

    def open_project(self):
        if not self.available():
            return
        path = filedialog.askopenfilename(filetypes=[("Proje JSON", "*.json")])
        if not path:
            return
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            if data.get("format") != "biosfere-workshop-project" or data.get("version") != 1 or not isinstance(data.get("groups"), list):
                raise ValueError("Bu dosya bir BioSfere Atölye projesi değil.")
            paths = data.get("photos", [])
            if any(not Path(photo).is_file() for photo in paths):
                raise ValueError("Bazı fotoğraf dosyaları taşınmış veya silinmiş. Özgün dosyaları eski konumuna getirin.")
            for group in data["groups"]:
                if not isinstance(group.get("fields"), dict) or not group.get("paths") or any(photo not in paths for photo in group["paths"]):
                    raise ValueError("Proje grupları geçersiz.")
            self.current = None
            self.groups = data["groups"]
            self.photos = []
            self.tiles.clear()
            self.images.clear()
            self.selected.clear()
            for widget in self.grid_frame.winfo_children():
                widget.destroy()
            self._add_paths(paths)
            self.current = 0 if self.groups else None
            self.refresh_groups()
            self.load_form()
        except Exception as error:
            messagebox.showerror("Proje açılamadı", str(error))

    def _poll(self):
        try:
            for _ in range(30):
                event = self.events.get_nowait()
                kind = event[0]
                if kind == "thumbnail":
                    if event[1] in self.photos:
                        self._tile(event[1], event[2])
                elif kind == "thumbnail_error":
                    self.status.set("Fotoğraf açılamadı: " + Path(event[1]).name + " · " + event[2])
                elif kind == "status":
                    self.status.set(event[1])
                elif kind == "result":
                    group = self.groups[event[1]]
                    group["fields"].update(event[2]["fields"])
                    group["analysis"] = event[2]["analysis"]
                    group.pop("error", None)
                    self.refresh_groups()
                    if self.current == event[1]:
                        self.load_form()
                elif kind == "description":
                    self.groups[event[1]]["fields"]["description"] = event[2]
                    self.groups[event[1]].setdefault("analysis", {})["descriptionModel"] = "qwen3-vl:2b"
                    if self.current == event[1]:
                        self.load_form()
                elif kind == "group_error":
                    self.groups[event[1]]["error"] = "Hata"
                    self.status.set("Gönderi " + str(event[1] + 1) + ": " + event[2])
                    self.refresh_groups()
                elif kind in ("done", "failed"):
                    self.busy = False
                    for entry in self.entries.values():
                        entry.configure(state="normal")
                    self.description.configure(state="normal")
                    self.load_form()
                    self.progress.stop()
                    self.status.set(event[1])
                    if kind == "failed":
                        messagebox.showerror("İşlem tamamlanamadı", event[1])
        except queue.Empty:
            pass
        self.after(80, self._poll)

    def _quit(self):
        self.cancelled.set()
        self.destroy()


def main():
    App().mainloop()
