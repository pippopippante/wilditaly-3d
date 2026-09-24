/* Wild Italy · bottiglia 3D da due foto (fronte e retro) su fondo neutro.
   Sagoma: superficie di rotazione misurata riga per riga sulla foto di fronte.
   Colori: ogni metà proietta i vertici sulla sua foto, ripulita dalla luce dello scatto.
   Luce: come in studio, luci e pannelli restano fermi ed è la bottiglia a girare. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const CENTRO = 0.47; /* altezza del perno di rotazione, con la bottiglia alta 1 */
const liscia = THREE.MathUtils.smoothstep;
const LIN = Array.from({ length: 256 }, (_, i) => ((i / 255 + 0.055) / 1.055) ** 2.4);
const srgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const SRGB = Uint8ClampedArray.from({ length: 4096 }, (_, i) => srgb(i / 4095)); /* tabella: niente potenze nel ciclo */
const font = (n) => `700 ${n}px "EB Garamond", Georgia, serif`; /* scritta della capsula */
const mediana = (a) => a.sort((p, q) => p - q)[a.length >> 1] ?? 0;
/* interpolazione lineare su punti [x, y] in ordine, prolungata oltre gli estremi */
const interpola = (p, x) => {
  let j = 1;
  while (j < p.length - 1 && p[j][0] < x) j++;
  const [x0, y0] = p[j - 1], [x1, y1] = p[j];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};

/* studio per i riflessi: fondo scuro, due pannelli alti ai lati e uno sopra */
function studio(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0c0a08);
  const pannello = (w, h, x, y, z, forza) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(forza), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  pannello(1.6, 9, -4, 0, 1.6, 14);
  pannello(1.6, 9, 4, 0, 1.6, 10);
  pannello(7, 2, 0, 5, 0, 5);
  return new THREE.PMREMGenerator(renderer).fromScene(s, 0.02).texture;
}

/* Ritaglia la bottiglia dalla foto (in memoria: il file resta com'è) e la ripulisce:
   - fuori dalle etichette è vetro: lo ridipinge del colore del vetro, riflessi e bordo grigio compresi
     (i riflessi veri li mette lo studio, e girano giusti); la capsula è un pezzo a parte, vedi telaCapsula;
   - toglie la luce dello scatto dalle etichette, misurata sulla foto stessa;
   - prepara la maschera del lucido: il vetro riflette, la carta no. */
function pulisci(img, foto, raggio, alt, vetro) {
  const k = (foto.basso - foto.alto) / alt;
  const rMax = raggio.max * k;
  const x0 = Math.floor(Math.min(...foto.cx) - rMax - 4), y0 = foto.alto - 4;
  const w = Math.ceil(Math.max(...foto.cx) + rMax + 4) - x0, h = foto.basso + 4 - y0;
  const tela = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
  const c = tela();
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, -x0, -y0);
  const dati = g.getImageData(0, 0, w, h), px = dati.data;
  const lucido = new ImageData(w, h), lx = lucido.data;
  const v = vetro.map((x) => LIN[x]);
  /* raggio e centro della bottiglia su una riga della tela */
  const riga = (y) => {
    const t = (y + y0 - foto.alto) / (foto.basso - foto.alto);
    return [raggio(t) * k, foto.cx[0] + (foto.cx[1] - foto.cx[0]) * t - x0];
  };

  /* Luce dello scatto, striscia verticale per striscia: il bianco dell'etichetta (95° percentile)
     rispetto a quello al centro. Misurata e non stimata perché lo scatto è più chiaro da un lato. */
  const N = 48, strisce = Array.from({ length: N }, () => []);
  for (let y = 0; y < h; y += 3) {
    const [r, cx] = riga(y);
    if (!r) continue;
    for (let x = Math.max(0, Math.ceil(cx - r)); x < Math.min(w, cx + r); x += 2) {
      const i = (y * w + x) * 4;
      strisce[Math.floor((((x - cx) / r + 1) / 2) * N)].push(LIN[px[i]] + LIN[px[i + 1]] + LIN[px[i + 2]]);
    }
  }
  const p95 = strisce.map((s) => s.sort((a, b) => a - b)[Math.floor(s.length * 0.95)] || 0);
  const centro = Math.max(...p95.slice(N / 2 - 2, N / 2 + 2));
  /* media su tre strisce e interpolazione: niente scalini verticali; mai più del doppio */
  const L = p95.map((_, j) =>
    Math.min(1, Math.max(0.5, (p95[Math.max(0, j - 1)] + p95[j] + p95[Math.min(N - 1, j + 1)]) / 3 / centro))
  );
  const luceScatto = (s) => {
    const f = Math.min(N - 1, Math.max(0, ((s + 1) / 2) * N - 0.5)), j = Math.min(N - 2, Math.floor(f));
    return L[j] + (L[j + 1] - L[j]) * (f - j);
  };

  /* Il ciclo gira su un milione e mezzo di pixel per foto: niente oggetti creati dentro, conti con i numeri
     e basta, e le righe senza etichette (quasi tutte vetro) copiate in un colpo solo */
  const orig = px.slice();
  const rigaVetro = new Uint8ClampedArray(w * 4), rigaLucida = new Uint8ClampedArray(w * 4).fill(255);
  for (let x = 0; x < w * 4; x += 4) rigaVetro.set([vetro[0], vetro[1], vetro[2], 255], x);
  for (let y = 0; y < h; y++) {
    const [r, cx] = riga(y);
    const Y = y + y0, piega = interpola(foto.curva, Y) * r;
    /* etichette che la riga può toccare: le righe "dritte" dei suoi pixel stanno fra Y - piega e Y */
    const lo = Math.min(Y, Y - piega) - 1, hi = Math.max(Y, Y - piega) + 1;
    const qui = r ? foto.etichette.filter(([a, b]) => b > lo && a < hi) : [];
    if (!qui.length) {
      px.set(rigaVetro, y * w * 4);
      lx.set(rigaLucida, y * w * 4);
      continue;
    }
    const ds = 1 / r;
    for (let x = 0, i = y * w * 4; x < w; x++, i += 4) {
      lx[i + 3] = 255;
      /* fuori dalla sagoma conta come il bordo: così il resto è vetro fino in fondo.
         Anche fuori serve il colore giusto: rimpicciolendo la foto la scheda video mescola i pixel vicini */
      const s = (x + 0.5 - cx) / r;
      const sb = s < -1 ? -1 : s > 1 ? 1 : s;
      /* riga "dritta" del pixel: quella a cui arriva la sua linea orizzontale ai lati della sagoma */
      const R = Y - piega * Math.sqrt(1 - sb * sb);
      /* Quanta parte del pixel cade dentro un'etichetta, in orizzontale e in verticale. Il bordo passa fra
         un pixel e l'altro e si sposta piano (bottiglia appena inclinata, righe curve): deciso pixel per pixel
         farebbe uno scalino ogni tante righe, che visto di lato, con la foto molto allargata, si vede */
      let dentro = 0;
      for (let e = 0; e < qui.length; e++) {
        const q = qui[e];
        const su = Math.min(R + 0.5, q[1]) - Math.max(R - 0.5, q[0]);
        const lato = (Math.min(sb + ds / 2, q[3]) - Math.max(sb - ds / 2, q[2])) / ds;
        if (su > 0 && lato > 0) dentro = Math.max(dentro, Math.min(1, su) * Math.min(1, lato));
      }
      if (dentro <= 0) {
        px[i] = vetro[0];
        px[i + 1] = vetro[1];
        px[i + 2] = vetro[2];
        lx[i] = lx[i + 1] = lx[i + 2] = 255;
        continue;
      }
      /* oltre il 93% del raggio la foto vede il bordo di taglio: si ripete l'ultima colonna buona,
         letta fra i due pixel vicini per lo stesso motivo */
      const sv = s < -0.93 ? -0.93 : s > 0.93 ? 0.93 : s;
      const xs = cx + sv * r - 0.5, j0 = Math.floor(xs), f = xs - j0;
      const i0 = (y * w + j0) * 4, i1 = i0 + 4;
      const c0 = orig[i0] + (orig[i1] - orig[i0]) * f;
      const c1 = orig[i0 + 1] + (orig[i1 + 1] - orig[i0 + 1]) * f;
      const c2 = orig[i0 + 2] + (orig[i1 + 2] - orig[i0 + 2]) * f;
      const lum = (c0 + c1 + c2) / 765;
      const sat = (Math.max(c0, c1, c2) - Math.min(c0, c1, c2)) / 255;
      /* negli angoli delle etichette resta un po' di bordo grigio: neutro e non chiaro, diventa vetro
         (la carta bianca e i colori dell'etichetta restano) */
      const bordo = liscia(Math.abs(sv), 0.8, 0.93) * (1 - liscia(sat, 0.05, 0.1)) * (1 - liscia(lum, 0.3, 0.4));
      const luce = luceScatto(sv);
      let l = 0;
      for (let ch = 0; ch < 3; ch++) {
        const a = LIN[orig[i0 + ch]] + (LIN[orig[i1 + ch]] - LIN[orig[i0 + ch]]) * f;
        const pulito = Math.min(1, (a + (v[ch] - a) * bordo) / luce);
        const fine = v[ch] + (pulito - v[ch]) * dentro; /* sul bordo: in parte etichetta, in parte vetro */
        px[i + ch] = SRGB[Math.round(fine * 4095)];
        l += fine / 3;
      }
      lx[i] = lx[i + 1] = lx[i + 2] = 255 * (1 - liscia(l, 0.02, 0.15));
    }
  }
  g.putImageData(dati, 0, 0);
  const cl = tela();
  cl.getContext("2d").putImageData(lucido, 0, 0);

  const mappa = new THREE.CanvasTexture(c);
  mappa.colorSpace = THREE.SRGBColorSpace;
  return { mappa, lucido: new THREE.CanvasTexture(cl), x0, y0, w, h, k };
}

/* Capsula rifatta da capo, tutta intera: niente giuntura fra le due foto.
   - Lamina rossa riga per riga, dalla foto di fronte: la mediana del rosso puro al centro di ogni riga, così restano
     anelli e bordini; lampi, bordi scuri e lettere restano fuori. Le righe della scritta, con le ombrine della
     stampa in rilievo, prendono il rosso delle righe appena sopra e sotto. Tutto portato al rosso misurato b.lamina.
   - La scritta ridisegnata col carattere, in oro, davanti e dietro. Nella foto le lettere sono strette e alte:
     il carattere viene stretto fino a riempire lo stesso arco. */
async function telaCapsula(img, b, raggio, alt) {
  const f = b.fronte, [a, z] = f.capsula, sc = b.scritta, [t0, t1] = sc.righe;
  const S = 2; /* pixel della tela per pixel della foto: basta anche da vicino */
  const r = raggio(((a + z) / 2 - f.alto) / alt);
  const W = Math.round(2 * Math.PI * r * S), H = (z - a) * S;
  const cx = (y) => f.cx[0] + ((f.cx[1] - f.cx[0]) * (y - f.alto)) / (f.basso - f.alto);

  const xa = Math.floor(Math.min(cx(a), cx(z)) - r), ww = Math.ceil(2 * r) + 20;
  const lettura = Object.assign(document.createElement("canvas"), { width: ww, height: z - a + 1 });
  const lg = lettura.getContext("2d", { willReadFrequently: true });
  lg.drawImage(img, -xa, -a);
  const px = lg.getImageData(0, 0, ww, z - a + 1).data;
  const righe = new Map();
  for (let y = a; y <= z; y++) {
    if (y >= t0 - 6 && y <= t1 + 6) continue;
    const cs = [[], [], []], c = cx(y) - xa;
    for (let x = Math.ceil(c - 0.6 * r); x < c + 0.6 * r; x++) {
      const i = ((y - a) * ww + x) * 4;
      /* rosso puro: fuori le lettere (oro) e i lampi (rosa) */
      if (px[i + 1] < 0.36 * px[i]) for (let ch = 0; ch < 3; ch++) cs[ch].push(px[i + ch]);
    }
    if (cs[0].length) righe.set(y, cs.map((v) => LIN[mediana(v)]));
  }
  const buone = [...righe.keys()];
  const media = [0, 1, 2].map((ch) => mediana(buone.map((y) => righe.get(y)[ch])));

  const tela = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = tela.getContext("2d");
  for (let y = a; y < z; y++) {
    const su = buone.findLast((q) => q <= y) ?? buone[0], giu = buone.find((q) => q >= y) ?? su;
    const q = su === giu ? 0 : (y - su) / (giu - su);
    const lin = righe.get(su).map((v, ch) => ((v + (righe.get(giu)[ch] - v) * q) * LIN[b.lamina[ch]]) / media[ch]);
    g.fillStyle = `rgb(${lin.map((v) => Math.round(srgb(Math.min(1, v)))).join()})`;
    g.fillRect(0, (y - a) * S, W, S);
  }

  await document.fonts.load(font(100)).catch(() => {});
  g.font = font(100);
  g.font = font((100 * (t1 - t0) * S) / g.measureText("N").actualBoundingBoxAscent);
  const lettere = [...sc.testo], larghe = lettere.map((l) => g.measureText(l).width);
  const spazio = 0.1 * larghe[0]; /* lettere quasi attaccate, come sulla capsula */
  const naturale = larghe.reduce((p, q) => p + q, 0) + spazio * (lettere.length - 1);
  const arco = 2 * Math.asin(sc.s) * r * S;
  /* le stesse lettere anche su una maschera a parte: lì sopra va lo strato di metallo dorato */
  const maschera = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const m = maschera.getContext("2d");
  m.fillRect(0, 0, W, H);
  for (const [ctx, colore] of [[g, `rgb(${b.oro.join()})`], [m, "#fff"]]) {
    ctx.font = g.font;
    ctx.fillStyle = colore;
    for (const centro of [W / 2, 0, W]) {
      /* davanti; dietro sta a cavallo del bordo della tela, quindi due mezze volte */
      ctx.save();
      ctx.translate(centro - arco / 2, (t1 - a) * S);
      ctx.scale(arco / naturale, 1);
      let x = 0;
      lettere.forEach((l, i) => {
        ctx.fillText(l, x, 0);
        x += larghe[i] + spazio;
      });
      ctx.restore();
    }
  }
  return { tela, maschera };
}

/* b.profilo: [mezza larghezza, riga] in pixel della foto di fronte, dal tappo al fondo.
   b.fronte / b.retro: { src, alto, basso, cx: [centro in alto, centro in basso], curva, etichette } in pixel della propria foto;
   curva: [[riga, quanto scende al centro la linea orizzontale, in raggi], ...], misurato sui bordi dritti;
   etichette: [riga da, riga a, s da, s a], righe prese ai lati della sagoma, s da -1 (bordo sinistro) a 1 (destro).
   b.fronte.capsula: [riga da, riga a] della capsula sulla foto di fronte.
   b.scritta: { testo, righe: [cima, base delle lettere], s: fin dove arriva la scritta, in frazione di raggio }.
   b.vetro, b.lamina, b.oro: colori [r, g, b] 0–255 di vetro, capsula e scritta, letti sulle foto. */
export function monta(el, b) {
  /* il carattere della capsula si scarica subito, insieme alle foto, e non quando serve */
  document.fonts.load(font(100)).catch(() => {});
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.append(renderer.domElement);

  const scene = new THREE.Scene();
  /* lo studio si riflette solo sul vetro: la foto prende le luci qui sotto e basta */
  const envMap = studio(renderer);
  /* tanta luce diffusa e una principale morbida da sinistra in alto: al centro la carta torna come nella foto */
  scene.add(new THREE.AmbientLight(0xffffff, 1.55));
  const chiave = new THREE.DirectionalLight(0xffffff, 1.8);
  chiave.position.set(-0.6, 1, 2.5);
  scene.add(chiave);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  const f0 = b.fronte;
  const alt = f0.basso - f0.alto;
  const prof = b.profilo;
  /* mezza larghezza a una certa altezza (t = 0 in cima, 1 sul fondo), in pixel della foto di fronte */
  const raggio = (t) => {
    const riga = f0.alto + t * alt;
    if (riga < prof[0][1] || riga > prof.at(-1)[1]) return 0;
    let j = 1;
    while (prof[j][1] < riga) j++;
    const [r0, y0] = prof[j - 1], [r1, y1] = prof[j];
    return r0 + ((r1 - r0) * (riga - y0)) / (y1 - y0 || 1);
  };
  raggio.max = Math.max(...prof.map((p) => p[0]));
  /* la capsula è un pezzo a parte; sotto, le due metà prese dalle foto.
     Punti dal fondo verso l'alto, altrimenti le normali guardano dentro */
  const z = f0.capsula[1], rz = raggio((z - f0.alto) / alt);
  const V = ([r, riga]) => new THREE.Vector2(r, f0.basso - riga);
  const puntiVetro = [...prof.filter(([, y]) => y > z).reverse(), [rz, z]].map(V);
  const puntiCapsula = [[rz, z], ...prof.filter(([, y]) => y < z).reverse()].map(V);

  /* la bottiglia gira attorno al perno; ombra e bottiglia girano insieme */
  const perno = new THREE.Group();
  perno.position.y = CENTRO;
  scene.add(perno);
  const bottiglia = new THREE.Group();
  bottiglia.scale.setScalar(1 / alt);
  bottiglia.position.y = -CENTRO;
  perno.add(bottiglia);

  const vetro = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(...b.vetro.map((x) => x / 255), THREE.SRGBColorSpace),
    roughness: 0.06,
    envMap,
    side: THREE.DoubleSide
  });
  /* fondo con la rientranza, in vetro pieno */
  const rb = prof.at(-1)[0];
  bottiglia.add(
    new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, 0.4], [0.3, 0.36], [0.65, 0.18], [0.9, 0.03], [1, 0]].map(([r, y]) => new THREE.Vector2(r * rb, y * rb)),
        64
      ),
      vetro
    )
  );

  /* capsula: tela disegnata da capo (u = angolo, v = altezza), lucida a metà; in cima un disco dello stesso rosso */
  const capsula = ({ tela, maschera }) => {
    const geo = new THREE.LatheGeometry(puntiCapsula, 128, -Math.PI, 2 * Math.PI); /* u = 0,5 davanti */
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - (f0.basso - z)) / (z - f0.capsula[0]));
    const mappa = new THREE.CanvasTexture(tela);
    mappa.colorSpace = THREE.SRGBColorSpace;
    mappa.anisotropy = renderer.capabilities.getMaxAnisotropy();
    bottiglia.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: mappa })));
    bottiglia.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          roughness: 0.2,
          envMap,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1
        })
      )
    );
    /* scritta in metallo dorato: riflette lo studio tinto d'oro, quindi è brunita dove guarda il fondo scuro
       e brilla dove prende un pannello, e il lampo scorre sulle lettere mentre la bottiglia gira */
    const lettere = new THREE.CanvasTexture(maschera);
    lettere.anisotropy = mappa.anisotropy;
    bottiglia.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setRGB(...b.oro.map((x) => x / 255), THREE.SRGBColorSpace),
          metalness: 0.9,
          roughness: 0.3,
          envMap,
          alphaMap: lettere,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2
        })
      )
    );
    const tappo = new THREE.Mesh(
      new THREE.CircleGeometry(prof[0][0], 48),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color().setRGB(...b.lamina.map((x) => x / 255), THREE.SRGBColorSpace)
      })
    );
    tappo.rotation.x = -Math.PI / 2;
    tappo.position.y = alt;
    bottiglia.add(tappo);
  };

  const meta = (foto, phi, verso) => {
    const geo = new THREE.LatheGeometry(puntiVetro, 96, phi, Math.PI);
    const img = new Image();
    img.src = foto.src;
    img.decode().then(() => {
      const p = pulisci(img, foto, raggio, alt, b.vetro);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        /* 8 px di margine: l'orlo in cima e il fondo non devono pescare lo sfondo */
        const t = Math.min(Math.max(1 - pos.getY(i) / alt, 8 / alt), 1 - 8 / alt);
        const cx = foto.cx[0] + (foto.cx[1] - foto.cx[0]) * t;
        /* Le linee orizzontali nella foto sono curve (fotocamera vicina e più in alto, più l'obiettivo):
           la parte verso la fotocamera scende di curva(riga) raggi rispetto ai lati. Qui si legge la foto lungo
           la curva, così sul modello tornano dritte */
        const X = pos.getX(i), Z = pos.getZ(i), rv = Math.hypot(X, Z);
        const R = foto.alto + t * (foto.basso - foto.alto);
        const piega = rv ? interpola(foto.curva, R) * p.k * verso * Z : 0; /* = curva · raggio · cos(angolo) */
        uv.setXY(i, (cx + verso * X * p.k * 0.995 - p.x0) / p.w, 1 - (R + piega - p.y0) / p.h);
      }
      uv.needsUpdate = true;
      /* la foto prende solo le luci; sopra, un velo che aggiunge i riflessi dello studio dove c'è vetro */
      bottiglia.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: p.mappa })));
      bottiglia.add(
        new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.05,
            envMap,
            alphaMap: p.lucido,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1
          })
        )
      );
      if (verso > 0) telaCapsula(img, b, raggio, alt).then(capsula);
    });
  };
  meta(b.fronte, -Math.PI / 2, 1);
  meta(b.retro, Math.PI / 2, -1); /* la foto del retro è girata: la sua destra è la nostra sinistra */

  /* ombra morbida a terra */
  const c = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(20,16,12,.45)");
  grad.addColorStop(1, "rgba(20,16,12,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const ombra = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  ombra.rotation.x = -Math.PI / 2;
  ombra.position.y = 0.001 - CENTRO;
  perno.add(ombra);

  /* OrbitControls muove una camera immaginaria; la bottiglia fa il movimento opposto e la camera vera sta ferma */
  const occhio = new THREE.PerspectiveCamera();
  occhio.position.set(0, CENTRO + 0.15, 2.6);
  const controls = new OrbitControls(occhio, renderer.domElement);
  controls.target.set(0, CENTRO, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.9;
  controls.maxDistance = 3.5;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI - 0.03;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.addEventListener("start", () => (controls.autoRotate = false));

  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }).observe(el);

  renderer.setAnimationLoop(() => {
    controls.update();
    perno.quaternion.copy(occhio.quaternion).invert();
    camera.position.set(0, CENTRO, occhio.position.distanceTo(controls.target));
    renderer.render(scene, camera);
  });
}
