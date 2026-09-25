/* Wild Italy · il barattolo della salsa tartufata che gira dentro la sua foto (misure e immagini da barattolo.py).
   Tappo, collo, fondo e riflessi sono uguali tutto intorno: girando restano quelli della foto, che fa da sfondo.
   Qui c'è solo quello che gira: la salsa dentro il vetro, le etichette sopra e il lucido del vetro, messi con la
   stessa fotocamera della foto proprio sopra il corpo del barattolo fotografato. */
import * as THREE from "three";

export function monta(el, m, sfondo) {
  const s = m.scena;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); /* trasparente: sotto c'è la foto */
  el.append(renderer.domElement);
  const carica = (src, poi) =>
    Object.assign(new THREE.TextureLoader().load(src, poi), {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy: renderer.capabilities.getMaxAnisotropy()
    });

  /* la fotocamera della foto: in piano, focale f, centro ottico (cx, cy); la foto è un pezzo della vista intera */
  const W = 2 * Math.max(s.cx, s.w - s.cx), H = 2 * Math.max(s.cy, s.h - s.cy);
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / s.f)), W / H, 0.1, 100);
  camera.setViewOffset(W, H, W / 2 - s.cx, H / 2 - s.cy, s.w, s.h);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.6));
  const sole = new THREE.DirectionalLight(0xffffff, 1.4);
  sole.position.set(-1, 1.2, 2);
  scene.add(sole);

  /* il barattolo ha raggio 1: sta a distanza f / r perché nella foto sia largo r pixel */
  const Z = s.f / s.r;
  const barattolo = new THREE.Group();
  barattolo.position.set(((s.x - s.cx) / s.f) * Z, (-(s.y0 - s.cy) / s.f) * Z, -Z);
  scene.add(barattolo);
  /* un cilindro aperto dall'altezza su a giu, u = 0,5 davanti */
  const giro = (r, su, giu, segmenti) =>
    new THREE.CylinderGeometry(r, r, su - giu, segmenti, 1, true, -Math.PI, 2 * Math.PI).translate(0, (su + giu) / 2, 0);

  /* salsa: poco dentro il vetro, la stessa fascia ripetuta tutto intorno; appena più scura, perché le luci la
     schiariscono e nella foto è già illuminata */
  const [giu, su] = m.corpo;
  const salsa = carica("salsa.jpg");
  salsa.wrapS = THREE.RepeatWrapping;
  salsa.repeat.set(360 / m.salsa.gradi, 1);
  salsa.offset.x = 0.3; /* la giuntura non davanti */
  barattolo.add(new THREE.Mesh(giro(0.93, su, giu, 128), new THREE.MeshLambertMaterial({ map: salsa, color: 0xd6d6d6 })));

  /* etichette: un foglio unico appena sopra il vetro; dove non c'è etichetta è trasparente */
  const [eSu, eGiu] = m.etichetta;
  barattolo.add(
    new THREE.Mesh(giro(1.003, eSu, eGiu, 256), new THREE.MeshLambertMaterial({ map: carica("etichette.png"), alphaTest: 0.5 }))
  );

  /* il lucido del vetro: riflette la scena stessa, solo dove non c'è etichetta (le etichette gli stanno davanti) */
  const ambiente = carica(sfondo);
  ambiente.mapping = THREE.EquirectangularReflectionMapping;
  barattolo.add(
    new THREE.Mesh(
      giro(1, su, giu, 128),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.1,
        envMapIntensity: 1,
        envMap: ambiente,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  );

  /* si gira solo attorno all'asse, col dito o col mouse in orizzontale; in verticale la pagina scorre */
  renderer.domElement.style.touchAction = "pan-y";
  let giri = 0, spinta = 0, x0 = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    x0 = e.clientX;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    spinta = ((e.clientX - x0) / el.clientWidth) * 4;
    giri += spinta;
    x0 = e.clientX;
  });
  const lascia = () => (x0 = null);
  renderer.domElement.addEventListener("pointerup", lascia);
  renderer.domElement.addEventListener("pointercancel", lascia);

  new ResizeObserver(() => renderer.setSize(el.clientWidth, el.clientHeight)).observe(el);
  renderer.setAnimationLoop(() => {
    if (!el.offsetWidth) return;
    if (x0 === null) giri += spinta *= 0.92; /* lasciato, rallenta piano */
    barattolo.rotation.y = giri;
    renderer.render(scene, camera);
  });
}
