import { useMemo } from "react";
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, type Vector3 } from "three";
import {
  color,
  dot,
  float,
  hash,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
  vertexIndex,
} from "three/tsl";
import { MeshBasicNodeMaterial, PointsNodeMaterial } from "three/webgpu";

// The night sky over the landing (ONB-01), as a dome: deep navy overhead, a cold misty haze at the
// horizon (the same colour as the fog, so far trees melt into it), the moon's glow lighting the haze
// around it, and thin cloud wisps drifting slowly past. Stars thin out toward the haze and shimmer
// over tens of seconds, never a flicker (0050). Our own, not drei's Stars (0049). Lights nothing:
// the scene's light is baked and set separately (GateScene).

export const HORIZON = "#1f3049"; // the haze; GateScene's fog uses it too
const ZENITH = "#050813";
const HIGH = "#0b1428";
const MOON_GLOW = "#8fb0dc";

const STARS = 520;
const RADIUS = 90;

function starPositions(): Float32Array {
  const out = new Float32Array(STARS * 3);
  let s = 7;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < STARS; i++) {
    const azimuth = next() * Math.PI * 2;
    const height = 0.12 + next() ** 0.8 * 0.88;
    const r = Math.sqrt(1 - height * height);
    out[i * 3] = Math.cos(azimuth) * r * RADIUS * 0.95;
    out[i * 3 + 1] = height * RADIUS * 0.95;
    out[i * 3 + 2] = Math.sin(azimuth) * r * RADIUS * 0.95;
  }
  return out;
}

export function Sky({ moon }: { moon: Vector3 }) {
  const { dome, stars, starMaterial, disc } = useMemo(() => {
    const toMoon = uniform(moon.clone().normalize());
    const dir = normalize(positionLocal);
    const up = max(dir.y, 0);
    // Navy overhead → haze at the horizon (a curve that keeps the haze low).
    let sky = mix(color(HORIZON), color(HIGH), smoothstep(0.0, 0.35, up));
    sky = mix(sky, color(ZENITH), smoothstep(0.3, 1.0, up));
    // The moon lights the sky round it: a wide soft glow and a tighter bright one.
    const near = max(dot(dir, toMoon), 0);
    const glow = pow(near, float(26))
      .mul(0.36)
      .add(pow(near, float(220)).mul(0.8));
    sky = sky.add(color(MOON_GLOW).mul(glow));
    // Thin cloud wisps, stretched sideways, drifting; lit where they pass near the moon.
    const flat = dir.xz.div(dir.y.add(0.12));
    const wisp = float(
      smoothstep(0.35, 0.85, mx_noise_float(vec3(flat.x.mul(0.35).add(time.mul(0.004)), flat.y.mul(1.4), 3))),
    ).mul(smoothstep(0.04, 0.3, up));
    const cloud = vec3(0.13, 0.2, 0.32).add(vec3(0.56, 0.69, 0.86).mul(glow.mul(1.6)));
    sky = mix(sky, cloud, wisp.mul(0.5));
    const domeMaterial = new MeshBasicNodeMaterial({ side: BackSide, fog: false, depthWrite: false });
    domeMaterial.colorNode = sky;

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(starPositions(), 3));
    const m = new PointsNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    const seed = hash(vertexIndex);
    const shimmer = sin(time.mul(float(0.08).add(seed.mul(0.12))).add(seed.mul(40)))
      .mul(0.25)
      .add(0.75);
    // Fainter low down, where the haze is.
    const height = normalize(positionLocal).y;
    m.colorNode = color("#d7e0ff")
      .mul(seed.mul(seed).mul(0.9).add(0.15))
      .mul(shimmer)
      .mul(smoothstep(0.1, 0.45, height));
    m.sizeNode = seed.mul(1.6).add(0.7);

    const d = new MeshBasicNodeMaterial({ toneMapped: false, fog: false });
    d.colorNode = color("#f2f4fb").mul(1.6);
    return { dome: domeMaterial, stars: geometry, starMaterial: m, disc: d };
  }, [moon]);
  const at = moon
    .clone()
    .normalize()
    .multiplyScalar(RADIUS * 0.9);
  return (
    <group>
      <mesh material={dome} renderOrder={-2}>
        <sphereGeometry args={[RADIUS, 48, 24]} />
      </mesh>
      <points geometry={stars} material={starMaterial} renderOrder={-1} />
      <mesh position={at} material={disc} onUpdate={(m) => m.lookAt(0, 0, 0)}>
        <circleGeometry args={[2.2, 48]} />
      </mesh>
    </group>
  );
}
