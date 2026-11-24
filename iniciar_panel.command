#!/bin/bash
# Panel de cifrado de equipos - inicio con doble clic (Mac / Linux). No necesita permisos de administrador.
# La primera vez instala lo necesario en la carpeta .venv de este proyecto; despues abre al instante.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: no encuentro Python 3. Instalalo desde https://www.python.org/downloads/ y vuelve a abrir este archivo."
  read -r -p "Pulsa Enter para cerrar..." _; exit 1
fi
if [ ! -x ".venv/bin/python" ]; then
  echo "Preparando el entorno por primera vez (tarda unos minutos)..."
  python3 -m venv .venv || { echo "ERROR: no pude crear el entorno (Python 3.10 o superior)."; read -r -p "Enter..." _; exit 1; }
fi
if ! .venv/bin/python -c "import streamlit, pandas, openpyxl" >/dev/null 2>&1; then
  echo "Instalando librerias (pandas, openpyxl, streamlit)..."
  .venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt || { echo "ERROR: no pude instalar las librerias (revisa internet/proxy)."; read -r -p "Enter..." _; exit 1; }
fi
echo; echo "Abriendo el panel en tu navegador... Para cerrarlo, cierra esta ventana."; echo
.venv/bin/python -m streamlit run app.py
