#!/bin/zsh
set -e
cd "$(dirname "$0")"
export UV_PYTHON_INSTALL_DIR="$PWD/.runtime"
export UV_CACHE_DIR="$PWD/.cache/uv"
export BIOSFERE_CACHE_DIR="$PWD/.cache/models"
if [[ ! -d .bootstrap/uv ]]; then
  python3 -m pip install --target .bootstrap uv==0.9.5
fi
PYTHONPATH="$PWD/.bootstrap" python3 -m uv venv --python 3.12 --managed-python --allow-existing .venv
PYTHONPATH="$PWD/.bootstrap" python3 -m uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python biosfere_data_maker.py
