"""Install the pinned classifier weights next to the browser's CPU runtime."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'public/identification/assets'
MANIFEST = json.loads((ROOT / 'scripts/identification-assets.json').read_text())


def verified(path, entry):
    if not path.is_file() or path.stat().st_size != entry['bytes']:
        return False
    return hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']


def install(entry):
    target = OUTPUT / entry['path']
    if verified(target, entry):
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error = None
    for attempt in range(3):
        for url in dict.fromkeys((entry['url'], entry.get('mirror', entry['url']))):
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as out:
                    temporary = Path(out.name)
                    with urlopen(url, timeout=50) as response:
                        shutil.copyfileobj(response, out, 1024 * 1024)
                if not verified(temporary, entry):
                    raise ValueError('SHA-256 uyuşmuyor')
                os.replace(temporary, target)
                return
            except Exception as error:
                last_error = error
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        time.sleep(2 ** attempt)
    raise RuntimeError('Model kurulamadı: ' + entry['path']) from last_error


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(install, MANIFEST))
    runtime = ROOT / 'node_modules/@litertjs/core'
    version = json.loads((runtime / 'package.json').read_text())['version']
    target = OUTPUT / ('litert-' + version)
    target.mkdir(parents=True, exist_ok=True)
    for stem in ('litert_wasm_internal', 'litert_wasm_compat_internal'):
        for ext in ('.js', '.wasm'):
            shutil.copyfile(runtime / 'wasm' / (stem + ext), target / (stem + ext))
    print('Sekiz model ve CPU çalışma zamanı hazır.')
