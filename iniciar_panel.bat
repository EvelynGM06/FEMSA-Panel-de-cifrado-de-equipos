@echo off
rem ============================================================================
rem  Panel de cifrado de equipos - inicio con doble clic (Windows)
rem  No necesita permisos de administrador. La primera vez instala lo necesario
rem  en la carpeta .venv de este proyecto (tarda unos minutos); despues abre al instante.
rem ============================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Panel de cifrado de equipos

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo.
  echo  ERROR: no encuentro Python en esta computadora.
  echo  Instala Python 3.10 o superior desde https://www.python.org/downloads/ ^(sin permisos de administrador:
  echo  elige "Install for current user" y marca "Add python.exe to PATH"^) y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo  Preparando el entorno por primera vez ^(solo ocurre una vez, tarda unos minutos^)...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo.
    echo  ERROR: no pude crear el entorno. Verifica que Python sea 3.10 o superior.
    pause
    exit /b 1
  )
)

".venv\Scripts\python.exe" -c "import streamlit, pandas, openpyxl" >nul 2>nul
if errorlevel 1 (
  echo  Instalando librerias ^(pandas, openpyxl, streamlit^)...
  ".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements.txt
  if errorlevel 1 (
    echo.
    echo  ERROR: no pude instalar las librerias. Revisa tu conexion a internet o el proxy de la empresa
    echo  ^(solo se necesita internet esta primera vez^) y vuelve a abrir este archivo.
    pause
    exit /b 1
  )
)

echo.
echo  Abriendo el panel en tu navegador... Para cerrarlo, cierra esta ventana.
echo.
".venv\Scripts\python.exe" -m streamlit run app.py
if errorlevel 1 pause
