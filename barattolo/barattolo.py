"""Barattolo 3D della salsa tartufata da tre foto: di fronte (foto-1) e di lato, a sinistra (foto-4) e a destra (foto-5).
Scrive, accanto a sé:
- giro.jpg: il vetro con le etichette srotolato tutto intorno (u: angolo da -180° a 180°, 0 davanti; v: altezza, dal
  fondo del tappo al piede);
- modello.json: sagoma, altezze di tappo e disco stampato.
Ogni punto del giro si prende dalla foto che lo vede meglio: l'etichetta nera da quella di fronte, quella dorata dalle
due di lato. Da lanciare dalla cartella barattolo/: python barattolo.py"""
import json
import numpy as np
from PIL import Image

D = "../../wild-italy/assets/img/definitive/salsa-tartufata-foto-"
LIN = lambda c: (np.asarray(c, dtype=float) / 255) ** 2.2
SRGB = lambda c: 255 * np.clip(c, 0, 1) ** (1 / 2.2)

# Righe di riferimento sul bordo della sagoma, in ogni foto: fondo del tappo, inizio del corpo, filo d'oro sopra e sotto
# l'etichetta dorata, fine del corpo, piede. Le altezze del modello sono le righe della foto di fronte.
# phi: da che angolo è vista la foto (0 = davanti, positivo verso destra del barattolo), misurato sui lati
# dell'etichetta nera: sulla foto di fronte va da -41,1° a 46,7°.
# b: quanto scende al centro una riga orizzontale del barattolo (foto un po' dall'alto), a due righe misurate.
FOTO = {
    1: dict(xc=545.5, r=198.5, phi=0, righe=[570, 640, 766, 945, 1055, 1080], b=[(766, 3), (945, 27)]),
    4: dict(xc=693, r=255, phi=-81, righe=[360, 450, 562, 845, 962, 995], b=[(562, 16), (845, 37)]),
    5: dict(xc=619, r=260, phi=96.2, righe=[443, 506, 672, 932, 1040, 1077], b=[(672, 18), (932, 19)]),
}
ETICHETTA_NERA = (-41.1, 46.7)
RIGHE = FOTO[1]["righe"]
# sagoma sulla foto di fronte: [riga, mezza larghezza]; collo con la filettatura, spalla, corpo, piede arrotondato
PROFILO = [(570, 176), (578, 181), (590, 181), (596, 176), (610, 177), (620, 187), (630, 196), (640, 198.5),
           (1052, 198.5), (1062, 194), (1070, 186), (1076, 175), (1080, 160)]
TAPPO = dict(alto=68, raggio=199.5, disco=0.62)  # in pixel della foto di fronte; disco nero stampato, in raggi

W, H = 2048, 720
teta = (np.arange(W) + 0.5) / W * 360 - 180
riga = np.linspace(RIGHE[0], RIGHE[-1], H)
prof = np.array(PROFILO, dtype=float)
rel = np.interp(riga, prof[:, 0], prof[:, 1]) / FOTO[1]["r"]  # raggio a quell'altezza, rispetto al corpo


def campiona(img, x, y):
    x = np.clip(x, 0, img.shape[1] - 1.001)
    y = np.clip(y, 0, img.shape[0] - 1.001)
    i, j = np.floor(y).astype(int), np.floor(x).astype(int)
    fy, fx = (y - i)[..., None], (x - j)[..., None]
    return (img[i, j] * (1 - fx) * (1 - fy) + img[i, j + 1] * fx * (1 - fy) +
            img[i + 1, j] * (1 - fx) * fy + img[i + 1, j + 1] * fx * fy)


# fascia di sola salsa, fra l'inizio del corpo e l'etichetta: serve a misurare la luce di ogni scatto
fascia = (riga > 650) & (riga < 700)
giri, pesi = {}, {}
for n, p in FOTO.items():
    img = LIN(Image.open(f"{D}{n}.jpg").convert("RGB"))
    ye = np.interp(riga, RIGHE, p["righe"])
    (y0, b0), (y1, b1) = p["b"]
    b = np.clip(b0 + (ye - y0) * (b1 - b0) / (y1 - y0), 0, None)
    t = np.radians((teta - p["phi"] + 180) % 360 - 180)
    X = p["xc"] + p["r"] * rel[:, None] * np.sin(t)[None, :]
    Y = ye[:, None] + b[:, None] * np.cos(t)[None, :]
    g = campiona(img, X, Y)
    # luce dello scatto, angolo per angolo: la luminosità della salsa (mediana: i riflessi restano fuori), liscia,
    # rispetto a quella al centro. Solo la luminosità: il colore lo porta la foto
    visto = np.cos(t) > 0.05
    luce = np.median(g[fascia].mean(2), 0)
    luce = np.interp(np.arange(W), np.nonzero(visto)[0], luce[visto], period=W)
    luce = np.convolve(np.pad(luce, 30, mode="wrap"), np.ones(61) / 61, mode="valid")
    davanti = np.abs(t) < 0.3
    g /= np.clip(luce / np.median(luce[davanti]), 0.6, 1.7)[None, :, None]
    # tutte e tre con il colore della salsa della foto di fronte
    salsa = np.median(g[fascia][:, davanti], (0, 1))
    giri[n] = g / salsa if n != 1 else g
    if n == 1:
        rif = salsa
    pesi[n] = np.zeros(W)
for n in (4, 5):
    giri[n] *= rif

# Chi prende cosa: la foto di fronte per l'etichetta nera, le altre due ai lati e dietro.
# Sulle righe dell'etichetta dorata il passaggio è netto sul bordo di quella nera (la dorata le passa sotto; la foto
# di fronte lì mostra salsa). Sulle righe della salsa la foto di fronte arriva più in là e sfuma per 6°: la grana
# delle due foto è diversa, e una sfumatura larga si nota meno di una riga.
liscio = lambda x, a, c: np.clip((x - a) / (c - a), 0, 1)
oro = (riga >= RIGHE[2] - 2) & (riga <= RIGHE[3] + 2)
a, c = ETICHETTA_NERA
stretta = liscio(teta, a - 1, a) * (1 - liscio(teta, c, c + 1))
larga = liscio(teta, a - 9, a - 3) * (1 - liscio(teta, c + 3, c + 9))
pesi[1] = np.where(oro[:, None], stretta[None], larga[None])
dietro = liscio(teta, -172.5, -170.5)[None]  # dietro si incontrano le due foto di lato
pesi[4] = (1 - pesi[1]) * (teta < 0)[None] * dietro
pesi[5] = 1 - pesi[1] - pesi[4]
giro = sum(giri[n] * pesi[n][..., None] for n in FOTO)

# Dietro nessuna foto vede bene (oltre 75° dal suo centro è tutta di sbieco): la salsa si prende a specchio dai due
# lati, l'etichetta dorata diventa oro liscio: riga per riga il fondo dell'etichetta sul lato destro (il 55° percentile:
# le scritte, scure, restano sotto), poi lisciato in verticale fuori dai due fili d'oro
col = lambda gradi: int((gradi + 180) / 360 * W)
g4, g5 = col(FOTO[4]["phi"] - 75), col(FOTO[5]["phi"] + 75 - 360) + W  # da g5 (oltre il bordo destro) a g4
meta = (g5 + g4 + W) // 2
for j in range(g5, g4 + W):
    giro[:, j % W] = giro[:, (2 * g5 - j) % W] if j < meta else giro[:, (2 * (g4 + W) - j) % W]
fondo = np.percentile(giro[oro][:, col(80):col(150)], 55, axis=1)
dentro = slice(6, -6)  # i fili d'oro in cima e in fondo restano riga per riga
fondo[dentro] = np.median(fondo[dentro], 0)
giro[np.ix_(oro, np.arange(g5, g4 + W) % W)] = fondo[:, None]
Image.fromarray(SRGB(giro).astype(np.uint8)).save("giro.jpg", quality=90)

json.dump({
    "giro": "giro.jpg", "righe": [RIGHE[0], RIGHE[-1]], "profilo": PROFILO, "tappo": TAPPO,
}, open("modello.json", "w"), separators=(",", ":"))
print("giro", W, "x", H)
