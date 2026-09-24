/* Wild Italy · bottiglia 3D da due foto (fronte e retro) su fondo neutro.
   Sagoma: superficie di rotazione misurata riga per riga sulla foto di fronte.
   Pezzi: corpo di vetro, capsula ridisegnata, etichette come fogli ritagliati che prendono i colori dalle foto.
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

/* Ritaglia la bottiglia dalla foto (in memoria: il file resta com'è) e ripulisce le etichette, l'unica parte
   della foto che si usa: vetro e capsula sono pezzi a parte.
   - toglie la luce dello scatto, misurata sulla foto stessa;
   - appena fuori dal bordo ripete la carta: rimpicciolendo la foto la scheda video mescola i pixel vicini,
     e il bordo del foglio non deve prendere il colore del vetro;
   - nelle zone "trasparente" il nero diventa buco: è vetro visto attraverso l'etichetta (l'incavo sopra). */
function pulisci(img, foto, raggio, alt) {
  const k = (foto.basso - foto.alto) / alt;
  const rMax = raggio.max * k;
  const x0 = Math.floor(Math.min(...foto.cx) - rMax - 4), y0 = foto.alto - 4;
  const w = Math.ceil(Math.max(...foto.cx) + rMax + 4) - x0, h = foto.basso + 4 - y0;
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, -x0, -y0);
  const dati = g.getImageData(0, 0, w, h), px = dati.data;
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

  const orig = px.slice();
  const buco = foto.trasparente || [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const [r, cx] = riga(y);
    if (!r) continue;
    const Y = y + y0, piega = interpola(foto.curva, Y) * r;
    /* etichette che la riga può toccare: le righe "dritte" dei suoi pixel stanno fra Y - piega e Y */
    const lo = Math.min(Y, Y - piega) - 3, hi = Math.max(Y, Y - piega) + 3;
    const qui = foto.etichette.filter(([a, b]) => b > lo && a < hi);
    for (let x = 0, i = y * w * 4; x < w && qui.length; x++, i += 4) {
      const s = (x + 0.5 - cx) / r;
      if (s <= -1 || s >= 1) continue;
      /* riga "dritta" del pixel: quella a cui arriva la sua linea orizzontale ai lati della sagoma */
      const R = Y - piega * Math.sqrt(1 - s * s);
      /* il pixel di carta da usare: il suo, o appena fuori dal bordo (fino a 12 px) quello di carta più vicino */
      let sv = 2, lontano = 12;
      for (let e = 0; e < qui.length; e++) {
        const q = qui[e];
        if (R < q[0] - 2 || R > q[1] + 2) continue;
        const f = (R - q[0]) / (q[1] - q[0]);
        const s0 = q[2].length ? q[2][0] + (q[2][1] - q[2][0]) * f : q[2];
        const s1 = q[3].length ? q[3][0] + (q[3][1] - q[3][0]) * f : q[3];
        const sc = s < s0 ? s0 : s > s1 ? s1 : s, d = Math.abs(s - sc) * r;
        if (d <= lontano) [lontano, sv] = [d, sc];
      }
      if (sv > 1) continue;
      const j = sv === s ? i : (y * w + Math.round(cx + sv * r - 0.5)) * 4;
      const luce = luceScatto(sv);
      for (let ch = 0; ch < 3; ch++) px[i + ch] = SRGB[Math.round(Math.min(1, LIN[orig[j + ch]] / luce) * 4095)];
      if (R >= buco[0] && R <= buco[1] && s >= buco[2] && s <= buco[3]) {
        const lum = (orig[j] + orig[j + 1] + orig[j + 2]) / 765;
        const sat = (Math.max(orig[j], orig[j + 1], orig[j + 2]) - Math.min(orig[j], orig[j + 1], orig[j + 2])) / 255;
        px[i + 3] = 255 * Math.max(liscia(lum, 0.1, 0.25), liscia(sat, 0.15, 0.3));
      }
    }
  }
  g.putImageData(dati, 0, 0);
  const mappa = new THREE.CanvasTexture(c);
  mappa.colorSpace = THREE.SRGBColorSpace;
  return { mappa, x0, y0, w, h, k };
}

/* Capsula rifatta da capo, tutta intera: niente giuntura fra le due foto.
   - Lamina riga per riga, dalla foto di fronte: la mediana al centro di ogni riga, così restano anelli e bordini
     e i lampi (pochi pixel) restano fuori. Le righe della scritta, con le ombrine della stampa in rilievo, prendono
     il colore delle righe appena sopra e sotto. Tutto portato al colore misurato b.lamina.
   - La scritta ridisegnata col carattere, in oro, due volte a mezzo giro l'una dall'altra, dove sta sulla capsula
     vera. Nella foto le lettere sono strette e alte: il carattere viene stretto fino a riempire lo stesso arco. */
async function telaCapsula(img, b, raggio, alt) {
  const f = b.fronte, [a, z] = f.capsula, sc = b.scritta, [t0, t1] = sc.righe;
  const r = raggio(((a + z) / 2 - f.alto) / alt);
  const S = Math.max(2, 1400 / (2 * Math.PI * r)); /* tela larga 1400 px circa: basta anche da vicino */
  const W = Math.round(2 * Math.PI * r * S), H = Math.round((z - a) * S);
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
    for (let x = Math.ceil(c - 0.45 * r); x < c + 0.45 * r; x++) {
      const i = ((y - a) * ww + x) * 4;
      for (let ch = 0; ch < 3; ch++) cs[ch].push(px[i + ch]);
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
    g.fillRect(0, Math.floor((y - a) * S), W, Math.ceil(S));
  }

  await document.fonts.load(font(100)).catch(() => {});
  g.font = font(100);
  g.font = font((100 * (t1 - t0) * S) / g.measureText("N").actualBoundingBoxAscent);
  const lettere = [...sc.testo], larghe = lettere.map((l) => g.measureText(l).width);
  const spazio = 0.1 * larghe[0]; /* lettere quasi attaccate, come sulla capsula */
  const naturale = larghe.reduce((p, q) => p + q, 0) + spazio * (lettere.length - 1);
  /* angoli: 0 al centro della foto di fronte, crescono verso destra; sulla tela u = 0,5 è davanti */
  const arco = ((sc.arco * Math.PI) / 180) * r * S, inizio = W / 2 + ((sc.inizio * Math.PI) / 180) * r * S;
  /* le stesse lettere anche su una maschera a parte: lì sopra va lo strato di metallo dorato */
  const maschera = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const m = maschera.getContext("2d");
  m.fillRect(0, 0, W, H);
  for (const [ctx, colore] of [[g, `rgb(${b.oro.join()})`], [m, "#fff"]]) {
    ctx.font = g.font;
    ctx.fillStyle = colore;
    for (const x0 of [-W, -W / 2, 0, W / 2, W].map((d) => inizio + d)) {
      /* le due scritte, e le loro copie a cavallo del bordo della tela */
      ctx.save();
      ctx.translate(x0, (t1 - a) * S);
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

/* Vetro: il colore di ogni riga dalla foto di fronte, al centro della bottiglia (mediana: i lampi restano fuori).
   Nel vino chiaro il vetro cambia colore con l'altezza (collo, livello del vino, tallone); nel rosso scuro è nero.
   Le righe coperte dall'etichetta prendono il colore dell'ultima riga libera sopra: il corpo continua uguale fino
   al tallone, che nella foto è più scuro e non va mescolato al resto. */
function telaVetro(img, b, raggio, alt) {
  const f = b.fronte, z = f.capsula[1];
  const cx = (y) => f.cx[0] + ((f.cx[1] - f.cx[0]) * (y - f.alto)) / (f.basso - f.alto);
  const xa = Math.floor(Math.min(...f.cx) - raggio.max), ww = Math.ceil(2 * raggio.max) + 4, hh = f.basso - z + 1;
  const lettura = Object.assign(document.createElement("canvas"), { width: ww, height: hh });
  const lg = lettura.getContext("2d", { willReadFrequently: true });
  lg.drawImage(img, -xa, -z);
  const px = lg.getImageData(0, 0, ww, hh).data;
  const righe = new Map();
  for (let y = z + 4; y <= f.basso - 2; y++) {
    const r = raggio((y - f.alto) / alt), R = y - interpola(f.curva, y) * r; /* riga dritta, al centro */
    if (f.etichette.some(([a, b2]) => R > a - 6 && R < b2 + 6)) continue;
    const cs = [[], [], []], c = cx(y) - xa;
    for (let x = Math.ceil(c - 0.45 * r); x < c + 0.45 * r; x++)
      for (let ch = 0; ch < 3; ch++) cs[ch].push(px[((y - z) * ww + x) * 4 + ch]);
    righe.set(y, cs.map(mediana));
  }
  const buone = [...righe.keys()];
  const tela = Object.assign(document.createElement("canvas"), { width: 4, height: hh });
  const g = tela.getContext("2d");
  for (let y = z; y <= f.basso; y++) {
    g.fillStyle = `rgb(${righe.get(buone.findLast((q) => q <= y) ?? buone[0]).join()})`;
    g.fillRect(0, y - z, 4, 1);
  }
  return { tela, fondo: righe.get(buone.at(-1)) };
}

/* b.profilo: [mezza larghezza, riga] in pixel della foto di fronte, dal tappo al fondo.
   b.fronte / b.retro: { src, alto, basso, cx: [centro in alto, centro in basso], curva, etichette } in pixel della propria foto;
   curva: [[riga, quanto scende al centro la linea orizzontale, in raggi], ...], misurato sui bordi dritti;
   etichette: [riga da, riga a, s da, s a], righe prese ai lati della sagoma, s da -1 (bordo sinistro) a 1 (destro);
   s può essere [in cima, in fondo] per un lato storto; meno di un pixel dentro il bordo vero della carta.
   trasparente: [riga da, riga a, s da, s a] dove il nero dell'etichetta è vetro visto da un buco.
   b.fronte.capsula: [riga da, riga a] della capsula sulla foto di fronte.
   b.scritta: { testo, righe: [cima, base delle lettere], inizio: angolo dove comincia (gradi, 0 davanti, positivi
   a destra), arco: quanti gradi occupa }; sulla capsula ce ne sono due, a mezzo giro l'una dall'altra.
   b.lamina, b.oro: colori [r, g, b] 0–255 di capsula e scritta, letti sulle foto (la lamina dove la luce la prende
   di fronte). Il vetro lo legge da solo, riga per riga. */
export function monta(el, b) {
  /* il carattere della capsula si scarica subito, insieme alle foto, e non quando serve */
  document.fonts.load(font(100)).catch(() => {});
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.append(renderer.domElement);

  const scene = new THREE.Scene();
  /* lo studio si riflette su vetro, capsula e scritta; la carta prende le luci qui sotto e basta */
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
  /* la capsula è un pezzo a parte; sotto, il corpo di vetro.
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

  /* vetro: prima un colore scuro qualsiasi, poi (letta la foto) il colore di ogni riga; il fondo, con la
     rientranza, prende quello dell'ultima riga */
  const vetro = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.05, envMap, side: THREE.DoubleSide });
  const vetroFondo = vetro.clone();
  const rb = prof.at(-1)[0];
  bottiglia.add(
    new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, 0.4], [0.3, 0.36], [0.65, 0.18], [0.9, 0.03], [1, 0]].map(([r, y]) => new THREE.Vector2(r * rb, y * rb)),
        64
      ),
      vetroFondo
    )
  );
  const colora = ({ tela, fondo }) => {
    vetro.map = new THREE.CanvasTexture(tela);
    vetro.map.colorSpace = THREE.SRGBColorSpace;
    vetro.color.set(0xffffff);
    vetro.needsUpdate = true;
    vetroFondo.color.setRGB(...fondo.map((x) => x / 255), THREE.SRGBColorSpace);
  };

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
          opacity: 0.3,
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

  /* Il corpo è vetro e basta, tutto intero: niente giuntura fra le due foto. */
  const corpo = new THREE.LatheGeometry(puntiVetro, 128);
  const cp = corpo.attributes.position;
  for (let i = 0; i < cp.count; i++) corpo.attributes.uv.setY(i, cp.getY(i) / (f0.basso - z)); /* v = altezza */
  bottiglia.add(new THREE.Mesh(corpo, vetro));

  /* Le etichette sono fogli appoggiati sul vetro, tagliati lungo i bordi misurati: il bordo è quello di un oggetto
     vero e resta netto a qualsiasi ingrandimento, invece di sfumare dentro una foto allargata.
     Ogni foglio prende i colori dalla sua foto, leggendola lungo le curve della prospettiva. */
  const foglio = (foto, verso, p, q) => {
    /* righe del foglio: 48 in fila più quelle dei punti del profilo, così il foglio piega dove piega il vetro
       e il vetro non spunta mai attraverso la carta */
    const kf = (foto.basso - foto.alto) / alt;
    const righe = [...Array.from({ length: 49 }, (_, i) => q[0] + ((q[1] - q[0]) * i) / 48),
      ...prof.map(([, y]) => foto.alto + (y - f0.alto) * kf).filter((R) => R > q[0] && R < q[1])].sort((a, b) => a - b);
    const nR = righe.length - 1, nC = 64, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nR; i++) {
      const R = righe[i], f = (R - q[0]) / (q[1] - q[0]);
      const s0 = q[2].length ? q[2][0] + (q[2][1] - q[2][0]) * f : q[2];
      const s1 = q[3].length ? q[3][0] + (q[3][1] - q[3][0]) * f : q[3];
      const t = (R - foto.alto) / (foto.basso - foto.alto), r = raggio(t);
      const cx = foto.cx[0] + (foto.cx[1] - foto.cx[0]) * t, piega = interpola(foto.curva, R) * r * p.k;
      for (let j = 0; j <= nC; j++) {
        const s = s0 + ((s1 - s0) * j) / nC, cos = Math.sqrt(1 - s * s);
        /* un filo sopra il vetro (0,2%), di spessore nullo come la carta */
        pos.push(verso * r * 1.002 * s, alt * (1 - t), verso * r * 1.002 * cos);
        uv.push((cx + s * r * p.k - p.x0) / p.w, 1 - (R + piega * cos - p.y0) / p.h);
      }
    }
    for (let i = 0; i < nR; i++)
      for (let j = 0; j < nC; j++) {
        const a = i * (nC + 1) + j, b = a + nC + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    /* carta: opaca, prende solo le luci; alphaTest per i buchi (l'incavo dove si vede il vetro) */
    bottiglia.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: p.mappa, alphaTest: 0.5 })));
  };

  const meta = (foto, verso) => {
    const img = new Image();
    img.src = foto.src;
    img.decode().then(() => {
      const p = pulisci(img, foto, raggio, alt);
      p.mappa.anisotropy = renderer.capabilities.getMaxAnisotropy();
      foto.etichette.forEach((q) => foglio(foto, verso, p, q));
      if (verso > 0) {
        colora(telaVetro(img, b, raggio, alt));
        telaCapsula(img, b, raggio, alt).then(capsula);
      }
    });
  };
  meta(b.fronte, 1);
  meta(b.retro, -1); /* la foto del retro è girata: la sua destra è la nostra sinistra */

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
