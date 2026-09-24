"""Bordi di etichette e capsula su una foto: curvatura delle linee orizzontali e lati (anche storti).
Si appoggia alle misure di misura.py (alto, basso, cx, profilo della foto di fronte)."""
import numpy as np
from PIL import Image

D = "assets/img/"  # da lanciare dalla cartella del sito


class Foto:
    def __init__(self, f, alto, basso, cx, profilo, alto0, basso0):
        self.a = np.asarray(Image.open(D + f).convert("RGB"), dtype=float)
        self.L = self.a.mean(2)
        self.alto, self.basso, self.cx = alto, basso, cx
        self.prof = np.array(profilo, dtype=float)
        self.alto0, self.basso0 = alto0, basso0  # della foto di fronte
        self.k = (basso - alto) / (basso0 - alto0)

    def geo(self, y):
        t = (y - self.alto) / (self.basso - self.alto)
        cx = self.cx[0] + (self.cx[1] - self.cx[0]) * t
        r = np.interp(self.alto0 + t * (self.basso0 - self.alto0), self.prof[:, 1], self.prof[:, 0]) * self.k
        return cx, r

    def colonna(self, s, y0, y1, canale):
        v = []
        for y in range(y0, y1):
            cx, r = self.geo(y)
            x = int(round(cx + s * r))
            p = self.a[y, x - 1:x + 2].mean(0)
            v.append(canale(p))
        return np.convolve(v, np.ones(3) / 3, mode="same")

    def orizzontale(self, y0, y1, canale=lambda p: p.mean(), ammesso=lambda s: True, verso=0, guida=None):
        """riga(s) = R0 + c*sqrt(1-s^2): R0 ai lati della sagoma, c quanto il centro scende (+) o sale (-).
        guida=(R0, c, mezza): cerca solo in una striscia attorno alla curva attesa (lettere e fondo restano fuori)"""
        ss, rr = [], []
        for s in np.linspace(-0.88, 0.88, 45):
            if not ammesso(s):
                continue
            if guida:
                yc = guida[0] + guida[1] * np.sqrt(1 - s * s)
                y0, y1 = int(yc - guida[2]), int(yc + guida[2])
            d = np.diff(self.colonna(s, y0, y1, canale))
            d[:2] = d[-2:] = 0
            d = d * verso if verso else np.abs(d)  # verso +1: si schiarisce scendendo, -1: si scurisce
            rr.append(y0 + np.argmax(d) + 0.5); ss.append(s)
        ss, rr = np.array(ss), np.array(rr)
        A = np.c_[np.ones_like(ss), np.sqrt(1 - ss ** 2)]
        keep = np.ones(len(ss), bool)
        for _ in range(4):
            sol, *_ = np.linalg.lstsq(A[keep], rr[keep], rcond=None)
            res = rr - A @ sol
            keep = np.abs(res) < max(2.0, 2.5 * np.std(res[keep]))
        R0, c = sol
        _, r = self.geo(R0)
        return round(float(R0), 1), round(float(c), 1), round(float(c / r), 4), round(float(np.std(res[keep])), 1), int(keep.sum()), len(ss)

    def lato(self, curva, y0, y1, sa, sb, verso):
        """bordo verticale: per ogni riga il salto più forte fra s=sa e s=sb (verso +1 carta->vetro verso destra).
        Restituisce s in cima e in fondo (righe dritte R) e lo scarto"""
        RR, SS = [], []
        for y in range(y0, y1, max(1, (y1 - y0) // 120)):
            cx, r = self.geo(y)
            xa, xb = int(cx + sa * r), int(cx + sb * r)
            riga = self.L[y - 1:y + 2, xa:xb].mean(0)
            g = np.diff(np.convolve(riga, np.ones(3) / 3, mode="same")) * -verso
            g[:2] = g[-2:] = 0
            j = int(np.argmax(g))
            if 0 < j < len(g) - 1:
                y1_, y2_, y3_ = g[j - 1:j + 2]
                j = j + 0.5 * (y1_ - y3_) / (y1_ - 2 * y2_ + y3_ or 1)
            s = (xa + j + 1 - cx) / r
            q = np.interp(y, [p[0] for p in curva], [p[1] for p in curva])
            RR.append(y - q * r * np.sqrt(max(0, 1 - s * s))); SS.append(s)
        RR, SS = np.array(RR), np.array(SS)
        keep = np.ones(len(RR), bool)
        for _ in range(4):
            m, q = np.polyfit(RR[keep], SS[keep], 1)
            res = SS - (m * RR + q)
            keep = np.abs(res) < max(0.003, 2.5 * np.std(res[keep]))
        _, r = self.geo((y0 + y1) / 2)
        return round(float(m * y0 + q), 4), round(float(m * y1 + q), 4), round(float(np.std(res[keep]) * r), 1), int(keep.sum()), len(RR)
