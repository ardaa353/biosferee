"""Package only the desktop application sources for the admin download link."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / "desktop"
destination = root / "public" / "downloads" / "biosfere-veri-atolyesi.zip"
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob("*")):
        relative = path.relative_to(source)
        if path.is_file() and not any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
            archive.write(path, "BioSfere-Veri-Atolyesi/" + relative.as_posix())
print("Desktop data workshop packaged.")
