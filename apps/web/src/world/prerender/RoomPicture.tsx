import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { type Camera, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";
import { float, mix, positionGeometry, texture, uniform, uv, vec3, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruinAt } from "../ruin";

// A room as a picture (prototype, 2.5D): the room rendered once, ruined and restored, drawn behind
// the live things, with the camera locked so they line up. The restoration wave still sweeps: each
// pixel finds where it lands on the floor, and asks the dial for the ruin there.

const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
/** `?capture=1`: the room alone, for tools/shots/capture-rooms.mjs. */
export const captureMode = params.has("capture");
/** Picture rooms are the default; `?pre=0` returns to the live room everywhere. */
export const pictureMode = !captureMode && params.get("pre") !== "0";

/** Every captured room layout. Hall ids include the near-edge door count to keep doors on their picture. */
const PICTURES = new Set([
  "r1-observatory-d1",
  "r1-observatory-d2",
  "r1-house-d1",
  "r2-observatory-d1",
  "r2-house-d1",
  "r2-hall-d4-f1",
  "r2-hall-d4-f2",
  "r2-hall-d5-f1",
  "r2-hall-d5-f2",
  "r3-observatory-d1",
  "r3-house-d1",
  "r3-hall-d3-f1",
  "r3-hall-d4-f1",
  "r3-hall-d5-f1",
  "r3-hall-d6-f1",
  "r3-hall-d7-f1",
  "r4-observatory-d1",
  "r4-house-d1",
  "r4-hall-d2-f1",
  "r4-hall-d3-f1",
]);
export const hasPicture = (id: string) => PICTURES.has(id);

const SCREEN = new PlaneGeometry(2, 2);

/** Where a corner of the screen lands on the floor (y = 0). */
function floorAt(camera: Camera, x: number, y: number) {
  camera.updateMatrixWorld();
  const to = new Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
  return camera.position.clone().addScaledVector(to, -camera.position.y / to.y);
}

export function RoomPicture({ id, home }: { id: string; home: Vector3 }) {
  const [ruined, restored] = useTexture([`/prerender/${id}-ruin.webp`, `/prerender/${id}-lit.webp`]);
  const camera = useThree((s) => s.camera);
  const material = useMemo(() => {
    for (const t of [ruined, restored]) if (t) t.colorSpace = SRGBColorSpace;
    camera.position.copy(home);
    camera.lookAt(0, 1.1, -0.6);
    const [a, b, c, d] = [
      floorAt(camera, -1, -1),
      floorAt(camera, 1, -1),
      floorAt(camera, -1, 1),
      floorAt(camera, 1, 1),
    ].map((p) => uniform(p));
    const m = new MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
    const at = uv();
    const floor = mix(mix(a as never, b as never, at.x), mix(c as never, d as never, at.x), at.y);
    m.vertexNode = vec4(positionGeometry.xy, float(0.99), float(1));
    m.colorNode = mix(texture(restored as never).rgb, texture(ruined as never).rgb, ruinAt(vec3(floor) as never));
    m.toneMapped = false;
    // The picture holds its own atmosphere: the room's fog would lie over it like smoke.
    m.fog = false;
    return m;
  }, [ruined, restored, camera, home]);
  return <mesh geometry={SCREEN} material={material} frustumCulled={false} renderOrder={-1000} />;
}
