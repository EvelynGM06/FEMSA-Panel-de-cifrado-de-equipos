# Panel de cifrado de equipos (FEMSA) · Rama UX/UI y pruebas

Esta rama contiene la versión final del panel, su sistema de diseño y la evidencia de pruebas.
El panel es un **monolito local**: un script de Python lee el Excel, limpia los datos y genera **un solo
archivo HTML** que se abre con doble clic. No hay servidor, hosting, `.exe` ni permisos de administrador,
y el HTML funciona sin internet.

> **Confidencialidad (NDA).** El HTML generado con el Excel real lleva los datos adentro. Se trata igual que el Excel: no se sube a ninguna IA, a la web ni a repositorios públicos. Los reportes de este repositorio solo contienen conteos, nunca filas de equipos.

## Contenido de la rama
```
├── panel.py                       ← ingesta + limpieza + genera el panel (lo único que se corre)
├── historial.py                   ← histórico entre cortes y catálogo de incidencias (lo importa panel.py)
├── requirements.txt               ← librerías necesarias (pandas, numpy, openpyxl)
├── plantilla_panel.html           ← esqueleto del panel (HTML + marcadores); panel.py la llena con los datos
├── estilos.css                    ← CSS del panel (fuente única; panel.py lo incrusta)
├── app.js                         ← JavaScript del panel (fuente única; panel.py lo incrusta)
├── reportes.js / reportes.css     ← pestaña Reportes e impresión a PDF
├── reporte_ejecutivo.js           ← contenido del reporte ejecutivo
├── reporte_tecnico.js             ← contenido del reporte técnico
├── DESIGN_SYSTEM_consolidado.md   ← tokens, colores, tipografía y reglas de contraste e implementación
├── Reporte_pruebas.md             ← resultados de la T24 (prueba de punta a punta con el Excel real)
├── ReporteQA.md                   ← revisión funcional, visual y de accesibilidad
├── Guion_demo.md                  ← guion de la demo, capturas con datos reales y entregable del scrum (T27)
├── imagenes/                      ← capturas que usa ReporteQA.md
│   └── demo/                      ← capturas de la demo con el Excel real (solo conteos, sin IDs)
└── Pruebas/                       ← pruebas_panel.py, prueba_carga.py, crear_fixture.py, pruebas_retro.py, crear_fixture_retro.py
```

`panel.py`, `historial.py`, `plantilla_panel.html`, `estilos.css`, `app.js` y los archivos de reportes deben estar **en la misma carpeta** al correr el panel.
Los scripts de `Pruebas/` buscan `panel.py` en su propia carpeta: cópialos junto a panel.py antes de correrlos.

## Cómo se usa

Requisitos: Python 3.10 o superior. Las librerías se instalan con:

```bash
pip install --user -r requirements.txt
```

Después:

```bash
python panel.py "ruta/al/archivo_FEMSA.xlsx"                  # corte = mes de logon más reciente del archivo
python panel.py "archivo.xlsx" --corte 2025-09                # fecha de corte explícita (AAAA-MM)
python panel.py "archivo.xlsx" --no-abrir                     # no abre el navegador al terminar
python panel.py "archivo.xlsx" --detalle                      # muestra el detalle técnico de un error
```

En Mac, usa `python3` en lugar de `python`. El script que se corre es `panel.py`; `historial.py` no se corre solo.

### Archivo de entrada: nombre del dataset y columnas

El archivo de FEMSA se llama **`Dataset Académico de Cifrado en PCs.xlsx`** (es el nombre que `panel.py` busca por defecto
si se corre sin indicar archivo; con cualquier otro nombre hay que pasar la ruta). Va en la primera hoja, con los
**encabezados en la fila 3**. Tiene **25 columnas** y deben llamarse **exactamente así** (el archivo con datos reales no se
sube al repositorio: solo se documenta su estructura):

| # | Columna (nombre exacto) | Valores o formato esperado |
|---|---|---|
| 1 | `EquipoID` | Texto, llave única (no puede repetirse) |
| 2 | `UsuarioID` | Usuario o `No asignado` |
| 3 | `País` | Texto, o `No disponible` |
| 4 | `Región` | Texto, o `No disponible` |
| 5 | `Sistema Operativo` | `Windows`, `macOS` |
| 6 | `Versión SO` | Por ejemplo `10.0.19045.x`, `Windows 10`, `macOS 15` |
| 7 | `Estado TPM` | `TPM 2`, `TPM 1.2`, `No disponible`, `No aplica` |
| 8 | `Encryption Readiness` | `Ready`, `Not ready`, `No disponible` |
| 9 | `Estado de Cifrado` | `Encrypted`, `Not encrypted`, `No disponible` |
| 10 | `Tecnología de cifrado State` | Mensaje de BitLocker (`Success`, `Fixed Drive not encrypted`, …) |
| 11 | `Estado de Cumplimiento` | `Compliant`, `Unknown`, `No disponible` |
| 12 | `Estado de Cuenta` | Texto |
| 13 | `Mes Último Logon` | `AAAA-MM`, o `No disponible` |
| 14 | `Banda Recencia` | `0-30 días`, `31-90 días`, `91-180 días`, `>180 días` |
| 15 | `Clase de Equipo` | Opcional: si viene, se descarta (columna constante) |
| 16 | `Fuente de Datos` | `MDM + AD`, `AD`, `MDM`, `Inventario macOS` |
| 17 | `En MDM` | `Sí` / `No` |
| 18 | `En AD` | `Sí` / `No` |
| 19 | `En MacOS` | `Sí` / `No` |
| 20-25 | `Categoría de Equipo`, `Perfil de Privilegio`, `Antigüedad Meses`, `Banda Antigüedad`, `Estado Hardware`, `Tipo de Red` | Solo para macOS; se separan en `macos_detalle.csv` |

`panel.py` compara los encabezados sin acentos, mayúsculas ni espacios y acepta los alias de `COLUMNAS_ORIGEN`, pero los
nombres de arriba son los oficiales. Si falta una columna obligatoria, el script se detiene con el error **E06** y la lista
de columnas que faltan. Los valores nuevos que no conoce se avisan con **E09** pero se procesan.

### Salidas

Al terminar, el script crea en `salidas/`:

| Archivo | Contenido |
|---|---|
| `corte_AAAA-MM/dataset_limpio.csv` | Dataset limpio, con banderas (no corrige datos) |
| `corte_AAAA-MM/reglas_aplicadas.csv` | Las 21 reglas de limpieza y cuántas filas tocó cada una |
| `corte_AAAA-MM/diccionario_columnas.csv` | Descripción de cada columna |
| `corte_AAAA-MM/macos_detalle.csv` | Columnas exclusivas de macOS, aparte |
| `historial.csv` | Una fila por corte. Solo se actualiza (ver «Historial y vida útil»); antes de cada actualización queda `historial.csv.bak` |
| `panel_cifrado_AAAA-MM.html` | El panel, un solo archivo |

Si algo falla, **no se modifica ninguna salida previa**: todo se calcula en memoria y se escribe en una
carpeta temporal antes de reemplazar. Los errores y avisos llevan código (E01 a E15) y dicen qué hacer.

La etiqueta amarilla «DATOS DUMMY» solo aparece si se corre con `--dummy`; con el Excel real no se usa.

## Historial y vida útil (5 años)

`historial.csv` **no se reescribe desde cero**: cada vez que se procesa un archivo solo se **agrega** la fila de ese corte o se
**reemplaza** si el corte ya existía (aviso E14), y las demás filas no cambian.

Para no acumular datos y memoria sin límite, el historial tiene una **vida útil de 5 años** (`VIDA_UTIL_ANIOS` en `historial.py`):

- Al procesar un corte se retiran los cortes con **más de 60 meses** respecto al corte más reciente. Un corte de exactamente
  5 años todavía se conserva.
- De los cortes retirados se borran su carpeta `salidas/corte_AAAA-MM/` y su `panel_cifrado_AAAA-MM.html`, **después** de
  escribir bien las salidas nuevas. El script lo avisa en consola con **E15** y deja la copia `historial.csv.bak` (de antes de
  la corrida) por si hay que recuperarlos.
- Nunca se retira el corte que se está procesando.
- Es una ventana por corte: el historial guarda una fila resumen por corte, no una por equipo. El **criterio de baja de un
  equipo individual** sigue pendiente con FEMSA.

## Qué muestra el panel

16 pestañas. **Principales:** Resumen ejecutivo, Países y regiones, Incidencias, Histórico, Información del corte, Reportes.
**Secundarias:** Visibilidad y cobertura, Equipos en riesgo, Cumplimiento de política, Usuarios, Sistemas operativos,
Actividad e inactivos, Calidad de datos, Detalle y descarga, Glosario y ayuda, Nota sobre macOS.

Fijo en todas las pestañas: filtros globales (país, región, fuente, versión de SO, recencia y estado de cifrado
efectivo, de selección múltiple con casillas), contador de equipos, fecha de corte en el encabezado y una **franja de incidencias que no se puede cerrar**, porque FEMSA pidió que siempre estén visibles.

El Resumen sigue este orden de lectura: una fila de **4 tarjetas** (el indicador principal, % de equipos cifrados, con su
variación contra el corte anterior, y los **3 hallazgos más urgentes**: equipos sin cifrar, equipos sin dato de cifrado y
equipos Compliant que no están cifrados); la **barra de cinco colores** con las 5 categorías de cifrado efectivo (Cifrado
conforme, con desviación, sin validar configuración, No cifrado y Sin dato), su leyenda y cifras; **«Dónde actuar primero»**
(una dona con cuántos países hay en cada color del semáforo y una tabla con **todos** los países en Rojo o en Ámbar, del peor al mejor: País,
Estado y Principal problema); el **cambio contra el corte anterior** y el cifrado por recencia del último logon. Las tablas
completas de semáforo y puntaje (por país y por región) están en «Países y regiones». Ya no hay barras apiladas de cifrado
por país ni en el Resumen ni en el PDF.

### Reportes en PDF

La pestaña **Reportes** genera dos PDF, cada uno en versión **general** (todo el corte) o **con los filtros activos**:

- **Reporte ejecutivo** (para dirección): indicador principal y 3 hallazgos, barra de 5 colores, «Dónde actuar primero» (dona y tabla con todos los países en Rojo o Ámbar), cambio frente al corte anterior, cifrado por recencia e incidencias. Hoja A4 vertical.
- **Reporte técnico** (datos de detalle): parámetros y filtros, indicadores, cifrado efectivo por país, catálogo de
  incidencias con su criterio, reglas de limpieza, comparación de cortes y listados de equipos (50 por incidencia y un
  listado general con tope de 200 a 2,000 filas). Hoja A4 horizontal.

El PDF sale del navegador (**Imprimir → Guardar como PDF**) porque el panel no usa servidor ni librerías y los filtros viven en
el navegador. En el cuadro de impresión hay que elegir «Guardar como PDF» y activar «Gráficos de fondo». Un PDF con datos reales
es confidencial igual que el HTML. La descarga en CSV sigue en «Detalle y descarga».

Con el corte 2025-11 (5,563 equipos) el panel reproduce las cifras del Entregable 3:
4,736 · 112 · 48 · 120 · 547.

## Diseño UX/UI

El diseño sigue `DESIGN_SYSTEM_consolidado.md`:

- **Tokens de diseño** en `:root` (colores, espaciado en múltiplos de 4 px, radios, tipografía).
- **Paleta:** guinda como color de marca y el azul de «cifrado» como color de datos, separados a propósito.
  «Sin cifrar» (rojo) y «Sin dato» (gris con trama) llevan estilos distintos: uno es un incumplimiento y el otro un punto ciego.
  En barras, barras apiladas y donas el ámbar usa un tono más oscuro (`--ambar-grafica`, contraste 3.6:1) para que se vea sobre blanco; el `--ambar` claro queda para el semáforo.
  El color nunca es el único indicador del estado (siempre hay texto o trama).
- **Contraste** de texto mínimo 4.5:1 (WCAG AA) y **foco visible** en todos los controles.
- **Sin fuentes ni recursos externos:** usa Inter si está instalada y, si no, la fuente del sistema.
- **Responsive:** hasta el sprint anterior se cuidó que no hubiera desplazamiento horizontal a 390 px; ya no es requisito (FEMSA aclaró que no se verá en teléfonos), pero los estilos se conservan.

El CSS y el JavaScript viven en archivos aparte (`estilos.css`, `app.js` y los de reportes) y `panel.py` los incrusta
en los marcadores de `plantilla_panel.html` (lista `PIEZAS_PLANTILLA` en `panel.py`). El panel generado sigue siendo
**un solo HTML**. Se edita siempre el archivo aparte, nunca la plantilla; ya no hay que copiar cambios entre dos lugares.

## Pruebas

Las pruebas imprimen solo PASA/FALLA y conteos, nunca filas, así que se pueden correr con el Excel real.

```bash
# Una sola vez (para las pruebas del navegador):
pip install --user playwright
python -m playwright install chromium

# Con datos falsos:
python crear_fixture.py                    # crea datos/fixture_prueba.xlsx (necesita datos/equipos_dummy.xlsx)
python pruebas_panel.py

# Con el Excel real y las cifras esperadas del Entregable 3:
python pruebas_panel.py "archivo.xlsx" --esperado "Cifrado conforme=4736,Cifrado con desviación=112,Cifrado sin validar configuración=48,No cifrado=120,Sin dato=547"

# Prueba de carga con 50 mil equipos:
python prueba_carga.py "archivo.xlsx"
```

Sin Playwright, `pruebas_panel.py` corre igual las pruebas de Python (`--sin-navegador`) y omite la parte del navegador.

`pruebas_retro.py` cubre lo agregado después de la retroalimentación (barra de 5 colores, dona de países por semáforo, «Dónde actuar primero», cambio contra el corte anterior, barras apiladas por recencia, semáforo desde el puntaje en Países, pestaña Reportes, PDF y vida útil de 5 años) con datos sintéticos de las mismas proporciones del corte real (`crear_fixture_retro.py`). Se corre junto a `panel.py`: `python pruebas_retro.py` (y `--carga` para 50 mil equipos).

**Resultados** (detalle en `Reporte_pruebas.md`), corte 2025-11, 5,563 equipos:

| Prueba | Resultado |
|---|---|
| Comprobaciones automáticas con el Excel real (`pruebas_panel.py`) | Pasan, 0 fallan; las cinco categorías coinciden: 4,736 · 112 · 48 · 120 · 547 |
| Pruebas de la retroalimentación (`pruebas_retro.py`, datos sintéticos de las mismas proporciones) | 92 pasan, 0 fallan |
| Prueba de carga (50 mil equipos) | Dentro de los límites: `panel.py` 30 s, HTML 25 MB, abrir 5 s, filtrar 2 s, cambiar pestaña 2 s; reportes: ejecutivo < 5 s y técnico < 10 s |
| Manuales: sin red, Chrome y Edge (incluye el PDF general y con filtros), teclado en el panel y datos reales | Pasan |

## Revisión de QA

`ReporteQA.md` documenta la revisión funcional, visual y de accesibilidad del panel generado.
Se corrigieron 5 bugs: contexto de incidencia no visible, multiselección con Ctrl/Shift y pérdida de foco,
contraste insuficiente en el mapa de calor, tabla de detalle inaccesible con teclado y exportación CSV
habilitada sin resultados.

Quedan como **recomendaciones opcionales** (no son bugs): una única región `aria-live`, adoptar el patrón ARIA Tabs
completo, aumentar el área clicable de los enlaces de país y, si el panel se usará en teléfonos, filtros colapsables
y navegación de pestañas horizontal.

## Qué es propio del equipo y qué se adaptó de la referencia con IA

**Adaptado de la referencia generada con IA:** la estructura inicial del script de ingesta (`panel.py`) y de la
plantilla HTML del panel.

**Propio del equipo** (o rehecho por el equipo sobre esa base):

- Las 21 reglas de limpieza, que vienen del notebook `Limpieza_Cifrado_PCs.ipynb` (Entrega 3).
- Las 5 categorías de cifrado efectivo y la validación contra las cifras del Entregable 3.
- `historial.py`: histórico entre cortes, comparación, movimientos equipo por equipo y la vida útil de 5 años.
- La pestaña Reportes y los dos PDF (`reportes.js`, `reporte_ejecutivo.js`, `reporte_tecnico.js`, `reportes.css`).
- El catálogo de 7 incidencias y su nivel de prioridad (provisional).
- El semáforo sale del puntaje y lo definió el equipo (referencia: ISO/IEC 27001, cláusula 6.1.2 y control A.8.24); los pesos y los cortes se ajustan en `SEMAFORO` de `panel.py`.
- Los códigos de error E01 a E14 y la escritura «todo o nada» de las salidas.
- El Design System (`DESIGN_SYSTEM_consolidado.md`) y su implementación en CSS.
- Los filtros con casillas y la corrección de los 5 bugs encontrados en QA.
- Las pruebas (`Pruebas/`), el reporte de pruebas de la T24 y el reporte de QA.

El código se probó con el Excel real y, para los cambios de la retroalimentación, también con datos sintéticos de las mismas proporciones (ver `Reporte_pruebas.md`). `pruebas_retro.py` usa solo datos sintéticos por diseño, para no exponer datos bajo NDA.

## Limitaciones y pendientes conocidos

- **Semáforo: criterio del equipo.** El semáforo se calcula desde el **puntaje** (0 a 100) de cada país o región: Verde con 80 o más, Ámbar de 70 a 79 y Rojo por debajo de 70. Puntaje = 100 − %sin dato − 4×%sin cifrar − 0.2×%Windows 10 − %inactivos − 2×%inconsistencias, sin bajar de 0 y redondeado a entero. Pesos y cortes los definió el equipo con referencia a ISO/IEC 27001 (cláusula 6.1.2, criterios de riesgo; control A.8.24, uso de criptografía). ISO no fija porcentajes ni pesos, así que FEMSA puede pedir otros: se cambian en `SEMAFORO` de `panel.py`. «Principal problema» es el concepto que más puntos le resta al país.
- **Catálogo de incidencias provisional.** Los 7 grupos y su nivel de riesgo, definidos en `historial.py`, están por validar.
- **Tiempo de filtrado con 50 mil equipos:** 1.3 s, dentro del límite de 2 s pero con poco margen; conviene revisarlo si el volumen crece.
- **Las reglas de limpieza vienen del notebook** `Limpieza_Cifrado_PCs.ipynb`: si se cambian, hay que cambiarlas allá también.
- **Pruebas en Chrome y Edge hechas a mano;** las automáticas corren en Chromium.
- **Accesibilidad de los reportes pendiente:** falta revisar que la dona y los puntos del semáforo se lean en escala de grises y recorrer la pestaña Reportes solo con teclado.
- **El PDF exige un paso del analista:** elegir «Guardar como PDF» y activar «Gráficos de fondo» en el cuadro de impresión. Una descarga directa sin ese paso necesitaría un generador de PDF propio (siguiente sprint).
- **La vida útil de 5 años es por corte,** no por equipo; el criterio de baja de equipos está pendiente con FEMSA.
