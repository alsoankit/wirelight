import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { regionMaterial } from "../kit/regionMaterials";
import { type RegionId, useRegion } from "../region";
import type { Vec3 } from "./layout";

// What a room can hold beside its doors (CORE-27, 0042): a board on a stand (a switch's MAC board,
// or a machine's neighbour ledger) and the keeper's desk when it has forgotten its job. Each shows
// only in rooms whose controls have it; clicking runs the real command.

const STONE = "#6d6a63";

// Each region dresses the boards and the desk in its own materials (art briefs): weavers' stone,
// the Works' walnut and brass (the MAC board's entries are brass tiles), the town's timber notice
// boards, the Cathedral's carved stone with brass inlay (the routing board) and a lectern.
const FRAME: Record<RegionId, string> = { 1: "Main", 2: "Walnut", 3: "Timber", 4: "Sandstone" };
const STAND: Record<RegionId, string> = { 1: "Main", 2: "Brass", 3: "Iron", 4: "Sandstone" };
const DESK: Record<RegionId, string> = { 1: "Wood", 2: "Walnut", 3: "Timber", 4: "Sandstone" };

/** Brass tiles on the Works' MAC board (the ledger's entries), and brass inlay on the Cathedral's map. */
function Marks({ region, kind }: { region: RegionId; kind: "mac" | "ledger" | "routes" }) {
  if (region === 2 && kind === "mac") {
    const tiles: [number, number][] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) tiles.push([-0.52 + c * 0.26, 1.7 - r * 0.22]);
    return (
      <>
        {tiles.map(([x, y]) => (
          <mesh key={`${x},${y}`} position={[x, y, 0.065]} material={regionMaterial("Brass", 2)}>
            <boxGeometry args={[0.2, 0.15, 0.02]} />
          </mesh>
        ))}
      </>
    );
  }
  if (region === 4 && kind === "routes") {
    // Brass lines between a few carved towns: the map's roads.
    const roads: [number, number, number, number][] = [
      [-0.5, 1.6, 0.1, 1.2],
      [0.1, 1.2, 0.5, 1.6],
      [0.1, 1.2, -0.2, 0.95],
      [-0.5, 1.6, -0.5, 1.05],
    ];
    return (
      <>
        {roads.map(([x1, y1, x2, y2]) => (
          <mesh
            key={`${x1},${y1},${x2},${y2}`}
            position={[(x1 + x2) / 2, (y1 + y2) / 2, 0.065]}
            rotation={[0, 0, Math.atan2(y2 - y1, x2 - x1)]}
            material={regionMaterial("Brass", 4)}
          >
            <boxGeometry args={[Math.hypot(x2 - x1, y2 - y1), 0.035, 0.02]} />
          </mesh>
        ))}
        {[
          [-0.5, 1.6],
          [0.1, 1.2],
          [0.5, 1.6],
          [-0.2, 0.95],
          [-0.5, 1.05],
        ].map(([x, y]) => (
          <mesh key={`${x},${y}`} position={[x as number, y as number, 0.07]} material={regionMaterial("Brass", 4)}>
            <cylinderGeometry args={[0.055, 0.055, 0.03, 12]} />
          </mesh>
        ))}
      </>
    );
  }
  return null;
}

function Chip({ label, onClick, at, tab }: { label: string; onClick: () => void; at: Vec3; tab: number }) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" data-tab={tab} onClick={onClick}>
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
  return <BoardBody at={at} turn={turn} works={state === "works"} kind={kind} label={label} read={read} />;
}

function BoardBody({
  at,
  turn,
  works,
  kind,
  label,
  read,
}: {
  at: Vec3;
  turn: number;
  works: boolean;
  kind: "mac" | "ledger" | "routes";
  label: string;
  read: () => Promise<void>;
}) {
  const region = useRegion();
  if (region === 1)
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
      <group position={at} rotation={[0, turn, 0]} onClick={() => void read()}>
        <mesh position={[0, 1.35, 0]}>
          <boxGeometry args={[1.5, 1.1, 0.1]} />
          <meshStandardMaterial color={works ? "#2f3a3c" : "#4a4f52"} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.12, 0.8, 0.12]} />
          <meshStandardMaterial color={STONE} />
        </mesh>
        <Chip
          label={label}
          onClick={() => void read()}
          at={[0, 2.15, 0]}
          tab={TAB.furniture + (kind === "routes" ? 2 : 1)}
        />
      </group>
    ); // The board's face stays dark and plain (its text opens in a panel); a clouded board is greyer.
  const face = region === 4 && kind === "routes" ? (works ? "#5a5248" : "#6a665f") : works ? "#2a2f33" : "#4a4f52";
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={at} rotation={[0, turn, 0]} onClick={() => void read()}>
      <mesh position={[0, 1.35, -0.02]} material={regionMaterial(FRAME[region], region)}>
        <boxGeometry args={[1.66, 1.26, 0.1]} />
      </mesh>
      <mesh position={[0, 1.35, 0.04]}>
        <boxGeometry args={[1.5, 1.1, 0.04]} />
        <meshStandardMaterial color={face} roughness={0.6} />
      </mesh>
      <Marks region={region} kind={kind} />
      {region === 4 ? (
        <mesh position={[0, 0.4, 0]} material={regionMaterial(STAND[region], region)}>
          <boxGeometry args={[0.5, 0.8, 0.3]} />
        </mesh>
      ) : (
        [-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.4, -0.02]} material={regionMaterial(STAND[region], region)}>
            <boxGeometry args={[0.07, 0.8, 0.07]} />
          </mesh>
        ))
      )}
      <Chip
        label={label}
        onClick={() => void read()}
        at={[0, 2.15, 0]}
        tab={TAB.furniture + (kind === "routes" ? 2 : 1)}
      />
    </group>
  );
}

/** The keeper's desk (0042), where messages wait while the keeper has forgotten its job. */
export function Desk({ device, at }: { device: string; at: Vec3 }) {
  const roomId = useSession((s) => s.roomId);
  const asleep = useSession((s) => !!s.status?.desks[device]);
  const openPanel = useSession((s) => s.openPanel);
  const isDesk = roomId ? roomById(roomId)?.controls.desk === device : false;
  const region = useRegion();
  if (!isDesk) return null;
  // In the Cathedral the desk is a lectern (region-4 brief: the keeper stands at a lectern).
  const lectern = region === 4;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way
    <group position={at} onClick={() => openPanel({ kind: "desk", device })}>
      {region === 1 ? (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1.6, 1.0, 0.6]} />
          <meshStandardMaterial color="#5a4a3a" roughness={0.9} />
        </mesh>
      ) : lectern ? (
        <>
          <mesh position={[0, 0.5, 0]} material={regionMaterial("Sandstone", 4)}>
            <cylinderGeometry args={[0.18, 0.28, 1.0, 8]} />
          </mesh>
          <mesh position={[0, 1.08, 0]} rotation={[-0.35, 0, 0]} material={regionMaterial("Brass", 4)}>
            <boxGeometry args={[0.9, 0.06, 0.6]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.94, 0]} material={regionMaterial(DESK[region], region)}>
            <boxGeometry args={[1.6, 0.1, 0.65]} />
          </mesh>
          {[-0.7, 0.7].map((x) => (
            <mesh key={x} position={[x, 0.45, 0]} material={regionMaterial(DESK[region], region)}>
              <boxGeometry args={[0.12, 0.9, 0.55]} />
            </mesh>
          ))}
          {region === 2 && (
            <mesh position={[0, 0.995, -0.15]} material={regionMaterial("Brass", 2)}>
              <boxGeometry args={[1.5, 0.02, 0.06]} />
            </mesh>
          )}
        </>
      )}
      <Chip
        label={asleep ? `${voice.desk.name} ●` : voice.desk.name}
        onClick={() => openPanel({ kind: "desk", device })}
        at={[0, 1.4, 0]}
        tab={TAB.furniture + 3}
      />
    </group>
  );
}
