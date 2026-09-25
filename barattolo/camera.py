"""Da dove è scattata una foto del barattolo: fotocamera vera (prospettiva), barattolo = cilindro di raggio 1.
Si misura sui due fili d'oro dell'etichetta, che sul vetro sono due cerchi orizzontali: la posa è quella che li
proietta sopra i punti tracciati sulla foto. Con la posa, ogni punto del barattolo (angolo, altezza) ha il suo
pixel sulla foto: le righe dell'etichetta restano dritte anche con la foto presa da vicino e dall'alto."""
import numpy as np


class Posa:
    """p = [qx, qy, qz, beccheggio, rollio, H]: centro del cerchio di sopra, inclinazione dell'asse, distanza fra
    i due cerchi (in raggi). f: focale in pixel; c: centro dell'immagine."""

    def __init__(self, p, f, c):
        self.p, self.f, self.c = np.asarray(p, float), f, np.asarray(c, float)
        qx, qy, qz, b, r, self.H = self.p[:6]
        self.altre = self.p[6:]  # altezze di altri cerchi (bordi dritti a metà etichetta), in raggi
        self.Q = np.array([qx, qy, qz])
        # asse in su: (0, -1, 0) inclinato all'indietro (beccheggio) e di lato (rollio)
        A = np.array([np.sin(r), -np.cos(r) * np.cos(b), np.cos(r) * np.sin(b)])
        self.A = A / np.linalg.norm(A)
        verso = -self.Q - (-self.Q @ self.A) * self.A  # verso la fotocamera, nel piano del cerchio
        self.W = verso / np.linalg.norm(verso)
        self.U = np.cross(self.A, self.W)  # angolo positivo = a destra nella foto

    def punto(self, teta, h):
        """teta (radianti, 0 verso la fotocamera), h (raggi, in su dal cerchio di sopra) -> punto 3D"""
        teta, h = np.broadcast_arrays(np.asarray(teta, float), np.asarray(h, float))
        return (self.Q + h[..., None] * self.A + np.sin(teta)[..., None] * self.U
                + np.cos(teta)[..., None] * self.W)

    def pixel(self, teta, h):
        P = self.punto(teta, h)
        return self.c + self.f * P[..., :2] / P[..., 2:3]

    def visibile(self, teta, h):
        """il punto guarda verso la fotocamera"""
        P = self.punto(teta, h)
        n = np.sin(teta)[..., None] * self.U + np.cos(teta)[..., None] * self.W
        return (n * -P).sum(-1) > 0


def contorno(posa, hs):
    """bordo sinistro e destro del barattolo sulla foto, alle altezze hs: dove il vetro si vede di taglio,
    cioè a sin(teta) + b cos(teta) = -1 (a, b: centro del cerchio lungo U e W)"""
    Cc = posa.Q + np.asarray(hs)[:, None] * posa.A
    a, b = Cc @ posa.U, Cc @ posa.W
    rho, phi = np.hypot(a, b), np.arctan2(b, a)
    s = np.arcsin(np.clip(-1 / rho, -1, 1))
    lati = [posa.pixel(-phi + s, hs), posa.pixel(-phi + np.pi - s, hs)]
    return sorted(lati, key=lambda xy: xy[:, 0].mean())  # [sinistro, destro]


def residui(p, f, c, bordi, lati=(), peso=5, fissi=None):
    posa = Posa(p, f, c)
    t = np.linspace(-np.pi, np.pi, 1440, endpoint=False)
    out = []
    for k, pts in bordi:
        hh = np.full_like(t, 0 if k == 0 else -posa.H if k == 1 else posa.altre[k - 2])
        curva = posa.pixel(t, hh)[posa.visibile(t, hh)]  # solo la metà che si vede
        d = np.linalg.norm(pts[:, None, :] - curva[None], axis=2).min(1) if len(curva) else np.full(len(pts), 1e3)
        out.append(d)
    if len(lati):
        sx, dx = contorno(posa, np.linspace(1.5, -posa.H - 1.5, 80))
        for lato, y, x in lati:
            q = sx if lato < 0 else dx
            o = np.argsort(q[:, 1])
            out.append([peso * (np.interp(y, q[o, 1], q[o, 0]) - x)])
    for i, v in (fissi or {}).items():  # parametri noti da altre foto
        out.append([500 * (p[i] - v)])
    return np.concatenate(out)


def adatta(p0, f, c, sopra, sotto, lati=(), giri=60, altre=(), fissi=None):
    """Levenberg-Marquardt con derivate numeriche; i punti lontani (riflessi presi per filo) si scartano.
    lati: [(-1 o 1, riga, colonna)] punti misurati sui bordi sinistro e destro del barattolo"""
    p = np.asarray(p0, float)
    bordi = [(0, sopra), (1, sotto)] + [(k + 2, a) for k, a in enumerate(altre)]
    R = lambda q: residui(q, f, c, bordi, lati, fissi=fissi)
    for fase in range(3):
        lam = 1e-2
        for _ in range(giri):
            r = R(p)
            J = np.stack([(R(p + dp) - r) / 1e-5 for dp in np.eye(len(p)) * 1e-5], 1)
            g = J.T @ r
            while True:
                dp = np.linalg.solve(J.T @ J + lam * np.diag(np.diag(J.T @ J) + 1e-9), -g)
                if (R(p + dp) ** 2).sum() < (r ** 2).sum():
                    p, lam = p + dp, lam / 3
                    break
                lam *= 5
                if lam > 1e8:
                    break
            if lam > 1e8 or np.abs(dp).max() < 1e-7:
                break
        # via i punti a più di 3 volte l'errore medio (solo sui fili)
        r = residui(p, f, c, bordi)
        lim = max(2.0, 3 * np.median(r))
        tagli = np.cumsum([len(b) for _, b in bordi])[:-1]
        bordi = [(k, b[rr < lim]) for (k, b), rr in zip(bordi, np.split(r, tagli))]
    return p, residui(p, f, c, bordi), [b for _, b in bordi]
