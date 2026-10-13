import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import type { Vec3 } from "./layout";

// What a room can hold beside its doors (CORE-27, 0042): a board on a stand (a switch's MAC board,
// or a machine's neighbour ledger) and the keeper's desk when it has forgotten its job. Each shows
// only in rooms whose controls have it; clicking runs the real command.

const STONE = "#6d6a63";

function Chip({ label, onClick, at }: { label: string; onClick: () => void; at: Vec3 }) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" onClick={onClick}>
        {label}
      </button>
    </Html>
  );
}

/** A board on a stand: the MAC board (`bridge fdb show`) or the neighbour ledger (`ip neigh show`). */
export function Board({
  device,
  kind,
  at,
  turn,
}: {
  device: string;
  kind: "mac" | "ledger" | "routes";
  at: Vec3;
  turn: number;
}) {
  const roomId = useSession((s) => s.roomId);
  const exec = useSession((s) => s.exec);
  const openPanel = useSession((s) => s.openPanel);
  const controls = roomId ? roomById(roomId)?.controls : undefined;
  const state =
    kind === "mac"
      ? controls?.macBoards?.[device]
      : kind === "ledger"
        ? controls?.ledgers?.[device]
        : controls?.routingBoards?.[device];
  if (!state) return null;
  const line = kind === "mac" ? "bridge fdb show" : kind === "ledger" ? "ip neigh show" : "ip route show";
  const read = async () => {
    if (state === "works") {
      const { execId } = await exec(device, line, "click");
      openPanel({ kind: "board", device, board: kind, execId });
    } else openPanel({ kind: "board", device, board: kind });
  };
  const label = kind === "mac" ? voice.board.name : kind === "ledger" ? voice.ledger.name : voice.routes.name;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={at} rotation={[0, turn, 0]} onClick={() => void read()}>
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[1.5, 1.1, 0.1]} />
        <meshStandardMaterial color={state === "works" ? "#2f3a3c" : "#4a4f52"} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.12, 0.8, 0.12]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <Chip label={label} onClick={() => void read()} at={[0, 2.15, 0]} />
    </group>
  );
}

/** The keeper's desk (0042), where messages wait while the keeper has forgotten its job. */
export function Desk({ device, at }: { device: string; at: Vec3 }) {
  const roomId = useSession((s) => s.roomId);
  const asleep = useSession((s) => !!s.status?.desks[device]);
  const openPanel = useSession((s) => s.openPanel);
  const isDesk = roomId ? roomById(roomId)?.controls.desk === device : false;
  if (!isDesk) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={at} onClick={() => openPanel({ kind: "desk", device })}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.6, 1.0, 0.6]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.9} />
      </mesh>
      <Chip
        label={asleep ? `${voice.desk.name} ●` : voice.desk.name}
        onClick={() => openPanel({ kind: "desk", device })}
        at={[0, 1.4, 0]}
      />
    </group>
  );
}
