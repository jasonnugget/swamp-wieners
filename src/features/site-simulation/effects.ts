import * as THREE from "three";
import type { SceneSettings } from "./types";
import type { VisualState } from "./visualization-state";

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.1)*.28+noise(p*4.3)*.15;}
`;
const planeVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function instancedPlane(size: number) {
  const plane = new THREE.PlaneGeometry(size, size), geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(plane.getIndex()); geometry.setAttribute("position", plane.getAttribute("position")); geometry.setAttribute("uv", plane.getAttribute("uv"));
  plane.dispose(); return geometry;
}

export function buildEffects(scene: THREE.Scene, camera: THREE.Camera) {
  const group = new THREE.Group(); scene.add(group);
  const time = { value: 0 }, wind = { value: 0 }, direction = { value: new THREE.Vector2() }, roof = { value: 1 };
  const drops = 850, positions = new Float32Array(drops * 6), offsets = new Float32Array(drops * 6), heads = new Float32Array(drops * 2);
  for (let i = 0; i < drops; i++) {
    const x = ((i * 13.37) % 53) - 26, y = ((i * 0.763) % 1), z = ((i * 7.93) % 42) - 21;
    for (let j = 0; j < 2; j++) { const k = i * 6 + j * 3; offsets[k] = x; offsets[k + 1] = y; offsets[k + 2] = z; heads[i * 2 + j] = j; }
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3)); rainGeo.setAttribute("offset", new THREE.BufferAttribute(offsets, 3)); rainGeo.setAttribute("head", new THREE.BufferAttribute(heads, 1));
  const rainMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time, wind, direction, roof },
    vertexShader: `attribute vec3 offset; attribute float head; uniform float time,wind,roof;uniform vec2 direction;varying float alpha;void main(){vec3 p=offset;p.y=fract(offset.y-time*.7)*22.-head*.75;p.xz+=direction*(22.-p.y)*wind*.6;float ground=roof*step(-13.5,p.x)*step(p.x,1.5)*step(-9.8,p.z)*step(p.z,-.2)*5.5;alpha=step(ground,p.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying float alpha;void main(){gl_FragColor=vec4(.64,.78,.81,alpha*.65);}` });
  const rain = new THREE.LineSegments(rainGeo, rainMaterial); rain.frustumCulled = false; group.add(rain);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute("position", new THREE.BufferAttribute(offsets.slice(0, drops * 3), 3));
  const snowMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time, direction, wind, hail: { value: 0 }, roof },
    vertexShader: `uniform float time,wind,hail,roof;uniform vec2 direction;varying float alpha;void main(){vec3 p=position;p.y=fract(position.y-time*mix(.07,.35,hail))*22.;p.xz+=direction*(22.-p.y)*wind*.3;p.x+=sin(time+position.x)*mix(.6,.05,hail);float ground=roof*step(-13.5,p.x)*step(p.x,1.5)*step(-9.8,p.z)*step(p.z,-.2)*5.5;alpha=step(ground,p.y);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(95./-mv.z,1.,5.);}`,
    fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.95,.97,.94,(1.-smoothstep(.25,.5,r))*alpha*.9);}` });
  const snow = new THREE.Points(snowGeo, snowMaterial); snow.frustumCulled = false; group.add(snow);
  const rippleGeo = instancedPlane(0.9);
  const splashOffsets = new Float32Array(90 * 3), phases = new Float32Array(90);
  for (let i = 0; i < 90; i++) { splashOffsets[i * 3] = -17 + ((i * 5.7) % 32); splashOffsets[i * 3 + 1] = 0.15; splashOffsets[i * 3 + 2] = i % 2 ? 12 + ((i * 0.7) % 3) : 2 + ((i * 2.7) % 8); phases[i] = (i * 0.73) % 1; }
  rippleGeo.setAttribute("offset", new THREE.InstancedBufferAttribute(splashOffsets, 3)); rippleGeo.setAttribute("phase", new THREE.InstancedBufferAttribute(phases, 1)); rippleGeo.instanceCount = 90;
  const rippleMaterial = new THREE.ShaderMaterial({ uniforms: { time }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 offset;attribute float phase;uniform float time;varying vec2 vUv;varying float age;void main(){vUv=uv;age=fract(time*1.6+phase);vec3 p=vec3(position.x,0.,position.y)*age+offset;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float age;void main(){float r=length(vUv-.5);float a=smoothstep(.30,.38,r)*(1.-smoothstep(.39,.47,r))*(1.-age);gl_FragColor=vec4(.7,.83,.81,a*.5);}` });
  const ripples = new THREE.Mesh(rippleGeo, rippleMaterial); ripples.frustumCulled = false; group.add(ripples);
  const trailsGeo = new THREE.BufferGeometry(); const trailsPos = new Float32Array(52 * 18), seeds = new Float32Array(52 * 6);
  for (let i = 0; i < 52; i++) for (let n = 0; n < 6; n++) { const k = i * 18 + n * 3; trailsPos[k] = n / 5; trailsPos[k + 1] = 2 + i % 6; trailsPos[k + 2] = 0; seeds[i * 6 + n] = i; }
  trailsGeo.setAttribute("position", new THREE.BufferAttribute(trailsPos, 3)); trailsGeo.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const trailsMaterial = new THREE.ShaderMaterial({ uniforms: { time, direction, wind, gust: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float seed;uniform float time,wind,gust;uniform vec2 direction;varying float alpha;void main(){float speed=2.+wind*8.+gust*(.5+.5*sin(time*1.3))*4.;float along=mod(seed*3.7+time*speed,55.)-27.;float across=mod(seed*7.13,40.)-20.;vec2 dir=direction;vec2 side=vec2(-dir.y,dir.x);vec3 p=vec3(0.,position.y,0.);p.xz=dir*(along+position.x*2.4)+side*across;p.y+=sin(along*.25+seed)*.25;alpha=sin(position.x*3.14159)*(.1+wind*.3);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying float alpha;void main(){gl_FragColor=vec4(.94,.97,.9,alpha);}` });
  const trails = new THREE.LineSegments(trailsGeo, trailsMaterial); trails.frustumCulled = false; group.add(trails);
  const cloudUniforms = { time, cover: { value: 0 } };
  const cloudMaterial = new THREE.ShaderMaterial({ uniforms: cloudUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: planeVertex,
    fragmentShader: `${noise} varying vec2 vUv;uniform float time,cover;void main(){vec2 p=vUv*2.-1.;float shape=1.-smoothstep(.3,1.,length(p*vec2(.8,1.2)));float density=fbm(vUv*5.+vec2(time*.015,0.));float a=shape*smoothstep(.25,.65,density)*cover*.78;vec3 color=mix(vec3(.91,.93,.87),vec3(.47,.55,.54),cover*.65)*(1.-density*.08);gl_FragColor=vec4(color,a);}` });
  const clouds: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) { const cloud = new THREE.Mesh(new THREE.PlaneGeometry(18, 8), cloudMaterial); cloud.position.set(-24 + i * 7.2, 13.5 + (i % 3), -15 + (i % 2) * 4); cloud.renderOrder = 2; group.add(cloud); clouds.push(cloud); }
  const smokeGeo = instancedPlane(1);
  const smokePhases = new Float32Array(26); for (let i = 0; i < 26; i++) smokePhases[i] = i / 26;
  smokeGeo.setAttribute("phase", new THREE.InstancedBufferAttribute(smokePhases, 1)); smokeGeo.instanceCount = 26;
  const smokeMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time, direction, wind },
    vertexShader: `attribute float phase;uniform float time,wind;uniform vec2 direction;varying vec2 vUv;varying float age;void main(){vUv=uv;age=fract(phase+time*.09);vec3 center=vec3(17.,2.+age*13.,-12.);center.xz+=direction*age*wind*11.;vec4 p=modelViewMatrix*vec4(center,1.);p.xy+=position.xy*(1.8+age*6.);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `${noise} varying vec2 vUv;varying float age;uniform float time;void main(){vec2 p=vUv-.5;float edge=1.-smoothstep(.2,.5,length(p));float density=fbm(vUv*5.-vec2(0.,time*.05));float a=edge*density*sin(age*3.14159)*.38;gl_FragColor=vec4(mix(vec3(.2,.24,.22),vec3(.47,.48,.43),age),a);}` });
  const smoke = new THREE.Mesh(smokeGeo, smokeMaterial); smoke.frustumCulled = false; group.add(smoke);
  const fireMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time }, vertexShader: planeVertex,
    fragmentShader: `${noise} varying vec2 vUv;uniform float time;void main(){float n=fbm(vec2(vUv.x*7.,vUv.y*6.-time*1.8));float width=pow(1.-vUv.y,.8)*.42;float body=1.-smoothstep(width*.15,width+.02,abs(vUv.x-.5+(n-.5)*.4));float a=body*(1.-smoothstep(.25,.98,vUv.y+n*.38));vec3 color=mix(vec3(.97,.23,.025),vec3(1.,.74,.22),pow(1.-vUv.y,2.));gl_FragColor=vec4(color,a*.85);}` });
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), fireMaterial); fire.position.set(17, 2.9, -12); fire.renderOrder = 3; group.add(fire);
  const flameSides = [-1, 1].map(side => { const f = new THREE.Mesh(fire.geometry, fireMaterial); f.position.set(17 + side * 0.8, 1.8, -12 + side * 0.4); f.scale.set(0.65, 0.65, 0.65); f.renderOrder = 3; group.add(f); return f; });
  const fireLight = new THREE.PointLight("#ffa450", 8, 10, 2); fireLight.position.set(17, 2, -12); group.add(fireLight);
  const emberPos = new Float32Array(48 * 3); for (let i = 0; i < 48; i++) { emberPos[i * 3] = (i * 0.37) % 3 - 1.5; emberPos[i * 3 + 1] = i / 48; emberPos[i * 3 + 2] = (i * 0.73) % 2 - 1; }
  const emberGeo = new THREE.BufferGeometry(); emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const emberMaterial = new THREE.ShaderMaterial({ uniforms: { time, wind, direction }, transparent: true, depthWrite: false,
    vertexShader: `uniform float time,wind;uniform vec2 direction;varying float age;void main(){age=fract(position.y+time*.17);vec3 p=vec3(17.+position.x,1.+age*8.,-12.+position.z);p.xz+=direction*age*wind*5.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=2.;}`,
    fragmentShader: `varying float age;void main(){gl_FragColor=vec4(1.,.65,.18,(1.-age)*(1.-smoothstep(.2,.5,length(gl_PointCoord-.5))));}` });
  const embers = new THREE.Points(emberGeo, emberMaterial); embers.frustumCulled = false; group.add(embers);
  const boltPoints: THREE.Vector3[] = [];
  const path = [[11, 16, -7], [9.8, 13, -7], [10.7, 11.8, -7], [8.7, 9, -7], [9.5, 8, -7], [7.8, 5.5, -7]];
  for (let i = 0; i < path.length - 1; i++) boltPoints.push(new THREE.Vector3(...path[i]), new THREE.Vector3(...path[i + 1]));
  boltPoints.push(new THREE.Vector3(10.7, 11.8, -7), new THREE.Vector3(13, 10.5, -6.8), new THREE.Vector3(13, 10.5, -6.8), new THREE.Vector3(13.6, 8.5, -6.8));
  const bolt = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(boltPoints), new THREE.LineBasicMaterial({ color: "#e8e9ff", transparent: true, opacity: 0.95 })); group.add(bolt);
  const heatMaterial = new THREE.ShaderMaterial({ uniforms: { time, strength: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: planeVertex,
    fragmentShader: `varying vec2 vUv;uniform float time,strength;void main(){vec2 p=vUv-.5;float edge=1.-smoothstep(.32,.66,length(p));float contour=.5+.5*sin(length(p*vec2(1.,1.5))*70.-time*.25);gl_FragColor=vec4(.91,.48,.17,edge*strength*(.11+pow(contour,12.)*.09));}` });
  const heat = new THREE.Mesh(new THREE.PlaneGeometry(35, 28), heatMaterial); heat.rotation.x = -Math.PI / 2; heat.position.set(-4, 0.17, -2); group.add(heat);
  const runoffMaterial = new THREE.MeshBasicMaterial({ color: "#91b2b1", transparent: true, opacity: 0.55 });
  const runoff = new THREE.Group(); group.add(runoff);
  for (const x of [-13.6, 1.5]) { const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.08, 5.2, 5), runoffMaterial); stream.position.set(x, 2.7, -0.3); runoff.add(stream); }
  const exposureMaterial = new THREE.MeshBasicMaterial({ color: "#639fa5", transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const exposure = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 41), exposureMaterial); exposure.rotation.x = -Math.PI / 2; exposure.position.set(19, 0.2, 0); group.add(exposure);
  return {
    update(v: VisualState, settings: SceneSettings) {
      rain.visible = v.rain > 0; rainGeo.setDrawRange(0, Math.round(drops * v.rain) * 2);
      snow.visible = v.snow || v.hail; snowMaterial.uniforms.hail.value = v.hail ? 1 : 0;
      ripples.visible = v.rain > 0; rippleGeo.instanceCount = Math.ceil(v.rain * 90);
      wind.value = v.wind; trailsMaterial.uniforms.gust.value = v.gust;
      const bearing = settings.windBearing * Math.PI / 180; direction.value.set(Math.sin(bearing), Math.cos(bearing));
      trails.visible = v.wind > 0 || v.gust > 0;
      roof.value = settings.template === "campus" ? 1 : 0;
      cloudUniforms.cover.value = v.cloud; clouds.forEach(c => { c.visible = v.cloud > 0.15; });
      smoke.visible = fire.visible = embers.visible = settings.demonstration === "fire";
      flameSides.forEach(f => { f.visible = fire.visible; }); fireLight.visible = fire.visible;
      bolt.visible = settings.demonstration === "lightning";
      heat.visible = settings.lens === "heat" && v.heat > 0; heatMaterial.uniforms.strength.value = v.heat;
      runoff.visible = settings.template === "campus" && v.rain > 0.1;
      exposure.visible = settings.lens === "water" && v.stage !== null; exposureMaterial.opacity = 0.06 + (v.stage ?? 0) * 0.2;
    },
    animate(seconds: number) {
      time.value = seconds;
      clouds.forEach((c, i) => { c.quaternion.copy(camera.quaternion); c.position.x = -24 + i * 7.2 + Math.sin(seconds * 0.025 + i) * 1.4; });
      fire.quaternion.copy(camera.quaternion);
      flameSides.forEach(f => f.quaternion.copy(camera.quaternion));
    },
  };
}
