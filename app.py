"""
app.py  ·  Pantalla de carga del Panel de cifrado de equipos (Streamlit)
=========================================================================
Reemplaza el comando de terminal `python panel.py archivo.xlsx` por una pantalla:

    1. El analista arrastra uno o varios Excel de FEMSA.
    2. La pantalla detecta el corte (AAAA-MM) de cada archivo y deja corregirlo.
    3. Pulsa «Procesar»: se aplica EXACTAMENTE la misma lógica de panel.py (21 reglas, historial, panel).
    4. El panel de siempre (las 16 pestañas, filtros y PDF) aparece en la misma página.

Todo corre en esta computadora (servidor local en localhost). Los archivos subidos viven en memoria;
solo se escriben las salidas, igual que antes, en la carpeta «salidas».

Cómo abrirla:  doble clic en iniciar_panel.bat (Windows) o iniciar_panel.command (Mac)
               o, desde una terminal:  streamlit run app.py
"""
from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

import panel as P                       # panel.py: la lógica de limpieza, historial y generación del panel
import generar_datos_demo as demo

AQUI = Path(__file__).resolve().parent
RE_CORTE = re.compile(r"\d{4}-(0[1-9]|1[0-2])")

st.set_page_config(page_title="Panel de cifrado de equipos", page_icon="🔐", layout="wide", initial_sidebar_state="collapsed")

# --------------------------------------------------------------------------------------
# Estilos: mismos tokens del DESIGN_SYSTEM (guinda de marca, beige, tinta) que estilos.css
# --------------------------------------------------------------------------------------
st.markdown("""
<style>
:root { --guinda:#7A1F33; --guinda-oscuro:#5A1627; --guinda-claro:#F6E4E8; --borde:#E7DCCB; --tinta2:#5C5C58; --ambar:#F2B31B; --ok:#1F7A3E; --rojo:#C73030; }
.block-container { padding: 1.2rem 2rem 3rem; max-width: 1400px; }   /* ancho para que el panel use su diseño de escritorio (≥ 1024 px) */
.hero { background: var(--guinda); color:#fff; padding:14px 24px; border-radius:12px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:16px; }
.hero h1 { color:#fff; font-size:22px; margin:0; padding:0; font-weight:700; }
.hero .sub { font-size:13px; opacity:.9; margin-top:2px; }
.chips { display:flex; gap:8px; flex-wrap:wrap; }
.chip { border:1px solid rgba(255,255,255,.55); border-radius:999px; padding:4px 12px; font-size:13px; white-space:nowrap; }
.chip.dummy { background:var(--ambar); color:#242424; border-color:var(--ambar); font-weight:700; }
h2, h3 { color: var(--guinda) !important; }
.paso { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--tinta2); margin-bottom:2px; }
div[data-testid="stVerticalBlockBorderWrapper"] { border-color: var(--borde) !important; border-radius:12px !important; background:#fff; }
div[data-testid="stFileUploaderDropzone"] { border:2px dashed var(--guinda); background:#fffdfb; border-radius:12px; }
div[data-testid="stFileUploaderDropzone"] button { border-color: var(--guinda); color: var(--guinda); }
.stButton > button[kind="primary"], .stDownloadButton > button[kind="primary"] { background: var(--guinda); border-color: var(--guinda); color:#fff; }
.stButton > button[kind="primary"]:hover { background: var(--guinda-oscuro); border-color: var(--guinda-oscuro); }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--guinda) !important; outline-offset: 2px; }
.ok { color: var(--ok); font-weight:600; } .mal { color: var(--rojo); font-weight:600; } .av { color:#7A5A06; font-weight:600; }
.stMarkdown p.nota, p.nota { color: var(--tinta2) !important; font-size: 13px !important; line-height: 1.5; }
</style>
""", unsafe_allow_html=True)

ss = st.session_state
ss.setdefault("resultados", [])          # resultados de la última corrida (uno por archivo)
ss.setdefault("corte_visto", None)       # corte que se muestra en el panel
ss.setdefault("n_subida", 0)             # para vaciar el cargador de archivos
ss.setdefault("demo", False)             # usando los datos sintéticos de datos_demo/
ss.setdefault("dummy", False)
ss.setdefault("procesados", {})          # archivo -> corte ya procesado en esta sesión (para no avisar «se reemplazará» después de procesar)


# --------------------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------------------
def texto_usuario(codigo, mensaje: str) -> str:
    """Mensaje del error pensado para quien usa la pantalla: sin nombres de código y con qué hacer."""
    primera = mensaje.split("\n")[0].strip()
    if codigo == "E06":
        cols = re.search(r"\[(.*?)\]", primera)
        lista = cols.group(1).replace("'", "") if cols else ""
        return ("al archivo le faltan columnas: " + lista + ". Revisa que sea el Excel de FEMSA, que la primera hoja traiga los equipos y que "
                "los encabezados estén en la fila 3. Si solo cambió el nombre de una columna, avisa al equipo del panel para agregar el alias.")
    return primera


@st.cache_data(show_spinner=False, max_entries=24)
def inspeccionar(nombre: str, datos: bytes) -> dict:
    """Lee el archivo en memoria y avisa antes de procesar: filas, corte detectado y si la estructura es válida."""
    try:
        df = P.leer_archivo(io.BytesIO(datos), nombre)
    except P.ErrorPanel as e:
        return {"ok": False, "codigo": e.codigo, "mensaje": e.mensaje, "filas": 0, "corte": None}
    except PermissionError:
        return {"ok": False, "codigo": "E04", "mensaje": f"no puedo abrir «{nombre}»: parece estar abierto en otro programa.", "filas": 0, "corte": None}
    except Exception as e:                                                         # archivo dañado
        return {"ok": False, "codigo": "E05", "mensaje": f"no pude leer «{nombre}»: el archivo parece dañado o no es el Excel de FEMSA. "
                f"Ábrelo en Excel para comprobar que se vea bien, o pide una copia nueva. ({type(e).__name__})", "filas": 0, "corte": None}
    return {"ok": True, "codigo": None, "mensaje": "", "filas": len(df), "corte": P.detectar_corte(df)}


def leer_historial(salida: Path) -> pd.DataFrame:
    ruta = salida / "historial.csv"
    if not ruta.exists():
        return pd.DataFrame()
    try:
        h = pd.read_csv(ruta, dtype={"corte": str}, encoding="utf-8-sig")
        return h.sort_values("corte").reset_index(drop=True) if "corte" in h.columns else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


def zip_corte(carpeta: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(carpeta.glob("*.csv")):
            z.write(f, f"{carpeta.name}/{f.name}")
    return buf.getvalue()


def mostrar_panel(html: str) -> None:
    """Incrusta el panel de siempre. st.iframe ajusta la altura al contenido (sin doble barra de desplazamiento)."""
    if hasattr(st, "iframe"):
        st.iframe(html, height="content")
    else:
        components.html(html, height=1500, scrolling=True)


SET_BASICO = "Demo básico (2 cortes, ~1,900 equipos)"
SET_EQUIPO = "Datasets del equipo: 2026-08 y 2026-11 (20,000 equipos, con altas, bajas y cambios)"
SET_PURGA = "Prueba de purga de 5 años: 2020-12, 2021-10, 2021-11 y 2026-11"


def archivos_equipo() -> list[Path]:
    """Excel propios del equipo para ensayar (20,000 equipos). Se agregan soltándolos en datos_demo/equipo/."""
    return sorted((AQUI / "datos_demo" / "equipo").glob("*.xlsx"))


def entradas_demo() -> list[tuple[str, bytes]]:
    if ss.get("set_demo") == SET_PURGA and archivos_equipo():
        viejos = sorted((AQUI / "datos_demo" / "purga").glob("*.xlsx"))
        base = [r for r in archivos_equipo() if r.name == "dataset_sintetico_2026.xlsx"]
        return [(r.name, r.read_bytes()) for r in viejos + base]
    if ss.get("set_demo") == SET_EQUIPO and archivos_equipo():
        return [(r.name, r.read_bytes()) for r in archivos_equipo()]
    carpeta = AQUI / "datos_demo"
    rutas = sorted(carpeta.glob("Dataset_demo_*.xlsx"))
    if len(rutas) < 2:
        rutas = demo.generar(1900, carpeta)
    return [(r.name, r.read_bytes()) for r in rutas]


# --------------------------------------------------------------------------------------
# Barra lateral: ajustes e historial
# --------------------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### Ajustes")
    salida = Path(st.text_input("Carpeta de salidas", value=str(AQUI / "salidas"),
                                help="Aquí se guardan los CSV de cada corte, historial.csv y el panel HTML (igual que antes).")).expanduser()
    ss.dummy = st.checkbox("Etiquetar como DATOS DUMMY", value=ss.dummy, help="Pone la etiqueta amarilla en el panel. Úsalo con datos de prueba.")
    detalle = st.checkbox("Mostrar detalle técnico de los errores", value=False)
    st.markdown("---")
    st.markdown("### Datos de prueba")
    if archivos_equipo():
        ss.set_demo = st.radio("Conjunto de prueba", [SET_BASICO, SET_EQUIPO, SET_PURGA], index=0,
                               help="El básico trae dos cortes de ejemplo. El del equipo usa los Excel de datos_demo/equipo/. "
                                    "Para ver la purga usa una carpeta de salidas vacía: se retiran los cortes de más de 5 años respecto al más reciente.")
    else:
        ss.set_demo = SET_BASICO
        st.caption("Dos cortes sintéticos (2025-09 y 2025-11) para ensayar la pantalla sin usar el Excel real.")
    if st.button("Cargar datos demo", width="stretch"):
        ss.demo, ss.dummy, ss.resultados = True, True, []
        ss.n_subida += 1
        st.rerun()
    st.markdown("---")
    st.markdown("### Historial de cortes")
    hist = leer_historial(salida)
    if hist.empty:
        st.caption("Todavía no hay cortes procesados.")
    else:
        tabla_h = hist[["corte", "equipos", "pct_cifrado"]].rename(columns={"corte": "Corte", "equipos": "Equipos", "pct_cifrado": "% cifrado"})
        st.dataframe(tabla_h.iloc[::-1], hide_index=True, width="stretch")
    st.caption("🔒 Todo se procesa en esta computadora; los archivos no se suben a ningún servidor.")

# --------------------------------------------------------------------------------------
# Encabezado
# --------------------------------------------------------------------------------------
chip_dummy = '<span class="chip dummy">DATOS DUMMY</span>' if ss.dummy else ""
st.markdown(f"""
<div class="hero"><div><h1>Panel de cifrado de equipos</h1><div class="sub">Carga los archivos de FEMSA y obtén el panel, los CSV y el historial</div></div>
<div class="chips">{chip_dummy}<span class="chip">🔒 Local: los datos no salen de esta computadora</span><span class="chip">Confidencial — uso interno</span></div></div>
""", unsafe_allow_html=True)

# --------------------------------------------------------------------------------------
# Paso 1 y 2: cargar archivos y revisar los cortes
# --------------------------------------------------------------------------------------
entradas: list[tuple[str, bytes]] = []
col1, col2 = st.columns([4, 8], gap="large")
with col1, st.container(border=True):
    st.markdown('<div class="paso">Paso 1</div>', unsafe_allow_html=True)
    st.subheader("Carga tus archivos")
    subidos = st.file_uploader("Excel de FEMSA (.xlsx). Puedes soltar uno o varios cortes a la vez.", type=["xlsx", "xlsm", "csv"],
                               accept_multiple_files=True, key=f"subida_{ss.n_subida}", label_visibility="visible")
    if subidos:
        ss.demo = False
        entradas = [(f.name, f.getvalue()) for f in subidos]
    elif ss.demo:
        entradas = entradas_demo()
        st.info("Usando los **datos demo** (sintéticos). Suelta tus archivos arriba para reemplazarlos.", icon="🧪")
    st.markdown('<p class="nota">Los encabezados deben estar en la fila 3 del Excel y la primera hoja debe traer los equipos. '
                'Cada archivo es un corte (un mes); el historial se actualiza solo.</p>', unsafe_allow_html=True)

filas_tabla, detalles = [], {}
existentes = set(hist["corte"]) if not hist.empty else set()
for nombre, datos in entradas:
    info = inspeccionar(nombre, datos)
    detalles[nombre] = info
    filas_tabla.append({"Archivo": nombre, "Equipos": info["filas"], "Detectado": info["corte"] or "—",
                        "Corte a usar": info["corte"] or "", "ok": info["ok"]})

with col2, st.container(border=True):
    st.markdown('<div class="paso">Paso 2</div>', unsafe_allow_html=True)
    st.subheader("Revisa los cortes")
    cortes_a_usar, hay_error = {}, False
    if not entradas:
        st.markdown('<p class="nota">Aquí aparecerá la lista de archivos con el corte (AAAA-MM) que detectó cada uno. '
                    'El corte sale del mes de logon más reciente del archivo; si no es el correcto, lo puedes cambiar.</p>', unsafe_allow_html=True)
    else:
        df_t = pd.DataFrame(filas_tabla)
        clave = "ed_" + "|".join(f"{n}:{len(d)}" for n, d in entradas)
        editado = st.data_editor(
            df_t.drop(columns="ok"), key=clave, hide_index=True, width="stretch",
            disabled=["Archivo", "Equipos", "Detectado"],
            column_config={"Archivo": st.column_config.TextColumn(width="medium"),
                           "Equipos": st.column_config.NumberColumn(format="localized", width="small"),
                           "Detectado": st.column_config.TextColumn(width="small", help="Mes de logon más reciente que trae el archivo."),
                           "Corte a usar": st.column_config.TextColumn("Corte a usar", help="Puedes corregirlo con doble clic. Formato AAAA-MM, por ejemplo 2025-11.", width="small")})
        usados: dict[str, str] = {}
        for i, (nombre, datos) in enumerate(entradas):
            info, corte = detalles[nombre], str(editado.loc[i, "Corte a usar"] or "").strip()
            if not info["ok"]:
                hay_error = True
                st.markdown(f'<span class="mal">✕ {nombre}</span> · <b>{info["codigo"] or "ERROR"}</b>: {texto_usuario(info["codigo"], info["mensaje"])} <i>Quítalo de la lista (✕) o corrígelo para continuar.</i>', unsafe_allow_html=True)
            elif not RE_CORTE.fullmatch(corte):
                hay_error = True
                st.markdown(f'<span class="mal">✕ {nombre}</span> · escribe el corte con formato AAAA-MM (por ejemplo 2025-11).', unsafe_allow_html=True)
            elif corte in usados:
                hay_error = True
                st.markdown(f'<span class="mal">✕ {nombre}</span> · tiene el mismo corte ({corte}) que «{usados[corte]}». Cada archivo debe ser de un mes distinto.', unsafe_allow_html=True)
            else:
                usados[corte] = nombre
                cortes_a_usar[nombre] = corte
                if ss.procesados.get(nombre) == corte:
                    st.markdown(f'<span class="ok">✓ {nombre}</span> · corte {corte} procesado. Mira el panel abajo.', unsafe_allow_html=True)
                elif corte in existentes:
                    st.markdown(f'<span class="av">⚠ {nombre}</span> · el corte {corte} ya está en el historial: se reemplazará (aviso E14).', unsafe_allow_html=True)
                else:
                    st.markdown(f'<span class="ok">✓ {nombre}</span> · corte {corte} listo para procesar.', unsafe_allow_html=True)
        n = len(cortes_a_usar)
        ya = n > 0 and all(ss.procesados.get(a) == c for a, c in cortes_a_usar.items())
        etiqueta = (f"Volver a procesar {n} archivo{'s' if n != 1 else ''}" if ya else f"Procesar {n} archivo{'s' if n != 1 else ''}") if n else "Procesar"
        procesar = st.button(etiqueta, type="primary" if not ya else "secondary",
                             disabled=hay_error or n == 0,
                             help="Corrige los avisos en rojo para continuar." if hay_error else "Aplica las 21 reglas, actualiza el historial y genera el panel.")
        if hay_error:
            st.caption("Corrige o quita los archivos marcados en rojo (✕) para poder procesar.")

# --------------------------------------------------------------------------------------
# Procesamiento (misma lógica que panel.py, archivo por archivo y en orden cronológico)
# --------------------------------------------------------------------------------------
if entradas and not hay_error and cortes_a_usar and procesar:
    P.DETALLE = detalle
    ss.resultados = []
    orden = sorted(entradas, key=lambda e: cortes_a_usar[e[0]])
    with st.status("Procesando…", expanded=True) as estado:
        barra = st.progress(0.0)
        for i, (nombre, datos) in enumerate(orden):
            corte = cortes_a_usar[nombre]
            st.write(f"**{nombre}** · corte {corte}")
            try:
                r = P.procesar(io.BytesIO(datos), nombre, corte, salida, ss.dummy, progreso=lambda t, n=nombre: st.write(f"&nbsp;&nbsp;↳ {t}…"))
                r["ok"] = True
            except P.ErrorPanel as e:
                r = {"ok": False, "archivo": nombre, "corte": corte, "codigo": e.codigo, "mensaje": e.mensaje, "detalle": e.detalle if detalle else None, "avisos": []}
                st.write(f"&nbsp;&nbsp;✕ {e.codigo or 'ERROR'}: {texto_usuario(e.codigo, e.mensaje)}")
            except Exception as e:                                                  # lo inesperado también se explica
                r = {"ok": False, "archivo": nombre, "corte": corte, "codigo": None, "avisos": [],
                     "mensaje": "ocurrió un error inesperado y no se modificó ninguna salida de este archivo.",
                     "detalle": f"{type(e).__name__}: {e}" if detalle else None}
                st.write(f"&nbsp;&nbsp;✕ {r['mensaje']}")
            ss.resultados.append(r)
            barra.progress((i + 1) / len(orden))
        buenos = [r for r in ss.resultados if r["ok"]]
        ss.procesados = {r["archivo"]: r["corte"] for r in buenos}
        if buenos:
            ss.corte_visto = buenos[-1]["corte"]
        estado.update(label=f"Listo: {len(buenos)} de {len(orden)} archivo(s) procesado(s)", state="complete" if len(buenos) == len(orden) else "error", expanded=False)
    st.rerun()

# --------------------------------------------------------------------------------------
# Resultados: panel, resumen y descargas
# --------------------------------------------------------------------------------------
hist = leer_historial(salida)                                       # se relee: la corrida pudo cambiarlo
disponibles = [c for c in (hist["corte"].tolist() if not hist.empty else []) if (salida / f"panel_cifrado_{c}.html").exists()]

if not disponibles and not ss.resultados:
    with st.container(border=True):
        st.markdown('<div class="paso">Cómo funciona</div>', unsafe_allow_html=True)
        st.subheader("Del Excel al panel en tres pasos")
        a, b, c = st.columns(3)
        a.markdown("**1 · Carga**  \nArrastra uno o varios Excel de FEMSA a la zona punteada.")
        b.markdown("**2 · Revisa**  \nConfirma el corte de cada archivo. La pantalla avisa si falta alguna columna.")
        c.markdown("**3 · Procesa**  \nObtienes el panel de 16 pestañas, los CSV del corte y el historial actualizado.")
        st.caption("¿Solo quieres ver cómo se ve? Usa «Cargar datos demo» en la barra lateral.")
else:
    st.markdown("&nbsp;")
    t_panel, t_resumen, t_desc = st.tabs(["📊 Panel", "🧾 Resumen del proceso", "⬇️ Descargas"])

    with t_resumen:
        if not ss.resultados:
            st.caption("Aún no se ha procesado nada en esta sesión. El historial de la barra lateral viene de corridas anteriores.")
        for r in ss.resultados:
            if r["ok"]:
                with st.container(border=True):
                    st.markdown(f'<span class="ok">✓ {r["archivo"]}</span> · corte <b>{r["corte"]}</b>', unsafe_allow_html=True)
                    m1, m2, m3, m4 = st.columns(4)
                    m1.metric("Equipos procesados", f'{r["equipos"]:,}')
                    m2.metric("Reglas aplicadas", len(r["reglas"]))
                    m3.metric("Avisos", len(r["avisos"]))
                    m4.metric("Tiempo", f'{r["segundos"]:.1f} s')
                    for a_ in r["avisos"]:
                        st.warning(a_, icon="⚠️")
                    with st.expander(f'Ver las {len(r["reglas"])} reglas y cuántas filas tocó cada una'):
                        st.dataframe(pd.DataFrame(r["reglas"]).rename(columns={"regla": "Regla", "filas_afectadas": "Filas afectadas", "nota": "Nota"}),
                                     hide_index=True, width="stretch")
            else:
                with st.container(border=True):
                    st.markdown(f'<span class="mal">✕ {r["archivo"]}</span> · corte {r["corte"]}', unsafe_allow_html=True)
                    st.error(f'**{r["codigo"] or "ERROR"}** · {texto_usuario(r["codigo"], r["mensaje"])}  \nNo se modificó ninguna salida de este archivo.')
                    if r.get("detalle"):
                        st.code(r["detalle"])

    with t_panel:
        if not disponibles:
            st.info("Ningún archivo se procesó correctamente. Revisa el resumen del proceso.", icon="ℹ️")
        else:
            if ss.corte_visto not in disponibles:
                ss.corte_visto = disponibles[-1]
            c1, c2 = st.columns([3, 9])
            ss.corte_visto = c1.selectbox("Corte que se muestra", disponibles[::-1], index=disponibles[::-1].index(ss.corte_visto),
                                         help="Incluye los cortes de corridas anteriores que siguen en la carpeta de salidas.")
            c2.markdown(f'<p class="nota" style="margin-top:28px">Es el mismo panel de siempre: 16 pestañas, filtros globales y reportes PDF (pestaña «Reportes»). '
                        f'Archivo: <code>{salida / f"panel_cifrado_{ss.corte_visto}.html"}</code></p>', unsafe_allow_html=True)
            mostrar_panel((salida / f"panel_cifrado_{ss.corte_visto}.html").read_text(encoding="utf-8"))

    with t_desc:
        if not disponibles:
            st.caption("Cuando se procese un corte aparecerán aquí sus descargas.")
        else:
            c = ss.corte_visto if ss.corte_visto in disponibles else disponibles[-1]
            st.markdown(f"**Corte {c}**")
            d1, d2, d3 = st.columns(3)
            ruta_html = salida / f"panel_cifrado_{c}.html"
            d1.download_button("Panel HTML (sin internet)", ruta_html.read_bytes(), file_name=ruta_html.name, mime="text/html", type="primary",
                               width="stretch", help="Un solo archivo: se abre con doble clic y se puede compartir con quien tenga autorización.")
            carpeta = salida / f"corte_{c}"
            if carpeta.exists():
                d2.download_button("CSV del corte (.zip)", zip_corte(carpeta), file_name=f"corte_{c}.zip", mime="application/zip", width="stretch",
                                   help="dataset_limpio, reglas_aplicadas, diccionario_columnas y macos_detalle.")
            if (salida / "historial.csv").exists():
                d3.download_button("historial.csv", (salida / "historial.csv").read_bytes(), file_name="historial.csv", mime="text/csv", width="stretch")
            st.caption("El HTML y los CSV con datos reales son confidenciales (NDA): no se suben a ninguna IA, a la web ni a repositorios públicos.")
