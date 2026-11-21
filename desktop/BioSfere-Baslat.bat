@echo off
setlocal
cd /d "%~dp0"
set "UV_PYTHON_INSTALL_DIR=%CD%\.runtime"
set "UV_CACHE_DIR=%CD%\.cache\uv"
set "BIOSFERE_CACHE_DIR=%CD%\.cache\models"
if not exist .bootstrap\uv (
  py -3 -m pip install --target .bootstrap uv==0.9.5
  if errorlevel 1 goto fail
)
set "PYTHONPATH=%CD%\.bootstrap"
py -3 -m uv venv --python 3.12 --managed-python --allow-existing .venv
if errorlevel 1 goto fail
py -3 -m uv pip install --python .venv\Scripts\python.exe -r requirements.txt
if errorlevel 1 goto fail
.venv\Scripts\python.exe biosfere_data_maker.py
if errorlevel 1 goto fail
exit /b
:fail
echo Kurulum veya program calistirilamadi. Python 3 ve internet baglantisini kontrol edin.
pause
