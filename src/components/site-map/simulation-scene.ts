import * as THREE from "three";
import type { ScenarioFrame } from "../../../shared/simulation";
import type { Site } from "../../../shared/types";
import { LAND_TOP, projectUS } from "./projection";
import { scenarioDestination, scenarioFootprint, SIMULATION_COLORS, type GeographicPoint, type SimulationLayer } from "./scenario-geometry";

const TAU = Math.PI * 2;
const TRACK_SAMPLES = 256;
const FOOTPRINT_SAMPLES = 96;
const PARTICLES = 120;

function dynamicLine(capacity: number, color: string, opacity: number, dashed = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  if (dashed) geometry.setAttribute("lineDistance", new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: .11, gapSize: .08, transparent: true, opacity, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  return new THREE.Line(geometry, material);
}

function writeLine(line: THREE.Line, points: GeographicPoint[], elevation = .07) {
  const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  const distances = line.geometry.getAttribute("lineDistance") as THREE.BufferAttribute | undefined;
  const count = Math.min(points.length, attribute.count);
  let distance = 0, previousX = 0, previousZ = 0;
  for (let index = 0; index < count; index++) {
    const point = points[Math.round(index / Math.max(1, count - 1) * (points.length - 1))];
    const projected = projectUS(point.latitude, point.longitude);
    attribute.setXYZ(index, projected.x, LAND_TOP + elevation, projected.z);
    if (index > 0) distance += Math.hypot(projected.x - previousX, projected.z - previousZ);
    distances?.setX(index, distance);
    previousX = projected.x; previousZ = projected.z;
  }
  attribute.needsUpdate = true;
  line.geometry.setDrawRange(0, count);
  line.geometry.computeBoundingSphere();
  if (distances) distances.needsUpdate = true;
}

function spiralGeometry() {
  const vertices: number[] = [], indices: number[] = [];
  const steps = 90;
  for (let arm = 0; arm < 3; arm++) {
    for (let index = 0; index <= steps; index++) {
      const progress = index / steps, radius = .16 + progress * .82;
      const angle = arm / 3 * TAU + progress * TAU * .88;
      const halfWidth = .009 + Math.sin(progress * Math.PI) * .044;
      for (const side of [-1, 1]) vertices.push(Math.cos(angle) * (radius + side * halfWidth), .13 + Math.sin(progress * Math.PI) * .04, Math.sin(angle) * (radius + side * halfWidth));
      if (index < steps) {
        const offset = (arm * (steps + 1) + index) * 2;
        indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Visual scenario layer. It never reads or mutates canonical beacon materials. */
export function createSimulationOverlay() {
  const group = new THREE.Group();
  group.name = "simulated-weather-overlay";
  group.visible = false;
  const projectedTrack = dynamicLine(TRACK_SAMPLES, "#8b8174", .65, true);
  const elapsedTrack = dynamicLine(TRACK_SAMPLES, "#b96732", 1);
  const footprint = dynamicLine(FOOTPRINT_SAMPLES + 1, "#b96732", .8, true);
  group.add(projectedTrack, elapsedTrack, footprint);

  const storm = new THREE.Group(), vortex = new THREE.Group();
  group.add(storm); storm.add(vortex);
  const haze = new THREE.Mesh(new THREE.RingGeometry(.16, 1, 96), new THREE.MeshBasicMaterial({ color: "#d99a68", transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false }));
  haze.rotation.x = -Math.PI / 2; haze.position.y = .035; storm.add(haze);
  const bands = new THREE.Mesh(spiralGeometry(), new THREE.MeshBasicMaterial({ color: "#cb8249", transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false }));
  vortex.add(bands);
  const eye = new THREE.Mesh(new THREE.RingGeometry(.105, .155, 64), new THREE.MeshBasicMaterial({ color: "#a75728", transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  eye.rotation.x = -Math.PI / 2; eye.position.y = .18; storm.add(eye);
  const innerEye = new THREE.Mesh(new THREE.RingGeometry(.075, .085, 64), new THREE.MeshBasicMaterial({ color: "#fff6de", side: THREE.DoubleSide, transparent: true, opacity: .9, depthWrite: false }));
  innerEye.rotation.x = -Math.PI / 2; innerEye.position.y = .185; storm.add(innerEye);

  const rainRings = new THREE.Group();
  for (const radius of [.28, .52, .78]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + .035, 80), new THREE.MeshBasicMaterial({ color: "#247f91", transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .08; rainRings.add(ring);
  }
  storm.add(rainRings);
  const rainPositions = new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute("position", rainPositions);
  const rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: "#26788c", size: .035, transparent: true, opacity: .65, depthWrite: false, sizeAttenuation: true }));
  storm.add(rain);
  function updateRain(phase: number) {
    for (let index = 0; index < PARTICLES; index++) {
      const radius = Math.sqrt((index + .5) / PARTICLES) * .93;
      const angle = index * 2.3999632297;
      rainPositions.setXYZ(index, Math.cos(angle) * radius, .08 + ((index * .618 + phase) % 1) * .36, Math.sin(angle) * radius);
    }
    rainPositions.needsUpdate = true;
  }
  updateRain(0);
  rainGeometry.computeBoundingSphere();

  const effectGeometry = new THREE.RingGeometry(.68, 1, 32);
  const effectMaterial = new THREE.MeshBasicMaterial({ color: "#386fa4", side: THREE.DoubleSide, transparent: true, opacity: .55, depthWrite: false });
  let effects = new THREE.InstancedMesh(effectGeometry, effectMaterial, 1);
  effects.count = 0; effects.frustumCulled = false; group.add(effects);
  let capacity = 1, current: ScenarioFrame | undefined, currentLayer: SimulationLayer = "wind", phase = 0, trackKey = "";
  const transform = new THREE.Object3D();

  return {
    group,
    update(frame: ScenarioFrame | undefined, layer: SimulationLayer, sites: Site[]) {
      current = frame; currentLayer = layer; group.visible = !!frame;
      if (!frame) return;
      const color = SIMULATION_COLORS[layer];
      const key = JSON.stringify(frame.track);
      if (key !== trackKey) { writeLine(projectedTrack, frame.track); trackKey = key; }
      writeLine(elapsedTrack, frame.traveledTrack, .085);
      writeLine(footprint, scenarioFootprint(frame.center, frame.config.radiusKm, FOOTPRINT_SAMPLES), .045);
      footprint.visible = frame.active;
      footprint.material.color.set(color); elapsedTrack.material.color.set(color);
      const center = projectUS(frame.center.latitude, frame.center.longitude);
      const east = scenarioDestination(frame.center, frame.config.radiusKm, Math.PI / 2);
      const south = scenarioDestination(frame.center, frame.config.radiusKm, Math.PI);
      storm.position.set(center.x, LAND_TOP + .02, center.z);
      storm.scale.set(Math.abs(projectUS(east.latitude, east.longitude).x - center.x), 1, Math.abs(projectUS(south.latitude, south.longitude).z - center.z));
      storm.visible = frame.active;
      vortex.rotation.y = -frame.progress * TAU * 1.4 - phase * .12;
      const windStrength = Math.min(frame.config.maxWindMph / 150, 1), rainStrength = Math.min(frame.config.rainRateMmH / 60, 1);
      vortex.visible = frame.kind === "hurricane" && (layer === "wind" ? windStrength > 0 : rainStrength > 0);
      eye.visible = innerEye.visible = frame.kind === "hurricane" && windStrength > 0;
      rainRings.visible = (frame.kind === "rainfall" || layer !== "wind") && rainStrength > 0;
      rain.visible = layer === "rain" && rainStrength > 0;
      rain.material.opacity = .2 + rainStrength * .55;
      bands.material.color.set(layer === "wind" ? "#cb8249" : "#3a8fa1");
      bands.material.opacity = layer === "runoff" ? .2 : .18 + (layer === "wind" ? windStrength : rainStrength) * .35;
      haze.material.color.set(color); haze.material.opacity = layer === "wind" ? windStrength * .1 : rainStrength * .14;
      eye.material.color.set(color);
      if (sites.length > capacity) {
        group.remove(effects); effects.dispose();
        capacity = sites.length;
        effects = new THREE.InstancedMesh(effectGeometry, effectMaterial, capacity);
        effects.frustumCulled = false; group.add(effects);
      }
      effectMaterial.color.set(color);
      let count = 0;
      for (const site of sites) {
        const impact = frame.impacts[site.id];
        if (!impact) continue;
        const value = layer === "wind" ? impact.windMph / 120 : layer === "rain" ? impact.rainRateMmH / 40 : impact.runoffMm / 120;
        if (value < .025) continue;
        const point = projectUS(site.latitude, site.longitude), size = .11 + Math.min(value, 1) * .22;
        transform.position.set(point.x, LAND_TOP + .035, point.z);
        transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.setScalar(size); transform.updateMatrix();
        effects.setMatrixAt(count++, transform.matrix);
      }
      effects.count = count; effects.instanceMatrix.needsUpdate = true;
    },
    tick(delta: number, playing: boolean) {
      if (!current?.active || !playing) return;
      phase += delta;
      if (current.kind === "hurricane") vortex.rotation.y -= delta * .12;
      if (currentLayer === "rain") updateRain(phase * .55);
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      group.traverse(object => {
        const drawable = object as THREE.Mesh;
        if (drawable.geometry) geometries.add(drawable.geometry);
        if (drawable.material) (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach(material => materials.add(material));
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      effects.dispose(); group.clear();
    },
  };
}
