import * as THREE from "three";
import { readingAt, weatherColor, weatherFraction, weatherValue, type WeatherLayer, type WeatherPoint } from "../../../shared/weather";
import { LAND_TOP, project } from "./projection";

export function createWeatherField(scene: THREE.Scene, labels: HTMLElement, onSelect: (point: WeatherPoint) => void) {
  const group = new THREE.Group();
  scene.add(group);
  const layerLabels = document.createElement("div");
  labels.appendChild(layerLabels);
  let anchors: { element: HTMLButtonElement; position: THREE.Vector3; selected: boolean }[] = [];
  let particles: { mesh: THREE.Mesh; x: number; z: number; phase: number; dx?: number; dz?: number }[] = [];
  const targets: THREE.Object3D[] = [];
  function clear() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
    layerLabels.replaceChildren();
    anchors = []; particles = []; targets.length = 0;
  }
  function update(points: WeatherPoint[], layer: WeatherLayer, hour: number, selectedId?: string) {
    clear();
    if (layer === "risk") return;
    const column = new THREE.CylinderGeometry(0.07, 0.12, 1, 10),
      dot = new THREE.SphereGeometry(0.13, 10, 8),
      disc = new THREE.CircleGeometry(0.62, 40),
      drop = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4);
    // Shared geometry is disposed with the next field rebuild.
    for (const [i, point] of points.entries()) {
      const reading = readingAt(point, hour), value = weatherValue(reading, layer);
      if (value == null) continue;
      const p = project(point.latitude, point.longitude > 0 ? point.longitude - 360 : point.longitude);
      const color = weatherColor(value, layer), fraction = weatherFraction(value, layer);
      const height = 0.18 + fraction * 3.2;
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25, emissive: color, emissiveIntensity: 0.16 });
      const stem = new THREE.Mesh(column, material);
      stem.position.set(p.x, LAND_TOP + height / 2, p.z);
      stem.scale.y = height;
      const cap = new THREE.Mesh(dot, material);
      cap.position.set(p.x, LAND_TOP + height, p.z);
      cap.userData.point = point;
      stem.userData.point = point;
      group.add(stem, cap); targets.push(cap, stem);
      const disk = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 + fraction * 0.12, depthWrite: false, side: THREE.DoubleSide }));
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(p.x, LAND_TOP + 0.02, p.z);
      disk.scale.setScalar(1 + fraction * 0.6);
      group.add(disk);
      if (layer === "wind" && value > 0 && reading?.direction != null) {
        const angle = reading.direction * Math.PI / 180;
        const dx = -Math.sin(angle), dz = Math.cos(angle);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(dx, 0, dz), new THREE.Vector3(p.x, LAND_TOP + 0.2, p.z), 0.5 + fraction * 2, color, 0.25, 0.12);
        group.add(arrow);
        for (let j = 0; j < 3; j++) {
          const particle = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color }));
          particle.scale.setScalar(0.28);
          particles.push({ mesh: particle, x: p.x, z: p.z, dx: dx * (0.6 + fraction * 2), dz: dz * (0.6 + fraction * 2), phase: j / 3 });
          group.add(particle);
        }
      }
      if (layer === "rain" && value > 0) {
        for (let j = 0; j < Math.ceil(fraction * 12) + 2; j++) {
          const particle = new THREE.Mesh(drop, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 }));
          particles.push({ mesh: particle, x: p.x + Math.sin(i * 17 + j * 9) * 0.45, z: p.z + Math.cos(i * 11 + j * 7) * 0.45, phase: (j * 0.31) % 1 });
          group.add(particle);
        }
      }
      if (layer === "clouds" && value > 10) {
        for (let j = 0; j < 3; j++) {
          const cloud = new THREE.Mesh(dot, new THREE.MeshStandardMaterial({ color: "#d4dddc", transparent: true, opacity: fraction * 0.35, depthWrite: false, roughness: 1 }));
          cloud.scale.set(3.5 + j, 1.2 + j * 0.2, 2.5);
          cloud.position.set(p.x + (j - 1) * 0.3, LAND_TOP + height * 0.8, p.z);
          group.add(cloud);
        }
      }
      const element = document.createElement("button");
      element.type = "button";
      element.className = `atlas-weather-marker ${point.id === selectedId ? "is-selected" : ""}`;
      element.innerText = `${point.id.length <= 2 ? point.id : "●"} ${value.toFixed(layer === "rain" ? 1 : 0)}${layer === "temperature" ? "°" : ""}`;
      element.style.setProperty("--weather-color", color);
      element.setAttribute("aria-label", `Inspect weather at ${point.name}`);
      element.onclick = (event) => { event.stopPropagation(); onSelect(point); };
      layerLabels.appendChild(element);
      anchors.push({ element, position: cap.position.clone().add(new THREE.Vector3(0, 0.3, 0)), selected: point.id === selectedId });
    }
    anchors.sort((a, b) => Number(b.selected) - Number(a.selected));
    // No readings can use these shared geometries, so release them explicitly.
    if (!anchors.length) { column.dispose(); dot.dispose(); disc.dispose(); }
    if (!particles.length || layer !== "rain") drop.dispose();
  }
  const projected = new THREE.Vector3();
  function draw(camera: THREE.Camera, width: number, height: number, now: number, animate: boolean) {
    const occupied: { x: number; y: number }[] = [];
    for (const anchor of anchors) {
      projected.copy(anchor.position).project(camera);
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
      const visible = projected.z > -1 && projected.z < 1 && x > 20 && x < width - 20 && y > 30 && y < height - 30 && !occupied.some((p) => Math.abs(x - p.x) < 54 && Math.abs(y - p.y) < 24);
      anchor.element.style.visibility = visible ? "visible" : "hidden";
      anchor.element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      if (visible) occupied.push({ x, y });
    }
    for (const p of particles) {
      const t = animate ? (now / 2000 + p.phase) % 1 : p.phase;
      p.mesh.position.set(p.x + (p.dx ?? 0) * t, LAND_TOP + (p.dx != null ? 0.3 : 0.2 + (1 - t) * 1.6), p.z + (p.dz ?? 0) * t);
    }
  }
  return { update, draw, pick: (raycaster: THREE.Raycaster) => raycaster.intersectObjects(targets)[0]?.object.userData.point as WeatherPoint | undefined, dispose() { clear(); scene.remove(group); layerLabels.remove(); } };
}
