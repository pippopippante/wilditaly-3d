"""Barattolo 3D della salsa tartufata 130 g: tutto il barattolo, tappo compreso, da girare come si vuole.
Etichette, salsa e tappo dalle tre foto vere del vasetto (provvisorie/salsa-tartufata-130-1/2/3: fronte, lato destro,
lato sinistro), raddrizzate con la fotocamera di ogni scatto (camera.py): le righe restano dritte anche se le foto
sono prese da vicino. La luce dipinta nelle foto si toglie: nel 3D a illuminare ci pensano le luci, così il barattolo
non sembra una figurina.
Misure in raggi del barattolo; h = 0 sul bordo di sopra dell'etichetta dorata, in su positivo.
Scrive accanto a sé: etichette.png, salsa.jpg, tappo.png, modello.json.
Da lanciare dalla cartella barattolo/: python barattolo.py"""
import json
import numpy as np
from PIL import Image, ImageFilter
from camera import Posa

VERE = "../../wilditaly/assets/img/provvisorie/salsa-tartufata-130-"
F, C = 2100, (1024, 1024)  # focale e centro delle foto vere, in pixel
# pose delle foto vere (camera.adatta sui bordi dell'etichetta dorata e del riquadro del logo; errore medio 1 px)
POSE = {1: [-0.42273, 0.00102, 4.10782, 0.21989, 0.00192, 1.06919, -0.03356, -0.40738],
        2: [-0.10184, -0.01357, 4.20148, 0.05629, 0.00805, 1.09225],
        3: [-0.17356, 0.19029, 3.84428, 0.08308, 0.04589, 1.08202]}
PHI = {1: 0, 2: 90, 3: -85}  # da che angolo guarda ogni foto: misurato sui lati dell'etichetta nera
H = 1.085  # altezza dell'etichetta dorata
NERA = (-38.2, 48.5)  # lati dell'etichetta nera, col bordino d'oro
PX, R = 6, 344  # 6 pixel per grado; un raggio = 344 pixel, così i pixel sono quadrati
LIVELLO = 0.55  # dove arriva la salsa dentro il vetro (il filo d'olio, misurato sulla foto 1)
# Sagoma misurata sulla foto 1 con la sua posa: [h, raggio]. Vetro dal bordo della bocca (sotto il tappo) al piede;
# il collo ha la filettatura, poi la spalla si apre sul corpo. Dentro: la salsa, un po' più stretta (il vetro è
# spesso circa 0,05 raggi).
VETRO = [[1.00, 0.86], [0.97, 0.92], [0.93, 0.92],  # la bocca, sotto il tappo
         [0.90, 0.885], [0.86, 0.915], [0.82, 0.885], [0.78, 0.915], [0.74, 0.885],  # la filettatura
         [0.72, 0.905], [0.66, 0.925], [0.58, 0.955], [0.50, 0.985], [0.44, 1.0],  # la spalla
         [-1.50, 1.0], [-1.58, 0.975], [-1.64, 0.93], [-1.68, 0.86], [-1.70, 0.76]]  # il corpo e il piede
DENTRO = [[LIVELLO, 0.915], [0.50, 0.935], [0.44, 0.95], [-1.50, 0.95], [-1.57, 0.92], [-1.62, 0.87],
          [-1.65, 0.80], [-1.66, 0.70]]
TAPPO = {"su": 1.30, "giu": 0.94, "r": 0.985, "smusso": 0.08}  # il tappo d'oro, largo quasi quanto il corpo
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
fondo = np.percentile(dor[3][:, (TETA > -130) & (TETA < -60)], 55, axis=1)
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
nitide = Image.fromarray(SRGB(etichette * CALDO)).filter(ImageFilter.UnsharpMask(2, 60, 2))  # le foto vere sono morbide
Image.fromarray(np.dstack([np.asarray(nitide), alfa])).save("etichette.png", optimize=True)

# --- salsa: un pezzo di salsa vera, raddrizzato, che si ripete tutto intorno ---------------------------------------
# La salsa non ha scritte né un verso, e srotolarla tutta intorno non conviene: attraverso il vetro curvo, ai bordi
# si deforma e ci si specchia il negozio. Si prende invece il pezzo scoperto sopra l'etichetta, 45° da ogni foto di
# lato: il 3D lo ripete a specchio due volte, con le giunzioni ai fianchi, e di fronte non si vede ripetere.
# Della luce del negozio resta solo la grana: l'immagine si divide per se stessa sfocata, così i pezzi di tartufo e i
# lampi d'olio restano e il riflesso largo se ne va. Il rilievo lo fa il 3D, con questa stessa immagine come bozza.
SALSA_H = (0.48, 0.03)  # la fascia di salsa scoperta sopra l'etichetta dorata
GRADI = 90  # quanti gradi da ogni foto: il pezzo è largo mezzo giro, e mezzo giro è quanto se ne vede


def pezzo(n, mezzo):
    posa = Posa(POSE[n], F, C)
    t = np.radians(np.linspace(-mezzo, mezzo, int(2 * mezzo * R * np.pi / 180)))
    h = np.linspace(*SALSA_H, int((SALSA_H[0] - SALSA_H[1]) * R))
    P = posa.punto(*np.meshgrid(t, h))
    xy = np.asarray(C, float) + F * P[..., :2] / P[..., 2:3]
    return campiona(foto[n], xy[..., 0], xy[..., 1])


def sfoca(a, r):
    k = np.ones(2 * r + 1) / (2 * r + 1)
    passa = lambda v: np.convolve(np.pad(v, r, mode="edge"), k, "valid")
    for _ in range(3):
        a = np.apply_along_axis(passa, 0, np.apply_along_axis(passa, 1, a))
    return a


sx, dx = pezzo(3, GRADI / 2 + 2), pezzo(2, GRADI / 2 + 2)  # 2° in più per lato, poi si tagliano: ai bordi è scura
k = int(20 * R * np.pi / 180)  # 20° di sfumatura fra i due pezzi: la giunzione non si vede
m = liscio(np.arange(k), 0, k - 1)[None, :, None]
tela = np.concatenate([sx[:, :-k], sx[:, -k:] * (1 - m) + dx[:, :k] * m, dx[:, k:]], 1)
taglio = int(2 * R * np.pi / 180)
tela = tela[:, taglio:-taglio]
grana = np.clip(tela / np.maximum(sfoca(tela, 80), 1e-4), 0, 2.2) ** 1.35  # via la luce larga, la grana si rinforza
# il colore di riferimento è quello della salsa, non la media col vetro che ci si specchia sopra: 35° percentile
salsa = Image.fromarray(SRGB(grana * np.percentile(tela, 28, axis=(0, 1)) * CALDO))
salsa.filter(ImageFilter.UnsharpMask(3, 90, 2)).save("salsa.jpg", quality=94)  # le foto vere sono morbide

# --- tappo: oro liscio tutto intorno, quindi basta la striscia dall'alto in basso, presa davanti nella foto 1 e
# spianata (la luce del negozio se la rifà il 3D). Il tappo ha raggio TAPPO["r"], non 1: il punto si prende lì.
strisce = []
HT = righe(TAPPO["su"] - 0.005, TAPPO["giu"] + 0.005)
posa1 = Posa(POSE[1], F, C)
TT = np.radians(np.arange(-34, 35, 2.0))
T2, H2 = np.meshgrid(TT, HT)
P = (posa1.Q + H2[..., None] * posa1.A + TAPPO["r"] * (np.sin(T2)[..., None] * posa1.U + np.cos(T2)[..., None] * posa1.W))
xy = np.asarray(C, float) + F * P[..., :2] / P[..., 2:3]
oroT = np.median(campiona(foto[1], xy[..., 0], xy[..., 1]), 1)  # mediana sugli angoli: via i riflessi di sbieco
oroT = oroT / np.median(oroT, 0) * LIN([196, 158, 78])  # oro medio, la luce la fanno le luci
Image.fromarray(SRGB(np.repeat(oroT[:, None, :], 8, 1))).save("tappo.png")

json.dump({
    "etichetta": [0.40, -1.25], "tappo": TAPPO,
    # la salsa: un pezzo largo un quarto di giro e alto SALSA_H, che si ripete a specchio
    "salsa": {"giri": 2, "alto": round(SALSA_H[0] - SALSA_H[1], 3)},
    "vetro": VETRO, "dentro": DENTRO,
}, open("modello.json", "w"), separators=(",", ":"))
print("etichette", etichette.shape, "salsa", salsa.size, "tappo", oroT.shape)
