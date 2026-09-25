/* Wild Italy · il barattolo della salsa tartufata, tutto intero (misure e immagini da barattolo.py, in modello.json).
   Gira tutto: tappo, collo, vetro, salsa. Niente foto dietro, niente pezzi fermi.
   Il vetro è un solido di rotazione; dentro c'è la salsa, un solido anche lei, con la sua superficie in cima: si
   vede attraverso la spalla quando si guarda un po' dall'alto. La grana della salsa fa anche da rilievo, così
   girando i pezzi di tartufo prendono luce e ombra invece di restare disegnati.
   Le luci stanno ferme ed è il barattolo a girare, come per le bottiglie dei vini. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MEZZO = Math.tan(THREE.MathUtils.degToRad(14)); /* metà dell'angolo di vista verticale (28°) */

/* il fondo: neutro e caldo, appena più chiaro dietro il barattolo */
function sfumatura() {
  const c = Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 108, 10, 128, 108, 190);
  grad.addColorStop(0, "#3d3125");
  grad.addColorStop(0.55, "#251d15");
  grad.addColorStop(1, "#15100c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return c;
}

/* lo studio per i riflessi: fondo caldo e scuro (l'oro non diventa nero), due pannelli alti ai lati e uno sopra */
function studio(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x2a211a);
  const pannello = (w, h, x, y, z, forza) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(forza), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  pannello(1.6, 9, -4, 0, 1.6, 12);
  pannello(1.6, 9, 4, 0, 1.6, 8);
  pannello(7, 2, 0, 5, 0, 5);
  return new THREE.PMREMGenerator(renderer).fromScene(s, 0.02).texture;
}

export function monta(el, m) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.append(renderer.domElement);
  const envMap = studio(renderer);
  const carica = (src, ripeti) =>
    Object.assign(new THREE.TextureLoader().load(src), {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
      wrapS: ripeti ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping,
      wrapT: ripeti ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping
    });

  const scene = new THREE.Scene();
  /* il fondo sta dentro il 3D, non nella pagina: il vetro ci aggiunge sopra i suoi riflessi e resta trasparente
     (se il fondo stesse dietro al canvas, il collo vuoto diventerebbe nero). Al posto di questo va la foto, quando c'è. */
  scene.background = new THREE.CanvasTexture(sfumatura());
  scene.background.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const chiave = new THREE.DirectionalLight(0xfff2dd, 1.5);
  chiave.position.set(-0.7, 1.1, 2.2);
  scene.add(chiave);
  const spalla = new THREE.DirectionalLight(0xffe9c8, 0.45); /* una seconda luce da destra: il vetro si stacca dal fondo */
  spalla.position.set(2.2, 0.6, -1.4);
  scene.add(spalla);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  /* il barattolo sta in piedi sul suo piede, e tutto insieme entra nel riquadro: alto ALTO, il perno a metà */
  const t = m.tappo;
  const PIEDE = m.vetro.at(-1)[0], ALTO = t.su - PIEDE;
  const perno = new THREE.Group();
  scene.add(perno);
  const barattolo = new THREE.Group();
  barattolo.scale.setScalar(1 / ALTO);
  barattolo.position.y = -((t.su + PIEDE) / 2) / ALTO;
  perno.add(barattolo);

  /* un solido di rotazione dal profilo [altezza, raggio]: i punti vanno dal basso in alto, se no le normali
     guardano dentro. u = 0,5 davanti */
  const tornio = (punti, segmenti = 128) =>
    new THREE.LatheGeometry(
      punti.map(([h, r]) => new THREE.Vector2(r, h)).reverse(),
      segmenti,
      -Math.PI,
      2 * Math.PI
    );

  /* --- la salsa: il pezzo di salsa vera si ripete a specchio, in giro e in altezza; la stessa immagine fa da
     rilievo, così i pezzi di tartufo si accendono e si spengono mentre il barattolo gira --- */
  const grana = carica("salsa.jpg", true);
  grana.repeat.set(m.salsa.giri, 1 / m.salsa.alto);
  grana.offset.x = 0; /* la giunzione fra le due foto cade ai fianchi; davanti e dietro c'è solo lo specchio */
  const salsa = tornio(m.dentro, 160);
  const pos = salsa.attributes.position, uv = salsa.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i)); /* v = altezza vera: la grana non si stira */
  const pelle = new THREE.MeshStandardMaterial({
    map: grana,
    bumpMap: grana,
    bumpScale: 0.02,
    roughness: 0.55,
    metalness: 0,
    envMap,
    envMapIntensity: 0.15
  });
  barattolo.add(new THREE.Mesh(salsa, pelle));
  /* la superficie della salsa, appena incavata: si vede dalla spalla quando si guarda dall'alto. Sta
     all'ombra del tappo, quindi più scura di quella di lato. */
  const [livello, rSalsa] = m.dentro[0];
  const pelleCima = carica("salsa.jpg", true);
  pelleCima.repeat.set(2 * rSalsa / m.salsa.largo, 2 * rSalsa / m.salsa.alto); /* grana quadrata, se no sembra legno */
  pelleCima.center.set(0.5, 0.5);
  pelleCima.rotation = 0.7;
  const faccia = new THREE.CircleGeometry(rSalsa, 96);
  const fp = faccia.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const d = Math.hypot(fp.getX(i), fp.getY(i)) / rSalsa;
    fp.setZ(i, -0.035 * (1 - d * d)); /* l'olio in mezzo sta un filo più giù */
  }
  faccia.computeVertexNormals();
  const cima = new THREE.Mesh(
    faccia,
    new THREE.MeshStandardMaterial({ map: pelleCima, bumpMap: pelleCima, bumpScale: 0.01, color: 0x8c8c8c, roughness: 0.5, envMap, envMapIntensity: 0.2 })
  );
  cima.rotation.x = -Math.PI / 2;
  cima.position.y = livello;
  barattolo.add(cima);

  /* --- le etichette: un foglio appena sopra il vetro, dove non c'è etichetta è trasparente --- */
  const [eSu, eGiu] = m.etichetta;
  const foglio = new THREE.CylinderGeometry(1.004, 1.004, eSu - eGiu, 256, 1, true, -Math.PI, 2 * Math.PI)
    .translate(0, (eSu + eGiu) / 2, 0);
  barattolo.add(
    new THREE.Mesh(foglio, new THREE.MeshLambertMaterial({ map: carica("etichette.png"), alphaTest: 0.5 }))
  );

  /* --- il vetro: solo il lucido. Due volte, prima la parete di là e poi quella di qua: nel collo vuoto si vedono
     tutti e due i lati, e il vetro non sembra una pellicola --- */
  const vetro = tornio(m.vetro, 160);
  const lucido = (lato) =>
    new THREE.Mesh(
      vetro,
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.06,
        envMap,
        envMapIntensity: lato === THREE.BackSide ? 0.55 : 1,
        side: lato,
        transparent: true,
        opacity: lato === THREE.BackSide ? 0.28 : 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  const dietro = lucido(THREE.BackSide), davanti = lucido(THREE.FrontSide);
  dietro.renderOrder = 1;
  davanti.renderOrder = 3;
  barattolo.add(dietro, davanti);

  /* --- il tappo: oro, con la striscia presa dalla foto (dall'alto in basso) e il bordo di sopra arrotondato --- */
  const oro = new THREE.MeshStandardMaterial({
    map: carica("tappo.png"),
    metalness: 0.92,
    roughness: 0.26,
    envMap
  });
  const sagoma = [[t.su, 0]];
  for (let k = 8; k >= 1; k--) {
    const a = (k / 8) * (Math.PI / 2);
    sagoma.push([t.su - t.smusso + t.smusso * Math.sin(a), t.r - t.smusso + t.smusso * Math.cos(a)]);
  }
  sagoma.push([t.su - t.smusso, t.r], [t.giu, t.r]);
  const tappo = tornio(sagoma, 160);
  const tp = tappo.attributes.position, tu = tappo.attributes.uv;
  for (let i = 0; i < tp.count; i++) tu.setY(i, (tp.getY(i) - t.giu) / (t.su - t.giu));
  barattolo.add(new THREE.Mesh(tappo, oro));

  /* --- l'ombra a terra, morbida: tiene il barattolo appoggiato invece che appeso --- */
  const c = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(10,7,4,.5)");
  grad.addColorStop(0.55, "rgba(10,7,4,.2)");
  grad.addColorStop(1, "rgba(10,7,4,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const ombra = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  ombra.rotation.x = -Math.PI / 2;
  ombra.position.y = (PIEDE - 0.005) / ALTO;
  ombra.renderOrder = -1;
  perno.add(ombra);

  /* OrbitControls muove una fotocamera immaginaria; il barattolo fa il movimento opposto e la fotocamera vera resta
     ferma, così le luci non girano con lui. Si parte di fronte, appena dall'alto come nelle foto. */
  const occhio = new THREE.PerspectiveCamera();
  occhio.position.setFromSphericalCoords(1, 1.33, 0);
  const controls = new OrbitControls(occhio, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 1.7;
  controls.minPolarAngle = 0.25; /* non proprio a piombo da sopra e da sotto: lì il barattolo non si capisce più */
  controls.maxPolarAngle = Math.PI - 0.35;

  let fit = 2;
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* il barattolo è alto 1 e largo 2/ALTO: ci sta dentro con un po' di margine */
    fit = Math.max(0.62 / MEZZO, (1.35 / ALTO) / (MEZZO * camera.aspect));
  }).observe(el);

  renderer.setAnimationLoop(() => {
    if (!el.offsetWidth) return;
    controls.update();
    perno.quaternion.copy(occhio.quaternion).invert();
    camera.position.set(0, 0, occhio.position.length() * fit);
    renderer.render(scene, camera);
  });
  return controls;
}
