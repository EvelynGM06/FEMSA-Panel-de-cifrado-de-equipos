"""
historial.py  ·  Persona 2: Histórico y métricas
=================================================
Módulo que importa panel.py. No limpia datos (eso es de P1) ni dibuja el HTML
(eso es de P3): solo calcula el resumen de cada corte, guarda historial.csv y
compara dos cortes.

Uso desde panel.py:
    from historial import resumen_corte, actualizar_historial, datos_historico
    hist = actualizar_historial(salida / "historial.csv", resumen_corte(limpio, corte, ruta.name))
    ...
    datos["historico"] = datos_historico(hist, salida)      # para el HTML (pestaña Histórico)

Prueba suelta:
    python historial.py salidas            # compara los 2 últimos cortes de salidas/
    python historial.py salidas 2025-11 2026-02
"""

from __future__ import annotations

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Vida útil (retro FEMSA): el historial conserva como máximo 5 años de cortes.
# Es una ventana por corte: se descartan los cortes con más de VIDA_UTIL_ANIOS años respecto al corte más
# reciente. El historial NO se reescribe desde cero: solo se agrega o reemplaza la fila del corte procesado
# (upsert) y, después, se retiran los cortes vencidos. Criterio de baja por equipo: pendiente con FEMSA.
# ---------------------------------------------------------------------------
VIDA_UTIL_ANIOS = 5


class ErrorHistorial(Exception):
    """Problema con los datos o con historial.csv. panel.py lo convierte en un mensaje claro (antes era sys.exit)."""


def _indice_mes(corte) -> int | None:
    """'2025-11' -> 24310 (año*12 + mes-1). None si el corte no tiene formato AAAA-MM."""
    m = re.fullmatch(r"(\d{4})-(\d{2})", str(corte).strip())
    return int(m.group(1)) * 12 + int(m.group(2)) - 1 if m else None


def purgar_vencidos(hist: pd.DataFrame, anios: int = VIDA_UTIL_ANIOS, proteger=()) -> tuple[pd.DataFrame, list[str]]:
    """Quita del historial los cortes con más de `anios` años respecto al corte más reciente.
    Un corte de exactamente `anios` años todavía se conserva. Nunca se quita un corte de `proteger`
    (el que se está procesando ahora) ni uno con formato raro. Devuelve (historial, cortes_quitados)."""
    if hist.empty:
        return hist, []
    meses = hist["corte"].map(_indice_mes)
    validos = meses.dropna()
    if validos.empty:
        return hist, []
    limite = validos.max() - anios * 12
    vencido = meses.notna() & (meses < limite) & ~hist["corte"].isin(list(proteger))
    return hist[~vencido].reset_index(drop=True), hist.loc[vencido, "corte"].tolist()


# ---------------------------------------------------------------------------
# Catálogo de incidencias (T9). PROVISIONAL: confirmar con el equipo que los
# 7 grupos son estos y revisar el nivel de riesgo. Para agregar o quitar una
# incidencia solo se edita esta lista; historial.csv, la comparación y el HTML
# se ajustan solos. Si una incidencia no tiene casos, se reporta 0 (no se omite).
# ---------------------------------------------------------------------------
CATALOGO_INCIDENCIAS = [
    {"id": "tpm_obsoleto", "columna": "flag_tpm_obsoleto", "nombre": "TPM 1.2 (obsoleto)",
     "criterio": "Estado TPM = TPM 1.2", "nivel": "Medio"},
    {"id": "compliant_sin_cifrar", "columna": "flag_compliant_sin_cifrar", "nombre": "Compliant pero sin cifrar",
     "criterio": "Cumplimiento = Compliant y Estado de cifrado = Not encrypted", "nivel": "Alto"},
    {"id": "success_sin_cifrar", "columna": "flag_success_sin_cifrar", "nombre": "BitLocker 'Success' pero sin cifrar",
     "criterio": "BitLocker = Success y Estado de cifrado = Not encrypted", "nivel": "Alto"},
    {"id": "config_incoherente", "columna": "flag_config_incoherente_sin_cifrar",
     "nombre": "Sin cifrar con mensaje de equipo cifrado",
     "criterio": "Not encrypted con BitLocker 'TPM no usado' o 'Método distinto'", "nivel": "Medio"},
    {"id": "cifrado_cum_unknown", "columna": "flag_cifrado_cumplimiento_unknown",
     "nombre": "Cifrado con cumplimiento Unknown",
     "criterio": "Encrypted y Cumplimiento = Unknown", "nivel": "Bajo"},
    {"id": "not_ready_cifrado", "columna": "flag_not_ready_pero_cifrado", "nombre": "Not ready pero ya cifrado",
     "criterio": "Readiness = Not ready y Encrypted", "nivel": "Bajo"},
    {"id": "ready_sin_cifrar", "columna": "flag_ready_pero_no_cifrado", "nombre": "Ready pero sin cifrar",
     "criterio": "Readiness = Ready y Not encrypted", "nivel": "Alto"},
]

# Las 5 categorías de cifrado_efectivo y el nombre de su columna en historial.csv
CATEGORIAS_CIFRADO = {
    "Cifrado conforme": "cif_conforme",
    "Cifrado con desviación": "cif_desviacion",
    "Cifrado sin validar configuración": "cif_sin_validar",
    "No cifrado": "cif_no_cifrado",
    "Sin dato": "cif_sin_dato",
}

# Métricas que se comparan entre cortes: (columna, etiqueta, es_porcentaje)
METRICAS = [
    ("equipos", "Equipos", False),
    ("pct_cifrado", "% cifrado (sobre todos los equipos)", True),
    ("pct_cifrado_con_dato", "% cifrado (sobre equipos con dato)", True),
    ("pct_sin_dato", "% sin dato", True),
    ("cifrados", "Cifrados", False),
    ("sin_cifrar", "Sin cifrar", False),
    ("sin_dato", "Sin dato", False),
    *[(col, f"Cifrado efectivo: {cat}", False) for cat, col in CATEGORIAS_CIFRADO.items()],
    ("compliant", "Compliant", False),
    ("windows10", "Windows 10", False),
    ("windows10_sin_cifrar", "Windows 10 sin cifrar", False),
    ("inactivos_90d", "Inactivos más de 90 días", False),
    ("solo_ad", "Solo en AD", False),
    ("solo_mdm", "Solo en MDM", False),
    ("sin_usuario", "Sin usuario", False),
    *[(f"inc_{i['id']}", f"Incidencia: {i['nombre']}", False) for i in CATALOGO_INCIDENCIAS],
]


# Columnas que necesita este módulo del dataset limpio. Si P1 cambia los nombres de
# salida de limpiar(), el error sale aquí, claro, y no como un KeyError o un panel vacío.
COLUMNAS_REQUERIDAS = [
    "equipo_id", "estado_cifrado", "cifrado_efectivo", "estado_cumplimiento", "windows10_fuera_de_soporte",
    "inactivo_mas_90d", "en_ad", "en_mdm", "en_macos", "usuario_sin_asignar", "flag_compliant_sin_cifrar",
]


def validar_columnas(d: pd.DataFrame) -> None:
    faltan = [c for c in COLUMNAS_REQUERIDAS + [i["columna"] for i in CATALOGO_INCIDENCIAS] if c not in d.columns]
    if faltan:
        raise ErrorHistorial(f"al dataset limpio le faltan columnas: {faltan}\n"
                             "Si cambiaron los nombres de salida de limpiar(), actualiza COLUMNAS_REQUERIDAS y "
                             "CATALOGO_INCIDENCIAS en historial.py.")


def _pct(parte, total) -> float:
    return round(100 * parte / total, 1) if total else 0.0


# ---------------------------------------------------------------------------
# 1. Resumen de un corte (una fila de historial.csv)
# ---------------------------------------------------------------------------
def resumen_corte(d: pd.DataFrame, corte: str, archivo: str) -> dict:
    """d = dataset_limpio de ese corte. Devuelve un diccionario plano (una fila)."""
    validar_columnas(d)
    n = len(d)
    cif = d["estado_cifrado"].astype(str).str.lower().str.replace(r"[^a-z]", "", regex=True)
    cifrados = int(cif.eq("encrypted").sum())
    no_cif = int(cif.eq("notencrypted").sum())
    sin_dato = int(cif.eq("nodisponible").sum())
    con_dato = n - sin_dato
    w10 = d["windows10_fuera_de_soporte"].astype(bool)

    fila = {
        "corte": corte, "generado": datetime.now().strftime("%Y-%m-%d %H:%M"), "archivo": archivo,
        "equipos": n, "cifrados": cifrados, "sin_cifrar": no_cif, "sin_dato": sin_dato,
        "pct_cifrado": _pct(cifrados, n),                       # igual que la versión original
        "pct_cifrado_con_dato": _pct(cifrados, con_dato),       # sin contar equipos sin dato
        "pct_sin_dato": _pct(sin_dato, n),
        "compliant": int(d["estado_cumplimiento"].eq("Compliant").sum()),
        "windows10": int(w10.sum()),
        "windows10_sin_cifrar": int((w10 & cif.eq("notencrypted")).sum()),
        "inactivos_90d": int(d["inactivo_mas_90d"].astype(bool).sum()),
        "solo_ad": int((d["en_ad"] & ~d["en_mdm"] & ~d["en_macos"]).sum()),
        "solo_mdm": int((d["en_mdm"] & ~d["en_ad"]).sum()),
        "sin_usuario": int(d["usuario_sin_asignar"].astype(bool).sum()),
        "compliant_sin_cifrar": int(d["flag_compliant_sin_cifrar"].astype(bool).sum()),
    }
    # cifrado_efectivo: siempre las 5 categorías, aunque alguna sea 0
    conteo = d["cifrado_efectivo"].value_counts()
    for cat, col in CATEGORIAS_CIFRADO.items():
        fila[col] = int(conteo.get(cat, 0))
    # incidencias: siempre las 7, aunque alguna sea 0
    for inc in CATALOGO_INCIDENCIAS:
        col = inc["columna"]
        fila[f"inc_{inc['id']}"] = int(d[col].astype(bool).sum()) if col in d.columns else 0
    return fila


# ---------------------------------------------------------------------------
# 2. Guardar historial.csv (con respaldo y sin duplicar cortes)
# ---------------------------------------------------------------------------
def actualizar_historial(ruta: Path, fila: dict) -> pd.DataFrame:
    """Agrega la fila del corte; si el corte ya existía, lo reemplaza.
    Deja una copia historial.csv.bak antes de escribir y escribe de forma
    atómica: si algo falla, el historial anterior queda intacto.
    OJO: panel.py no usa esta función (usa calcular_historial); se conserva para uso suelto."""
    ruta = Path(ruta)
    hist = pd.DataFrame()
    if ruta.exists():
        try:
            hist = pd.read_csv(ruta, dtype={"corte": str}, encoding="utf-8-sig")
        except Exception as e:                                   # archivo dañado
            raise ErrorHistorial(f"no se pudo leer {ruta}: {e}\n"
                                 f"Revisa el archivo o restaura {ruta.name}.bak. No se modificó nada.") from e
        shutil.copy2(ruta, ruta.with_suffix(".csv.bak"))
        hist = hist[hist["corte"] != fila["corte"]]
    nueva = pd.DataFrame([fila])
    hist = nueva if hist.empty else pd.concat([hist, nueva], ignore_index=True)
    hist = hist.sort_values("corte").reset_index(drop=True)
    # cortes viejos sin las columnas nuevas quedan vacíos (no se inventan valores)
    tmp = ruta.with_suffix(".csv.tmp")
    hist.to_csv(tmp, index=False, encoding="utf-8-sig")
    tmp.replace(ruta)
    return hist


# ---------------------------------------------------------------------------
# 3. Comparar dos cortes
# ---------------------------------------------------------------------------
def comparar(hist: pd.DataFrame, corte_a: str, corte_b: str) -> pd.DataFrame:
    """Tabla métrica | corte_a | corte_b | variación. corte_a = base, corte_b = nuevo.
    Los porcentajes varían en puntos porcentuales (pp); los conteos en absoluto y en %."""
    h = hist.set_index("corte")
    for c in (corte_a, corte_b):
        if c not in h.index:
            raise ValueError(f"El corte {c} no está en el historial. Cortes disponibles: {list(h.index)}")
    filas = []
    for col, etiqueta, es_pct in METRICAS:
        if col not in h.columns:
            continue
        a, b = h.at[corte_a, col], h.at[corte_b, col]
        if pd.isna(a) or pd.isna(b):                    # corte viejo sin esa métrica
            filas.append({"metrica": etiqueta, "columna": col, "porcentaje": es_pct,
                          corte_a: None, corte_b: None, "variacion": None, "variacion_pct": None})
            continue
        var = round(float(b) - float(a), 1 if es_pct else 0)
        filas.append({"metrica": etiqueta, "columna": col, "porcentaje": es_pct,
                      corte_a: a, corte_b: b, "variacion": var,
                      "variacion_pct": None if es_pct or not a else round(100 * (b - a) / a, 1)})
    return pd.DataFrame(filas)


def movimientos(df_a: pd.DataFrame, df_b: pd.DataFrame) -> dict:
    """Qué pasó con cada equipo entre dos cortes (por equipo_id):
    altas, bajas y matriz de cambio de cifrado_efectivo (de → a)."""
    a, b = df_a.set_index("equipo_id")["cifrado_efectivo"], df_b.set_index("equipo_id")["cifrado_efectivo"]
    comunes = a.index.intersection(b.index)
    matriz = pd.crosstab(a.loc[comunes].rename("de"), b.loc[comunes].rename("a"))
    cambios = [{"de": de, "a": a_, "equipos": int(matriz.at[de, a_])}
               for de in matriz.index for a_ in matriz.columns if de != a_ and matriz.at[de, a_] > 0]
    return {"altas": int(len(b.index.difference(a.index))), "bajas": int(len(a.index.difference(b.index))),
            "en_ambos": int(len(comunes)), "sin_cambio": int(sum(matriz.at[x, x] for x in matriz.index if x in matriz.columns)),
            "cambios": sorted(cambios, key=lambda r: -r["equipos"])}


def cargar_dataset(salida: Path, corte: str, corte_actual: str | None = None,
                   df_actual: pd.DataFrame | None = None) -> pd.DataFrame:
    """Dataset limpio de un corte. Si es el corte que se está procesando ahora, todavía no está
    escrito en disco (panel.py escribe todo al final), así que se usa el DataFrame en memoria."""
    if df_actual is not None and corte == corte_actual:
        return df_actual
    ruta = Path(salida) / f"corte_{corte}" / "dataset_limpio.csv"
    if not ruta.exists():
        raise FileNotFoundError(f"No existe {ruta}. No se puede comparar equipo por equipo ese corte.")
    d = pd.read_csv(ruta, dtype=str, encoding="utf-8-sig")
    return d


# ---------------------------------------------------------------------------
# 4. Paquete de datos para el HTML (contrato con P3, T8)
# ---------------------------------------------------------------------------
def datos_historico(hist: pd.DataFrame, salida: Path, corte_actual: str | None = None,
                    df_actual: pd.DataFrame | None = None) -> dict:
    """Todo lo que necesita la pestaña Histórico. Se agrega a DATOS en generar_html().
    La comparación por defecto es entre los dos últimos cortes; si solo hay uno,
    'comparacion' es None y el HTML debe mostrar 'Se necesita al menos 2 cortes'."""
    cortes = hist["corte"].tolist()
    out = {
        "cortes": cortes,
        "catalogo_incidencias": CATALOGO_INCIDENCIAS,
        "metricas": [{"columna": c, "etiqueta": e, "porcentaje": p} for c, e, p in METRICAS],
        "filas": hist.astype(object).where(hist.notna(), None).to_dict(orient="records"),
        "comparacion": None,
    }
    if len(cortes) >= 2:
        a, b = cortes[-2], cortes[-1]
        comp = comparar(hist, a, b)
        out["comparacion"] = {"base": a, "nuevo": b,
                              "tabla": comp.astype(object).where(comp.notna(), None).to_dict(orient="records")}
        try:
            out["comparacion"]["movimientos"] = movimientos(cargar_dataset(salida, a, corte_actual, df_actual),
                                                            cargar_dataset(salida, b, corte_actual, df_actual))
        except Exception as e:      # el detalle equipo por equipo nunca debe impedir generar el panel
            out["comparacion"]["movimientos"] = None
            out["comparacion"]["aviso"] = f"No se pudo calcular el detalle equipo por equipo: {e}"
    return out


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    salida = Path(sys.argv[1] if len(sys.argv) > 1 else "salidas")
    h = pd.read_csv(salida / "historial.csv", dtype={"corte": str}, encoding="utf-8-sig")
    a, b = (sys.argv[2], sys.argv[3]) if len(sys.argv) > 3 else (h["corte"].iloc[-2], h["corte"].iloc[-1])
    print(f"Comparación {a} → {b}")
    print(comparar(h, a, b)[["metrica", a, b, "variacion", "variacion_pct"]].to_string(index=False))
    print(movimientos(cargar_dataset(salida, a), cargar_dataset(salida, b)))
