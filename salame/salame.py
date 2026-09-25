"""Salame 3D da una foto di lato (salame morbido spalmabile, foto.jpg).
Scrive, accanto a sé:
- buccia.jpg: la buccia srotolata, x lungo il salame, in verticale l'angolo attorno all'asse da +45° (sopra) a -45°
  (sotto). Si usa solo la fascia di fronte, la più nitida; nel 3D si ripete a specchio tutto intorno.
- cartellino.png: il cartellino raddrizzato, con la trasparenza attorno;
- modello.json: sagoma (x, centro, raggio in pixel della foto) e dove stanno buccia e cartellino.
Da lanciare dalla cartella salame/: python salame.py"""
import json
import numpy as np
from PIL import Image

foto = np.asarray(Image.open("foto.jpg").convert("RGB"), dtype=float)
LIN = lambda c: (c / 255) ** 2.2  # abbastanza vicino a sRGB per luce e medie
SRGB = lambda c: 255 * np.clip(c, 0, 1) ** (1 / 2.2)

# --- sagoma, misurata sulla foto -------------------------------------------------------------------------------
# punte: il primo pixel di salame riga per riga, entrando dai lati (x, raggio = distanza della riga dal centro)
CENTRO_SX, CENTRO_DX = 417, 400
punta_sx = [(98, 0), (99.5, 38), (104, 53), (106, 68), (113, 83), (124, 98), (135, 113), (155, 128), (182, 143), (214, 158)]
punta_dx = [(1288, 152), (1321, 140), (1333, 128), (1347, 116), (1391, 74), (1396, 68), (1400, 50), (1403, 30), (1404.5, 0)]
# corpo: bordo di sopra e di sotto colonna per colonna (sotto: sopra l'ombra sul tagliere)
corpo = [(250, 251, 580), (300, 246, 583), (350, 235, 585), (450, 228, 586), (550, 222, 585), (650, 220, 578),
         (750, 223, 570), (900, 229, 569), (1000, 236, 567), (1100, 240, 562), (1200, 241, 560)]
punti = [(x, CENTRO_SX, r) for x, r in punta_sx] + [(x, (t + b) / 2, (b - t) / 2) for x, t, b in corpo] + \
        [(x, CENTRO_DX, r) for x, r in punta_dx]
P = np.array(punti, dtype=float)

# ricampionata a passi uguali lungo il profilo (x, raggio): punte fitte, corpo rado
lung = np.concatenate([[0], np.cumsum(np.hypot(np.diff(P[:, 0]), np.diff(P[:, 2])))])
s = np.linspace(0, lung[-1], int(lung[-1] / 8))
profilo = np.stack([np.interp(s, lung, P[:, k]) for k in range(3)], 1)
X0, X1 = P[0, 0], P[-1, 0]
xs = np.arange(X0, X1)
yc = np.interp(xs, P[:, 0], P[:, 1])
rr = np.interp(xs, P[:, 0], P[:, 2])


def campiona(img, x, y):
    """bilineare, x e y array della stessa forma"""
    x = np.clip(x, 0, img.shape[1] - 1.001)
    y = np.clip(y, 0, img.shape[0] - 1.001)
    i, j = np.floor(y).astype(int), np.floor(x).astype(int)
    fy, fx = (y - i)[..., None], (x - j)[..., None]
    return (img[i, j] * (1 - fx) * (1 - fy) + img[i, j + 1] * fx * (1 - fy) +
            img[i + 1, j] * (1 - fx) * fy + img[i + 1, j + 1] * fx * fy)


# --- buccia ------------------------------------------------------------------------------------------------------
TETA, H = 45, 360
teta = np.radians(np.linspace(TETA, -TETA, H))  # riga 0 = sopra
FX = np.broadcast_to(xs, (H, len(xs)))
FY = yc[None, :] - rr[None, :] * np.sin(teta)[:, None]
buccia = LIN(campiona(foto, FX, FY))

# punte: sulla foto sono pochi pixel di bordo, mescolati al fondo. Il cartellino e il suo spago coprono la punta
# destra. Lì le colonne si prendono a specchio da quelle accanto: niente scalini dove comincia la copia
SX, DX = int(25), int(1203 - X0)
buccia[:, :SX] = buccia[:, 2 * SX - np.arange(SX)]
buccia[:, DX:] = buccia[:, 2 * DX - np.arange(DX, len(xs))]

# luce dello scatto: ogni riga e ogni colonna portate alla stessa luminosità del centro (lo spago al centro escluso)
lum = buccia.mean(2)
corpo_x = ((xs > 300) & (xs < 1150) & ~((xs > 760) & (xs < 900)))
riga = np.median(lum[:, corpo_x], 1)
riga = np.convolve(np.pad(riga, 7, mode="edge"), np.ones(15) / 15, mode="valid")
bersaglio = np.median(lum[H // 2 - 30:H // 2 + 30][:, corpo_x])
buccia *= (bersaglio / riga)[:, None, None]
col = np.median(buccia.mean(2), 0)
col = np.convolve(np.pad(col, 20, mode="edge"), np.ones(41) / 41, mode="valid")
buccia *= np.clip(bersaglio / col, 0.7, 1.8)[None, :, None]
Image.fromarray(SRGB(buccia).astype(np.uint8)).save("buccia.jpg", quality=90)

# --- cartellino ----------------------------------------------------------------------------------------------------
# angoli del foglio sulla foto (senza la linguetta ripiegata in cima): alto sx, alto dx, basso dx, basso sx
Q = np.array([(1201, 357), (1461, 357), (1548, 830), (1257, 840)], dtype=float)
TAB = (0.24, 0.87, 0.045)  # linguetta: da u, a u, quanto sporge sopra (in altezze del foglio)


def omografia(q):
    """(u, v) del rettangolo 0..1 -> pixel della foto"""
    a = []
    for (u, v), (x, y) in zip([(0, 0), (1, 0), (1, 1), (0, 1)], q):
        a += [[u, v, 1, 0, 0, 0, -u * x, -v * x, -x], [0, 0, 0, u, v, 1, -u * y, -v * y, -y]]
    return np.linalg.svd(np.array(a))[2][-1].reshape(3, 3)


Hm = omografia(Q)
CW, CH = 300, 546  # proporzioni del foglio sulla foto
top = int(round(TAB[2] * CH))
u, v = np.meshgrid((np.arange(CW) + 0.5) / CW, (np.arange(-top, CH) + 0.5) / CH)
p = np.einsum("ij,jhw->ihw", Hm, np.stack([u, v, np.ones_like(u)]))
rgb = campiona(foto, p[0] / p[2], p[1] / p[2])
# forma: rettangolo con gli angoli tondi, rientrato di un filo perché non entri il fondo; più la linguetta
R, m = 0.08, 0.008
du = np.maximum(np.maximum(m + R - u, u - (1 - m - R)), 0)
dv = np.maximum(np.maximum(m + R * CW / CH - v, v - (1 - m - R * CW / CH)), 0)
foglio = (u > m) & (u < 1 - m) & (v > m) & (v < 1 - m) & (np.hypot(du, dv * CH / CW) <= R)
linguetta = (u > TAB[0]) & (u < TAB[1]) & (v > -TAB[2] + 0.004) & (v <= m + 0.01)
alfa = ((foglio | linguetta) * 255).astype(np.uint8)
# nella foto il bianco della plastica è in ombra (190 circa) e un po' giallo: portato a bianco come dal vero
lum = rgb.mean(2)
bianco = rgb[foglio & (lum > np.percentile(lum[foglio], 80))].mean(0)
rgb = SRGB(LIN(rgb) * LIN(np.array([238, 238, 234])) / LIN(bianco))
Image.fromarray(np.dstack([rgb.astype(np.uint8), alfa])).save("cartellino.png", optimize=True)

json.dump({
    "profilo": [[round(a, 1) for a in q] for q in profilo],
    "buccia": {"src": "buccia.jpg", "x0": X0, "x1": X1, "teta": TETA},
    # il cartellino: largo quanto sulla foto, appeso davanti alla punta destra
    "cartellino": {"src": "cartellino.png", "largo": float(np.mean([Q[1, 0] - Q[0, 0], Q[2, 0] - Q[3, 0]])),
                   "alto": float(np.mean([Q[3, 1] - Q[0, 1], Q[2, 1] - Q[1, 1]])), "linguetta": TAB[2],
                   "x": float((Q[0, 0] + Q[1, 0]) / 2), "y": float(Q[0, 1])},
}, open("modello.json", "w"), separators=(",", ":"))
print("profilo", len(profilo), "punti; buccia", buccia.shape[1], "x", H)
