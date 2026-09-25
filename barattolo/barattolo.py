"""Barattolo 3D della salsa tartufata 130 g.
Etichette e salsa dalle tre foto vere del vasetto (provvisorie/salsa-tartufata-130-1/2/3: fronte, lato destro, lato
sinistro), raddrizzate con la fotocamera di ogni scatto (camera.py): le righe restano dritte anche se le foto sono
prese da vicino. La scena è la foto modificata (definitive/salsa-tartufata-foto-1): tappo, collo, fondo e riflessi
sono uguali tutto intorno, e girando il barattolo restano come nella foto; girano solo salsa ed etichette, che nel 3D
coprono il corpo del barattolo della foto.
Misure in raggi del barattolo; h = 0 sul bordo di sopra dell'etichetta dorata, in su positivo.
Scrive accanto a sé: etichette.png, salsa.jpg, modello.json.
Da lanciare dalla cartella barattolo/: python barattolo.py"""
import json
import numpy as np
from PIL import Image
from camera import Posa

VERE = "../../wild-italy/assets/img/provvisorie/salsa-tartufata-130-"
F, C = 2100, (1024, 1024)  # focale e centro delle foto vere, in pixel
# pose delle foto vere (camera.adatta sui bordi dell'etichetta dorata e del riquadro del logo; errore medio 1 px)
POSE = {1: [-0.42273, 0.00102, 4.10782, 0.21989, 0.00192, 1.06919, -0.03356, -0.40738],
        2: [-0.10184, -0.01357, 4.20148, 0.05629, 0.00805, 1.09225],
        3: [-0.17356, 0.19029, 3.84428, 0.08308, 0.04589, 1.08202]}
PHI = {1: 0, 2: 90, 3: -85}  # da che angolo guarda ogni foto: misurato sui lati dell'etichetta nera
H = 1.085  # altezza dell'etichetta dorata
NERA = (-38.2, 48.5)  # lati dell'etichetta nera, col bordino d'oro
PX, R = 6, 344  # 6 pixel per grado; un raggio = 344 pixel, così i pixel sono quadrati
CORPO = (-1.28, 0.62)  # la parte del barattolo che gira: dal fondo della salsa (sotto c'è il piede di vetro) alla spalla
CALDO = np.array([1.154, 1.269, 1.443])  # bilanciamento: il bianco del logo come nella scena (le foto vere hanno luce gialla)

LIN = lambda c: (np.asarray(c, float) / 255) ** 2.2
SRGB = lambda c: (255 * np.clip(c, 0, 1) ** (1 / 2.2)).astype(np.uint8)
liscio = lambda x, a, b: np.clip((x - a) / (b - a), 0, 1)
righe = lambda su, giu: su - (np.arange(int(round((su - giu) * R))) + 0.5) / R
TETA = (np.arange(360 * PX) + 0.5) / PX - 180


def campiona(img, x, y):
    x = np.clip(x, 0, img.shape[1] - 1.001)
    y = np.clip(y, 0, img.shape[0] - 1.001)
    i, j = np.floor(y).astype(int), np.floor(x).astype(int)
    fy, fx = (y - i)[..., None], (x - j)[..., None]
    return (img[i, j] * (1 - fx) * (1 - fy) + img[i, j + 1] * fx * (1 - fy) +
            img[i + 1, j] * (1 - fx) * fy + img[i + 1, j + 1] * fx * fy)


foto = {n: LIN(Image.open(f"{VERE}{n}.jpg").convert("RGB")) for n in POSE}


def srotola(n, teta, h):
    """colori della foto n agli angoli teta (gradi, giro comune) e altezze h; e dove la foto li vede"""
    posa = Posa(POSE[n], F, C)
    T, Hh = np.meshgrid(np.radians(np.asarray(teta) - PHI[n]), h)
    xy = posa.pixel(T, Hh)
    return campiona(foto[n], xy[..., 0], xy[..., 1]), posa.visibile(T, Hh)


# --- etichette: un foglio unico tutto intorno, da sopra l'etichetta nera a sotto ----------------------------------------
HE = righe(0.40, -1.25)
oro = (HE <= 0) & (HE >= -H)
dor = {}
for n in (3, 2):
    g, vis = srotola(n, TETA, HE)
    # luce dello scatto angolo per angolo, sul fondo dell'etichetta (75° percentile: le scritte, scure, restano sotto)
    ok = vis[oro].all(0)
    lum = np.percentile(g[oro].mean(2), 75, axis=0)
    lum = np.interp(np.arange(len(TETA)), np.nonzero(ok)[0], lum[ok])
    lum = np.convolve(np.pad(lum, 60, mode="edge"), np.ones(121) / 121, mode="valid")
    g /= np.clip(lum / np.median(lum[ok & (np.abs(TETA - PHI[n]) < 20)]), 0.6, 1.6)[None, :, None]
    # lo stesso colore di fondo in tutte e due: quello della foto 3
    fondo = np.median(g[oro][:, ok & (np.abs(TETA - PHI[n]) < 40)], (0, 1))
    rif = fondo if n == 3 else rif
    dor[n] = g / fondo * rif
# a sinistra la foto 3 fino al lato dell'etichetta nera, a destra la 2; dietro nessuna vede bene: fondo liscio,
# riga per riga (così restano i fili d'oro in cima e in fondo)
p3 = liscio(TETA, -158, -152) * (1 - liscio(TETA, NERA[0] + 1, NERA[0] + 3))  # oltre -155° la vede di sbieco
p2 = liscio(TETA, NERA[1] - 3, NERA[1] - 1) * (1 - liscio(TETA, 160, 165))
fondo = np.percentile(dor[3][:, (TETA > -130) & (TETA < -60)], 70, axis=1)
fili = (HE > -0.035) | (HE < -H + 0.035)
fondo[~fili] = np.median(fondo[oro & ~fili], 0)
dietro = 1 - p3 - p2 - ((TETA > NERA[0]) & (TETA < NERA[1]))
etichette = dor[3] * p3[None, :, None] + dor[2] * p2[None, :, None] + fondo[:, None, :] * dietro[None, :, None]

# etichetta nera dalla foto di fronte; la sua sagoma: per ogni colonna il primo bordo d'oro dall'alto e dal basso
g1, _ = srotola(1, TETA, HE)
in_nera = (TETA >= NERA[0] - 0.3) & (TETA <= NERA[1] + 0.3)
r_, g_, b_ = [SRGB(g1)[..., k].astype(float) for k in range(3)]
dorato = (r_ + g_ - 2 * b_ > 90) & (r_ > 150)
alto = np.full(len(TETA), np.nan)
basso = np.full(len(TETA), np.nan)
# il bordo è un filo d'oro continuo (almeno 4 righe): i lampi della salsa e del vetro sono puntini
filo = dorato & np.roll(dorato, -1, 0) & np.roll(dorato, -2, 0) & np.roll(dorato, -3, 0)
for j in np.nonzero(in_nera)[0]:
    su = np.nonzero(filo[:, j] & (HE > -0.2) & (HE < 0.36))[0]
    giu = np.nonzero(dorato[:, j] & (HE < -0.95))[0]
    if len(su):
        alto[j] = su[0]
    if len(giu):
        basso[j] = giu[-1]
cj = np.nonzero(in_nera)[0]
# in cima: mediana su 9 colonne, e dove non c'è il filo le colonne vicine
ok = ~np.isnan(alto[cj])
alto[cj] = np.interp(cj, cj[ok], alto[cj][ok])
alto[cj] = [np.median(alto[cj][max(0, k - 4):k + 5]) for k in range(len(cj))]
# sui 4° ai lati il bordo è quello delle spalle, mai più in alto (lì il vetro ha dei lampi d'oro)
for lato in (cj[:4 * PX], cj[-4 * PX:]):
    alto[lato] = np.maximum(alto[lato], np.median(alto[lato]))
# in fondo la fascia tricolore è un arco: curva liscia (4° grado) sui punti buoni, i fuori posto scartati
x, y = TETA[cj], basso[cj]
buoni = ~np.isnan(y)
for _ in range(3):
    c = np.polyfit(x[buoni], y[buoni], 4)
    buoni &= np.abs(np.nan_to_num(y) - np.polyval(c, x)) < 6
basso[cj] = np.polyval(c, x)
riga = np.arange(len(HE))[:, None]
nera = in_nera[None, :] & (riga >= alto[None, :] - 1) & (riga <= basso[None, :] + 1)
etichette = np.where(nera[..., None], g1, etichette)
alfa = ((oro[:, None] | nera) * 255).astype(np.uint8)
from PIL import ImageFilter
nitide = Image.fromarray(SRGB(etichette * CALDO)).filter(ImageFilter.UnsharpMask(2, 60, 2))  # le foto vere sono morbide
Image.fromarray(np.dstack([np.asarray(nitide), alfa])).save("etichette.png", optimize=True)

# --- salsa: dalla foto 5 della scena (definitive, di lato), solo salsa, niente scritte: la foto modificata va bene.
# Sopra l'etichetta la fascia di salsa della foto è alta proprio quanto serve; sotto, righe da 945 a 1000 (più giù ci
# sono i riflessi del fondo di vetro).
# Una fascia di 120° che si ripete tre volte tutto intorno, con le due estremità sfumate l'una nell'altra (niente
# cuciture a specchio). Colore portato a quello della salsa della foto 1.
f5 = LIN(Image.open("../../wild-italy/assets/img/definitive/salsa-tartufata-foto-5.jpg").convert("RGB"))
GS = 120
TS = np.radians((np.arange((GS + 12) * PX) + 0.5) / PX - (GS + 12) / 2)
HS = righe(CORPO[1], CORPO[0])
sopra = HS > -0.5
# riga della foto 5 per ogni altezza: sopra da 506 (h 0,62) a 667 (h 0); sotto da 940 (h -1,08) a 1030 (h -1,42)
yf = np.where(sopra, 506 + (CORPO[1] - HS) * 260, np.clip(945 + (-1.08 - HS) * 265, 945, 1000))
s = campiona(f5, (619 + 260 * np.sin(TS))[None, :].repeat(len(HS), 0),
             yf[:, None] + 18 * np.cos(TS)[None, :])  # righe prese sui bordi: al centro scendono di 18 px
lum = s.mean(2)
for f in (sopra, ~sopra):  # via i riflessi verticali del vetro, fascia per fascia
    s[f] /= (np.median(lum[f], 0) / np.median(lum[f]))[None, :, None]
s = np.minimum(s, np.percentile(s, 97, axis=(0, 1)))
n, k = GS * PX, 12 * PX  # sfuma i 12° in più dentro l'inizio: la fascia si chiude su se stessa
a_ = np.linspace(0, 1, k)[None, :, None]
s = np.concatenate([s[:, n:n + k] * (1 - a_) + s[:, :k] * a_, s[:, k:n]], 1)
vista = s[(HS > 0.05) | (HS < -1.1)].reshape(-1, 3)
s *= np.median(LIN(Image.open("scena.jpg").convert("RGB"))[1015:1050, 420:670].reshape(-1, 3), 0) / np.median(vista, 0)
Image.fromarray(SRGB(s)).save("salsa.jpg", quality=90)

json.dump({
    "corpo": CORPO, "etichetta": [0.40, -1.25], "salsa": {"gradi": GS},
    # la scena: foto 1122 x 1402, presa in piano all'altezza della riga 745 (dove le righe del barattolo sono dritte;
    # più in basso fanno il sorriso), focale 1650 px; barattolo al centro x 545,5, raggio 198,5 px, bordo di sopra
    # dell'etichetta dorata alla riga 767
    "scena": {"w": 1122, "h": 1402, "f": 1650, "cx": 561, "cy": 745, "x": 545.5, "r": 198.5, "y0": 767},
}, open("modello.json", "w"), separators=(",", ":"))
print("etichette", etichette.shape, "salsa", s.shape)
