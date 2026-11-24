"""
generar_datos_demo.py  ·  Datos SINTÉTICOS para probar el panel sin tocar el Excel real de FEMSA
=================================================================================================
Crea dos archivos con la misma estructura que entrega FEMSA (25 columnas, encabezados en la fila 3):

    datos_demo/Dataset_demo_2025-09.xlsx
    datos_demo/Dataset_demo_2025-11.xlsx

Todo es inventado (IDs, usuarios, proporciones). Sirve para ensayar la pantalla de carga, el
historial entre cortes y los reportes. No contiene ni se parece a datos reales (NDA).

Uso:
    python generar_datos_demo.py                 # 2 cortes, ~1,900 equipos
    python generar_datos_demo.py --equipos 6000  # más equipos
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

from openpyxl import Workbook

COLUMNAS = [
    "EquipoID", "UsuarioID", "País", "Región", "Sistema Operativo", "Versión SO", "Estado TPM",
    "Encryption Readiness", "Estado de Cifrado", "Tecnología de cifrado State", "Estado de Cumplimiento",
    "Estado de Cuenta", "Mes Último Logon", "Banda Recencia", "Clase de Equipo", "Fuente de Datos",
    "En MDM", "En AD", "En MacOS", "Categoría de Equipo", "Perfil de Privilegio", "Antigüedad Meses",
    "Banda Antigüedad", "Estado Hardware", "Tipo de Red",
]
PAISES = {  # país: (región, peso)  · regiones inventadas, igual que en el dummy del Entregable 3
    "México": ("Norte", 30), "Colombia": ("Andina", 12), "Perú": ("Andina", 8), "Ecuador": ("Andina", 5),
    "Brasil": ("Brasil", 14), "Argentina": ("Cono Sur", 10), "Chile": ("Cono Sur", 8),
    "Guatemala": ("Centroamérica", 5), "Costa Rica": ("Centroamérica", 4), "Panamá": ("Centroamérica", 4),
}
BUILDS_WIN = ["10.0.19045.x"] * 3 + ["10.0.22631.x"] * 5 + ["10.0.26100.x"] * 3 + ["10.0.19044.x", "10.0.26200.x"]
TEC_CIF = ["Success"] * 86 + ["TPM not used for protection of OS volume, but is required by policy"] * 5 + \
          ["Fixed Drive not encrypted"] * 3 + ["Encryption method of OS Volume is different than that set by policy"] * 6
TEC_NOC = ["Fixed Drive not encrypted"] * 80 + ["Success"] * 6 + \
          ["TPM not used for protection of OS volume, but is required by policy"] * 8 + \
          ["Encryption method of OS Volume is different than that set by policy"] * 6
ND = "No disponible"


def _mes(corte: str, atras: int) -> str:
    a, m = int(corte[:4]), int(corte[5:])
    t = a * 12 + (m - 1) - atras
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def _banda(atras: int) -> str:
    return "0-30 días" if atras == 0 else "31-90 días" if atras <= 2 else "91-180 días" if atras <= 5 else ">180 días"


def equipo_base(i: int, rnd: random.Random) -> dict:
    """Atributos que no cambian de un corte a otro."""
    pais = rnd.choices(list(PAISES), [p[1] for p in PAISES.values()])[0]
    fuente = rnd.choices(["MDM + AD", "AD", "MDM", "Inventario macOS"], [78, 12, 3, 7])[0]
    return {
        "id": f"EQ{i:06d}", "pais": pais, "region": PAISES[pais][0], "fuente": fuente,
        "usuario": None if rnd.random() < 0.015 else f"USR{rnd.randint(1, 100000):05d}",
        "version": rnd.choice(BUILDS_WIN), "tpm": rnd.choices(["TPM 2", "TPM 1.2"], [94, 6])[0],
        "ready": rnd.choices(["Ready", "Not ready"], [90, 10])[0],
        "cifrado": rnd.random() < 0.9, "atras": rnd.choices([0, 1, 2, 3, 4, 6, 9], [40, 18, 10, 8, 6, 10, 8])[0],
        "cuenta": rnd.choices(["Habilitada", "Deshabilitada"], [96, 4])[0], "mac": rnd.choice(["macOS 15", "26.0.x", "macOS 14"]),
        "generica": rnd.choice(["Windows 10", "Windows 11", "Windows (versión agrupada)"]),
    }


def fila(e: dict, corte: str, rnd: random.Random) -> list:
    f = e["fuente"]
    mes = _mes(corte, e["atras"])
    win = f in ("MDM + AD", "AD", "MDM")
    r = dict.fromkeys(COLUMNAS, ND)
    r.update({"EquipoID": e["id"], "UsuarioID": e["usuario"] or "No asignado", "Clase de Equipo": "PC",
              "Fuente de Datos": f, "En MDM": "Sí" if "MDM" in f else "No", "En AD": "Sí" if "AD" in f else "No",
              "En MacOS": "Sí" if f == "Inventario macOS" else "No", "Estado de Cuenta": e["cuenta"]})
    r["Sistema Operativo"] = "macOS" if f == "Inventario macOS" else "Windows"
    if f in ("MDM + AD", "AD"):
        r["País"], r["Región"] = e["pais"], e["region"]
        r["Mes Último Logon"], r["Banda Recencia"] = mes, _banda(e["atras"])
    if f == "MDM + AD":
        r["Versión SO"], r["Estado TPM"], r["Encryption Readiness"] = e["version"], e["tpm"], e["ready"]
        cif = e["cifrado"]
        r["Estado de Cifrado"] = "Encrypted" if cif else "Not encrypted"
        r["Tecnología de cifrado State"] = rnd.choice(TEC_CIF if cif else TEC_NOC)
        r["Estado de Cumplimiento"] = (rnd.choices(["Compliant", "Unknown"], [85, 15]) if cif else rnd.choices(["Compliant", "Unknown"], [8, 92]))[0]
    elif f == "AD":
        r["Versión SO"] = e["generica"]
    elif f == "MDM":
        r["Versión SO"], r["Estado TPM"], r["Encryption Readiness"] = e["version"], e["tpm"], e["ready"]
        cif = e["cifrado"]
        r["Estado de Cifrado"] = "Encrypted" if cif else "Not encrypted"
        r["Tecnología de cifrado State"] = rnd.choice(TEC_CIF if cif else TEC_NOC)
        r["Estado de Cumplimiento"] = "Unknown"
    else:  # macOS: inventario aparte, sin MDM ni AD
        r["Versión SO"], r["Estado TPM"], r["Tecnología de cifrado State"] = e["mac"], "No aplica", "No aplica"
        r.update({"Categoría de Equipo": rnd.choice(["Portátil", "Escritorio"]), "Perfil de Privilegio": rnd.choice(["Estándar", "Administrador"]),
                  "Antigüedad Meses": str(rnd.randint(1, 60)), "Banda Antigüedad": rnd.choice(["0-12 meses", "13-36 meses", "más de 36 meses"]),
                  "Estado Hardware": rnd.choice(["Bueno", "Regular"]), "Tipo de Red": rnd.choice(["Corporativa", "Remota"])})
    return [r[c] for c in COLUMNAS]


def escribir(ruta: Path, corte: str, filas: list[list]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Dataset"
    ws.append([f"Dataset de cifrado en PCs · DATOS SINTÉTICOS DE PRUEBA · corte {corte}"])
    ws.append([])
    ws.append(COLUMNAS)                       # encabezados en la fila 3, igual que el archivo de FEMSA
    for f in filas:
        ws.append(f)
    wb.save(ruta)


def generar(equipos: int = 1900, salida: str | Path = "datos_demo") -> list[Path]:
    """Crea los dos Excel sintéticos y devuelve sus rutas."""
    out = Path(salida)
    out.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(2025)
    total = equipos
    base = [equipo_base(i, rnd) for i in range(1, total + 1)]
    bajas = int(total * 0.02)                                   # los primeros equipos salen del inventario en el 2.º corte
    altas = int(total * 0.16)                                   # los últimos solo existen en el 2.º corte

    # Corte 1 (2025-09): sin los equipos nuevos
    f1 = [fila(e, "2025-09", random.Random(e["id"])) for e in base[: total - altas]]
    r1 = out / "Dataset_demo_2025-09.xlsx"
    escribir(r1, "2025-09", f1)

    # Corte 2 (2025-11): sin las bajas; algunos equipos sin cifrar ya se cifraron y unos pocos al revés
    f2 = []
    for e in base[bajas:]:
        e2 = dict(e)
        z = random.Random("c2" + e["id"]).random()
        if not e["cifrado"] and z < 0.35:
            e2["cifrado"] = True
        elif e["cifrado"] and z > 0.985:
            e2["cifrado"] = False
        e2["atras"] = max(0, e["atras"] + (1 if z > 0.6 else 0) - (1 if z < 0.2 else 0)) if e["atras"] < 9 else 9
        f2.append(fila(e2, "2025-11", random.Random(e["id"] + "b")))
    r2 = out / "Dataset_demo_2025-11.xlsx"
    escribir(r2, "2025-11", f2)
    return [r1, r2]


def main() -> None:
    ap = argparse.ArgumentParser(description="Genera Excel sintéticos con la estructura de FEMSA")
    ap.add_argument("--equipos", type=int, default=1900, help="Equipos del corte más reciente (por defecto 1900)")
    ap.add_argument("--salida", default="datos_demo")
    a = ap.parse_args()
    r1, r2 = generar(a.equipos, a.salida)
    print(f"Listo: {r1} y {r2}. Datos sintéticos.")


if __name__ == "__main__":
    main()
