# Panel de cifrado de equipos (FEMSA)
 
Aplicación para ver el estado de cifrado de los equipos. Abres una pantalla en el navegador, **subes tu Excel** y el panel
se genera solo.
 
Todo corre **en tu computadora**: no usa internet para procesar, no necesita servidor ni permisos de administrador, y los datos
no salen de tu equipo.
 
> **Confidencialidad (NDA).** Lo que se genera con el Excel real (carpeta `salidas/`) contiene datos de FEMSA. No lo subas a
> internet, a ninguna IA ni a este repositorio.
 
---
 
## 1. Antes de empezar
 
Necesitas:
 
1. **Python 3.10 o superior.** Si tu versión es menor, el programa muestra el error E11.
   - Windows: abre el menú Inicio, escribe `cmd`, y ahí escribe `python --version`.
   - Mac: abre Terminal y escribe `python3 --version`.
   - Si no lo tienes: https://www.python.org/downloads/ . En Windows elige **«Install for current user»** y marca
     **«Add python.exe to PATH»** (así no pide permisos de administrador).
2. **Google Chrome** (en Mac es obligatorio; en Windows también sirve Edge).
3. **Internet solo la primera vez**, para instalar las librerías. Después ya no.
## 2. Extrae la carpeta
 
Si descargaste un `.zip`, **extráelo completo** antes de usarlo:
 
- Windows: clic derecho en el `.zip` → **Extraer todo…**
- Mac: doble clic en el `.zip`.
⚠️ **No abras nada desde dentro del `.zip`.** Si lo haces, sale el error `No such file or directory: requirements.txt`.
 
---
 
## 3. Cómo abrirlo en Windows
 
1. Entra a la carpeta que extrajiste.
2. Doble clic en **`iniciar_panel.bat`**.
3. Se abre una ventana negra. **La primera vez tarda unos minutos** (instala lo necesario). Déjala abierta.
4. Se abre el navegador con la aplicación (`http://localhost:8501`). Si no se abre solo, copia esa dirección en Chrome.
5. **No cierres la ventana negra mientras lo usas.** Para apagar el panel, ciérrala.
| Si pasa esto | Haz esto |
|---|---|
| `No such file or directory: requirements.txt` | Abriste el `.bat` dentro del `.zip`. Extrae todo y ábrelo desde la carpeta extraída. |
| «no encuentro Python» | Instala Python (punto 1) y vuelve a abrir el `.bat`. |
| `ERROR E11` | Tu Python es menor a 3.10. Instala uno nuevo, borra la carpeta `.venv` y abre el `.bat` otra vez. |
| «no pude instalar las librerías» | No hay internet o la red de la empresa lo bloquea. Prueba en otra red o pide apoyo a TI. |
| Pide un «Email» | Presiona Enter sin escribir nada. |
| «Windows protegió tu PC» | Clic en «Más información» → «Ejecutar de todos modos». |
 
---
 
## Cómo abrirlo en Mac
 
> ✅ **Navegador recomendado: Google Chrome.**
>
> ⚠️ **Evita Safari.** En Safari, el botón «Generar PDF» de la pestaña **Reportes** abre el cuadro de impresión
> sin la opción **Guardar como PDF**, así que no se puede descargar el reporte. Pasa lo mismo con el
> `panel_cifrado_AAAA-MM.html` descargado: ábrelo con **clic derecho → Abrir con → Google Chrome**, no con doble clic
> si Safari es tu navegador predeterminado.
 
### Requisitos
- **Python 3.10 o superior.** Compruébalo en Terminal con `python3 --version`. El Python 3.9 que trae macOS de
  fábrica **no sirve** (error E11). Si tienes Anaconda (el prompt dice `(base)`), su Python sirve.
- **Google Chrome** instalado.
### Si tu Python es menor a 3.10
 
Si `python3 --version` dice 3.9 o menos, instala un Python nuevo con **una** de estas opciones y crea el entorno.
Primero borra el entorno viejo, si ya existía:
 
```bash
cd ~/Downloads/panel_streamlit
rm -rf .venv
```
 
**Opción 1 · Sin permisos de administrador (recomendada): `uv`**
Descarga Python 3.12 dentro de tu usuario, sin tocar el sistema:
 
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh       # instala uv en ~/.local/bin
source $HOME/.local/bin/env                           # lo deja disponible en esta Terminal
cd ~/Downloads/panel_streamlit
uv venv --python 3.12 .venv                           # descarga Python 3.12 y crea el entorno
source .venv/bin/activate
python --version                                      # debe decir 3.12.x
uv pip install -r requirements.txt                    # instala pandas, numpy, openpyxl y streamlit
```
 
**Opción 2 · Con permisos de administrador: instalador oficial**
1. Descarga el instalador de macOS de Python 3.12 desde https://www.python.org/downloads/ e instálalo (pide la contraseña de la Mac).
2. Abre `Aplicaciones/Python 3.12/` y da doble clic en **Install Certificates.command**.
3. En una Terminal nueva:
```bash
cd ~/Downloads/panel_streamlit
python3.12 -m venv .venv
source .venv/bin/activate
python --version                                      # debe decir 3.12.x
pip install -r requirements.txt
```
 
Después de cualquiera de las dos, salta a «Cada vez que lo uses».
 
### Primera vez (si tu Python ya es 3.10 o superior; solo una vez, necesita internet)
Abre **Terminal** (Cmd + Espacio → «Terminal») y corre, cambiando la ruta por la de tu carpeta:
 
```bash
cd ~/Downloads/panel_streamlit          # carpeta donde está app.py (puedes arrastrarla a la Terminal después de «cd »)
python3 -m venv .venv                   # crea el entorno del proyecto
source .venv/bin/activate
python --version                        # debe decir 3.10 o más
pip install -r requirements.txt         # tarda unos minutos
```
 
### Cada vez que lo uses
```bash
cd ~/Downloads/panel_streamlit
source .venv/bin/activate
streamlit run app.py --server.headless true &
sleep 3 && open -a "Google Chrome" http://localhost:8501
```
Así el panel se abre en Chrome aunque Safari sea tu navegador predeterminado.
Si se abrió en Safari de todos modos, copia `http://localhost:8501` y pégalo en Chrome.
Para cerrar el panel: en la Terminal, `kill %1` (o cierra la ventana de la Terminal).
 
### Guardar el PDF (en Chrome)
1. Pestaña **Reportes** → **Generar PDF ejecutivo** o **Generar PDF técnico**.
2. En «Destino», elige **Guardar como PDF**.
3. En «Más ajustes», activa **Gráficos de fondo** (si no, salen sin colores).
4. **Guardar**.
### Problemas comunes en Mac
| Síntoma | Solución |
|---|---|
| No aparece «Guardar como PDF» al imprimir | Estás en Safari: abre `http://localhost:8501` en Google Chrome |
| `ERROR E11` (versión de Python) | La `.venv` se creó con Python 3.9. Bórrala con `rm -rf .venv` y sigue «Si tu Python es menor a 3.10» |
| `command not found: streamlit` | Falta activar el entorno: `source .venv/bin/activate` |
| `curl` no descarga `uv` | Probablemente el proxy de la empresa lo bloquea: usa la Opción 2 o pide apoyo a TI |
| Streamlit pide un «Email» | Presiona Enter |
| `Port 8501 is already in use` | Ya hay un panel abierto: ciérralo o usa `--server.port 8502` (y abre `http://localhost:8502`) |
| Doble clic en `iniciar_panel.command` no abre nada o da error | Usa la Terminal como arriba. El `.command` puede tomar el Python 3.9 del sistema |
 
---
 
## 4. Cómo se usa
 
1. **Paso 1:** sube tu Excel (puedes subir uno o varios; cada archivo es un mes).
2. **Paso 2:** revisa que el mes detectado sea el correcto. Si algún archivo trae un problema, aparece en rojo con lo que hay que arreglar.
3. Clic en **Procesar**. Cuando termine, verás el panel, el resumen y las descargas.
El Excel tiene que cumplir el formato de la sección 5, si no, la aplicación lo rechaza.
 
¿Solo quieres ver cómo se ve? En la barra lateral, **«Datos de prueba» → «Cargar datos demo»** usa datos inventados.
 
## 5. El Excel que subes (formato obligatorio)
 
Para que funcione, el archivo tiene que cumplir esto:
 
- Formato **`.xlsx`**, con los equipos en la **primera hoja**.
- Los **encabezados van en la fila 3** (las filas 1 y 2 pueden tener título o estar vacías).
- Las columnas deben llamarse **exactamente** como en esta tabla (el orden no importa). Son **obligatorias** las columnas 1 a 14 y 16 a 19 (18 en total); la 15 y de la 20 a la 25 son **opcionales** y pueden faltar:
| # | Columna | Qué trae |
|---|---|---|
| 1 | `EquipoID` | Identificador del equipo. No puede repetirse |
| 2 | `UsuarioID` | Usuario, o `No asignado` |
| 3 | `País` | Texto, o `No disponible` |
| 4 | `Región` | Texto, o `No disponible` |
| 5 | `Sistema Operativo` | `Windows` o `macOS` |
| 6 | `Versión SO` | Por ejemplo `10.0.19045.x`, `Windows 10`, `macOS 15` |
| 7 | `Estado TPM` | `TPM 2`, `TPM 1.2`, `No disponible`, `No aplica` |
| 8 | `Encryption Readiness` | `Ready`, `Not ready`, `No disponible` |
| 9 | `Estado de Cifrado` | `Encrypted`, `Not encrypted`, `No disponible` |
| 10 | `Tecnología de cifrado State` | Mensaje de BitLocker (`Success`, `Fixed Drive not encrypted`…) |
| 11 | `Estado de Cumplimiento` | `Compliant`, `Unknown`, `No disponible` |
| 12 | `Estado de Cuenta` | Texto |
| 13 | `Mes Último Logon` | `AAAA-MM` (por ejemplo `2026-11`), o `No disponible` |
| 14 | `Banda Recencia` | `0-30 días`, `31-90 días`, `91-180 días`, `>180 días`, `No disponible` |
| 15 | `Clase de Equipo` | **Opcional** (si viene, se ignora) |
| 16 | `Fuente de Datos` | `MDM + AD`, `AD`, `MDM`, `Inventario macOS` |
| 17 | `En MDM` | `Sí` / `No` |
| 18 | `En AD` | `Sí` / `No` |
| 19 | `En MacOS` | `Sí` / `No` |
| 20 a 25 | `Categoría de Equipo`, `Perfil de Privilegio`, `Antigüedad Meses`, `Banda Antigüedad`, `Estado Hardware`, `Tipo de Red` | **Opcionales.** Solo se llenan para equipos macOS |
 
**Qué pasa si algo no cuadra**
 
- Si **falta una columna obligatoria** o un encabezado está mal escrito, la aplicación se detiene con el error **E06** y te dice cuáles faltan. No se genera nada.
- Mayúsculas, acentos y espacios de más en los encabezados no importan; aun así, usa los nombres de la tabla.
- Si trae un **valor que no conoce** (por ejemplo un estado nuevo), te avisa pero igual procesa el archivo.
- **Un archivo es un mes.** El mes (corte) sale del `Mes Último Logon` más reciente del archivo. Si subes dos archivos del mismo mes, hay que corregir uno.
## 6. Dónde queda lo que se genera
 
En la carpeta **`salidas/`**, que se crea sola junto a `app.py`: los CSV de cada mes, el historial y el panel en HTML.
 
## 7. Cosas que debes saber
 
**Cuida tus resultados**
- **No borres la carpeta `salidas/`.** Ahí está el historial de los meses anteriores (hasta 5 años). Si la borras, la pestaña Histórico queda vacía.
- **Subir el mismo mes dos veces reemplaza el anterior**, no lo duplica.
- **Para agregar un mes nuevo solo súbelo.** El historial crece solo, no hay que hacer nada más.
- **No guardes esta carpeta en OneDrive, Google Drive o similares** si usas datos reales: se sincronizaría a la nube y `salidas/` tiene datos confidenciales.
- Los **datos de prueba** llevan la etiqueta amarilla **«DATOS DUMMY»**. No son cifras reales de FEMSA.
**Si no abre o se traba**
- **Si al abrir el `.bat` se abre la tienda de Microsoft Store**, tu Windows no tiene Python de verdad (solo un acceso directo). Instálalo desde python.org (punto 1).
- **No muevas ni renombres los archivos** de la carpeta, y no los abras desde dentro del `.zip`.
- **Cierra el Excel antes de subirlo.** Con el archivo abierto en Excel, Windows a veces no deja leerlo.
- **Si recargas la página (F5) no pierdes nada:** el panel que ya procesaste vuelve a aparecer en «Corte que se muestra».
**Guardar un reporte en PDF (Windows y Mac)**
1. Pestaña **Reportes** → **Generar PDF ejecutivo** o **Generar PDF técnico**.
2. En «Destino» elige **Guardar como PDF**.
3. En «Más ajustes» activa **Gráficos de fondo** (si no, el PDF sale sin colores).
4. **Guardar**.

 
## 8. Qué archivo es cada cosa
 
```
├── iniciar_panel.bat          ← Windows: doble clic para abrir
├── iniciar_panel.command      ← Mac: alterno (mejor usa la Terminal, ver arriba)
├── app.py                     ← la pantalla de la aplicación
├── panel.py, historial.py     ← el procesamiento de los datos
├── plantilla_panel.html, estilos.css, app.js,
│   reportes.js, reportes.css,
│   reporte_ejecutivo.js, reporte_tecnico.js   ← el panel que se muestra
├── requirements.txt           ← las librerías que se instalan solas
├── datos_demo/                ← Excel inventados para probar
├── generar_datos_demo.py, generar_datasets_prueba.py   ← crean esos Excel de prueba
└── .streamlit/                ← configuración (solo local, sin telemetría)
```
 
Se crean solas, no las toques: `salidas/` (resultados) y `.venv/` (las librerías de este proyecto).
 
## 9. ¿Qué significa cada pestaña del panel?
 
Ver el archivo **App Flow** (descripción de las 16 pestañas y qué hay que saber de cada una).
 
