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
   - fuori da etichette e capsula è vetro: lo ridipinge del colore del vetro, riflessi e bordo grigio compresi
     (i riflessi veri li mette lo studio, e girano giusti);
   - toglie la luce dello scatto da etichette e capsula, misurata sulla foto stessa;
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

  const orig = px.slice();
  for (let y = 0; y < h; y++) {
    const [r, cx] = riga(y);
    const qui = foto.etichette.filter(([a, b]) => y + y0 >= a && y + y0 <= b);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      lx[i + 3] = 255;
      /* fuori dalla sagoma conta come il bordo: così la capsula arriva fino in fondo e il resto è vetro.
         Anche fuori serve il colore giusto: rimpicciolendo la foto la scheda video mescola i pixel vicini */
      const s = r > 0 ? (x + 0.5 - cx) / r : 0;
      const sb = Math.max(-1, Math.min(1, s));
      if (!r || !qui.some(([, , s0, s1]) => sb >= s0 && sb <= s1)) {
        vetro.forEach((c, ch) => (px[i + ch] = c));
        lx[i] = lx[i + 1] = lx[i + 2] = 255;
        continue;
      }
      /* oltre il 93% del raggio la foto vede il bordo di taglio: si ripete l'ultima colonna buona */
      const sv = Math.max(-0.93, Math.min(0.93, s));
      const j = sv === s ? i : (y * w + Math.round(cx + sv * r - 0.5)) * 4;
      const lum = (orig[j] + orig[j + 1] + orig[j + 2]) / 765;
      const sat = (Math.max(orig[j], orig[j + 1], orig[j + 2]) - Math.min(orig[j], orig[j + 1], orig[j + 2])) / 255;
      /* negli angoli delle etichette resta un po' di bordo grigio: neutro e non chiaro, diventa vetro
         (la carta bianca e i colori dell'etichetta restano) */
      const bordo = liscia(Math.abs(sv), 0.8, 0.93) * (1 - liscia(sat, 0.05, 0.1)) * (1 - liscia(lum, 0.3, 0.4));
      const luce = luceScatto(sv);
      let l = 0;
      for (let ch = 0; ch < 3; ch++) {
        const a = LIN[orig[j + ch]];
        const pulito = Math.min(1, (a + (v[ch] - a) * bordo) / luce);
        px[i + ch] = srgb(pulito);
        l += pulito / 3;
      }
      lx[i] = lx[i + 1] = lx[i + 2] = 255 * (1 - liscia(l, 0.02, 0.15));
    }
  }
  g.putImageData(dati, 0, 0);
  const cl = tela();
  cl.getContext("2d").putImageData(lucido, 0, 0);

  const mappa = new THREE.CanvasTexture(c);
  mappa.colorSpace = THREE.SRGBColorSpace;
  /* colore della capsula, per il disco in cima */
  const yc = Math.round(foto.alto + 0.05 * (foto.basso - foto.alto) - y0);
  const ic = (yc * w + Math.round(foto.cx[0] - x0)) * 4;
  const capsula = new THREE.Color().setRGB(px[ic] / 255, px[ic + 1] / 255, px[ic + 2] / 255, THREE.SRGBColorSpace);
  return { mappa, lucido: new THREE.CanvasTexture(cl), capsula, x0, y0, w, h, k };
}

/* b.profilo: [mezza larghezza, riga] in pixel della foto di fronte, dal tappo al fondo.
   b.fronte / b.retro: { src, alto, basso, cx: [centro in alto, centro in basso], etichette } in pixel della propria foto;
   etichette: [riga da, riga a, s da, s a] per etichette e capsula, con s da -1 (bordo sinistro) a 1 (bordo destro).
   b.vetro: colore del vetro [r, g, b] 0–255, letto sulla foto. */
export function monta(el, b) {
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
  /* dal fondo verso l'alto, altrimenti le normali guardano dentro */
  const punti = prof
    .slice()
    .reverse()
    .map(([r, riga]) => new THREE.Vector2(r, f0.basso - riga));

  /* la bottiglia gira attorno al perno; ombra e bottiglia girano insieme */
  const perno = new THREE.Group();
  perno.position.y = CENTRO;
  scene.add(perno);
  const bottiglia = new THREE.Group();
  bottiglia.scale.setScalar(1 / alt);
  bottiglia.position.y = -CENTRO;
  perno.add(bottiglia);

  const vetro = new THREE.MeshPhysicalMaterial({
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

  const meta = (foto, phi, verso) => {
    const geo = new THREE.LatheGeometry(punti, 96, phi, Math.PI);
    const img = new Image();
    img.src = foto.src;
    img.decode().then(() => {
      const p = pulisci(img, foto, raggio, alt, b.vetro);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        /* 8 px di margine: l'orlo in cima e il fondo non devono pescare lo sfondo */
        const t = Math.min(Math.max(1 - pos.getY(i) / alt, 8 / alt), 1 - 8 / alt);
        const cx = foto.cx[0] + (foto.cx[1] - foto.cx[0]) * t;
        uv.setXY(
          i,
          (cx + verso * pos.getX(i) * p.k * 0.995 - p.x0) / p.w,
          1 - (foto.alto + t * (foto.basso - foto.alto) - p.y0) / p.h
        );
      }
      uv.needsUpdate = true;
      /* la foto prende solo le luci; sopra, un velo che aggiunge i riflessi dello studio dove c'è vetro */
      bottiglia.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: p.mappa })));
      bottiglia.add(
        new THREE.Mesh(
          geo,
          new THREE.MeshPhysicalMaterial({
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
      if (verso > 0) {
        const tappo = new THREE.Mesh(
          new THREE.CircleGeometry(prof[0][0], 48),
          new THREE.MeshLambertMaterial({ color: p.capsula }) /* luce come il resto della capsula */
        );
        tappo.rotation.x = -Math.PI / 2;
        tappo.position.y = alt;
        bottiglia.add(tappo);
      }
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
