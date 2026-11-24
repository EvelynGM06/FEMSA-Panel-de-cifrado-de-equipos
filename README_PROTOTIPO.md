# Prototipo: pantalla de carga con Streamlit

Reemplaza el comando `python panel.py archivo.xlsx` por una pantalla donde se cargan uno o varios Excel.
**La lógica no cambió:** las 21 reglas, el historial, el catálogo de incidencias y el panel de 16 pestañas son los mismos.

## Cómo abrirlo
- **Windows:** doble clic en `iniciar_panel.bat`.
- **Mac:** doble clic en `iniciar_panel.command` (la primera vez: clic derecho → Abrir).
- **Terminal (opcional):** `pip install --user -r requirements.txt` y `streamlit run app.py`.

La primera vez se prepara una carpeta `.venv` con las librerías (solo necesita internet esa vez, sin permisos de administrador).
Después abre en segundos. Se abre el navegador en `http://localhost:8501`; para cerrar, cierra la ventana negra.

## Qué hace cada archivo
| Archivo | Para qué |
|---|---|
| `app.py` | La pantalla (Streamlit): carga, revisión de cortes, procesamiento, panel embebido, descargas |
| `panel.py` | Misma lógica de siempre. Nuevo: `procesar()` (la usan la terminal y la pantalla), `ErrorPanel` (errores E01–E14 como excepción) y `detectar_corte()` |
| `historial.py` | Sin cambios de lógica; solo lanza `ErrorHistorial` en lugar de cerrar el programa |
| `generar_datos_demo.py` | Dos Excel **sintéticos** (cortes 2025-09 y 2025-11) para probar sin el archivo real |
| `.streamlit/config.toml` | Solo `localhost`, sin telemetría, colores del Design System |
| `iniciar_panel.bat` / `.command` | Lanzadores de doble clic |

`python panel.py archivo.xlsx` **sigue funcionando** y genera exactamente las mismas salidas (se verificó byte a byte).

## Cosas a probar en un equipo real de FEMSA
1. Que el `.bat` no esté bloqueado por la política de TI y que `pip` alcance el repositorio (proxy) la primera vez.
2. Imprimir a PDF desde la pestaña «Reportes» con Chrome y con Edge (el panel va dentro de un iframe).
3. Con 20–50 mil equipos: tiempo de procesamiento y fluidez del panel embebido.

## Conjuntos de prueba (barra lateral → Datos de prueba)

| Conjunto | Archivos | Qué se ve |
|---|---|---|
| Demo básico | 2025-09 y 2025-11 (~1,900 equipos) | Flujo completo con archivos chicos |
| Datasets del equipo | `datos_demo/equipo/`: 2026-08 y 2026-11 (20,000 equipos) | Histórico con equipos en común: 1,200 altas, 700 bajas y 1,894 equipos que cambiaron de estado de cifrado |
| Prueba de purga | `datos_demo/purga/`: 2020-12, 2021-10, 2021-11 + 2026-11 | Con carpeta de salidas vacía, al procesar 2026-11 se retiran 2020-12 y 2021-10 (aviso E15); 2021-11 (exactamente 5 años) se conserva |

La purga se hace por **corte** (un archivo = un mes), no por fila: un Excel con logons de 2021 a 2023 es un solo corte (2023-12) y no se purga mientras esté a 5 años o menos del corte más reciente.
Para regenerar los archivos derivados: `python generar_datasets_prueba.py`.
