/* Wild Italy · salame 3D da una foto di lato (misure e immagini da salame.py, in modello.json).
   Sagoma: solido di rotazione attorno all'asse del salame, misurato colonna per colonna sulla foto.
   Buccia: la fascia di fronte della foto, srotolata e senza la luce dello scatto, ripetuta a specchio tutto intorno.
   Cartellino: raddrizzato dalla foto, appeso davanti alla punta destra col suo spago.
   Come per la bottiglia, le luci restano ferme ed è il salame a girare. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MEZZO = Math.tan(THREE.MathUtils.degToRad(14)); /* metà dell'angolo di vista verticale (28°) */

/* corpo: un anello di punti per ogni punto del profilo [x, centro, raggio], in pixel della foto (y in su).
   Angolo 0 davanti, 90° sopra; la buccia copre ±teta e oltre si ripete a specchio (v fuori da 0..1) */
function corpo({ profilo, buccia: b }) {
  const N = 96, pos = [], uv = [], idx = [];
  for (const [x, yc, r] of profilo)
    for (let j = 0; j <= N; j++) {
      const t = -Math.PI + (2 * Math.PI * j) / N;
      pos.push(x, -yc + r * Math.sin(t), r * Math.cos(t));
      uv.push((x - b.x0) / (b.x1 - b.x0), (THREE.MathUtils.radToDeg(t) + b.teta) / (2 * b.teta));
    }
  for (let i = 0; i < profilo.length - 1; i++)
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, c = a + N + 1;
      idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /* dietro, dove l'anello si chiude, i due punti doppi prendono la stessa normale; sulle punte guarda fuori dritta */
  const n = geo.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < profilo.length; i++) {
    const a = i * (N + 1);
    v.fromBufferAttribute(n, a).add(w.fromBufferAttribute(n, a + N)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(a + N, v.x, v.y, v.z);
    if (i === 0 || i === profilo.length - 1) for (let j = 0; j <= N; j++) n.setXYZ(a + j, i ? 1 : -1, 0, 0);
  }
  return geo;
}

export function monta(el, m) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color(getComputedStyle(el).backgroundColor), 1);
  el.append(renderer.domElement);
  const carica = (src, poi) =>
    Object.assign(new THREE.TextureLoader().load(src, poi), {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy: renderer.capabilities.getMaxAnisotropy()
    });

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const chiave = new THREE.DirectionalLight(0xffffff, 1.8);
  chiave.position.set(-0.6, 1, 2.5);
  scene.add(chiave);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  /* in pixel della foto, y in su; il perno è al centro del salame, e il salame è lungo 1 */
  const { profilo, buccia: b, cartellino: c } = m;
  const L = b.x1 - b.x0, centro = profilo[profilo.length >> 1][1];
  const perno = new THREE.Group();
  scene.add(perno);
  const salame = new THREE.Group();
  salame.scale.setScalar(1 / L);
  salame.position.set(-(b.x0 + b.x1) / 2 / L, centro / L, 0);
  perno.add(salame);

  const pelle = carica(b.src);
  pelle.wrapT = THREE.MirroredRepeatWrapping;
  /* budello un po' lucido; le macchie della buccia fanno anche da rilievo */
  salame.add(new THREE.Mesh(corpo(m), new THREE.MeshStandardMaterial({ map: pelle, bumpMap: pelle, bumpScale: 2, roughness: 0.55 })));

  /* cartellino: il bordo di sopra del foglio in (x, y) della foto, davanti alla punta, appena inclinato in avanti;
     la linguetta ripiegata sporge sopra. Dietro è plastica bianca, con la stessa sagoma */
  const alto = c.alto * (1 + c.linguetta);
  const foglio = new THREE.PlaneGeometry(c.largo, alto).translate(0, alto / 2 - c.alto, 0);
  const cartellino = new THREE.Group();
  const zCart = interpolaRaggio(profilo, c.x) + 10;
  cartellino.position.set(c.x, -c.y, zCart);
  cartellino.rotation.x = -0.12;
  const stampa = carica(c.src, (t) => {
    const tela = Object.assign(document.createElement("canvas"), { width: t.image.width, height: t.image.height });
    const g = tela.getContext("2d");
    g.drawImage(t.image, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#ecebe6";
    g.fillRect(0, 0, tela.width, tela.height);
    retro.map = Object.assign(new THREE.CanvasTexture(tela), { colorSpace: THREE.SRGBColorSpace });
    retro.visible = true;
  });
  const retro = new THREE.MeshStandardMaterial({ alphaTest: 0.5, roughness: 0.4, side: THREE.BackSide, visible: false });
  cartellino.add(new THREE.Mesh(foglio, new THREE.MeshStandardMaterial({ map: stampa, alphaTest: 0.5, roughness: 0.4 })));
  cartellino.add(new THREE.Mesh(foglio, retro));
  salame.add(cartellino);

  /* spago: dalla linguetta gira attorno alla punta legata e torna giù */
  const xp = b.x1, yp = centro;
  const spago = new THREE.CatmullRomCurve3(
    [
      [c.x - 30, c.y - 8, zCart], [c.x - 40, c.y - 50, zCart - 20], [c.x, yp - 125, 90], [xp - 25, yp - 100, 45],
      [xp + 4, yp - 40, 0], [xp - 10, yp - 60, -50], [xp - 45, yp - 95, -40], [c.x + 20, c.y - 20, zCart - 25],
      [c.x + 25, c.y - 8, zCart]
    ].map(([x, y, z]) => new THREE.Vector3(x, -y, z))
  );
  salame.add(new THREE.Mesh(new THREE.TubeGeometry(spago, 80, 4, 6), new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 1 })));

  /* OrbitControls muove una camera immaginaria; il salame fa il movimento opposto e la camera vera sta ferma.
     Si parte un po' dall'alto e di tre quarti; la distanza è relativa a quella che fa stare tutto nel riquadro */
  const occhio = new THREE.PerspectiveCamera();
  occhio.position.setFromSphericalCoords(1, 1.3, -0.45);
  const controls = new OrbitControls(occhio, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.3;
  controls.maxDistance = 1.6;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI - 0.03;

  let fit = 2;
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* largo 1,2 (il salame di tre quarti, con margine), alto 0,7 (col cartellino appeso) */
    fit = Math.max(0.6 / (MEZZO * camera.aspect), 0.35 / MEZZO);
  }).observe(el);

  renderer.setAnimationLoop(() => {
    if (!el.offsetWidth) return;
    controls.update();
    perno.quaternion.copy(occhio.quaternion).invert();
    camera.position.set(0, -0.08, occhio.position.length() * fit);
    renderer.render(scene, camera);
  });
  return controls;
}

/* raggio del salame all'altezza x della foto */
function interpolaRaggio(profilo, x) {
  const j = Math.max(1, profilo.findIndex((p) => p[0] >= x));
  const [x0, , r0] = profilo[j - 1], [x1, , r1] = profilo[j];
  return r0 + ((r1 - r0) * (x - x0)) / (x1 - x0 || 1);
}
