import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildSiteKit } from "./site-kit";
import { buildEffects } from "./effects";
import { visualState } from "./visualization-state";
import type { ScenarioValues, SceneSettings } from "./types";

export interface SiteScene {
  update(values: ScenarioValues, paused: boolean, settings: SceneSettings): void;
  resetCamera(): void;
  cameraView(view: "overview" | "overhead" | "detail"): void;
  orbit(angle: number): void;
  zoom(factor: number): void;
  dispose(): void;
}

export function createSiteScene(host: HTMLElement): SiteScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-label", "Interactive architectural miniature with hypothetical environmental effects"); canvas.setAttribute("role", "img");
  host.append(canvas);
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#cddbd7"); scene.fog = new THREE.Fog("#cddbd7", 95, 180);
  const camera = new THREE.PerspectiveCamera(37, 1, 0.5, 250);
  const controls = new OrbitControls(camera, canvas); controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 26; controls.maxDistance = 160; controls.enablePan = false;
  const fill = new THREE.HemisphereLight("#dfeef0", "#8f9676", 2.1); scene.add(fill);
  const sun = new THREE.DirectionalLight("#fff1d1", 3.8); sun.position.set(-22, 40, 24); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35; sun.shadow.camera.near = 1; sun.shadow.camera.far = 110; sun.shadow.normalBias = 0.08; sun.shadow.bias = -0.0003;
  sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: "#cad4c6", roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -3.5; floor.receiveShadow = true; scene.add(floor);
  const skyUniforms = { top: { value: new THREE.Color("#8caaa9") }, bottom: { value: new THREE.Color("#e2e5d5") } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: skyUniforms,
    vertexShader: `varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vWorld;uniform vec3 top,bottom;void main(){float h=clamp(normalize(vWorld).y*.8+.2,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);}` })); scene.add(sky);
  const kit = buildSiteKit(scene), effects = buildEffects(scene, camera);
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const heatPass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform float time,amount;varying vec2 vUv;void main(){vec2 uv=vUv;vec2 p=(uv-vec2(.5,.33))*vec2(1.2,2.8);float mask=1.-smoothstep(.15,.43,length(p));float wave=sin(uv.y*165.+time*2.8+sin(uv.x*74.+time)*2.)*.65+sin(uv.y*91.-time*1.7)*.35;uv.x+=wave*mask*amount*.0013;uv.y+=sin(uv.x*77.+time)*mask*amount*.0002;gl_FragColor=texture2D(tDiffuse,clamp(uv,.001,.999));}` });
  composer.addPass(heatPass); const output = new OutputPass(); composer.addPass(output);
  let paused = true, visible = true, lost = false, disposed = false, initialized = false, animation = 0, last = 0, seconds = 0, wind = 0, gust = 0, bearing = 0;
  let view: "overview" | "overhead" | "detail" = "overview", fit = 1;
  const fitForAspect = () => view === "detail" ? 1 : Math.max(1, Math.min(1.65, 1.4 / camera.aspect));
  function render() {
    if (!initialized || disposed || lost || !visible || document.hidden) return;
    renderer.info.reset(); composer.render();
    canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.geometries = String(renderer.info.memory.geometries);
    canvas.dataset.frames = String(Number(canvas.dataset.frames ?? 0) + 1);
  }
  function moveCamera(nextView: "overview" | "overhead" | "detail") {
    view = nextView;
    if (view === "overview") { camera.position.set(53, 43, 58); controls.target.set(0, 2, 0); }
    if (view === "overhead") { camera.position.set(0, 82, 0.1); controls.target.set(0, 0, 0); }
    if (view === "detail") { camera.position.set(27, 11, 38); controls.target.set(-2, -0.6, 8); }
    fit = fitForAspect(); camera.position.sub(controls.target).multiplyScalar(fit).add(controls.target);
    canvas.dataset.cameraView = view; controls.update(); effects.animate(seconds); render();
  }
  function animate(now: number) {
    animation = 0;
    if (paused || !visible || document.hidden || lost || disposed) return;
    seconds += Math.min((now - last) / 1000, 0.05); last = now;
    kit.animate(seconds, Math.max(wind, gust * (0.45 + Math.sin(seconds * 1.3) * 0.25)), bearing); effects.animate(seconds); heatPass.uniforms.time.value = seconds;
    render(); animation = requestAnimationFrame(animate);
  }
  function schedule() {
    cancelAnimationFrame(animation); animation = 0;
    if (!paused && visible && !document.hidden && !lost && !disposed) { last = performance.now(); animation = requestAnimationFrame(animate); }
    render();
  }
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }); observer.observe(host);
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h || disposed) return;
    renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h;
    const nextFit = fitForAspect(); camera.position.sub(controls.target).multiplyScalar(nextFit / fit).add(controls.target); fit = nextFit;
    camera.updateProjectionMatrix(); controls.update(); render();
  }); resize.observe(host);
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; canvas.dataset.context = "lost"; schedule(); };
  const contextRestored = () => { lost = false; canvas.dataset.context = "ready"; schedule(); };
  canvas.addEventListener("webglcontextlost", contextLost); canvas.addEventListener("webglcontextrestored", contextRestored);
  controls.addEventListener("change", () => { effects.animate(seconds); render(); });
  document.addEventListener("visibilitychange", schedule);
  moveCamera("overview"); canvas.dataset.context = "ready";
  return {
    resetCamera() { moveCamera("overview"); }, cameraView: moveCamera,
    orbit(angle) { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle); camera.position.copy(controls.target).add(offset); controls.update(); },
    zoom(factor) { const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(offset); controls.update(); },
    update(values, nextPaused, settings) {
      const v = visualState(values); paused = nextPaused; wind = v.wind; gust = v.gust; bearing = settings.windBearing * Math.PI / 180;
      kit.update(v, settings.template, settings.lens === "soil"); effects.update(v, settings);
      kit.animate(seconds, wind, bearing); effects.animate(seconds);
      sun.intensity = 3.8 - v.cloud * 2.9; fill.intensity = 2.1 - v.cloud * 0.6;
      sun.color.set(v.heat > 0.6 ? "#ffe3b2" : "#fff1d1");
      const fog = scene.fog as THREE.Fog; fog.near = v.fog ? 24 : 95 - v.cloud * 30; fog.far = v.fog ? 105 : 180;
      skyUniforms.top.value.set("#8caaa9").lerp(new THREE.Color("#657778"), v.cloud); skyUniforms.bottom.value.set("#e2e5d5").lerp(new THREE.Color("#acb9b2"), v.cloud);
      fog.color.copy(skyUniforms.bottom.value);
      heatPass.uniforms.amount.value = settings.lens === "heat" ? v.heat : 0;
      const pixelRatio = Math.min(devicePixelRatio, settings.quality === "high" ? 1.75 : 1.25);
      if (renderer.getPixelRatio() !== pixelRatio) { renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio); }
      canvas.dataset.lens = settings.lens; canvas.dataset.template = settings.template; canvas.dataset.precipitation = v.snow ? "snow" : v.hail ? "hail" : v.rain > 0 ? "rain-replay" : "none";
      canvas.dataset.demonstration = settings.demonstration; canvas.dataset.heat = String(v.heat); canvas.dataset.surfaceMoisture = values.soil.moistureSurface === null ? "unknown" : String(values.soil.moistureSurface);
      canvas.dataset.paused = String(paused); initialized = true; schedule();
    },
    dispose() {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(animation); observer.disconnect(); resize.disconnect(); controls.dispose(); document.removeEventListener("visibilitychange", schedule);
      canvas.removeEventListener("webglcontextlost", contextLost); canvas.removeEventListener("webglcontextrestored", contextRestored);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); kit.dispose();
      sun.shadow.dispose(); heatPass.dispose(); output.dispose(); composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
