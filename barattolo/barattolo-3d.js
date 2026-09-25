/* Wild Italy · barattolo 3D da tre foto (misure e immagine da barattolo.py, in modello.json).
   Vetro: solido di rotazione misurato sulla foto di fronte, vestito col giro (etichette e salsa cucite dalle tre foto),
   più uno strato lucido che riflette lo studio. Tappo: metallo dorato, col disco nero stampato sopra.
   Come per la bottiglia, le luci restano ferme ed è il barattolo a girare. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MEZZO = Math.tan(THREE.MathUtils.degToRad(14)); /* metà dell'angolo di vista verticale (28°) */

/* studio per i riflessi: fondo caldo e scuro (l'oro non diventa nero), due pannelli alti ai lati e uno sopra */
function studio(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x3a2e22);
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

export function monta(el, m) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color(getComputedStyle(el).backgroundColor), 1);
  el.append(renderer.domElement);
  const envMap = studio(renderer);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.55));
  const chiave = new THREE.DirectionalLight(0xffffff, 1.8);
  chiave.position.set(-0.6, 1, 2.5);
  scene.add(chiave);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  /* in pixel della foto di fronte, y in su (y = -riga); il barattolo è alto 1 e il perno sta a metà */
  const { profilo, righe: [su, giu], tappo: t } = m;
  const cima = su - t.alto, alt = giu - cima;
  const perno = new THREE.Group();
  scene.add(perno);
  const barattolo = new THREE.Group();
  barattolo.scale.setScalar(1 / alt);
  barattolo.position.y = (cima + giu) / 2 / alt;
  perno.add(barattolo);

  /* vetro: punti dal fondo verso l'alto (se no le normali guardano dentro); u = 0,5 davanti, v = altezza sul giro */
  const vetro = new THREE.LatheGeometry(
    profilo.map(([riga, r]) => new THREE.Vector2(r, -riga)).reverse(),
    128,
    -Math.PI,
    2 * Math.PI
  );
  const pos = vetro.attributes.position, uv = vetro.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (giu + pos.getY(i)) / (giu - su));
  const giro = Object.assign(new THREE.TextureLoader().load(m.giro), {
    colorSpace: THREE.SRGBColorSpace,
    anisotropy: renderer.capabilities.getMaxAnisotropy()
  });
  barattolo.add(new THREE.Mesh(vetro, new THREE.MeshLambertMaterial({ map: giro })));
  barattolo.add(
    new THREE.Mesh(
      vetro,
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.08,
        envMap,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  );
  /* il fondo: vetro spesso con la salsa sopra */
  const [righaFondo, rFondo] = profilo.at(-1);
  const fondo = new THREE.Mesh(new THREE.CircleGeometry(rFondo, 64), new THREE.MeshLambertMaterial({ color: 0x2a1c10 }));
  fondo.rotation.x = Math.PI / 2;
  fondo.position.y = -righaFondo;
  barattolo.add(fondo);

  /* tappo: fascia dorata col bordo di sopra arrotondato, piano dorato sopra e il disco nero stampato */
  const oro = new THREE.MeshStandardMaterial({ color: 0xe0b45c, metalness: 1, roughness: 0.3, envMap });
  const R = t.raggio, smusso = 0.05 * R;
  const bordo = [[R, -su], [R, -cima - smusso]];
  for (let k = 1; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    bordo.push([R - smusso + smusso * Math.cos(a), -cima - smusso + smusso * Math.sin(a)]);
  }
  barattolo.add(new THREE.Mesh(new THREE.LatheGeometry(bordo.map(([r, y]) => new THREE.Vector2(r, y)), 128), oro));
  const disco = (r, y, mat) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 96), mat);
    d.rotation.x = -Math.PI / 2;
    d.position.y = y;
    barattolo.add(d);
  };
  disco(R - smusso, -cima, oro);
  disco(t.disco * R, -cima + 0.5, new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.35, envMap }));

  /* ombra morbida a terra, gira col barattolo */
  const c = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(20,16,12,.45)");
  grad.addColorStop(1, "rgba(20,16,12,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const ombra = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  ombra.rotation.x = -Math.PI / 2;
  ombra.position.y = 0.001 - 0.5;
  ombra.renderOrder = -1;
  perno.add(ombra);

  /* OrbitControls muove una camera immaginaria; il barattolo fa il movimento opposto e la camera vera sta ferma.
     Si parte di fronte, appena dall'alto come nelle foto; la distanza è relativa a quella che fa stare tutto nel riquadro */
  const occhio = new THREE.PerspectiveCamera();
  occhio.position.setFromSphericalCoords(1, 1.35, 0);
  const controls = new OrbitControls(occhio, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.35;
  controls.maxDistance = 1.6;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI - 0.03;

  let fit = 2;
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* alto 1,45 e largo 1,1 col margine (il barattolo è alto 1 e largo 0,7) */
    fit = Math.max(0.72 / MEZZO, 0.55 / (MEZZO * camera.aspect));
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
