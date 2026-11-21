"""Read photos and write the versioned archive accepted by the BioSfere admin panel."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
import json
import math
import os
from pathlib import Path
import tempfile
import uuid
import zipfile

FORMAT = "biosfere-dataset"
VERSION = 1
RANKS = ("kingdom", "phylum", "className", "orderName", "family", "genus", "species", "commonName")
LIMITS = {"description": 5000, "kingdom": 100, "phylum": 150, "className": 150, "orderName": 150,
          "family": 150, "genus": 150, "species": 200, "commonName": 200, "city": 100, "locality": 200}


def open_photo(path: str | Path):
    from PIL import Image, ImageOps
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass
    image = Image.open(path)
    try:
        image.seek(0)
        return ImageOps.exif_transpose(image).copy()
    finally:
        image.close()


def photo_gps(path: str | Path):
    from PIL import Image
    try:
        with Image.open(path) as image:
            gps = image.getexif().get_ifd(34853)
        def coordinate(parts, direction):
            result = float(parts[0]) + float(parts[1]) / 60 + float(parts[2]) / 3600
            return -result if direction in ("S", "W", b"S", b"W") else result
        latitude = coordinate(gps[2], gps.get(1))
        longitude = coordinate(gps[4], gps.get(3))
        if math.isfinite(latitude) and math.isfinite(longitude) and -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return latitude, longitude
    except (OSError, KeyError, TypeError, ValueError, IndexError, ZeroDivisionError):
        pass
    return None


def prepared_photo(path: str | Path):
    image = open_photo(path)
    try:
        image.thumbnail((3840, 3840))
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        for quality in (92, 82, 72, 60):
            output = BytesIO()
            image.save(output, "WEBP", quality=quality, method=4)
            content = output.getvalue()
            if len(content) <= 7_500_000:
                return content, "webp"
        while len(content) > 7_500_000:
            image.thumbnail((max(1, int(image.width * .75)), max(1, int(image.height * .75))))
            output = BytesIO()
            image.save(output, "WEBP", quality=72)
            content = output.getvalue()
        return content, "webp"
    finally:
        image.close()


def number(value, minimum, maximum, name):
    try:
        parsed = float(str(value).replace(",", "."))
    except (ValueError, TypeError) as error:
        raise ValueError(name + " alanına geçerli bir koordinat girin.") from error
    if not math.isfinite(parsed) or not minimum <= parsed <= maximum:
        raise ValueError(name + " geçerli aralığın dışında.")
    return parsed


def record_for_group(group: dict, index: int):
    fields = group["fields"]
    if not group.get("paths"):
        raise ValueError("Gönderi " + str(index) + " için fotoğraf seçin.")
    record = {key: str(fields.get(key, "")).strip() for key in LIMITS}
    for key, maximum in LIMITS.items():
        if len(record[key]) > maximum:
            raise ValueError("Gönderi " + str(index) + " / " + key + " en fazla " + str(maximum) + " karakter olabilir.")
    record["city"] = record["city"] or "Belirtilmedi"
    record["locality"] = record["locality"] or "Belirtilmedi"
    record["description"] = record["description"] or "Fotoğraflarıyla kaydedilmiş canlı gözlemi."
    record.update(id=str(index), lat=number(fields.get("lat"), -90, 90, "Enlem"),
                  lng=number(fields.get("lng"), -180, 180, "Boylam"), images=[])
    record["status"] = "verified" if record["species"] else "unknown"
    date = str(fields.get("createdAt") or datetime.now(timezone.utc).isoformat())
    try:
        parsed = datetime.fromisoformat(date.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        record["createdAt"] = parsed.isoformat()
    except ValueError as error:
        raise ValueError("Gönderi " + str(index) + " kayıt tarihi geçersiz.") from error
    record["author"] = {"username": str(fields.get("username", "")).strip(), "firstName": "", "lastName": "", "system": False}
    record["metadata"] = {"analysis": group.get("analysis", {}), "originalFileNames": [Path(p).name for p in group["paths"]]}
    return record


def write_archive(groups: list[dict], destination: str | Path, progress=lambda text: None, cancelled=lambda: False):
    destination = Path(destination)
    records = [record_for_group(group, index) for index, group in enumerate(groups, 1)]
    if not records:
        raise ValueError("Önce fotoğrafları en az bir gönderiye gruplandırın.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="biosfere-", suffix=".zip.tmp", dir=destination.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for index, (group, record) in enumerate(zip(groups, records), 1):
                for photo_index, path in enumerate(group["paths"], 1):
                    if cancelled():
                        raise InterruptedError("Dışa aktarma durduruldu.")
                    progress("Gönderi " + str(index) + " / " + str(len(groups)) + " · fotoğraf " + str(photo_index))
                    content, extension = prepared_photo(path)
                    filename = "photos/gonderi" + str(index) + "." + str(photo_index) + "." + extension
                    archive.writestr(filename, content)
                    record["images"].append("./" + filename)
            data = {"format": FORMAT, "version": VERSION, "archiveId": str(uuid.uuid4()),
                    "exportedAt": datetime.now(timezone.utc).isoformat(), "posts": records}
            archive.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return len(records)
