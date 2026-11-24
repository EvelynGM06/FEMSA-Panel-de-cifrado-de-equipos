"""
panel.py  ·  Panel de cifrado de equipos (monolito local)
==========================================================
Un solo comando hace toda la ingesta:

    python panel.py ruta/al/archivo_femsa.xlsx
    python panel.py archivo.xlsx --corte 2025-09

1. Lee el Excel que entrega FEMSA (encabezados en la fila 3).
2. Valida la estructura y las categorías clave; si algo no cuadra, explica qué hacer.
3. Aplica las 21 reglas de limpieza y marca las banderas (no corrige datos).
4. Escribe en salidas/:
      corte_AAAA-MM/dataset_limpio.csv
      corte_AAAA-MM/reglas_aplicadas.csv
      corte_AAAA-MM/diccionario_columnas.csv
      corte_AAAA-MM/macos_detalle.csv
      historial.csv                (una fila por corte; antes de cada actualización queda historial.csv.bak)
      panel_cifrado_AAAA-MM.html   (el panel, un solo archivo, sin internet)
5. Abre el panel en el navegador (se puede apagar con --no-abrir).

Si algo falla, no se modifica ninguna salida previa: todo se calcula primero en memoria y se
escribe en una carpeta temporal antes de reemplazar los archivos anteriores.

Errores y avisos (cada mensaje lleva su código):
    E01 sin archivo            E08 hoja sin equipos
    E02 la ruta no existe      E09 valores no interpretables (aviso)
    E03 no es .xlsx            E10 faltan librerías
    E04 archivo en uso         E11 versión de Python
    E05 archivo dañado         E12 sin permiso de escritura
    E06 faltan columnas        E13 historial dañado
    E07 columnas extra (aviso) E14 el corte ya existe (aviso)
                               E15 cortes de más de 5 años retirados (aviso)
Con --detalle se muestra además el detalle técnico del error.

Requisitos del cliente que cumple: todo corre local, sin servidor, sin hosting,
sin .exe y sin permisos de administrador. Solo necesita Python 3.10+ con pandas
y openpyxl (pip install --user -r requirements.txt).

Los datos NUNCA salen de la computadora: el HTML generado los lleva adentro.
"""

from __future__ import annotations

import sys

if sys.version_info < (3, 10):                                              # E11
    sys.exit(f"\nERROR E11: este programa necesita Python 3.10 o superior y esta computadora tiene "
             f"{sys.version_info[0]}.{sys.version_info[1]}. Instala una versión más reciente "
             "(o usa un entorno con Python 3.10+) y vuelve a correr.")

import argparse
import json
import os
import re
import shutil
import time
import unicodedata
import webbrowser
from datetime import datetime
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    import openpyxl  # noqa: F401  (pandas la usa para leer .xlsx)
except ImportError as _e:                                                   # E10
    sys.exit(f"\nERROR E10: falta la librería '{_e.name}'. Instálala con:\n"
             "    pip install --user pandas openpyxl\n"
             "(o: pip install --user -r requirements.txt) y vuelve a correr.")

try:                                                                        # P2: histórico y métricas
    from historial import resumen_corte, datos_historico, purgar_vencidos, VIDA_UTIL_ANIOS, ErrorHistorial
except ImportError as _e:
    sys.exit(f"\nERROR: no encuentro historial.py junto a panel.py ({_e}). Copia los dos archivos a la misma carpeta.")

AQUI = Path(__file__).resolve().parent          # carpeta donde vive panel.py
PLANTILLA = AQUI / "plantilla_panel.html"
# Piezas de la plantilla en archivos aparte: (marcador, archivo). El orden importa: el JS se incrusta en este
# orden y todo va antes del bloque de arranque de plantilla_panel.html. Los archivos de reportes pueden estar vacíos.
PIEZAS_PLANTILLA = (
    ("/*__CSS__*/", "estilos.css"),
    ("/*__CSS_REPORTES__*/", "reportes.css"),
    ("/*__JS__*/", "app.js"),
    ("/*__JS_REPORTES__*/", "reportes.js"),
    ("/*__JS_REPORTE_EJECUTIVO__*/", "reporte_ejecutivo.js"),
    ("/*__JS_REPORTE_TECNICO__*/", "reporte_tecnico.js"),
)

# ---------------------------------------------------------------------------
# Configuración (ajustable sin tocar el resto del código)
# ---------------------------------------------------------------------------
UMBRAL_CUENTA_COMPARTIDA = 3          # equipos por usuario para marcar "posible compartida"
SEMAFORO = {                          # criterio definido por el equipo (ISO/IEC 27001, 6.1.2 y A.8.24)
    "verde_desde": 80, "ambar_desde": 70,                     # el semáforo sale del puntaje (0 a 100)
    "pesos": {"sin_dato": 1.0, "sin_cifrar": 4.0, "windows10": 0.2, "inactivos": 1.0, "inconsistencias": 2.0},
}

# Nombre "canónico" de cada columna del archivo original. Se comparan sin
# acentos, mayúsculas ni espacios, así que "Versión SO" = "version so" = "VersionSO".
# Si FEMSA cambia un encabezado, se agrega el alias aquí.
COLUMNAS_ORIGEN = {
    "EquipoID": ["equipo id", "id equipo"],
    "UsuarioID": ["usuario id", "id usuario", "usuario"],
    "País": ["pais"],
    "Región": ["region"],
    "Sistema Operativo": ["so"],
    "Versión SO": ["version sistema operativo", "version"],
    "Estado TPM": ["tpm"],
    "Encryption Readiness": ["readiness"],
    "Estado de Cifrado": ["estado cifrado"],
    "Tecnología de cifrado State": ["tecnologia de cifrado", "bitlocker state"],
    "Estado de Cumplimiento": ["cumplimiento", "compliance"],
    "Estado de Cuenta": ["estado cuenta"],
    "Mes Último Logon": ["mes ultimo logon", "ultimo logon"],
    "Banda Recencia": ["recencia"],
    "Clase de Equipo": ["clase equipo"],
    "Fuente de Datos": ["fuente"],
    "En MDM": [],
    "En AD": [],
    "En MacOS": ["en mac"],
}
COLUMNAS_MACOS = ["Categoría de Equipo", "Perfil de Privilegio", "Antigüedad Meses",
                  "Banda Antigüedad", "Estado Hardware", "Tipo de Red"]
MACOS_RENOMBRE = dict(zip(COLUMNAS_MACOS, ["categoria_equipo", "perfil_privilegio", "antiguedad_meses",
                                           "banda_antiguedad", "estado_hardware", "tipo_red"]))

# Reglas de limpieza: vienen del notebook Limpieza_Cifrado_PCs.ipynb (Entrega 3). No cambiar aquí
# sin cambiarlas allá: el notebook manda.
BUILDS = {
    "19043": "Windows 10 21H1", "19044": "Windows 10 21H2", "19045": "Windows 10 22H2",
    "22631": "Windows 11 23H2", "26100": "Windows 11 24H2", "26200": "Windows 11 25H2",
}
TECNOLOGIA = {
    "Success": "Success",
    "TPM not used for protection of OS volume, but is required by policy": "TPM no usado (requerido por política)",
    "Encryption method of OS Volume is different than that set by policy": "Método distinto al de la política",
    "Fixed Drive not encrypted": "Disco fijo sin cifrar",
    "No disponible": "No disponible",
    "No aplica": "No aplica",
}
VALORES_CONOCIDOS = {
    "Estado de Cifrado": {"Encrypted", "Not encrypted", "No disponible"},
    "Estado de Cumplimiento": {"Compliant", "Unknown", "No disponible"},
    "Encryption Readiness": {"Ready", "Not ready", "No disponible"},
    "Estado TPM": {"TPM 2", "TPM 1.2", "No disponible", "No aplica"},
    "Fuente de Datos": {"MDM + AD", "AD", "MDM", "Inventario macOS"},
    "Sistema Operativo": {"Windows", "macOS"},
}
# Orden de columnas del dataset_limpio.csv de la Entrega 3
COLUMNAS_SALIDA = [
    "equipo_id", "usuario_id", "usuario_sin_asignar", "equipos_por_usuario", "usuario_multiequipo",
    "usuario_posible_compartido", "pais", "region", "sistema_operativo", "version_so_original", "build_so",
    "version_so", "familia_so", "version_generica", "windows10_fuera_de_soporte", "estado_tpm",
    "readiness_cifrado", "flag_tpm_obsoleto", "estado_cifrado", "tecnologia_bitlocker", "cifrado_efectivo",
    "estado_cumplimiento", "flag_compliant_sin_cifrar", "flag_success_sin_cifrar",
    "flag_config_incoherente_sin_cifrar", "flag_cifrado_cumplimiento_unknown", "flag_not_ready_pero_cifrado",
    "flag_ready_pero_no_cifrado", "estado_cuenta", "mes_ultimo_logon", "fecha_ultimo_logon_mes",
    "meses_desde_logon", "banda_recencia", "inactivo_mas_90d", "fuente_datos", "en_mdm", "en_ad",
    "en_macos", "motivo_sin_dato",
]
DICCIONARIO = [
    ("equipo_id", "Llave del equipo, en mayúsculas y sin espacios"),
    ("usuario_id", "Usuario del equipo. Nulo si no tiene asignado"),
    ("usuario_sin_asignar", "Verdadero si el equipo no tiene usuario"),
    ("equipos_por_usuario", "Cuántos equipos tiene ese usuario en el archivo"),
    ("usuario_multiequipo", "Usuario con 2 o más equipos"),
    ("usuario_posible_compartido", "Usuario con muchos equipos (umbral configurable), posible cuenta compartida o de servicio"),
    ("pais", "País. 'Sin país' si el equipo solo está en MDM"),
    ("region", "Región. 'Sin región' si el equipo solo está en MDM"),
    ("sistema_operativo", "Windows o macOS"),
    ("version_so_original", "Versión tal como venía en el Excel"),
    ("build_so", "Número de compilación de Windows, nulo si la versión es genérica"),
    ("version_so", "Nombre de la versión (por ejemplo Windows 11 24H2)"),
    ("familia_so", "Windows 10, Windows 11, macOS o Windows (sin versión)"),
    ("version_generica", "Verdadero si la versión viene agrupada y no permite saber el build"),
    ("windows10_fuera_de_soporte", "Verdadero si es Windows 10 (soporte terminó en octubre de 2025)"),
    ("estado_tpm", "TPM 2, TPM 1.2, No disponible o No aplica"),
    ("readiness_cifrado", "Si el equipo cumple los requisitos para cifrarse"),
    ("estado_cifrado", "Estado original: Encrypted, Not encrypted o No disponible"),
    ("tecnologia_bitlocker", "Resultado de BitLocker con nombres cortos"),
    ("cifrado_efectivo", "Cifrado conforme, con desviación, sin validar configuración, No cifrado o Sin dato"),
    ("estado_cumplimiento", "Compliant, Unknown o No disponible"),
    ("flag_tpm_obsoleto", "TPM 1.2"),
    ("flag_compliant_sin_cifrar", "Dice Compliant pero no está cifrado"),
    ("flag_success_sin_cifrar", "BitLocker dice Success pero no está cifrado"),
    ("flag_config_incoherente_sin_cifrar", "Sin cifrar pero con un mensaje de BitLocker propio de equipos cifrados"),
    ("flag_cifrado_cumplimiento_unknown", "Cifrado pero con cumplimiento sin evaluar"),
    ("flag_not_ready_pero_cifrado", "Readiness 'Not ready' pero ya cifrado"),
    ("flag_ready_pero_no_cifrado", "Readiness 'Ready' pero sin cifrar"),
    ("estado_cuenta", "Estado de la cuenta"),
    ("mes_ultimo_logon", "Mes del último logon (AAAA-MM). Nulo si no hay dato"),
    ("fecha_ultimo_logon_mes", "Primer día de ese mes, como fecha"),
    ("meses_desde_logon", "Meses entre el último logon y la fecha de corte"),
    ("banda_recencia", "Banda original del archivo (viene calculada por día, que el archivo no incluye)"),
    ("inactivo_mas_90d", "Banda 91-180 o más de 180 días"),
    ("fuente_datos", "MDM + AD, AD, MDM o Inventario macOS"),
    ("en_mdm", "Aparece en MDM"),
    ("en_ad", "Aparece en Active Directory"),
    ("en_macos", "Aparece en el inventario macOS"),
    ("motivo_sin_dato", "Explica qué información falta según la fuente"),
]
ND = "No disponible"

# ---------------------------------------------------------------------------
# Errores claros (T6): dicen qué pasó y qué hacer, sin traceback. Cada uno lleva su código.
# ---------------------------------------------------------------------------
DETALLE = False        # se activa con --detalle
AVISOS = []


class ErrorPanel(Exception):
    """Error con código (E01…E14) que explica qué pasó y qué hacer. La terminal lo imprime; la pantalla de
    carga (app.py) lo muestra como mensaje. Antes salir() cerraba el programa con sys.exit."""

    def __init__(self, codigo, mensaje: str, detalle=None):
        super().__init__(mensaje)
        self.codigo, self.mensaje, self.detalle = codigo, mensaje, detalle

    def texto(self, con_detalle: bool = False) -> str:
        etiqueta = f"ERROR {self.codigo}" if self.codigo else "ERROR"
        t = f"\n{etiqueta}: {self.mensaje}"
        if con_detalle and self.detalle:
            t += f"\n  Detalle técnico: {self.detalle}"
        return t + "\nNo se modificó ninguna salida."


def salir(codigo, mensaje: str, detalle=None):
    raise ErrorPanel(codigo, mensaje, detalle)


def aviso(codigo: str, mensaje: str):
    AVISOS.append(f"[{codigo}] {mensaje}")


def verificar_escritura(rutas):
    """Antes de reemplazar nada, comprueba que se pueden sobrescribir los archivos que ya existen
    (en Windows falla si alguno está abierto en Excel). Así no queda una salida a medias."""
    bloqueadas = []
    for r in rutas:
        try:
            if r.exists():
                with open(r, "ab"):
                    pass
        except OSError:
            bloqueadas.append(r)
    if bloqueadas:
        salir("E12", "no puedo escribir estos archivos (¿están abiertos en Excel?):\n  "
                     + "\n  ".join(str(b) for b in bloqueadas) + "\nCiérralos y vuelve a correr.")


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def normalizar(texto) -> str:
    """'Versión SO ' -> 'versionso' (para comparar encabezados y valores)."""
    t = unicodedata.normalize("NFKD", str(texto))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t.lower())


def a_booleano(serie: pd.Series) -> pd.Series:
    return serie.map(lambda v: normalizar(v) in {"si", "yes", "true", "1", "verdadero", "x"})


def leer_archivo(origen, nombre: str | None = None) -> pd.DataFrame:
    """origen = ruta (Path) o contenido en memoria (BytesIO, como lo entrega la pantalla de carga)."""
    nombre = nombre or getattr(origen, "name", "")
    if Path(nombre).suffix.lower() in {".csv", ".txt"}:
        df = pd.read_csv(origen, dtype=str, encoding="utf-8-sig")
    else:
        df = pd.read_excel(origen, dtype=str, header=2)           # encabezados en la fila 3
    df = df.dropna(how="all").reset_index(drop=True)
    if df.empty:                                                           # E08
        salir("E08", "la hoja no tiene equipos: no hay filas debajo de los encabezados (fila 3). "
                     "Revisa que sea la primera hoja del libro y que traiga datos.")
    # renombra encabezados al nombre canónico
    buscados = {}
    for canon, alias in {**COLUMNAS_ORIGEN, **{c: [] for c in COLUMNAS_MACOS}}.items():
        for a_ in [canon, *alias]:
            buscados[normalizar(a_)] = canon
    df = df.rename(columns={c: buscados.get(normalizar(c), c) for c in df.columns})
    faltan = [c for c in COLUMNAS_ORIGEN if c not in df.columns and c != "Clase de Equipo"]
    if faltan:                                                             # E06
        salir("E06", f"al archivo le faltan columnas: {faltan}\n"
                     f"  Columnas encontradas: {list(df.columns)}\n"
                     "  Si solo cambió el nombre, agrega el alias en COLUMNAS_ORIGEN (panel.py). "
                     "Si los encabezados no están en la fila 3, revisa el archivo.")
    return df


def mes_aaaa_mm(valor):
    if valor is None or (isinstance(valor, float) and pd.isna(valor)) or pd.isna(valor):
        return None
    s = str(valor).strip()
    m = re.match(r"^(\d{4})[-/](\d{1,2})", s)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}"
    try:
        f = pd.to_datetime(s, dayfirst=True)
        return f"{f.year:04d}-{f.month:02d}"
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Limpieza
# ---------------------------------------------------------------------------
def interpretar_version(version, so):
    """Devuelve (build, nombre, familia, generica)."""
    v = str(version)
    m = re.match(r"^10\.0\.(\d+)\.x$", v)
    if m and m.group(1) in BUILDS:
        nombre = BUILDS[m.group(1)]
        return m.group(1), nombre, " ".join(nombre.split()[:2]), False
    if v == "Windows 10":
        return None, "Windows 10 (sin build)", "Windows 10", True
    if v == "Windows 11":
        return None, "Windows 11 (sin build)", "Windows 11", True
    if v == "Windows (versión agrupada)":
        return None, "Windows (sin versión)", "Windows (sin versión)", True
    if so == "macOS":
        if v == "macOS 15":
            return None, "macOS 15", "macOS", False
        if v == "26.0.x":
            return None, "macOS 26", "macOS", False
        return None, "macOS (sin versión)", "macOS", True
    return None, "Revisar versión", "Revisar versión", True


def detectar_corte(crudo: pd.DataFrame) -> str | None:
    """Corte AAAA-MM que usaría limpiar() si no se indica --corte: el mes de logon más reciente. None si no hay."""
    if "Mes Último Logon" not in crudo.columns:
        return None
    meses = crudo["Mes Último Logon"].map(mes_aaaa_mm).dropna()
    return max(meses) if len(meses) else None


def validar_entrada(df: pd.DataFrame) -> None:
    """Avisos (no detienen el proceso) sobre columnas o valores que la limpieza no conoce."""
    conocidas = set(COLUMNAS_ORIGEN) | set(COLUMNAS_MACOS)
    nuevas = [c for c in df.columns if c not in conocidas]
    if nuevas:                                                             # E07
        aviso("E07", f"el archivo trae {len(nuevas)} columnas que no conozco y se ignoran: {nuevas}")
    for col, ok in VALORES_CONOCIDOS.items():                              # E09
        raros = set(df[col].dropna().astype(str).str.strip().unique()) - ok
        if raros:
            aviso("E09", f"valores nuevos en '{col}': {sorted(raros)}. Se procesan, pero revisa que no sean errores de captura.")
    mes = df["Mes Último Logon"]
    ilegibles = mes.notna() & mes.map(mes_aaaa_mm).isna() & (mes.astype(str).str.strip() != "No disponible")
    if ilegibles.any():                                                    # E09
        aviso("E09", f"{int(ilegibles.sum())} valores de 'Mes Último Logon' no se pudieron leer como AAAA-MM "
                     f"(por ejemplo {mes[ilegibles].iloc[0]!r}); quedan sin mes de logon.")


def limpiar(df: pd.DataFrame, corte: str | None = None):
    """Devuelve (dataset_limpio, tabla_macos, reglas, corte AAAA-MM).
    Si hay EquipoID repetidos devuelve (None, filas_repetidas, reglas, None)."""
    reglas = []

    def regla(nombre, filas, nota=""):
        reglas.append({"regla": nombre, "filas_afectadas": int(filas), "nota": nota})

    d = df.copy()

    # 1. Espacios y mayúsculas
    cambiadas = 0
    for c in d.columns:
        if d[c].dtype == "object" or pd.api.types.is_string_dtype(d[c]):
            antes = d[c]
            despues = antes.str.replace("\xa0", " ", regex=False).str.strip()
            cambiadas += int((antes.fillna("") != despues.fillna("")).sum())
            d[c] = despues
    regla("Quitar espacios sobrantes en texto", cambiadas)
    d["EquipoID"] = d["EquipoID"].str.upper()

    # 2. Llave única
    dup = int(d["EquipoID"].duplicated().sum())
    regla("EquipoID duplicados", dup, "Si es mayor que 0 el proceso se detiene")
    if dup:
        return None, d.loc[d["EquipoID"].duplicated(keep=False), ["EquipoID"]], reglas, None

    o = pd.DataFrame(index=d.index)
    o["equipo_id"] = d["EquipoID"]

    # 3. Usuario
    sin_usuario = d["UsuarioID"].isin(["No asignado", "No disponible", ""]) | d["UsuarioID"].isna()
    o["usuario_id"] = d["UsuarioID"].where(~sin_usuario)
    o["usuario_sin_asignar"] = sin_usuario
    por_usuario = o["usuario_id"].map(o["usuario_id"].value_counts())
    o["equipos_por_usuario"] = por_usuario.astype(float)
    o["usuario_multiequipo"] = por_usuario.fillna(0) >= 2
    o["usuario_posible_compartido"] = por_usuario.fillna(0) >= UMBRAL_CUENTA_COMPARTIDA
    regla("Usuario 'No asignado' convertido a nulo", sin_usuario.sum())
    regla("Usuarios con 2 o más equipos (bandera)", o["usuario_multiequipo"].sum(), "Filas de equipos, no usuarios")
    regla(f"Usuarios con {UMBRAL_CUENTA_COMPARTIDA} o más equipos (posible cuenta compartida)",
          o["usuario_posible_compartido"].sum(), "Filas de equipos, hay que validarlas con el cliente")

    # 4. País y región
    o["pais"] = d["País"].replace({"No disponible": "Sin país"})
    o["region"] = d["Región"].replace({"No disponible": "Sin región"})
    regla("País 'No disponible' a 'Sin país'", (d["País"] == "No disponible").sum(), "No se infiere país")
    regla("Región 'No disponible' a 'Sin región'", (d["Región"] == "No disponible").sum())

    # 5. Sistema operativo y versión
    o["sistema_operativo"] = d["Sistema Operativo"]
    info = [interpretar_version(v, s_) for v, s_ in zip(d["Versión SO"], d["Sistema Operativo"])]
    o["version_so_original"] = d["Versión SO"]
    o["build_so"] = [i[0] for i in info]
    o["version_so"] = [i[1] for i in info]
    o["familia_so"] = [i[2] for i in info]
    o["version_generica"] = [i[3] for i in info]
    o["windows10_fuera_de_soporte"] = o["familia_so"] == "Windows 10"
    regla("Versión de SO traducida a nombre y familia", len(o))
    regla("Versiones genéricas (sin build)", o["version_generica"].sum(), "Se conservan con bandera")
    regla("Equipos Windows 10 (soporte terminó en octubre de 2025)", o["windows10_fuera_de_soporte"].sum(),
          "Incluye builds 19043, 19044, 19045 y los genéricos")

    # 6. TPM y readiness
    o["estado_tpm"] = d["Estado TPM"]
    o["readiness_cifrado"] = d["Encryption Readiness"]
    o["flag_tpm_obsoleto"] = d["Estado TPM"] == "TPM 1.2"

    # 7. Cifrado
    o["estado_cifrado"] = d["Estado de Cifrado"]
    o["tecnologia_bitlocker"] = d["Tecnología de cifrado State"].map(TECNOLOGIA).fillna("Revisar valor")
    cif = d["Estado de Cifrado"] == "Encrypted"
    nocif = d["Estado de Cifrado"] == "Not encrypted"
    tec = o["tecnologia_bitlocker"]
    o["cifrado_efectivo"] = np.select(
        [nocif,
         cif & (tec == "Success"),
         cif & tec.isin(["TPM no usado (requerido por política)", "Disco fijo sin cifrar"]),
         cif],
        ["No cifrado", "Cifrado conforme", "Cifrado con desviación", "Cifrado sin validar configuración"],
        default="Sin dato",
    )
    o["estado_cumplimiento"] = d["Estado de Cumplimiento"]

    # 8. Banderas de contradicción (solo se marcan)
    cumple = d["Estado de Cumplimiento"] == "Compliant"
    o["flag_compliant_sin_cifrar"] = cumple & nocif
    o["flag_success_sin_cifrar"] = (tec == "Success") & nocif
    o["flag_config_incoherente_sin_cifrar"] = nocif & tec.isin(
        ["TPM no usado (requerido por política)", "Método distinto al de la política"])
    o["flag_cifrado_cumplimiento_unknown"] = cif & (d["Estado de Cumplimiento"] == "Unknown")
    o["flag_not_ready_pero_cifrado"] = (d["Encryption Readiness"] == "Not ready") & cif
    o["flag_ready_pero_no_cifrado"] = (d["Encryption Readiness"] == "Ready") & nocif
    for col, texto in [
        ("flag_compliant_sin_cifrar", "Compliant pero sin cifrar"),
        ("flag_success_sin_cifrar", "BitLocker 'Success' pero sin cifrar"),
        ("flag_config_incoherente_sin_cifrar",
         "Sin cifrar pero con mensaje de TPM o método distinto (que describen equipos cifrados)"),
        ("flag_cifrado_cumplimiento_unknown", "Cifrado con cumplimiento 'Unknown'"),
        ("flag_not_ready_pero_cifrado", "Readiness 'Not ready' pero ya cifrado"),
        ("flag_ready_pero_no_cifrado", "Readiness 'Ready' pero sin cifrar"),
    ]:
        regla(f"Bandera: {texto}", o[col].sum(), "Solo se marca, no se corrige")

    # 9. Cuenta, logon y recencia
    o["estado_cuenta"] = d["Estado de Cuenta"]
    mes_txt = d["Mes Último Logon"].map(mes_aaaa_mm)
    mes = pd.to_datetime(mes_txt, format="%Y-%m", errors="coerce")
    o["mes_ultimo_logon"] = mes_txt.where(mes.notna())
    o["fecha_ultimo_logon_mes"] = mes
    if corte:
        ct = pd.Timestamp(f"{corte}-01")
    elif mes.notna().any():
        ct = mes.max()
    else:
        salir(None, "no hay ningún mes de logon válido en el archivo y no se indicó --corte AAAA-MM.")
    o["meses_desde_logon"] = ((ct.year - mes.dt.year) * 12 + (ct.month - mes.dt.month)).astype(float)
    o["banda_recencia"] = d["Banda Recencia"]
    o["inactivo_mas_90d"] = d["Banda Recencia"].isin(["91-180 días", ">180 días"])
    regla("Meses desde logon calculados contra la fecha de corte", mes.notna().sum(),
          f"Fecha de corte usada: {ct.date()} (mes de logon más reciente si no se indicó)")
    regla("Equipos inactivos más de 90 días (según banda original)", o["inactivo_mas_90d"].sum())

    # 10. Fuentes y motivo del hueco
    o["fuente_datos"] = d["Fuente de Datos"]
    o["en_mdm"] = a_booleano(d["En MDM"])
    o["en_ad"] = a_booleano(d["En AD"])
    o["en_macos"] = a_booleano(d["En MacOS"])
    o["motivo_sin_dato"] = np.select(
        [d["Fuente de Datos"] == "AD", d["Fuente de Datos"] == "MDM", d["Fuente de Datos"] == "Inventario macOS"],
        ["Solo en AD: sin cifrado, TPM ni readiness", "Solo en MDM: sin país, región ni logon",
         "Solo en inventario macOS: sin MDM ni AD"],
        default="Completo",
    )
    regla("Motivo del hueco asignado por fuente", (o["motivo_sin_dato"] != "Completo").sum())

    # 11. macOS aparte y columna constante fuera
    es_mac = o["en_macos"]
    cols_mac = [c for c in COLUMNAS_MACOS if c in d.columns]
    macos = pd.concat([o.loc[es_mac, ["equipo_id"]], d.loc[es_mac, cols_mac]], axis=1).rename(columns=MACOS_RENOMBRE)
    if "antiguedad_meses" in macos.columns:
        macos["antiguedad_meses"] = pd.to_numeric(macos["antiguedad_meses"], errors="coerce").astype(float)
    regla("Columnas exclusivas de macOS separadas a otra tabla", len(macos), f"{len(cols_mac)} columnas")
    clase = sorted(d["Clase de Equipo"].dropna().unique().tolist()) if "Clase de Equipo" in d.columns else []
    regla("Columna 'Clase de Equipo' descartada", len(d), f"Valores únicos: {clase}")

    return o[COLUMNAS_SALIDA], macos.reset_index(drop=True), reglas, f"{ct.year:04d}-{ct.month:02d}"


def verificar(crudo: pd.DataFrame, limpio: pd.DataFrame) -> None:
    """Verificaciones de la Entrega 3. Se corren ANTES de escribir ninguna salida."""
    problemas = []
    if len(limpio) != len(crudo):
        problemas.append(f"cambió el número de filas ({len(crudo):,} → {len(limpio):,})")
    if not limpio["equipo_id"].is_unique:
        problemas.append("hay equipo_id repetidos")
    if limpio["cifrado_efectivo"].isna().any():
        problemas.append("hay equipos sin cifrado_efectivo")
    raros_tec = crudo.loc[limpio["tecnologia_bitlocker"] == "Revisar valor", "Tecnología de cifrado State"]
    if len(raros_tec):
        problemas.append(f"{len(raros_tec)} equipos con un mensaje de BitLocker desconocido: "
                         f"{sorted(raros_tec.dropna().unique())[:5]}. Agrégalo a TECNOLOGIA en panel.py.")
    raros_ver = crudo.loc[limpio["familia_so"] == "Revisar versión", "Versión SO"]
    if len(raros_ver):
        problemas.append(f"{len(raros_ver)} equipos con una versión de SO desconocida: "
                         f"{sorted(raros_ver.dropna().unique())[:5]}. Si es un build nuevo, agrégalo a BUILDS en panel.py.")
    if problemas:
        salir(None, "no pasó la verificación de la limpieza:\n  - " + "\n  - ".join(problemas))


# ---------------------------------------------------------------------------
# Historial y panel
# ---------------------------------------------------------------------------
# resumen_corte() vive ahora en historial.py (P2): mismos 14 indicadores + cifrado efectivo e incidencias


def calcular_historial(ruta: Path, fila: dict):
    """Calcula el historial nuevo EN MEMORIA (todavía no escribe nada).
    Devuelve (historial, reemplazo, vencidos): reemplazo es True si el corte ya existía y vencidos son los
    cortes de más de VIDA_UTIL_ANIOS años que se retiran. El historial solo se actualiza (upsert), no se reescribe."""
    try:
        hist = pd.read_csv(ruta, dtype={"corte": str}) if ruta.exists() else pd.DataFrame()
        if len(hist) and "corte" not in hist.columns:
            raise ValueError("no tiene la columna 'corte'")
    except Exception as e:                                                 # E13
        salir("E13", f"no pude leer {ruta.name}: está dañado. Restaura {ruta.name}.bak (copia de antes de "
                     f"la última corrida) o bórralo para empezar el historial de cero.",
              f"{type(e).__name__}: {e}")
    reemplazo = bool(len(hist)) and bool((hist["corte"] == fila["corte"]).any())
    if len(hist):
        hist = hist[hist["corte"] != fila["corte"]]            # re-procesar un corte lo reemplaza
    hist = pd.concat([hist, pd.DataFrame([fila])], ignore_index=True).sort_values("corte")
    hist, vencidos = purgar_vencidos(hist, proteger=[fila["corte"]])       # vida útil: 5 años
    return hist, reemplazo, vencidos


def a_columnas(d: pd.DataFrame) -> dict:
    """Empaca la tabla por columnas; los textos repetidos van como catálogo + índices (ahorra memoria)."""
    cols = {}
    for c in d.columns:
        s = d[c]
        if s.dtype == bool:
            cols[c] = {"b": s.astype(int).tolist()}
        elif c in {"meses_desde_logon", "equipos_por_usuario", "build_so"}:
            cols[c] = {"n": [None if pd.isna(v) else int(v) for v in s]}
        else:
            s = [None if v is None or (not isinstance(v, str) and pd.isna(v)) else str(v) for v in s]
            cat = sorted({v for v in s if v is not None})
            pos = {v: i for i, v in enumerate(cat)}
            cols[c] = {"c": cat, "v": [-1 if v is None else pos[v] for v in s]}
    return {"n": len(d), "cols": cols}


def armar_html(d, tabla_macos, reglas, hist, corte, archivo, dummy, salida) -> str:
    campos_panel = [c for c, _ in DICCIONARIO if c not in {"fecha_ultimo_logon_mes", "version_so_original"}]
    datos = {
        "meta": {"corte": corte, "archivo": archivo, "dummy": dummy, "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
                 "umbral_compartida": UMBRAL_CUENTA_COMPARTIDA, "semaforo": SEMAFORO},
        "equipos": a_columnas(d[campos_panel]),
        "reglas": reglas,
        "diccionario": [{"columna": c, "descripcion": t} for c, t in DICCIONARIO],
        "historial": json.loads(hist.to_json(orient="records", force_ascii=False)),
        "historico": datos_historico(hist, salida, corte, d),        # P2: pestañas Histórico e Información del corte
        "macos": json.loads(tabla_macos.to_json(orient="records", force_ascii=False)),
    }
    js = json.dumps(datos, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = PLANTILLA.read_text(encoding="utf-8")
    # Los estilos y el JS viven en archivos aparte (ver PIEZAS_PLANTILLA); se incrustan en su marcador
    # para que el panel siga siendo un solo HTML.
    for marcador, nombre in PIEZAS_PLANTILLA:
        if marcador in html:
            f = AQUI / nombre
            if not f.exists():
                salir(None, f"la plantilla necesita '{nombre}' y no está junto a panel.py.")
            html = html.replace(marcador, f.read_text(encoding="utf-8").rstrip("\n"))
    return html.replace("/*__DATOS__*/null", js)


def escribir_salidas(salida, carpeta, ruta_hist, ruta_html, limpio, macos, reglas, hist, html):
    """Escribe todo en una carpeta temporal y solo al final reemplaza los archivos anteriores."""
    tmp = salida / f".tmp_{carpeta.name}"
    nombres = ["dataset_limpio.csv", "reglas_aplicadas.csv", "diccionario_columnas.csv", "macos_detalle.csv"]
    try:
        if tmp.exists():
            shutil.rmtree(tmp)
        tmp.mkdir(parents=True)
        limpio.to_csv(tmp / nombres[0], index=False, encoding="utf-8-sig")
        pd.DataFrame(reglas).to_csv(tmp / nombres[1], index=False, encoding="utf-8-sig")
        pd.DataFrame(DICCIONARIO, columns=["columna", "descripcion"]).to_csv(tmp / nombres[2], index=False, encoding="utf-8-sig")
        macos.to_csv(tmp / nombres[3], index=False, encoding="utf-8-sig")
        hist.to_csv(tmp / "historial.csv", index=False, encoding="utf-8-sig")
        (tmp / ruta_html.name).write_text(html, encoding="utf-8")
        # Todo se escribió bien en la carpeta temporal: ahora sí se reemplazan las salidas
        verificar_escritura([carpeta / n for n in nombres] + [ruta_hist, ruta_html])
        carpeta.mkdir(exist_ok=True)
        for n in nombres:
            os.replace(tmp / n, carpeta / n)
        if ruta_hist.exists():
            shutil.copy2(ruta_hist, ruta_hist.with_name(ruta_hist.name + ".bak"))   # respaldo antes de actualizar
        os.replace(tmp / "historial.csv", ruta_hist)
        os.replace(tmp / ruta_html.name, ruta_html)
    except OSError as e:                                                   # E12
        salir("E12", f"no pude escribir en '{salida}' (sin permiso, disco lleno o archivos abiertos). "
                     "Cierra los archivos que tengas abiertos, libera espacio o elige otra carpeta con --salida.",
              f"{type(e).__name__}: {e}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def borrar_cortes_vencidos(salida: Path, vencidos) -> None:
    """Borra la carpeta corte_AAAA-MM y el panel_cifrado_AAAA-MM.html de los cortes retirados por vida útil.
    Se llama después de escribir las salidas nuevas. Si no se puede borrar algo, solo avisa (no falla el proceso)."""
    for c in vencidos:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(c)):            # nunca borrar rutas raras
            continue
        try:
            if (salida / f"corte_{c}").exists():
                shutil.rmtree(salida / f"corte_{c}")
            (salida / f"panel_cifrado_{c}.html").unlink(missing_ok=True)
        except OSError as e:
            aviso("E15", f"no pude borrar los archivos del corte {c} ({type(e).__name__}); bórralos a mano si ya no los necesitas.")


# ---------------------------------------------------------------------------
def procesar(origen, nombre: str, corte: str | None = None, salida: Path | str = "salidas", dummy: bool = False,
             progreso=None) -> dict:
    """Todo el pipeline para UN archivo: lee, valida, limpia, calcula historial, genera el panel y escribe las salidas.
    La usan la terminal (main) y la pantalla de carga (app.py), así la lógica es la misma en los dos.
    origen = Path o BytesIO · nombre = nombre del archivo (para la extensión y para el historial) ·
    progreso = función opcional que recibe un texto con la etapa en curso.
    Lanza ErrorPanel (con código) si algo falla; en ese caso no se modifica ninguna salida previa."""
    inicio = time.perf_counter()
    AVISOS.clear()
    avanzar = progreso or (lambda _t: None)
    salida = Path(salida)
    if corte and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", corte):
        salir(None, f"el corte debe tener formato AAAA-MM (por ejemplo 2025-11); recibí '{corte}'.")
    if nombre.startswith("~$"):                                            # temporal de Excel
        salir("E05", f"'{nombre}' es el archivo temporal que crea Excel mientras el libro está abierto, "
                     "no el Excel real. Usa el archivo sin el '~$' al inicio.")
    if Path(nombre).suffix.lower() not in {".xlsx", ".xlsm", ".csv"}:       # E03
        salir("E03", f"'{nombre}' no es un Excel (.xlsx). Guarda el archivo de FEMSA como .xlsx y vuelve a intentar.")

    # --- 1. leer, limpiar y verificar TODO en memoria -----------------------
    avanzar("Leyendo el archivo")
    try:
        crudo = leer_archivo(origen, nombre)
    except ErrorPanel:
        raise
    except PermissionError as e:                                           # E04
        salir("E04", f"no puedo abrir '{nombre}': parece estar abierto en Excel o en otro programa. "
                     "Ciérralo y vuelve a intentar.", f"{type(e).__name__}: {e}")
    except Exception as e:                                                 # E05
        salir("E05", f"no pude leer '{nombre}': el archivo parece dañado o no es el Excel de FEMSA. "
                     "Ábrelo en Excel para comprobar que se vea bien, o pide una copia nueva.",
              f"{type(e).__name__}: {e}")
    avanzar("Validando la estructura")
    validar_entrada(crudo)
    avanzar("Aplicando las reglas de limpieza")
    limpio, macos, reglas, corte = limpiar(crudo, corte)

    if limpio is None:
        rep = salida / "equipos_duplicados.csv"
        try:
            salida.mkdir(parents=True, exist_ok=True)
            macos.to_csv(rep, index=False, encoding="utf-8-sig")
        except OSError:
            rep = "(no pude guardar el reporte)"
        salir(None, f"hay {len(macos)} filas con EquipoID repetido, y es la llave del historial. "
                    f"Revisa {rep} y corrige el archivo.")
    verificar(crudo, limpio)
    carpeta = salida / f"corte_{corte}"
    ruta_hist = salida / "historial.csv"
    ruta_html = salida / f"panel_cifrado_{corte}.html"
    avanzar("Actualizando el historial")
    try:
        fila = resumen_corte(limpio, corte, nombre)
    except ErrorHistorial as e:
        salir(None, str(e))
    hist, reemplazo, vencidos = calcular_historial(ruta_hist, fila)
    if reemplazo:                                                          # E14
        aviso("E14", f"el corte {corte} ya estaba en el historial: se reemplazó su fila (la anterior quedó en historial.csv.bak).")
    if vencidos:                                                           # E15
        aviso("E15", f"se retiraron del historial {len(vencidos)} corte(s) de más de {VIDA_UTIL_ANIOS} años: "
                     f"{', '.join(vencidos)}. Sus CSV y su panel se borran al terminar; la copia previa del historial "
                     "quedó en historial.csv.bak.")
    avanzar("Generando el panel")
    html = armar_html(limpio, macos, reglas, hist, corte, nombre, dummy, salida)

    # --- 2. escribir (todo o nada) -------------------------------------------
    avanzar("Guardando las salidas")
    try:
        salida.mkdir(parents=True, exist_ok=True)
    except OSError as e:                                                   # E12
        salir("E12", f"no puedo crear la carpeta '{salida}'. Elige otra carpeta de salidas.", f"{type(e).__name__}: {e}")
    escribir_salidas(salida, carpeta, ruta_hist, ruta_html, limpio, macos, reglas, hist, html)
    borrar_cortes_vencidos(salida, vencidos)         # solo después de escribir todo bien
    return {"corte": corte, "archivo": nombre, "equipos": len(limpio), "reglas": reglas, "avisos": list(AVISOS),
            "carpeta": carpeta, "ruta_hist": ruta_hist, "ruta_html": ruta_html, "html": html, "reemplazo": reemplazo,
            "vencidos": vencidos, "segundos": time.perf_counter() - inicio}


def main():
    global DETALLE
    ap = argparse.ArgumentParser(description="Ingesta, limpieza y panel de cifrado (local)")
    ap.add_argument("archivo", nargs="?", default=None, help="Excel que entrega FEMSA")
    ap.add_argument("--corte", help="Fecha de corte AAAA-MM (por defecto: mes de logon más reciente)")
    ap.add_argument("--salida", default="salidas", help="Carpeta de salida (por defecto: salidas)")
    ap.add_argument("--dummy", action="store_true", help="Marca el panel con la etiqueta DATOS DUMMY")
    ap.add_argument("--no-abrir", action="store_true", help="No abrir el navegador al terminar")
    ap.add_argument("--detalle", action="store_true", help="Muestra el detalle técnico de los errores")
    args = ap.parse_args()
    DETALLE = args.detalle
    try:
        _main_terminal(args)
    except ErrorPanel as e:
        sys.exit(e.texto(DETALLE))


def _main_terminal(args):
    # --- entradas -----------------------------------------------------------
    if args.corte and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.corte):
        salir(None, f"--corte debe tener formato AAAA-MM (por ejemplo 2025-11); recibí '{args.corte}'.")
    if args.archivo is None:
        defecto = AQUI / "Dataset Académico de Cifrado en PCs.xlsx"
        if not defecto.exists():                                           # E01
            salir("E01", "no indicaste el archivo. Uso:\n    python panel.py ruta/al/archivo.xlsx\n"
                         "(si la ruta tiene espacios, ponla entre comillas).\n"
                         "O abre la pantalla de carga con iniciar_panel.bat (Windows) / iniciar_panel.command (Mac).")
        ruta = defecto
    else:
        ruta = Path(args.archivo)
    if not ruta.exists():                                                  # E02
        salir("E02", f"no encuentro '{ruta}'. Revisa la ruta (si tiene espacios, ponla entre comillas).")
    print(f"Leyendo {ruta.name} ...")
    r = procesar(ruta, ruta.name, args.corte, args.salida, args.dummy)
    corte, reglas = r["corte"], r["reglas"]
    avisos = r["avisos"]
    if not args.corte:
        avisos.append(f"No se indicó --corte: se usó {corte} (mes de logon más reciente).")

    # --- resumen final ------------------------------------------------------
    print(f"\n{len(reglas)} reglas aplicadas sobre {r['equipos']:,} equipos (corte {corte}):")
    for x in reglas:
        print(f"  {x['filas_afectadas']:>6,}  {x['regla']}")
    print(f"\nListo en {r['segundos']:.1f} s")
    print(f"  Corte:               {corte}")
    print(f"  Equipos procesados:  {r['equipos']:,}")
    print(f"  Avisos:              {len(avisos)}")
    for a_ in avisos:
        print(f"    - {a_}")
    print(f"  Salidas en:          {r['carpeta']}/ y {r['ruta_hist']}")
    print(f"  Panel:               {r['ruta_html'].resolve()}")
    if not args.no_abrir:
        webbrowser.open(r["ruta_html"].resolve().as_uri())


if __name__ == "__main__":
    main()
