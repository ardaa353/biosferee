"""Fetch and atomically install the verified, pinned SQLite index for BioSfere."""
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from catalog import DETAILS, RELEASE, TREE_SHA, build, check_digest

URL = 'https://download.checklistbank.org/col/monthly/2026-10-16_xr_txtree.zip'
PROJECT = Path(__file__).resolve().parent.parent
OUTPUT = Path(os.environ.get('COL_DATABASE_PATH') or PROJECT / 'dist' / 'data' / f'col-{RELEASE}.sqlite')
CACHE_HOME = Path(os.environ.get('XDG_CACHE_HOME') or Path.home() / '.cache')
CACHE = Path(os.environ.get('COL_CACHE_DIR') or CACHE_HOME / 'biosfere-catalog')


def index_is_current(path, signature):
    if not path.is_file():
        return False
    try:
        db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
        try:
            stored = db.execute("SELECT value FROM meta WHERE key='build'").fetchone()
            pages = db.execute('PRAGMA page_count').fetchone()[0]
            page_size = db.execute('PRAGMA page_size').fetchone()[0]
            return stored == (signature,) and path.stat().st_size == pages * page_size
        finally:
            db.close()
    except (OSError, sqlite3.Error):
        return False


def get_archive(staging):
    supplied = os.environ.get('COL_ARCHIVE_PATH')
    if supplied:
        return Path(supplied).resolve(strict=True)
    target = CACHE / f'col-{RELEASE}.zip'
    if target.is_file():
        try:
            check_digest(target, TREE_SHA)
            return target
        except ValueError:
            pass
    temp = staging / 'download.zip'
    for attempt in range(3):
        try:
            request = Request(URL, headers={'User-Agent':'BioSfere/1.0 (Catalogue of Life build)'})
            with urlopen(request, timeout=40) as response, temp.open('wb') as out:
                shutil.copyfileobj(response, out, length=1024*1024)
            check_digest(temp, TREE_SHA)
            temp.replace(target)
            return target
        except (OSError, ValueError, URLError) as error:
            if attempt == 2:
                raise RuntimeError(f'Could not obtain the pinned Catalogue of Life archive: {error}') from error
            time.sleep(2 ** attempt)
    raise AssertionError('Unreachable')


def main():
    signature = hashlib.sha256(Path(__file__).with_name('catalog.py').read_bytes() + DETAILS.read_bytes() + TREE_SHA.encode()).hexdigest()
    if index_is_current(OUTPUT,signature):
        print(f'Catalogue of Life {RELEASE} ready')
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f'col-{RELEASE}-{signature[:16]}.sqlite'
    if not index_is_current(cached,signature):
        with tempfile.TemporaryDirectory(dir=CACHE, prefix='building-') as tmp:
            staging = Path(tmp)
            archive = get_archive(staging)
            index = staging / 'index.sqlite'
            build(archive,index)
            db = sqlite3.connect(index)
            try:
                db.execute('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID')
                db.execute('INSERT INTO meta VALUES(?,?)',('build',signature))
                db.commit()
            finally:
                db.close()
            index.replace(cached)
    with tempfile.TemporaryDirectory(dir=OUTPUT.parent, prefix='installing-') as tmp:
        ready = Path(tmp) / 'catalog.sqlite'
        try:
            os.link(cached,ready)
        except OSError:
            shutil.copyfile(cached,ready)
        ready.replace(OUTPUT)
    print(f'Catalogue of Life {RELEASE} ready ({OUTPUT.stat().st_size // 1024 // 1024} MiB on disk)')


if __name__ == '__main__':
    main()
