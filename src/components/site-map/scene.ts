import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mapNearPlane } from "./camera";
import type { ScenarioFrame } from "../../../shared/simulation";
import { createSimulationOverlay } from "./simulation-scene";
import { scenarioBounds, type SimulationLayer } from "./scenario-geometry";
import type { Decision, HazardReport, Site } from "../../../shared/types";
import { REGION_BOUNDS, type MapRegion } from "../../../shared/weather";
import { accentTone } from "../../lib/accent";
import {
  LAND_TOP,
  projectUS as project,
  normalizeLongitude,
  REGION,
  riskColor,
  atlasStates,
  SOUTHEAST_CORNERS,
  statePolygons,
  unproject,
  type StateGeometry,
} from "./projection";

export interface SceneData {
  sites: Site[];
  decisions: Record<string, Pick<Decision, "index" | "tasks" | "lightningUntil">>;
  visuals?: Record<string, { value: number | null; fraction: number; confidence: number; color: string; label: string; unit: string }>;
  hour?: number;
  layer?: string;
  selected: string;
  reports: HazardReport[];
  pin?: { latitude: number; longitude: number };
  simulation?: ScenarioFrame;
  simulationLayer?: SimulationLayer;
  simulationPlaying?: boolean;
}
export interface MapScene {
  update(data: SceneData): void;
  fit(): void;
  focus(site: Pick<Site, "latitude" | "longitude">): void;
  region(region: MapRegion): void;
  frameScenario(frame: ScenarioFrame): void;
  topDown(value: boolean): void;
  rotate(value: boolean): void;
  zoom(factor: number): void;
  resize(): void;
  dispose(): void;
}

/** Current accent from the header picker; CSS owns the palette. */
function brandColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#c3d99c";
}

type LandRole = "surface" | "ocean" | "top" | "top-focal" | "side" | "edge" | "pin-edge" | "pin-edge-focal";
/** Land tints follow the accent; the dark pin-map surfaces stay neutral slate. */
function landColor(role: LandRole) {
  switch (role) {
    case "surface": return accentTone(0.955, 0.6);
    case "ocean": return accentTone(0.93, 0.5);
    case "top": return accentTone(0.82, 0.4);
    case "top-focal": return accentTone(0.77, 0.6);
    case "side": return accentTone(0.57, 0.55);
    case "edge": return accentTone(0.41, 0.6);
    case "pin-edge": return accentTone(0.33, 1);
    case "pin-edge-focal": return accentTone(0.65, 0.8);
  }
}

function disposeGroup(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
        (m) => materials.add(m),
      );
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  group.clear();
}

export function createMapScene(
  container: HTMLDivElement,
  labels: HTMLDivElement,
  initial: SceneData,
  callbacks: {
    select(id: string): void;
    pin?(latitude: number, longitude: number): void;
    hover(id: string | null): void;
    interact(): void;
    ready(): void;
    geographyError(): void;
  },
): MapScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(callbacks.pin ? "#11191d" : landColor("surface"));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.className = "three-map-canvas";
  canvas.setAttribute(
    "aria-label",
    callbacks.pin
      ? "3D hazard pin map. Drag to pan; click to place the hazard."
      : "Interactive 3D site risk map. Drag to orbit, scroll to zoom, right-drag to pan.",
  );
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(callbacks.pin ? "#11191d" : landColor("surface"), 0.003);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minDistance = callbacks.pin ? 0.06 : 1.6;
  controls.maxDistance = 500;
  controls.minPolarAngle = 0.01;
  controls.maxPolarAngle = Math.PI / 2.25;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.45;
  controls.listenToKeyEvents(canvas);
  if (callbacks.pin) {
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.touches.ONE = THREE.TOUCH.PAN;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  scene.add(new THREE.HemisphereLight("#fffdf7", "#7d7869", callbacks.pin ? 2.3 : 1.3));
  const sun = new THREE.DirectionalLight("#fffdf7", callbacks.pin ? 2.7 : 1.7);
  sun.position.set(-3, 9, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#d8d3c5", callbacks.pin ? 1.3 : .8);
  rim.position.set(5, 4, -5);
  scene.add(rim);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(650, 650),
    new THREE.MeshStandardMaterial({
      color: callbacks.pin ? "#172329" : landColor("ocean"),
      roughness: 0.85,
      metalness: 0.15,
    }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = callbacks.pin ? -0.17 : -0.46;
  scene.add(ocean);
  const grid = new THREE.GridHelper(250, 125, "#c4bc9f", "#cfc7af");
  grid.position.y = callbacks.pin ? -0.16 : -0.45;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = callbacks.pin ? 0.35 : 0.18;
  scene.add(grid);
  const land = new THREE.Group(),
    beacons = new THREE.Group(),
    reports = new THREE.Group();
  scene.add(land, beacons, reports);
  const landMaterials: [THREE.MeshStandardMaterial | THREE.LineBasicMaterial, LandRole][] = [];
  const recolorLand = () => {
    landMaterials.forEach(([material, role]) => material.color.set(landColor(role)));
    if (callbacks.pin) return;
    renderer.setClearColor(landColor("surface"));
    (scene.fog as THREE.FogExp2).color.set(landColor("surface"));
    (ocean.material as THREE.MeshStandardMaterial).color.set(landColor("ocean"));
  };
  document.addEventListener("planit:accent", recolorLand);
  const simulation = callbacks.pin ? undefined : createSimulationOverlay();
  if (simulation) scene.add(simulation.group);
  const simulationLabel = document.createElement("div");
  simulationLabel.className = "scenario-map-label";
  simulationLabel.dataset.testid = "scenario-map-label";
  simulationLabel.hidden = true;
  labels.appendChild(simulationLabel);
  const siteLabels = document.createElement("div");
  labels.appendChild(siteLabels);
  const abort = new AbortController();
  let disposed = false,
    top = !!callbacks.pin,
    rotating = false,
    inView = true;
  let overview: MapRegion | undefined = callbacks.pin ? undefined : "mainland";
  const interact = () => {
    overview = undefined;
    rotating = false;
    move = undefined;
    callbacks.interact();
  };
  controls.addEventListener("start", interact);
  let data = initial;
  const anchors: {
    element: HTMLElement;
    position: THREE.Vector3;
    priority: number;
  }[] = [];
  const pulses: { mesh: THREE.Mesh; base: number }[] = [];
  const pickTargets: THREE.Object3D[] = [];
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LAND_TOP);
  let move:
    | {
        startPosition: THREE.Vector3;
        endPosition: THREE.Vector3;
        startTarget: THREE.Vector3;
        endTarget: THREE.Vector3;
        start: number;
      }
    | undefined;

  function animateTo(target: THREE.Vector3, position: THREE.Vector3) {
    if (reduced.matches) {
      controls.target.copy(target);
      camera.position.copy(position);
      controls.update();
      return;
    }
    move = {
      startPosition: camera.position.clone(),
      endPosition: position,
      startTarget: controls.target.clone(),
      endTarget: target,
      start: performance.now(),
    };
  }
  function fit(immediate = false, sites: { latitude: number; longitude: number }[] = data.sites) {
    overview = undefined;
    const box = new THREE.Box3();
    sites.forEach((s) => {
      const p = project(s.latitude, s.longitude);
      box.expandByPoint(new THREE.Vector3(p.x, LAND_TOP, p.z));
    });
    if (box.isEmpty())
      box.setFromCenterAndSize(
        new THREE.Vector3(),
        new THREE.Vector3(10, 1, 8),
      );
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    const distance =
      (Math.max(
        size.x / Math.max(camera.aspect, 0.4),
        size.z,
        callbacks.pin ? 0.16 : 4,
      ) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
      1.45;
    const offset = top
      ? new THREE.Vector3(0, distance, distance * 0.001)
      : new THREE.Vector3(distance * 0.2, distance * 0.72, distance * 0.78);
    if (immediate) {
      controls.target.copy(center);
      camera.position.copy(center).add(offset);
      controls.update();
    } else animateTo(center, center.clone().add(offset));
  }
  function region(value: MapRegion, immediate = false) {
    // The atlas frames the sites inside a region rather than the region's full extent.
    const inRegion = data.sites.filter((s) => value === "all" || (value === "alaska" ? s.state === "AK" : value === "hawaii" ? s.state === "HI" : !["AK", "HI"].includes(s.state)));
    if (!callbacks.pin && inRegion.length) {
      // The Lower 48 view also frames the always-drawn Southeast around the sites.
      fit(immediate, value === "mainland" ? [...inRegion, ...SOUTHEAST_CORNERS] : inRegion);
      overview = value;
      canvas.dataset.region = value;
      return;
    }
    overview = value;
    const bounds = REGION_BOUNDS[value];
    const a = project(bounds.north, bounds.west), b = project(bounds.south, bounds.east);
    const center = new THREE.Vector3((a.x + b.x) / 2, LAND_TOP, (a.z + b.z) / 2);
    const available = camera.aspect < 0.8 ? 1.05 : 0.83;
    const distance = Math.max((b.x - a.x) / Math.max(camera.aspect * available, 0.25), b.z - a.z) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (camera.aspect < 0.8 ? 1.1 : 1.3);
    const offset = top ? new THREE.Vector3(0, distance, 0.001) : new THREE.Vector3(0, distance * 0.76, distance * 0.82);
    if (immediate) { controls.target.copy(center); camera.position.copy(center).add(offset); controls.update(); }
    else animateTo(center, center.clone().add(offset));
    canvas.dataset.region = value;
  }
  function focus(site: Pick<Site, "latitude" | "longitude">) {
    overview = undefined;
    const p = project(site.latitude, site.longitude > 0 ? site.longitude - 360 : site.longitude),
      target = new THREE.Vector3(p.x, LAND_TOP, p.z);
    const distance = callbacks.pin
      ? 0.24
      : Math.max(3.7, 4.7 / Math.max(camera.aspect, 0.6));
    animateTo(
      target,
      target
        .clone()
        .add(
          top
            ? new THREE.Vector3(0, distance, 0.001)
            : new THREE.Vector3(0.8, distance * 0.8, distance * 0.9),
        ),
    );
  }
  function frameScenario(frame: ScenarioFrame) {
    overview = undefined;
    rotating = false;
    controls.autoRotate = false;
    const bounds = scenarioBounds(frame);
    const center = new THREE.Vector3((bounds.west + bounds.east) / 2, LAND_TOP, (bounds.north + bounds.south) / 2);
    const availableWidth = camera.aspect > 1.2 ? .72 : .9;
    const distance = Math.max((bounds.east - bounds.west) / Math.max(camera.aspect * availableWidth, .35), bounds.south - bounds.north, 3) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.3;
    animateTo(center, center.clone().add(top ? new THREE.Vector3(0, distance, .001) : new THREE.Vector3(0, distance * .85, distance * .72)));
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    if (!callbacks.pin) camera.setViewOffset(width, height, width > 1100 ? 125 : 0, height < 850 && width > 760 ? 35 : 0, width, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (overview) region(overview, true);
  }
  resize();
  if (callbacks.pin && data.sites[0]) {
    const p = project(data.sites[0].latitude, data.sites[0].longitude);
    controls.target.set(p.x, LAND_TOP, p.z);
    camera.position.set(p.x, LAND_TOP + 0.24, p.z + 0.0001);
    controls.update();
  } else region("mainland", true);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const visibility = new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? true;
  });
  visibility.observe(container);

  let geography: StateGeometry | undefined, drawnStates = "";
  void fetch("/data/us-states.geojson", { signal: abort.signal })
    .then((r) => {
      if (!r.ok) throw new Error("Geography unavailable");
      return r.json() as Promise<StateGeometry>;
    })
    .then((states) => {
      if (disposed) return;
      geography = states;
      drawLand();
      canvas.dataset.geography = "ready";
    })
    .catch((error) => {
      if (error.name !== "AbortError" && !disposed) callbacks.geographyError();
    });
  // The atlas draws the Southeast plus states holding a loaded site; the pin map keeps every state.
  function drawLand() {
    if (!geography) return;
    const wanted = callbacks.pin ? null : atlasStates(data.sites);
    const key = wanted ? [...wanted].sort().join() : "*";
    if (key === drawnStates) return;
    drawnStates = key;
    disposeGroup(land);
    landMaterials.length = 0;
    const features = geography.features.filter((f) => !wanted || wanted.has(f.properties.name));
    for (const state of features)
      for (const polygon of statePolygons(state.geometry)) {
        const shape = new THREE.Shape();
        polygon.forEach((ring, index) => {
          const path = index === 0 ? shape : new THREE.Path();
          ring.forEach(([longitude, latitude], i) => {
            const p = project(latitude, longitude > 0 ? longitude - 360 : longitude);
            if (i === 0) path.moveTo(p.x, -p.z);
            else path.lineTo(p.x, -p.z);
          });
          path.closePath();
          if (index > 0) shape.holes.push(path);
        });
        const focal = ["Florida", "Louisiana", "Mississippi"].includes(
          state.properties.name,
        );
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: callbacks.pin ? 0.25 : 0.55,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, LAND_TOP - (callbacks.pin ? 0.25 : 0.55), 0);
        const top = new THREE.MeshStandardMaterial({
          color: callbacks.pin ? (focal ? "#4b5c5b" : "#3e4b50") : landColor(focal ? "top-focal" : "top"),
          roughness: 0.8,
          metalness: 0.15,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const side = new THREE.MeshStandardMaterial({
          color: callbacks.pin ? "#1c3b38" : landColor("side"),
          roughness: 0.6,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const edge = new THREE.LineBasicMaterial({
          color: landColor(callbacks.pin ? (focal ? "pin-edge-focal" : "pin-edge") : "edge"),
          transparent: true,
          opacity: callbacks.pin ? (focal ? 0.7 : 0.4) : 0.48,
        });
        if (!callbacks.pin) landMaterials.push([top, focal ? "top-focal" : "top"], [side, "side"]);
        landMaterials.push([edge, callbacks.pin ? (focal ? "pin-edge-focal" : "pin-edge") : "edge"]);
        const mesh = new THREE.Mesh(geometry, [top, side]);
        land.add(mesh);
        mesh.userData.state = state.properties.name;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edge);
        land.add(edges);
      }
    canvas.dataset.states = String(features.length);
  }

  function label(
    text: string,
    className: string,
    position: THREE.Vector3,
    priority: number,
  ) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = text;
    siteLabels.appendChild(element);
    anchors.push({ element, position, priority });
    return element;
  }
  // Each site is a small house: walls and roof take the risk color; size stays constant so color carries the score.
  const BUILDING_HEIGHT = 0.15, buildingScale = (selected: boolean) => (callbacks.pin ? 0.025 : 1) * (selected ? 1.3 : 1);
  const records = new Map<string, { building: THREE.Group; walls: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; element: HTMLButtonElement; anchor: { position: THREE.Vector3; priority: number }; key: string }>();
  let topology = "";
  function refreshBeacons() {
    pulses.length = 0;
    for (const site of data.sites) {
      const record = records.get(site.id); if (!record) continue;
      const decision = data.decisions[site.id], visual = data.visuals?.[site.id];
      const value = visual ? visual.value : decision?.index ?? null, color = visual?.color ?? riskColor(value), selected = site.id === data.selected;
      const key = JSON.stringify([value, color, selected, visual?.label, visual?.confidence, decision?.tasks.some(t => t.state === "HOLD")]);
      if (selected || decision?.tasks.some(t => t.state === "HOLD")) pulses.push({ mesh: record.halo, base: selected ? 0.8 : 0.35 });
      if (record.key === key) continue;
      record.key = key;
      const scale = buildingScale(selected), opacity = value === null ? 0.4 : visual && visual.confidence < 0.5 ? 0.55 : 1;
      record.building.scale.setScalar(scale);
      record.walls.color.set(color); record.walls.emissive.set(color); record.walls.emissiveIntensity = selected ? 0.55 : 0.18;
      record.roof.color.set(color).multiplyScalar(0.72); record.roof.emissive.set(color); record.roof.emissiveIntensity = selected ? 0.4 : 0.1;
      record.walls.opacity = record.roof.opacity = opacity;
      record.halo.material.color.set(color); record.halo.material.opacity = selected ? 0.8 : 0.35;
      record.anchor.position.set(record.building.position.x, LAND_TOP + BUILDING_HEIGHT * scale + (callbacks.pin ? 0.003 : 0.06), record.building.position.z); record.anchor.priority = selected ? 100 : 10;
      record.element.textContent = value?.toFixed(1) ?? "?";
      record.element.className = `site-beacon ${selected ? "is-selected" : ""} ${value === null ? "is-unknown" : ""} ${visual && visual.confidence < 0.5 ? "has-low-confidence" : ""}`;
      record.element.style.setProperty("--beacon-color", color);
      record.element.dataset.confidence = visual ? String(visual.confidence) : "";
      record.element.dataset.value = value === null ? "unknown" : String(value);
      record.element.setAttribute("aria-label", `${site.name}, ${visual?.label ?? "risk"} ${value ?? "unknown"}`);
      record.element.setAttribute("aria-pressed", String(selected)); record.element.title = `${site.name} · ${value ?? "unknown"} ${visual?.unit ?? "/10"}`;
    }
  }
  function update(next: SceneData) {
    data = next;
    drawLand();
    simulation?.update(data.simulation, data.simulationLayer ?? "wind", data.sites);
    simulationLabel.hidden = !data.simulation;
    simulationLabel.textContent = data.simulation ? `SIMULATED · ${data.simulation.active ? data.simulation.kind === "hurricane" ? "Hurricane" : "Rainfall" : "Track complete"}` : "";
    canvas.dataset.simulation = data.simulation ? "true" : "false";
    canvas.dataset.simulationHour = data.simulation ? String(data.simulation.hour) : "";
    canvas.dataset.simulationLayer = data.simulationLayer ?? "wind";
    canvas.dataset.riskLayer = data.layer ?? "risk";
    canvas.dataset.riskHour = String(data.hour ?? 0);
    const signature = JSON.stringify([data.sites.map(s => [s.id, s.latitude, s.longitude, s.name]), data.sites.map(s => data.decisions[s.id]?.lightningUntil), data.reports, data.pin]);
    if (signature === topology) { refreshBeacons(); return; }
    topology = signature;
    records.clear();
    canvas.dataset.beaconBuilds = String(Number(canvas.dataset.beaconBuilds ?? 0) + 1);
    disposeGroup(beacons);
    disposeGroup(reports);
    siteLabels.replaceChildren();
    anchors.length = 0;
    pulses.length = 0;
    pickTargets.length = 0;
    // Shared house geometry, modelled at full size with its base at y = 0.
    const body = new THREE.BoxGeometry(0.11, 0.09, 0.09).translate(0, 0.045, 0),
      annex = new THREE.BoxGeometry(0.05, 0.05, 0.06).translate(0.075, 0.025, 0.01),
      gable = new THREE.ConeGeometry(0.085, BUILDING_HEIGHT - 0.09, 4).rotateY(Math.PI / 4).translate(0, 0.09 + (BUILDING_HEIGHT - 0.09) / 2, 0),
      ring = new THREE.RingGeometry(
        callbacks.pin ? 0.002 : 0.11,
        callbacks.pin ? 0.003 : 0.135,
        32,
      );
    for (const site of data.sites) {
      const decision = data.decisions[site.id],
        risk = decision?.index;
      const selected = site.id === data.selected,
        color = riskColor(risk),
        p = project(site.latitude, site.longitude);
      const scale = buildingScale(selected);
      const walls = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: selected ? 0.55 : 0.18, transparent: true, roughness: 0.6 }),
        roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), emissive: color, emissiveIntensity: selected ? 0.4 : 0.1, transparent: true, roughness: 0.5 });
      const building = new THREE.Group();
      for (const [geometry, material] of [[body, walls], [annex, walls], [gable, roof]] as const) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.siteId = site.id;
        building.add(mesh);
        pickTargets.push(mesh);
      }
      building.position.set(p.x, LAND_TOP, p.z);
      building.scale.setScalar(scale);
      building.userData.siteId = site.id;
      beacons.add(building);
      const halo = new THREE.Mesh(
        ring,
        new THREE.MeshBasicMaterial({
          color: selected ? brandColor() : color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: selected ? 0.8 : 0.35,
          depthWrite: false,
        }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(p.x, LAND_TOP + 0.008, p.z);
      beacons.add(halo);
      if (selected || decision?.tasks.some((t) => t.state === "HOLD"))
        pulses.push({ mesh: halo, base: selected ? 0.8 : 0.35 });
      const element = label(
        risk?.toFixed(0) ?? "?",
        `site-beacon ${selected ? "is-selected" : ""}`,
        new THREE.Vector3(p.x, LAND_TOP + BUILDING_HEIGHT * scale + (callbacks.pin ? 0.003 : 0.06), p.z),
        selected ? 100 : 10,
      );
      element.style.setProperty("--beacon-color", color);
      element.dataset.siteId = site.id;
      element.setAttribute(
        "aria-label",
        `${site.name}, risk ${risk ?? "unknown"}`,
      );
      element.setAttribute("aria-pressed", String(selected));
      element.title = `${site.name} · ${risk ?? "unknown"}/10`;
      element.onclick = (event) => {
        event.stopPropagation();
        rotating = false;
        controls.autoRotate = false;
        callbacks.select(site.id);
      };
      records.set(site.id, { building, walls, roof, halo, element, anchor: anchors[anchors.length - 1], key: "" });
      element.onmouseenter = () => callbacks.hover(site.id);
      element.onmouseleave = () => callbacks.hover(null);
      element.onfocus = () => callbacks.hover(site.id);
      element.onblur = () => callbacks.hover(null);
      if (decision?.lightningUntil) {
        // Geodesic 10-mile boundary; visual risk halos above are schematic.
        const points: THREE.Vector3[] = [],
          angular = 10 / 3958.7613,
          latitude = THREE.MathUtils.degToRad(site.latitude),
          longitude = THREE.MathUtils.degToRad(site.longitude);
        for (let i = 0; i <= 64; i++) {
          const bearing = (i / 64) * Math.PI * 2;
          const lat = Math.asin(
            Math.sin(latitude) * Math.cos(angular) +
              Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing),
          );
          const lon =
            longitude +
            Math.atan2(
              Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
              Math.cos(angular) - Math.sin(latitude) * Math.sin(lat),
            );
          const q = project(
            THREE.MathUtils.radToDeg(lat),
            THREE.MathUtils.radToDeg(lon),
          );
          points.push(new THREE.Vector3(q.x, LAND_TOP + 0.015, q.z));
        }
        const boundary = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: "#ffb794" }),
        );
        boundary.userData.lightningRadiusMiles = 10;
        beacons.add(boundary);
      }
    }
    for (const report of data.reports.filter((r) => r.status === "open")) {
      const p = project(report.latitude, report.longitude),
        point = new THREE.Vector3(
          p.x,
          LAND_TOP + (callbacks.pin ? 0.015 : 0.3),
          p.z,
        );
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(callbacks.pin ? 0.0015 : 0.09),
        new THREE.MeshBasicMaterial({ color: "#ffc482" }),
      );
      marker.position.copy(point);
      reports.add(marker);
      const element = label(
        "!",
        "scene-report-pin",
        point
          .clone()
          .add(new THREE.Vector3(0, callbacks.pin ? 0.003 : 0.12, 0)),
        110,
      );
      element.title = report.description;
      element.setAttribute("aria-label", `Crew report: ${report.description}`);
      element.onclick = () => callbacks.select(report.siteId);
    }
    refreshBeacons();
    if (data.pin) {
      const p = project(data.pin.latitude, data.pin.longitude);
      const element = label(
        "+",
        "scene-report-pin is-draft",
        new THREE.Vector3(p.x, LAND_TOP + 0.02, p.z),
        120,
      );
      element.setAttribute("aria-label", "Selected hazard location");
      element.style.pointerEvents = "none";
    }
  }
  update(initial);
  let down: { x: number; y: number; id: number } | undefined;
  const contacts = new Set<number>();
  let multiTouch = false;
  function setPointer(event: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      (-(event.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }
  const start = (event: PointerEvent) => {
    if (event.button !== 0) return;
    contacts.add(event.pointerId);
    if (contacts.size > 1) {
      multiTouch = true;
      down = undefined;
      return;
    }
    down = { x: event.clientX, y: event.clientY, id: event.pointerId };
    move = undefined;
    rotating = false;
    controls.autoRotate = false;
  };
  const end = (event: PointerEvent) => {
    contacts.delete(event.pointerId);
    if (multiTouch) {
      down = undefined;
      if (contacts.size === 0) multiTouch = false;
      return;
    }
    if (!down || down.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = undefined;
    if (distance > 5 || event.button !== 0) return;
    setPointer(event);
    if (!callbacks.pin) {
      const hit = raycaster.intersectObjects(pickTargets)[0];
      if (hit?.object.userData.siteId) {
        callbacks.select(hit.object.userData.siteId);
        return;
      }
      return;
    }
    const hit = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    if (!hit) return;
    const p = unproject(hit.x, hit.z);
    if (
      p.latitude < REGION.south ||
      p.latitude > REGION.north ||
      p.longitude < REGION.west ||
      p.longitude > REGION.east
    )
      return;
    callbacks.pin(p.latitude, normalizeLongitude(p.longitude));
  };
  const cancel = (event: PointerEvent) => {
    contacts.delete(event.pointerId);
    down = undefined;
    if (contacts.size === 0) multiTouch = false;
  };
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", cancel);
  const hover = (event: PointerEvent) => {
    if (down || callbacks.pin) return;
    setPointer(event);
    const id =
      raycaster.intersectObjects(pickTargets)[0]?.object.userData.siteId ??
      null;
    canvas.style.cursor = id ? "pointer" : "grab";
    callbacks.hover(id);
  };
  canvas.addEventListener("pointermove", hover);
  const leave = () => callbacks.hover(null);
  canvas.addEventListener("pointerleave", leave);
  const preventMenu = (event: Event) => event.preventDefault();
  canvas.addEventListener("contextmenu", preventMenu);
  let frame = 0,
    lastDraw = 0;
  const projected = new THREE.Vector3();
  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!inView || document.hidden || now - lastDraw < 32) return;
    const delta = Math.min((now - lastDraw) / 1000, 0.1);
    lastDraw = now;
    if (move) {
      const t = Math.min(1, (now - move.start) / 650),
        ease = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(move.startPosition, move.endPosition, ease);
      controls.target.lerpVectors(move.startTarget, move.endTarget, ease);
      if (t >= 1) move = undefined;
    }
    controls.autoRotate =
      rotating && !top && !reduced.matches && !move && !down;
    controls.update(delta);
    const near = mapNearPlane(controls.getDistance());
    if (camera.near !== near) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    if (!reduced.matches)
      pulses.forEach(({ mesh, base }, i) => {
        const t = (now / 2200 + i * 0.13) % 1;
        mesh.scale.setScalar(1 + t * 1.6);
        (mesh.material as THREE.MeshBasicMaterial).opacity = base * (1 - t);
      });
    simulation?.tick(delta, !!data.simulationPlaying && !reduced.matches);
    renderer.render(scene, camera);
    const width = container.clientWidth,
      height = container.clientHeight;
    for (const { element, position, priority } of anchors) {
      projected.copy(position).project(camera);
      const x = ((projected.x + 1) * width) / 2,
        y = ((1 - projected.y) * height) / 2;
      const visible =
        projected.z > -1 &&
        projected.z < 1 &&
        x > 10 &&
        x < width - 10 &&
        y > 18 &&
        y < height - 18;
      element.style.visibility = visible ? "visible" : "hidden";
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      element.style.zIndex = String(
        priority + Math.round((1 - projected.z) * 100),
      );
    }
    if (data.simulation) {
      const center = project(data.simulation.center.latitude, data.simulation.center.longitude);
      projected.set(center.x, LAND_TOP + .65, center.z).project(camera);
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
      simulationLabel.style.visibility = projected.z > -1 && projected.z < 1 && x > 0 && x < width && y > 0 && y < height ? "visible" : "hidden";
      simulationLabel.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    canvas.dataset.camera = [
      controls.getAzimuthalAngle(),
      controls.getPolarAngle(),
      controls.getDistance(),
    ]
      .map((n) => n.toFixed(3))
      .join(",");
    if (canvas.dataset.ready !== "true") {
      canvas.dataset.ready = "true";
      callbacks.ready();
    }
  }
  frame = requestAnimationFrame(tick);
  return {
    update,
    region,
    fit,
    focus,
    frameScenario,
    resize,
    topDown(value) {
      top = value || !!callbacks.pin;
      controls.enableRotate = !top;
      const offset = camera.position.clone().sub(controls.target),
        distance = offset.length();
      animateTo(
        controls.target.clone(),
        controls.target
          .clone()
          .add(
            top
              ? new THREE.Vector3(0, distance, distance * 0.001)
              : new THREE.Vector3(
                  distance * 0.2,
                  distance * 0.72,
                  distance * 0.78,
                ),
          ),
      );
    },
    rotate(value) {
      rotating = value;
    },
    zoom(factor) {
      move = undefined;
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(factor);
      const distance = THREE.MathUtils.clamp(
        offset.length(),
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      abort.abort();
      observer.disconnect();
      visibility.disconnect();
      controls.dispose();
      document.removeEventListener("planit:accent", recolorLand);
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("contextmenu", preventMenu);
      if (simulation) { scene.remove(simulation.group); simulation.dispose(); }
      disposeGroup(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labels.replaceChildren();
    },
  };
}
