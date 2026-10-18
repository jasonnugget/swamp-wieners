import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Template } from "./types";
import type { VisualState } from "./visualization-state";

function noiseTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = 155 + ((i * 137 + (i % 67) * 71) % 65);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = n; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(16, 16); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildSiteKit(scene: THREE.Scene) {
  const texture = noiseTexture();
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ color: "#d6d7c9", roughness: 0.82, map: texture }),
    roof: new THREE.MeshStandardMaterial({ color: "#6a7b77", roughness: 0.45, metalness: 0.32 }),
    metal: new THREE.MeshStandardMaterial({ color: "#aebfba", roughness: 0.3, metalness: 0.65 }),
    dark: new THREE.MeshStandardMaterial({ color: "#354e4d", roughness: 0.5, metalness: 0.35 }),
    insulator: new THREE.MeshStandardMaterial({ color: "#698f89", roughness: 0.28, metalness: 0.1 }),
    road: new THREE.MeshStandardMaterial({ color: "#69716c", roughness: 0.95, map: texture }),
    soil: new THREE.MeshStandardMaterial({ color: "#a59576", roughness: 1, map: texture }),
    root: new THREE.MeshStandardMaterial({ color: "#887053", roughness: 1, map: texture }),
    grass: new THREE.MeshStandardMaterial({ color: "#81916a", roughness: 1, map: texture }),
    gravel: new THREE.MeshStandardMaterial({ color: "#b5b7a3", roughness: 1, map: texture }),
    yellow: new THREE.MeshStandardMaterial({ color: "#d0ad65", roughness: 0.65 }),
    panel: new THREE.MeshStandardMaterial({ color: "#315c72", metalness: 0.55, roughness: 0.27 }),
  };
  const root = new THREE.Group(); scene.add(root);
  function box(parent: THREE.Object3D, size: number[], pos: number[], material: THREE.Material, bevel = 0.06) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(bevel, Math.min(...size) / 3)), material);
    mesh.position.set(pos[0], pos[1], pos[2]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(parent: THREE.Object3D, r: number, h: number, pos: number[], material: THREE.Material, top = r) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, r, h, 12), material);
    mesh.position.set(pos[0], pos[1], pos[2]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function pipe(parent: THREE.Object3D, points: number[][], radius = 0.12) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius, 6, false), materials.metal); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function tile(y: number, depth: number, material: THREE.Material) {
    const s = new THREE.Shape(); s.moveTo(-25, -22); s.lineTo(23, -22); s.quadraticCurveTo(28, -22, 28, -17); s.lineTo(28, 17); s.quadraticCurveTo(28, 22, 23, 22); s.lineTo(-23, 22); s.quadraticCurveTo(-28, 22, -28, 17); s.lineTo(-28, -17); s.quadraticCurveTo(-28, -22, -25, -22);
    const geometry = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }); geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.receiveShadow = true; mesh.castShadow = true; root.add(mesh); return mesh;
  }
  tile(-3.4, 1.1, materials.root); tile(-2.3, 2.25, materials.soil); tile(-0.08, 0.08, materials.grass);
  // Thin exposed bands make the surface/root layers legible in the cutaway view.
  const rootBand = box(root, [43, 0.5, 0.1], [-3, -2.5, 21.9], materials.root);
  const surfaceBand = box(root, [43, 0.55, 0.1], [-3, -0.65, 21.9], materials.soil);
  box(root, [35, 0.12, 28], [-4, 0, -2], materials.gravel);
  box(root, [43, 0.13, 3.3], [-3, 0.04, 13.5], materials.road);
  box(root, [3.4, 0.13, 25], [-19.7, 0.04, -0.5], materials.road);
  for (let i = 0; i < 13; i++) box(root, [1.1, 0.018, 0.08], [-22 + i * 3, 0.12, 13.5], materials.yellow, 0);
  // Drainage grates alongside the access road.
  for (let i = 0; i < 10; i++) box(root, [0.08, 0.06, 0.65], [-9 + i * 0.25, 0.11, 11.3], materials.dark, 0);
  const fence = new THREE.Group(); root.add(fence);
  const postGeo = new THREE.CylinderGeometry(0.055, 0.055, 2.1, 5);
  const posts = new THREE.InstancedMesh(postGeo, materials.metal, 76);
  const matrix = new THREE.Matrix4(); let count = 0;
  for (let i = 0; i < 23; i++) for (const z of [-17, 10]) { matrix.makeTranslation(-17.5 + i * 1.5, 1.05, z); posts.setMatrixAt(count++, matrix); }
  for (let i = 1; i < 16; i++) for (const x of [-17.5, 15.5]) { matrix.makeTranslation(x, 1.05, -17 + i * 1.65); posts.setMatrixAt(count++, matrix); }
  fence.add(posts);
  const fencePoints: THREE.Vector3[] = [];
  for (const y of [0.4, 1.1, 1.9]) for (const z of [-17, 10]) fencePoints.push(new THREE.Vector3(-17.5, y, z), new THREE.Vector3(15.5, y, z));
  for (const y of [0.4, 1.1, 1.9]) for (const x of [-17.5, 15.5]) fencePoints.push(new THREE.Vector3(x, y, -17), new THREE.Vector3(x, y, 10));
  fence.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fencePoints), new THREE.LineBasicMaterial({ color: "#8faba0", transparent: true, opacity: 0.7 })));
  const templates = { campus: new THREE.Group(), solar: new THREE.Group(), substation: new THREE.Group() };
  Object.values(templates).forEach(g => root.add(g));
  function transformer(parent: THREE.Object3D, x: number, z: number, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, 0.1, z); g.scale.setScalar(scale); parent.add(g);
    box(g, [3.2, 0.22, 2.4], [0, 0.11, 0], materials.concrete);
    box(g, [2, 1.9, 1.5], [0, 1.2, 0], materials.roof);
    for (let i = 0; i < 7; i++) for (const x of [-1.15, 1.15]) box(g, [0.4, 1.4, 0.08], [x, 1.25, -0.6 + i * 0.2], materials.metal, 0.02);
    for (const x of [-0.65, 0, 0.65]) { cylinder(g, 0.12, 0.7, [x, 2.5, 0], materials.insulator); for (let n = 0; n < 4; n++) cylinder(g, 0.22, 0.05, [x, 2.25 + n * 0.16, 0], materials.insulator); }
  }
  for (const parent of Object.values(templates)) for (let i = 0; i < 3; i++) transformer(parent, -9 + i * 6.2, 6, 0.9);
  // Illustrative industrial campus. The roof's seams, ducts and pipework provide scale.
  const campus = templates.campus;
  box(campus, [15, 5, 9], [-6, 2.6, -5], materials.concrete, 0.15);
  box(campus, [15.5, 0.38, 9.5], [-6, 5.25, -5], materials.roof);
  for (let i = 0; i < 15; i++) box(campus, [0.04, 0.06, 9.4], [-13 + i, 5.48, -5], materials.metal, 0);
  for (let i = 0; i < 5; i++) { box(campus, [1.8, 1.15, 1.45], [-11 + i * 2.6, 5.95, -5], materials.dark); cylinder(campus, 0.5, 0.12, [-11 + i * 2.6, 6.57, -5], materials.metal); }
  for (let i = 0; i < 8; i++) box(campus, [1.2, 1.1, 0.05], [-12 + i * 1.8, 3.7, -0.46], materials.dark, 0.02);
  box(campus, [2.8, 2.8, 0.12], [-5, 1.5, -0.4], materials.roof);
  for (let i = 0; i < 3; i++) {
    const x = 5 + i * 3.4;
    cylinder(campus, 1.3, 4.1, [x, 2.2, -8], materials.metal);
    cylinder(campus, 1.34, 0.2, [x, 4.3, -8], materials.roof);
    pipe(campus, [[x, 2.7, -6.8], [x, 2.7, -3], [0.8, 2.7, -3]], 0.13);
    cylinder(campus, 0.42, 5.8, [x, 3.1, -13], materials.concrete);
    cylinder(campus, 0.46, 0.5, [x, 6.1, -13], materials.yellow);
  }
  box(campus, [3.8, 2.6, 3], [10, 1.4, 1], materials.concrete);
  // Solar array rows with visible cell divisions and angled supports.
  const solar = templates.solar;
  for (let row = 0; row < 4; row++) for (let column = 0; column < 6; column++) {
    const g = new THREE.Group(); g.position.set(-13 + column * 4.6, 1.55, -13 + row * 4.1); solar.add(g);
    cylinder(g, 0.08, 1.5, [0, -0.7, 0], materials.metal);
    const panel = box(g, [4.2, 0.12, 2.7], [0, 0, 0], materials.panel, 0.02); panel.rotation.x = -0.28;
    for (let i = 0; i < 6; i++) { const seam = box(g, [0.018, 0.015, 2.7], [-1.75 + i * 0.7, 0.08, 0], materials.metal, 0); seam.rotation.x = -0.28; }
  }
  // Substation gantries, bus bars and insulated switches.
  const substation = templates.substation;
  for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
    const x = -12 + column * 7.2, z = -12 + row * 5.3;
    for (const dx of [-1.2, 1.2]) { box(substation, [0.13, 5, 0.13], [x + dx, 2.5, z], materials.metal); cylinder(substation, 0.25, 1.5, [x + dx, 3.2, z + 1.2], materials.insulator); }
    box(substation, [3.6, 0.18, 0.18], [x, 5, z], materials.metal);
    pipe(substation, [[x - 1.2, 4.2, z], [x - 1.2, 4.2, z + 4], [x + 1.2, 4.2, z + 4]], 0.07);
  }
  // Roadside field equipment, low bollards, and a parked illustrative crew vehicle.
  for (let i = 0; i < 4; i++) cylinder(root, 0.1, 0.9, [-15 + i * 1.2, 0.5, 11.3], materials.yellow);
  const truck = new THREE.Group(); truck.position.set(-12, 0.2, 14); root.add(truck);
  box(truck, [2.5, 0.7, 1.25], [0, 0.8, 0], materials.concrete);
  box(truck, [1.1, 0.8, 1.2], [0.4, 1.5, 0], materials.concrete);
  box(truck, [0.04, 0.5, 1.05], [0.97, 1.6, 0], materials.dark);
  for (const x of [-0.8, 0.8]) for (const z of [-0.65, 0.65]) { const wheel = cylinder(truck, 0.3, 0.18, [x, 0.4, z], materials.dark); wheel.rotation.x = Math.PI / 2; }
  // Sculpted landscape mounds and trees kept outside the fenced work area.
  const leaves: { mesh: THREE.Mesh; x: number; z: number }[] = [];
  const leafGeo = new THREE.IcosahedronGeometry(1, 1), trunkGeo = new THREE.CylinderGeometry(0.12, 0.21, 1.9, 6);
  const bark = new THREE.MeshStandardMaterial({ color: "#796a51", roughness: 1 });
  const leafMaterials = ["#56785d", "#6d8660", "#8b9a6c"].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  for (let i = 0; i < 31; i++) {
    const x = i < 15 ? -25 + (i % 3) * 1.6 : -22 + (i - 15) * 2.6;
    const z = i < 15 ? -17 + Math.floor(i / 3) * 7 : -20;
    const trunk = new THREE.Mesh(trunkGeo, bark); trunk.position.set(x, 1, z); trunk.castShadow = true; root.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMaterials[i % 3]); leaf.position.set(x, 3.1 + (i % 3) * 0.25, z); leaf.scale.set(1.3, 1.7 + (i % 2) * 0.2, 1.2); leaf.castShadow = true; root.add(leaf); leaves.push({ mesh: leaf, x, z });
  }
  for (let i = 0; i < 9; i++) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), materials.grass); mound.position.set(-23 + i * 5.5, -0.4, 19); mound.scale.set(3.1, 1.2, 2.3); mound.receiveShadow = true; root.add(mound);
  }
  const waterUniforms = { time: { value: 0 }, cloud: { value: 0 }, known: { value: 0 }, level: { value: 0 } };
  const waterMaterial = new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `varying vec2 vUv; uniform float time,cloud,known; void main(){float wave=sin(vUv.y*160.+time*.8+sin(vUv.x*40.+time)*.3)*.5+.5;float shine=pow(wave,24.)*.025;vec3 water=mix(vec3(.07,.20,.21),vec3(.12,.27,.27),vUv.x)+shine;water*=1.-cloud*.23;gl_FragColor=vec4(mix(vec3(.28,.32,.28),water,known),1.);}` });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(5, 42, 16, 32), waterMaterial); river.rotation.x = -Math.PI / 2; river.position.set(23, 0.06, 0); root.add(river);
  // Gauge tower is schematic. Its height never claims to be site inundation.
  box(root, [0.26, 4, 0.28], [19.6, 2, 6], materials.concrete);
  for (let i = 0; i < 10; i++) box(root, [0.3, 0.04, 0.33], [19.6, 0.3 + i * 0.36, 6], materials.dark, 0);
  const gauge = box(root, [0.36, 0.15, 0.35], [19.6, 0.4, 6], materials.yellow);
  const sockPole = cylinder(root, 0.065, 5.7, [13.6, 2.85, 8.5], materials.metal);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.8, 10, 1, true), new THREE.MeshStandardMaterial({ color: "#ce8d57", side: THREE.DoubleSide }));
  sock.rotation.z = -Math.PI / 2; sock.position.set(sockPole.position.x + 0.8, 5.5, 8.5); root.add(sock);
  const roots = new THREE.Group(); root.add(roots);
  for (let i = 0; i < 14; i++) {
    const points = [new THREE.Vector3(-23 + i * 2.8, -0.4, 22.05), new THREE.Vector3(-22.7 + i * 2.8, -1.2, 22.05), new THREE.Vector3(-23.4 + i * 2.8, -2.6, 22.05)];
    roots.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: "#ccb78b", transparent: true, opacity: 0.7 })));
  }
  // Merge static parts by material. Detail should not cost one draw call per bolt or fence rail.
  const dynamic = new Set<THREE.Object3D>([rootBand, surfaceBand, river, gauge, sock, ...leaves.map(l => l.mesh)]);
  root.updateMatrixWorld(true);
  function batch(parent: THREE.Group, skipTemplates: boolean) {
    const buckets = new Map<THREE.Material, { meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
    parent.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || dynamic.has(object)) return;
      if (skipTemplates) { let ancestor = object.parent; while (ancestor && ancestor !== parent) { if (Object.values(templates).includes(ancestor as THREE.Group)) return; ancestor = ancestor.parent; } }
      const material = object.material; if (Array.isArray(material)) return;
      const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
      if (geometry !== transformed) transformed.dispose();
      const bucket = buckets.get(material) ?? { meshes: [], geometries: [] };
      bucket.meshes.push(object); bucket.geometries.push(geometry); buckets.set(material, bucket);
    });
    const originals = new Set<THREE.BufferGeometry>();
    for (const [material, bucket] of buckets) {
      const geometry = mergeGeometries(bucket.geometries, false);
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
        bucket.meshes.forEach(m => { originals.add(m.geometry); m.removeFromParent(); }); parent.add(mesh);
      }
      bucket.geometries.forEach(g => g.dispose());
    }
    originals.forEach(g => g.dispose());
  }
  Object.values(templates).forEach(t => batch(t, false)); batch(root, true);
  return {
    root,
    update(v: VisualState, template: Template, soilLens: boolean) {
      Object.entries(templates).forEach(([key, group]) => { group.visible = key === template; });
      materials.grass.color.set(v.surface === null ? "#8c9681" : "#84936e");
      materials.grass.color.lerp(new THREE.Color("#576e58"), (v.surface ?? 0) * 0.5);
      materials.soil.color.set(v.surface === null ? "#a59576" : "#b39b72").lerp(new THREE.Color("#665e4b"), v.surface ?? 0);
      materials.root.color.set(v.root === null ? "#887865" : "#9b7b54").lerp(new THREE.Color("#514e45"), v.root ?? 0);
      materials.road.roughness = 0.95 - v.wet * 0.72; materials.road.metalness = v.wet * 0.18;
      materials.roof.roughness = 0.45 - v.wet * 0.22;
      materials.grass.color.lerp(new THREE.Color("#e2e6db"), v.snow ? 0.72 : 0);
      rootBand.visible = surfaceBand.visible = roots.visible = soilLens;
      waterUniforms.cloud.value = v.cloud; waterUniforms.known.value = v.stage === null ? 0 : 1;
      gauge.position.y = v.stage === null ? 0.25 : 0.3 + v.stage * 3.3;
    },
    animate(time: number, wind: number, bearing: number) {
      waterUniforms.time.value = time;
      leaves.forEach(({ mesh }, i) => { mesh.rotation.z = Math.sin(time * 1.3 + i * 0.7) * wind * 0.09; mesh.rotation.x = Math.sin(time + i) * wind * 0.055; });
      sock.rotation.y = -bearing; sock.rotation.z = -Math.PI / 2 + (1 - wind) * 0.6 + Math.sin(time * 5) * wind * 0.09;
    },
    dispose() { texture.dispose(); },
  };
}
