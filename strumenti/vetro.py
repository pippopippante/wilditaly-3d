"""Aspetto del vetro trasparente, preso da una foto della bottiglia su fondo bianco (quelle del sito della cantina).
Su fondo bianco il colore di ogni punto è proprio quanto la bottiglia lascia passare: bianco × vino × vetro, con i
riflessi dello studio. La mappa ha in orizzontale il punto della bottiglia visto dalla camera (bordo sinistro, centro,
bordo destro) e in verticale l'altezza della nostra bottiglia, dal fondo della capsula al piede.

Righe allineate a tratti: collo e spalla in proporzione, corpo dritto con un solo profilo (preso sopra l'etichetta,
che nella foto copre il vetro), tallone in proporzione.

Uso: python vetro.py grechetto foto_bianco.jpg uscita.png  (i numeri della bottiglia sono nella tabella qui sotto).
Le foto su bianco vengono dal sito della cantina, napolini.it (es. wp-content/uploads/2020/04/Grechetto.jpg)."""
import sys
import numpy as np
from PIL import Image

BOTTIGLIE = {
    # nostra bottiglia (righe della foto di fronte): fondo capsula, inizio corpo dritto, inizio tallone, piede
    # foto su bianco: fondo capsula, inizio corpo, righe del corpo libero sopra l'etichetta, inizio tallone, piede, centro
    # nero (facoltativo): righe della foto su bianco dove il collo si allarga e il vetro spesso fa lente e viene nero;
    # visto di lato è una riga, ma dall'alto la spalla si vede di piatto e diventa un anello: lì si sfuma da sopra a sotto
    "grechetto": dict(nostra=(362, 796, 1172, 1198), bianco=(240, 562, (470, 515), 885, 915), cx=500.5),
    "vignarosa": dict(nostra=(370, 693, 1149, 1212), bianco=(237, 386, (390, 432), 881, 912), cx=496, nero=(271, 289)),
}
N = 64  # colonne: da bordo sinistro a bordo destro


def mappa(foto, B):
    a = np.asarray(Image.open(foto).convert("RGB"), dtype=float)
    diff = np.abs(a - 255).sum(2)
    raggio = {}

    def r_di(y):
        if y not in raggio:
            xs = np.nonzero(diff[y] > 25)[0]
            raggio[y] = (xs.max() - xs.min()) / 2 if len(xs) > 3 else 0
        return raggio[y]

    def profilo(y):
        """colori della riga y, da s=-0.96 a +0.96; mediana su tre righe e tre pixel"""
        out = []
        for i in range(N):
            s = np.clip(-1 + (i + 0.5) * 2 / N, -0.96, 0.96)
            col = []
            for yy in (y - 1, y, y + 1):
                x = int(round(B["cx"] + s * r_di(yy)))
                col += list(a[yy, x - 1:x + 2])
            out.append(np.median(np.array(col), 0))
        return np.array(out)

    zc, corpo, tallone, piede = B["nostra"]
    zp, corpoP, (c0, c1), talloneP, piedeP = B["bianco"]
    def riga(yp):
        n = B.get("nero")
        if n and n[0] < yp < n[1]:
            w = (yp - n[0]) / (n[1] - n[0])
            return profilo(n[0]) * (1 - w) + profilo(n[1]) * w
        return profilo(int(round(yp)))

    corpoMedio = np.median(np.array([profilo(y) for y in range(c0, c1 + 1, 3)]), 0)
    righe = []
    for y in range(zc, piede + 1):
        if y < corpo:
            yp = zp + (y - zc) / (corpo - zc) * (corpoP - zp)
            # la spalla sfuma nel profilo del corpo, senza scalino
            w = float(np.clip((yp - (c0 - 40)) / 40, 0, 1))
            righe.append(corpoMedio if w >= 1 else riga(min(yp, c0)) * (1 - w) + corpoMedio * w)
        elif y < tallone:
            righe.append(corpoMedio)
        else:
            yp = talloneP + (y - tallone) / max(1, piede - tallone) * (piedeP - 2 - talloneP)
            righe.append(profilo(int(round(yp))))
    return np.clip(np.array(righe), 0, 255).astype(np.uint8)


if __name__ == "__main__":
    nome, foto, uscita = sys.argv[1], sys.argv[2], sys.argv[3]
    m = mappa(foto, BOTTIGLIE[nome])
    Image.fromarray(m).save(uscita)
    print(uscita, m.shape, "centro del corpo:", m[len(m) // 2, N // 2], "sinistra:", m[len(m) // 2, N // 5], "destra:", m[len(m) // 2, 4 * N // 5])
