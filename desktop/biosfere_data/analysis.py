"""Unmetered on-device BioCLIP 2 classification across the published TreeOfLife taxa."""
from __future__ import annotations

from datetime import datetime, timezone
import base64
from io import BytesIO
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
import urllib.error
import urllib.request

from .archive import open_photo, photo_gps

MODEL_REPO = "imageomics/bioclip-2"
MODEL_REVISION = "2957b322090f9cb17ae72c71981c7218a28d81e0"
TAXA_REPO = "imageomics/TreeOfLife-200M"
TAXA_REVISION = "5f2dc493b3dc0e544438a04038ab15faa646b749"
MODEL_NAME = "BioSfereBioCLIP2"
CACHE = Path(os.environ.get("BIOSFERE_CACHE_DIR") or Path.home() / ".cache" / "biosfere-data-maker")
RANK_KEYS = ("kingdom", "phylum", "className", "orderName", "family", "genus")


def draft_description(fields: dict, image_count: int):
    name = fields.get("species") or fields.get("genus") or "Canlı"
    family = fields.get("family")
    detail = (" " + family + " familyasıyla ilişkilendirilmiştir.") if family else ""
    return (str(image_count) + " fotoğraf birlikte değerlendirilerek " + name + " olası tür olarak önerildi." + detail
            + " Tür tayini, fotoğrafta görülen ayırt edici özelliklerle karşılaştırılarak kontrol edilebilir.")


class BioClipEngine:
    def __init__(self, progress=lambda text: None, device="auto"):
        import numpy as np
        import torch
        import open_clip
        from open_clip.factory import add_model_config
        from huggingface_hub import hf_hub_download
        CACHE.mkdir(parents=True, exist_ok=True)
        progress("BioCLIP 2 ve yayımlanmış takson vektörleri hazırlanıyor. İlk kullanımda büyük dosyalar indirilir…")
        self.progress = progress
        self.torch = torch
        self.np = np
        self.device = "mps" if device == "auto" and torch.backends.mps.is_available() else "cuda" if device == "auto" and torch.cuda.is_available() else "cpu" if device == "auto" else device
        def model_file(name):
            return hf_hub_download(MODEL_REPO, name, revision=MODEL_REVISION, cache_dir=str(CACHE / "huggingface"))
        configuration = json.loads(Path(model_file("open_clip_config.json")).read_text())
        config_directory = CACHE / "configs"
        config_directory.mkdir(exist_ok=True)
        config_path = config_directory / (MODEL_NAME + ".json")
        config_path.write_text(json.dumps(configuration["model_cfg"]))
        add_model_config(config_path)
        checkpoint = model_file("open_clip_model.safetensors")
        precision = "fp16" if self.device in ("mps", "cuda") else "fp32"
        progress("Görüntü modeli " + self.device.upper() + " üzerinde açılıyor…")
        model = open_clip.create_model(MODEL_NAME, pretrained=checkpoint, precision=precision, device="cpu")
        self.visual = model.visual.eval().to(self.device)
        self.dtype = self.visual.conv1.weight.dtype
        self.scale = float(model.logit_scale.detach().float().exp().cpu())
        del model
        # The upstream pybioclip TreeOfLife classifier uses full-frame 224 x 224 preprocessing.
        from torchvision import transforms
        self.preprocess = transforms.Compose([transforms.ToTensor(), transforms.Resize((224, 224), antialias=True),
            transforms.Normalize((.48145466, .4578275, .40821073), (.26862954, .26130258, .27577711))])
        progress("Taksonların arama vektörleri hazırlanıyor…")
        vectors = hf_hub_download(TAXA_REPO, "embeddings/txt_emb_bioclip-2.npy", repo_type="dataset", revision=TAXA_REVISION, cache_dir=str(CACHE / "huggingface"))
        self.embeddings = np.load(vectors, mmap_mode="r", allow_pickle=False)
        names_file = hf_hub_download(TAXA_REPO, "embeddings/txt_emb_bioclip-2.json", repo_type="dataset", revision=TAXA_REVISION, cache_dir=str(CACHE / "huggingface"))
        database = CACHE / ("taxa-" + TAXA_REVISION[:12] + ".sqlite")
        if not database.exists():
            self._build_names(names_file, database)
        self.names = sqlite3.connect(database)
        self.names.row_factory = sqlite3.Row
        self.count = self.names.execute("SELECT count(*) FROM names").fetchone()[0]
        if self.count not in self.embeddings.shape:
            raise ValueError("Modelin takson adlarıyla vektör sayısı uyuşmuyor.")
        progress(str(self.count) + " takson hazır.")

    def _build_names(self, source, destination):
        import ijson
        temporary = destination.with_suffix(".building.sqlite")
        temporary.unlink(missing_ok=True)
        db = sqlite3.connect(temporary)
        try:
            db.execute("CREATE TABLE names(id INTEGER PRIMARY KEY,kingdom TEXT,phylum TEXT,className TEXT,orderName TEXT,family TEXT,genus TEXT,species TEXT,commonName TEXT)")
            batch = []
            with open(source, "rb") as stream:
                for index, row in enumerate(ijson.items(stream, "item")):
                    scientific, common = row
                    if len(scientific) < 7:
                        raise ValueError("Takson adı dosyasının biçimi geçersiz.")
                    ranks = [str(part or "").strip() for part in scientific]
                    species = (ranks[-2] + " " + ranks[-1]).strip()
                    batch.append((index, *ranks[:6], species, str(common or "")))
                    if len(batch) == 1000:
                        db.executemany("INSERT INTO names VALUES(?,?,?,?,?,?,?,?,?)", batch)
                        batch.clear()
            db.executemany("INSERT INTO names VALUES(?,?,?,?,?,?,?,?,?)", batch)
            db.commit()
        finally:
            db.close()
        temporary.replace(destination)

    def analyze(self, paths: list[str], cancelled=lambda: False):
        np, torch = self.np, self.torch
        features = []
        gps = None
        for index, path in enumerate(paths, 1):
            if cancelled():
                raise InterruptedError("Analiz durduruldu.")
            self.progress("Gruptaki fotoğraf " + str(index) + " / " + str(len(paths)) + " inceleniyor…")
            image = open_photo(path)
            try:
                image = image.convert("RGB")
                tensor = self.preprocess(image).unsqueeze(0).to(device=self.device, dtype=self.dtype)
                with torch.inference_mode():
                    feature = self.visual(tensor).float()
                    feature = feature / feature.norm(dim=-1, keepdim=True).clamp_min(1e-12)
                    features.append(feature[0].cpu().numpy())
            finally:
                image.close()
            if gps is None:
                gps = photo_gps(path)
        if not features:
            raise ValueError("Analiz için fotoğraf seçilmedi.")
        image_feature = np.mean(features, axis=0).astype(np.float32)
        image_feature /= max(float(np.linalg.norm(image_feature)), 1e-12)
        logits = np.empty(self.count, dtype=np.float32)
        for start in range(0, self.count, 8192):
            if cancelled():
                raise InterruptedError("Analiz durduruldu.")
            end = min(self.count, start + 8192)
            block = self.embeddings[:, start:end] if self.embeddings.shape[1] == self.count else self.embeddings[start:end].T
            logits[start:end] = (image_feature @ np.asarray(block, dtype=np.float32)) * self.scale
        maximum = float(logits.max())
        probabilities = np.exp(logits - maximum)
        probabilities /= probabilities.sum()
        top = np.argsort(probabilities)[-5:][::-1]
        candidates = []
        for index in top:
            row = self.names.execute("SELECT * FROM names WHERE id=?", (int(index),)).fetchone()
            record = dict(row)
            record.pop("id")
            # Vernacular names in the model are not consistently Turkish. Keep them with the provenance.
            common = record.pop("commonName")
            record["commonName"] = ""
            candidates.append({"fields": record, "score": float(probabilities[index]), "modelCommonName": common})
        best = dict(candidates[0]["fields"])
        best["description"] = draft_description(best, len(paths))
        if gps is not None:
            best.update(lat=str(gps[0]), lng=str(gps[1]))
        return {"fields": best, "analysis": {"model": MODEL_REPO, "modelRevision": MODEL_REVISION, "taxaRevision": TAXA_REVISION,
                "taxaCount": self.count, "photoCount": len(paths), "method": "normalized-mean-image-embeddings", "candidates": candidates,
                "reviewed": False, "analyzedAt": datetime.now(timezone.utc).isoformat(), "gpsFromPhoto": gps is not None}}

    def close(self):
        if getattr(self, "names", None):
            self.names.close()
        if getattr(self, "visual", None) is not None:
            del self.visual
        if self.device == "mps":
            self.torch.mps.empty_cache()
        elif self.device == "cuda":
            self.torch.cuda.empty_cache()


def ollama_description(paths, fields, model="qwen3-vl:2b", cancelled=lambda: False):
    notes = []
    for start in range(0, len(paths), 4):
        if cancelled():
            raise InterruptedError("Analiz durduruldu.")
        pictures = []
        for path in paths[start:start + 4]:
            image = open_photo(path).convert("RGB")
            try:
                image.thumbnail((640, 640))
                output = BytesIO()
                image.save(output, "JPEG", quality=85)
                pictures.append(base64.b64encode(output.getvalue()).decode())
            finally:
                image.close()
        prompt = ("Aynı canlıya ait bu fotoğraflar için Türkçe, en fazla 100 kelimelik biyolojik gözlem notu yaz. "
                  "Yalnızca fotoğraflarda görülen özellikleri anlat. Coğrafi konum, boyut ölçüsü ve habitat bilgisi uydurma. "
                  "Sınıflandırıcı aday türü " + fields.get("species", "") + ". Tür adını kesin teşhis gibi sunma. "
                  "Cevapta sadece düzenlenebilir gözlem notu olsun.")
        payload = {"model": model, "stream": False, "messages": [{"role": "user", "content": prompt, "images": pictures}],
                   "options": {"temperature": .1, "num_predict": 300}, "keep_alive": 0}
        request = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
        text = result.get("message", {}).get("content", "").strip()
        if text:
            notes.append(text)
    if not notes:
        raise ValueError("Yerel açıklama modeli boş yanıt verdi.")
    return "\n\n".join(notes)[:5000]


def prepare_ollama_model(model="qwen3-vl:2b", progress=lambda text: None):
    request = urllib.request.Request("http://127.0.0.1:11434/api/pull", data=json.dumps({"model": model, "stream": True}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:
        for line in response:
            row = json.loads(line)
            if row.get("error"):
                raise ValueError(row["error"])
            progress(row.get("status", "Model hazırlanıyor…"))
