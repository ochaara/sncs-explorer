"""Genera public/data/projects.json a partir del JSON de proyectos.

Reproduce los cálculos de InvestigaciónV2.ipynb:
  - R_a: media, en cada área, de las similitudes medias de sus proyectos
    (calculada sobre todos los proyectos, sin filtro de publicaciones).
  - SNCS = similitud media del proyecto / R_a.
  - p25 y desviación estándar (poblacional, como np.std) de las similitudes
    normalizadas s_ij / R_a.

Uso:
    python scripts/build_data.py                 # descarga el JSON de Google Drive
    python scripts/build_data.py datos.json      # usa un fichero local

Solo necesita numpy.
"""
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np

DRIVE_FILE_ID = "14LcbQgNkwB7LMc3WTfkB77d4AbGSvihc"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "projects.json"
DECIMALS = 5


def load(path=None):
    if path:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    url = f"https://drive.google.com/uc?export=download&id={DRIVE_FILE_ID}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


def is_valid(row):
    # Equivalente a df.dropna() del notebook
    return all(v is not None and not (isinstance(v, float) and np.isnan(v)) for v in row.values())


def main():
    rows = [r for r in load(sys.argv[1] if len(sys.argv) > 1 else None) if is_valid(r)]

    sims = [np.asarray(r["similitudes"], dtype=float) for r in rows]
    means = np.array([s.mean() for s in sims])

    by_area = defaultdict(list)
    for r, m in zip(rows, means):
        by_area[r["Área"]].append(m)
    ref_area = {a: float(np.mean(v)) for a, v in by_area.items()}

    areas = sorted(ref_area)
    area_idx = {a: i for i, a in enumerate(areas)}

    out = {"areas": areas, "ref": [], "area": [], "n": [], "sncs": [], "p25": [], "std": []}
    for r, s, m in zip(rows, sims, means):
        ra = ref_area[r["Área"]]
        z = s / ra
        out["ref"].append(r["Referencia"])
        out["area"].append(area_idx[r["Área"]])
        out["n"].append(int(len(s)))
        out["sncs"].append(round(float(m / ra), DECIMALS))
        out["p25"].append(round(float(np.percentile(z, 25)), DECIMALS))
        out["std"].append(round(float(np.std(z)), DECIMALS))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    n = np.array(out["n"])
    print(f"{len(rows)} proyectos, {len(areas)} áreas -> {OUT}")
    sel = n >= 3
    p25 = np.array(out["p25"])[sel]
    std = np.array(out["std"])[sel]
    print(f"Comprobación (>=3 publicaciones): N={sel.sum()}, "
          f"Q1(p25)={np.quantile(p25, 0.25):.3f}, Q3(std)={np.quantile(std, 0.75):.3f}")


if __name__ == "__main__":
    main()
