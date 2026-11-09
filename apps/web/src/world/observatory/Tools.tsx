import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { asRegion, type RegionId } from "../region";

// The robot's Frame builder (CORE-34), shown only in rooms where it has been found.

const LECTERN = {
  1: { stone: "#77796f", dark: "#454a45", brass: "#9d7844", parchment: "#dfc99f" },
  2: { stone: "#827d6b", dark: "#4e5049", brass: "#bc8b3d", parchment: "#e0c99a" },
  3: { stone: "#b1a28b", dark: "#716854", brass: "#a87837", parchment: "#eed7a9" },
  4: { stone: "#c1b9a7", dark: "#817765", brass: "#a9854b", parchment: "#ead8b7" },
} as const;

function Chip({
  label,
  onClick,
  at,
  tab,
}: {
  label: string;
  onClick: () => void;
  at: [number, number, number];
  tab: number;
}) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" data-tab={tab} onClick={onClick}>
        {label}
      </button>
    </Html>
  );
}

function Workbench({ onOpen, region }: { onOpen: () => void; region: RegionId }) {
  const materials = LECTERN[region];
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={[-2.5, 0, 0.9]} rotation={[0, 0.5, 0]} onClick={onOpen}>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[1.05, 0.2, 0.72]} />
        <meshStandardMaterial color={materials.dark} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[0.68, 0.62, 0.54]} />
        <meshStandardMaterial color={materials.stone} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.83, 0]} rotation={[-0.22, 0, 0]}>
        <boxGeometry args={[1.42, 0.15, 0.82]} />
        <meshStandardMaterial color={materials.stone} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[-0.22, 0, 0.12]}>
        <boxGeometry args={[0.62, 0.025, 0.48]} />
        <meshStandardMaterial color={materials.parchment} roughness={1} side={2} />
      </mesh>
      {[-0.12, -0.04, 0.04, 0.12].map((z) => (
        <mesh key={z} position={[0, 0.94, z]} rotation={[-0.22, 0, 0.12]}>
          <boxGeometry args={[0.34 - Math.abs(z) * 0.35, 0.006, 0.012]} />
          <meshStandardMaterial color={materials.dark} roughness={1} />
        </mesh>
      ))}
      {[-0.59, 0.59].map((x) => (
        <mesh key={x} position={[x, 0.91, 0]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[0.045, 0.19, 0.84]} />
          <meshStandardMaterial color={materials.brass} metalness={0.65} roughness={0.32} />
        </mesh>
      ))}
      {[-0.31, 0.31].map((x) => (
        <mesh key={x} position={[x, 0.88, 0.22]} rotation={[-0.22, 0, 0]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshStandardMaterial color={materials.brass} metalness={0.65} roughness={0.32} />
        </mesh>
      ))}
      <mesh position={[0, 0.48, 0.28]}>
        <boxGeometry args={[0.22, 0.34, 0.035]} />
        <meshStandardMaterial color={materials.brass} metalness={0.52} roughness={0.4} />
      </mesh>
      <Chip label={voice.workbench.name} onClick={onOpen} at={[0, 1.25, 0]} tab={TAB.furniture + 4} />
    </group>
  );
}

export function ObservatoryTools() {
  const roomId = useSession((s) => s.roomId);
  const openPanel = useSession((s) => s.openPanel);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room) return null;
  return (
    <>
      {room.controls.workbench === "works" && (
        <Workbench onOpen={() => openPanel({ kind: "workbench" })} region={asRegion(room.region)} />
      )}
    </>
  );
}
