"""Misure di una bottiglia da due foto (fronte e retro) su fondo neutro, per bottiglia-3d.js.
Uso: python misura.py fronte.jpg retro.jpg"""
import sys
import numpy as np
from sagoma import sagoma


def pulita(righe, h):
    """larghezze e centri riga per riga, con le righe disturbate (bordo della mensola, riflessi) tolte:
    una riga che si stacca dalla mediana delle vicine è un disturbo, non la bottiglia"""
    import warnings
    warnings.simplefilter("ignore", RuntimeWarning)
    L = np.full(h, np.nan); C = np.full(h, np.nan)
    for y, r in enumerate(righe):
        if r:
            L[y] = r[1] - r[0]; C[y] = (r[0] + r[1]) / 2
    for _ in range(2):
        Lm = np.array([np.nanmedian(L[max(0, y - 7):y + 8]) for y in range(h)])
        Cm = np.array([np.nanmedian(C[max(0, y - 7):y + 8]) for y in range(h)])
        male = (np.abs(L - Lm) > 0.06 * Lm + 1) | (np.abs(C - Cm) > 3)
        L[male] = np.nan; C[male] = np.nan
    return L, C


def estremi(L, h):
    """cima: prima riga con un po' di larghezza. Fondo: scendendo, dopo il corpo il tallone si stringe fino al punto
    d'appoggio, poi il riflesso nella mensola (largo come la bottiglia) si riallarga: il fondo è quel minimo"""
    corpo = np.nanpercentile(L, 90)
    alto = next(y for y in range(h) if L[y] > 0.15 * corpo)
    y = next(y for y in range(alto, h) if L[y] >= 0.97 * corpo)  # inizio del corpo
    sotto = 0
    while y < h and sotto < 3:  # corpo, finché non si stringe per tre righe valide di fila
        if not np.isnan(L[y]):
            sotto = sotto + 1 if L[y] < 0.97 * corpo else 0
        y += 1
    minimo, basso = np.inf, y
    for y in range(y, h):
        if np.isnan(L[y]):
            continue
        if L[y] < minimo:
            minimo, basso = L[y], y
        elif L[y] > minimo * 1.015 + 1:
            break
    return alto, basso


def misura(f):
    a, righe = sagoma(f)
    h = len(righe)
    L, C = pulita(righe, h)
    alto, basso = estremi(L, h)
    # centro: retta sulle righe del corpo (fra 45% e 90% dell'altezza), dove i bordi sono netti
    ys = np.arange(int(alto + 0.45 * (basso - alto)), int(alto + 0.9 * (basso - alto)))
    ok = ~np.isnan(C[ys])
    m, q = np.polyfit(ys[ok], C[ys][ok], 1)
    return dict(a=a, L=L, C=C, alto=alto, basso=basso, cx=(round(m * alto + q, 1), round(m * basso + q, 1)))


def profilo(M, passo):
    """mezze larghezze dalla cima al fondo; sul corpo dritto i punti intermedi si tolgono"""
    L, alto, basso = M["L"], M["alto"], M["basso"]
    pts = []
    for y in list(range(alto, basso, passo)) + [basso]:
        v = L[max(alto, y - 7):min(basso + 1, y + 8)]
        v = v[~np.isnan(v)]
        if len(v):
            pts.append([round(float(np.median(v)) / 2, 1), int(y)])
    # via i punti allineati con i vicini (meno di mezzo pixel di scarto)
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        (r0, y0), (r1, y1), (r2, y2) = out[-1], pts[i], pts[i + 1]
        if abs(r0 + (r2 - r0) * (y1 - y0) / (y2 - y0) - r1) > 0.5:
            out.append(pts[i])
    out.append(pts[-1])
    return out


if __name__ == "__main__":
    F, R = misura(sys.argv[1]), misura(sys.argv[2])
    h = F["a"].shape[0]
    print("fronte:", dict(alto=F["alto"], basso=F["basso"], cx=F["cx"]))
    print("retro: ", dict(alto=R["alto"], basso=R["basso"], cx=R["cx"]))
    print("scala retro/fronte:", round((R["basso"] - R["alto"]) / (F["basso"] - F["alto"]), 4))
    print("profilo:", profilo(F, max(2, h // 350)))
