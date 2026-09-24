"""Sagoma della bottiglia riga per riga: il primo salto netto di colore entrando da sinistra e da destra.
Lo sfondo ha sfumature larghe (vignettatura), il bordo del vetro è un salto stretto."""
import sys
import numpy as np
from PIL import Image

D = "assets/img/"  # da lanciare dalla cartella del sito


def sagoma(f, soglia=None):
    a = np.asarray(Image.open(D + f).convert("RGB"), dtype=float)
    h, w, _ = a.shape
    k = np.array([1, 4, 6, 4, 1]) / 16
    liscia = np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 1, a)
    g = np.abs(np.diff(liscia, axis=1)).sum(2)  # salto di colore fra pixel vicini
    g[:, :4] = g[:, -4:] = 0
    soglia = soglia or 10 * w / 2000 + 6
    righe = []
    for y in range(h):
        xs = np.nonzero(g[y] > soglia)[0]
        righe.append((xs[0], xs[-1] + 1) if len(xs) > 1 else None)
    return a, righe


if __name__ == "__main__":
    for f in sys.argv[1:]:
        a, righe = sagoma(f)
        h = len(righe)
        print(f, a.shape[1], "x", h)
        passo = max(1, h // 70)
        for y in range(0, h, passo):
            r = righe[y]
            if r:
                print(f"  {y:5d}  {r[0]:5d} {r[1]:5d}  larga {r[1]-r[0]:4d}  centro {(r[0]+r[1])/2:7.1f}")
