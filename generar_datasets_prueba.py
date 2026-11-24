"""
generar_datasets_prueba.py
==========================
Crea, a partir de dataset_sintetico_2026.xlsx (corte 2026-11), los archivos de prueba de dos escenarios:

  1) datos_demo/equipo/dataset_sintetico_2026-08.xlsx  -> corte anterior (3 meses antes) con los MISMOS EquipoID:
       · altas  (equipos que están en 2026-11 y no en 2026-08)
       · bajas  (equipos que estaban en 2026-08 y ya no están en 2026-11)
       · cambios de estado de cifrado (sin cifrar -> cifrado, y algunos al revés)
     Sirve para ver la pestaña Histórico con movimientos equipo por equipo.

  2) datos_demo/purga/dataset_purga_2020-12.xlsx, _2021-10.xlsx, _2021-11.xlsx -> cortes viejos (muestra de 3,000 equipos)
     Contra el corte más reciente (2026-11) el límite de vida útil es 2021-11 (5 años):
       2020-12 y 2021-10 se retiran; 2021-11 (exactamente 5 años) se conserva.

Los datos son sintéticos y reutilizan columnas del archivo base (por eso aparecen builds recientes en cortes viejos).
Uso:  python generar_datasets_prueba.py [ruta_al_2026.xlsx]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import openpyxl
import pandas as pd

AQUI = Path(__file__).resolve().parent
BASE = AQUI / "datos_demo" / "equipo" / "dataset_sintetico_2026.xlsx"
CORTE_BASE = (2026, 11)
COL_MES = "Mes Último Logon"
COLS_CIFRADO = ["Estado de Cifrado", "Tecnología de cifrado State", "Estado de Cumplimiento", "Encryption Readiness"]


def _mes_a_indice(m: str) -> int:
    return int(m[:4]) * 12 + int(m[5:7]) - 1


def _indice_a_mes(i: int) -> str:
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def desplazar_meses(d: pd.DataFrame, meses: int) -> pd.DataFrame:
    """Mueve todos los 'Mes Último Logon' `meses` hacia atrás. Las bandas de recencia no cambian porque la distancia al corte es la misma."""
    d = d.copy()
    ok = d[COL_MES] != "No disponible"
    d.loc[ok, COL_MES] = d.loc[ok, COL_MES].map(lambda m: _indice_a_mes(_mes_a_indice(m) - meses))
    return d


def escribir(d: pd.DataFrame, destino: Path, origen: Path) -> None:
    """Misma disposición que el original: título en la fila 1, encabezados en la fila 3, hoja 'Dataset_Academico'."""
    titulo = openpyxl.load_workbook(origen, read_only=True)["Dataset_Academico"]["A1"].value
    destino.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet("Dataset_Academico")
    ws.append([titulo]); ws.append([])
    ws.append(list(d.columns))
    for fila in d.itertuples(index=False, name=None):
        ws.append([None if (isinstance(v, float) and np.isnan(v)) else v for v in fila])
    wb.save(destino)


def corte_anterior(base: pd.DataFrame, rng: np.random.Generator, meses_antes: int = 3,
                   altas: int = 1200, bajas: int = 700, mejoran: int = 1800, empeoran: int = 250) -> pd.DataFrame:
    d = desplazar_meses(base, meses_antes)
    mdm = d["En MDM"].astype(str).str.lower().isin(["true", "1", "si", "sí", "verdadero"]) | d["Fuente de Datos"].isin(["MDM", "MDM + AD"])
    # Cambios de estado de cifrado: se copia el perfil completo (estado, tecnología, cumplimiento, readiness) de un equipo "donante"
    # de la misma fuente, así cada combinación sigue siendo coherente con las reglas del panel.
    def donar(idx, estado_destino):
        for fuente, grupo in d.loc[idx].groupby("Fuente de Datos"):
            donantes = d[(d["Estado de Cifrado"] == estado_destino) & (d["Fuente de Datos"] == fuente)]
            if donantes.empty:
                continue
            elegidos = donantes.sample(len(grupo), replace=True, random_state=int(rng.integers(1e9)))[COLS_CIFRADO].to_numpy()
            d.loc[grupo.index, COLS_CIFRADO] = elegidos
    cifrados = d.index[(d["Estado de Cifrado"] == "Encrypted") & mdm]
    sin_cifrar = d.index[(d["Estado de Cifrado"] == "Not encrypted") & mdm]
    donar(rng.choice(cifrados, mejoran, replace=False), "Not encrypted")        # antes sin cifrar; hoy cifrados (mejoraron)
    donar(rng.choice(sin_cifrar, min(empeoran, len(sin_cifrar)), replace=False), "Encrypted")   # antes cifrados; hoy sin cifrar (empeoraron)
    # Altas: equipos que NO están en el corte anterior (sí en el nuevo). No se quitan equipos macOS.
    quitables = d.index[d["Fuente de Datos"] != "Inventario macOS"]
    d = d.drop(index=rng.choice(quitables, altas, replace=False))
    # Bajas: equipos que SÍ estaban en el corte anterior y ya no están en el nuevo (IDs nuevos que no existen en 2026-11)
    nuevos = d[d["Fuente de Datos"].isin(["MDM + AD", "AD", "MDM"])].sample(bajas, random_state=int(rng.integers(1e9))).copy()
    ultimo = int(base["EquipoID"].str[-5:].astype(int).max())
    nuevos["EquipoID"] = [f"PC-S{ultimo + i + 1:05d}" for i in range(bajas)]
    nuevos["UsuarioID"] = [f"U-S{int(rng.integers(1, 9000)):05d}" for _ in range(bajas)]
    return pd.concat([d, nuevos], ignore_index=True).sort_values("EquipoID").reset_index(drop=True)


def corte_viejo(base: pd.DataFrame, corte: str, rng: np.random.Generator, n: int = 3000) -> pd.DataFrame:
    meses = _mes_a_indice(f"{CORTE_BASE[0]}-{CORTE_BASE[1]:02d}") - _mes_a_indice(corte)
    muestra = base.sample(n, random_state=int(rng.integers(1e9))).sort_values("EquipoID").reset_index(drop=True)
    return desplazar_meses(muestra, meses)


def main() -> None:
    origen = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE
    base = pd.read_excel(origen, header=2)
    rng = np.random.default_rng(2026)
    salida = origen.parent
    ant = corte_anterior(base, rng)
    escribir(ant, salida / "dataset_sintetico_2026-08.xlsx", origen)
    print(f"2026-08: {len(ant):,} equipos")
    for c in ("2020-12", "2021-10", "2021-11"):
        v = corte_viejo(base, c, rng)
        escribir(v, AQUI / "datos_demo" / "purga" / f"dataset_purga_{c}.xlsx", origen)
        print(f"{c}: {len(v):,} equipos")


if __name__ == "__main__":
    main()
