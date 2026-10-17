import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Decision, HazardReport, Site } from "../../../shared/types";
import {
  LAND_TOP,
  project,
  REGION,
  riskColor,
  statePolygons,
  unproject,
  type StateGeometry,
} from "./projection";

export interface SceneData {
  sites: Site[];
  decisions: Record<string, Decision>;
  selected: string;
  reports: HazardReport[];
  pin?: { latitude: number; longitude: number };
}
export interface MapScene {
  update(data: SceneData): void;
  fit(): void;
  focus(site: Site): void;
  topDown(value: boolean): void;
  rotate(value: boolean): void;
  zoom(factor: number): void;
  resize(): void;
  dispose(): void;
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
  renderer.setClearColor("#101e23");
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
  scene.fog = new THREE.FogExp2("#101e23", 0.018);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 140);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minDistance = callbacks.pin ? 0.06 : 1.6;
  controls.maxDistance = 38;
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
  scene.add(new THREE.HemisphereLight("#d7f8e8", "#102128", 2.6));
  const sun = new THREE.DirectionalLight("#d1e9bd", 3.2);
  sun.position.set(-3, 9, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#5babad", 1.5);
  rim.position.set(5, 4, -5);
  scene.add(rim);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({
      color: "#12272d",
      roughness: 0.85,
      metalness: 0.15,
    }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.17;
  scene.add(ocean);
  const grid = new THREE.GridHelper(52, 104, "#2a6265", "#204247");
  grid.position.y = -0.16;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  scene.add(grid);
  const land = new THREE.Group(),
    beacons = new THREE.Group(),
    reports = new THREE.Group();
  scene.add(land, beacons, reports);
  const abort = new AbortController();
  let disposed = false,
    top = !!callbacks.pin,
    rotating = false,
    inView = true;
  const interact = () => {
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
  function fit(immediate = false) {
    const box = new THREE.Box3();
    data.sites.forEach((s) => {
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
  function focus(site: Site) {
    const p = project(site.latitude, site.longitude),
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
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  resize();
  if (callbacks.pin && data.sites[0]) {
    const p = project(data.sites[0].latitude, data.sites[0].longitude);
    controls.target.set(p.x, LAND_TOP, p.z);
    camera.position.set(p.x, LAND_TOP + 0.24, p.z + 0.0001);
    controls.update();
  } else fit(true);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const visibility = new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? true;
  });
  visibility.observe(container);

  void fetch("/data/states.geojson", { signal: abort.signal })
    .then((r) => {
      if (!r.ok) throw new Error("Geography unavailable");
      return r.json() as Promise<StateGeometry>;
    })
    .then((states) => {
      if (disposed) return;
      for (const state of states.features)
        for (const polygon of statePolygons(state.geometry)) {
          const shape = new THREE.Shape();
          polygon.forEach((ring, index) => {
            const path = index === 0 ? shape : new THREE.Path();
            ring.forEach(([longitude, latitude], i) => {
              const p = project(latitude, longitude);
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
            depth: 0.25,
            bevelEnabled: false,
            steps: 1,
            curveSegments: 1,
          });
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(0, LAND_TOP - 0.25, 0);
          const mesh = new THREE.Mesh(geometry, [
            new THREE.MeshStandardMaterial({
              color: focal ? "#456853" : "#263d38",
              roughness: 0.8,
              metalness: 0.15,
            }),
            new THREE.MeshStandardMaterial({
              color: "#1c3b38",
              roughness: 0.6,
            }),
          ]);
          land.add(mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry, 30),
            new THREE.LineBasicMaterial({
              color: focal ? "#8fbea0" : "#3f6960",
              transparent: true,
              opacity: focal ? 0.7 : 0.4,
            }),
          );
          land.add(edges);
        }
      canvas.dataset.geography = "ready";
    })
    .catch((error) => {
      if (error.name !== "AbortError" && !disposed) callbacks.geographyError();
    });

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
    labels.appendChild(element);
    anchors.push({ element, position, priority });
    return element;
  }
  function update(next: SceneData) {
    data = next;
    disposeGroup(beacons);
    disposeGroup(reports);
    labels.replaceChildren();
    anchors.length = 0;
    pulses.length = 0;
    pickTargets.length = 0;
    const cylinder = new THREE.CylinderGeometry(
        callbacks.pin ? 0.0006 : 0.035,
        callbacks.pin ? 0.001 : 0.065,
        1,
        8,
      ),
      cap = new THREE.SphereGeometry(callbacks.pin ? 0.0017 : 0.075, 10, 8),
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
      const height = callbacks.pin ? 0.004 : 0.15 + (risk ?? 0) * 0.055;
      const pillar = new THREE.Mesh(
        cylinder,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: selected ? 1 : 0.45,
          transparent: true,
          opacity: 0.85,
          roughness: 0.35,
        }),
      );
      pillar.position.set(p.x, LAND_TOP + height / 2, p.z);
      pillar.scale.y = height;
      pillar.userData.siteId = site.id;
      beacons.add(pillar);
      pickTargets.push(pillar);
      const head = new THREE.Mesh(
        cap,
        new THREE.MeshBasicMaterial({ color: selected ? "#d7ff9c" : color }),
      );
      head.position.set(p.x, LAND_TOP + height, p.z);
      head.scale.setScalar(selected ? 1.25 : 0.7);
      head.userData.siteId = site.id;
      beacons.add(head);
      pickTargets.push(head);
      const halo = new THREE.Mesh(
        ring,
        new THREE.MeshBasicMaterial({
          color: selected ? "#d7ff9c" : color,
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
        head.position
          .clone()
          .add(new THREE.Vector3(0, callbacks.pin ? 0.003 : 0.12, 0)),
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
      if (hit?.object.userData.siteId)
        callbacks.select(hit.object.userData.siteId);
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
    callbacks.pin(p.latitude, p.longitude);
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
    if (!reduced.matches)
      pulses.forEach(({ mesh, base }, i) => {
        const t = (now / 2200 + i * 0.13) % 1;
        mesh.scale.setScalar(1 + t * 1.6);
        (mesh.material as THREE.MeshBasicMaterial).opacity = base * (1 - t);
      });
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
    fit,
    focus,
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
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("contextmenu", preventMenu);
      disposeGroup(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labels.replaceChildren();
    },
  };
}
