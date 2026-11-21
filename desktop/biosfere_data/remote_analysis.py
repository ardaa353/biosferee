"""Public BioCLIP inference and 200M+ image search; no local model downloads."""
from __future__ import annotations

import csv
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
import tempfile
import time
from urllib.parse import urlparse

from .archive import open_photo, photo_gps
from .analysis import draft_description

CLASSIFIER = "https://imageomics-bioclip-2-demo.hf.space"
DATABASE = "https://imageomics-bioclip-image-search-lite.hf.space"
RANKS = ("kingdom", "phylum", "className", "orderName", "family", "genus")


def parse_label(label):
    scientific = label.split(" (")[0].strip().split()
    if len(scientific) != 7:
        raise ValueError("Çevrim içi servis sistematik adlarını beklenen biçimde döndürmedi.")
    result = dict(zip(RANKS, scientific[:6]))
    result.update(species=scientific[-2] + " " + scientific[-1], commonName="")
    return result


def combine(rows):
    totals = {}
    for row in rows:
        best = {}
        for candidate in row:
            species = candidate["fields"].get("species", "")
            if species and candidate["score"] > best.get(species, {}).get("score", -1):
                best[species] = candidate
        for species, candidate in best.items():
            totals[species] = {**candidate, "score": totals.get(species, {}).get("score", 0) + candidate["score"]}
    return sorted(({**item, "score": item["score"] / max(1, len(rows))} for item in totals.values()), key=lambda item: item["score"], reverse=True)[:5]


class RemoteEngine:
    def __init__(self, progress=lambda text: None, mode="online"):
        from gradio_client import Client
        self.mode = mode
        self.host = DATABASE if mode == "database" else CLASSIFIER
        self.progress = progress
        progress("Çevrim içi BioCLIP servisine bağlanılıyor. Büyük model indirilmez…")
        self.client = Client(self.host, verbose=False, download_files=False, httpx_kwargs={"timeout": 60})

    def _call(self, *args, endpoint, cancelled):
        if cancelled():
            raise InterruptedError("Analiz durduruldu.")
        job = self.client.submit(*args, api_name=endpoint)
        started = time.monotonic()
        try:
            while not job.done():
                if cancelled():
                    raise InterruptedError("Analiz durduruldu.")
                if time.monotonic() - started > 180:
                    raise TimeoutError("Ortak çevrim içi servis zamanında yanıt vermedi. Daha sonra yeniden deneyin.")
                time.sleep(.15)
            return job.result()
        except BaseException:
            job.cancel()
            raise

    def analyze(self, paths, cancelled=lambda: False):
        from gradio_client import handle_file
        import httpx
        rows, references = [], []
        gps = None
        for index, path in enumerate(paths, 1):
            if cancelled():
                raise InterruptedError("Analiz durduruldu.")
            self.progress("Fotoğraf " + str(index) + " / " + str(len(paths)) + " çevrim içi inceleniyor…")
            with tempfile.TemporaryDirectory(prefix="biosfere-query-") as folder:
                prepared = Path(folder) / "query.jpg"
                image = open_photo(path).convert("RGB")
                try:
                    image.thumbnail((1024, 1024))
                    # Only pixels are sent; EXIF coordinates and camera metadata stay local.
                    image.save(prepared, "JPEG", quality=90)
                finally:
                    image.close()
                if self.mode == "database":
                    self._call(handle_file(str(prepared)), 10, 16, "All Sources", endpoint="/search", cancelled=cancelled)
                    exported = self._call(endpoint="/_prepare_export", cancelled=cancelled)
                    if isinstance(exported, dict):
                        exported = exported.get("value", exported)
                    link = exported.get("url") or exported.get("path") if isinstance(exported, dict) else exported
                    if isinstance(link, str) and link.startswith("/"):
                        link = self.host + "/gradio_api/file=" + link
                    if not isinstance(link, str) or urlparse(link).scheme != "https" or urlparse(link).netloc != urlparse(self.host).netloc:
                        raise ValueError("Görsel veritabanının sonuç dosyası alınamadı.")
                    response = httpx.get(link, timeout=60)
                    response.raise_for_status()
                    entries = list(csv.DictReader(StringIO(response.content.decode("utf-8-sig"))))
                    candidates = []
                    for position, entry in enumerate(entries):
                        fields = {"kingdom": entry.get("kingdom", ""), "phylum": entry.get("phylum", ""), "className": entry.get("class", ""), "orderName": entry.get("order", ""), "family": entry.get("family", ""), "genus": entry.get("genus", ""), "species": entry.get("species", ""), "commonName": ""}
                        if " " not in fields["species"]:
                            fields["species"] = (fields["genus"] + " " + fields["species"]).strip()
                        candidates.append({"fields": fields, "score": 1 / (position + 1), "modelCommonName": entry.get("common_name", "")})
                        if entry.get("image_url", "").startswith("https://"):
                            references.append({"species": fields["species"], "url": entry["image_url"], "source": entry.get("source_dataset", "TreeOfLife")})
                else:
                    output = self._call(handle_file(str(prepared)), "Species", endpoint="/lambda", cancelled=cancelled)
                    label = output[0] if isinstance(output, (tuple, list)) else output
                    candidates = []
                    for candidate in label.get("confidences", []):
                        try:
                            candidates.append({"fields": parse_label(candidate["label"]), "score": float(candidate["confidence"]), "modelCommonName": candidate["label"].split(" (", 1)[-1].removesuffix(")") if " (" in candidate["label"] else ""})
                        except (ValueError, KeyError, TypeError):
                            continue
                if not candidates:
                    raise ValueError("Çevrim içi servis tür adayı döndürmedi.")
                rows.append(candidates)
            if gps is None:
                gps = photo_gps(path)
        candidates = combine(rows)
        if not candidates:
            raise ValueError("Analiz için fotoğraf seçilmedi.")
        fields = dict(candidates[0]["fields"])
        fields["description"] = draft_description(fields, len(paths))
        if gps is not None:
            fields.update(lat=str(gps[0]), lng=str(gps[1]))
        return {"fields": fields, "analysis": {"model": self.host, "mode": self.mode, "method": "mean-photo-candidate-scores" if self.mode == "online" else "mean-photo-reciprocal-search-ranks", "photoCount": len(paths), "candidates": candidates, "references": references[:20], "reviewed": False, "analyzedAt": datetime.now(timezone.utc).isoformat(), "gpsFromPhoto": gps is not None}}

    def close(self):
        self.client.close()
