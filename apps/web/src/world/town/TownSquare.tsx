import { Html } from "@react-three/drei";
import { fill, town } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../../engine/store";
import { TAB } from "../../play/keys";
import { RichText } from "../../play/RichText";
import { HALL_SLOTS } from "../hall/layout";
import { regionMaterial } from "../kit/regionMaterials";
import { Address } from "../Plate";
import { doorGeometry, type Vec3 } from "../room/layout";
import {
  answered,
  census,
  doorOrder,
  type House,
  houseNumber,
  register,
  squareOf,
  squareStreet,
  streetStart,
} from "./street";

// The Lantern Town's readable things, in the square (Region 3; floors/floor-5.md, floor-7.md):
// - the Lamplighter's register on its board: every house on the street and its own address (5.1 on);
// - the street sign on the corner post: which street this is (Floor 7 on, when streets are taught);
// - the census board (7.B): the houses that must answer, a lamp for each lit as it answers;
// - each house's number on the balustrade above its door.
// Made in code, warm wood, brass and paper, and lit so they're among the brightest things in the
// square. A click opens a small card in the world; every value comes from the room (street.ts).

/** Rooms with a census on the square. */
const CENSUS_ROOMS = new Set(["f7.boss-census"]);

const PAPER = "#efe3c4";
const PAPER_GLOW = "#4a3c22";
const INK = "#5b4a36";
const LAMP_LIT = "#FFCB70";

/**
 * The street sign: a signpost in the corner where the two rows of houses meet (low enough that its
 * street reads clear of the plates above the doors). After the census a narrow door opens behind it.
 */
export const STREET_SIGN_AT: Vec3 = [-2.9, 0, -2.9];
const SIGN_HEIGHT = 1.45;

type Open = "register" | "sign" | "census" | null;

function Card({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  return (
    <div className="town-card" role="dialog" aria-label={title} ref={ref}>
      <h3>{title}</h3>
      {children}
      <div className="panel-actions">
        <button type="button" onClick={onClose}>
          {town.close}
        </button>
      </div>
    </div>
  );
}

/** A board of paper on two posts, framed in timber, with ruled lines (one per entry). */
function NoticeBoard({ at, turn, lines, onClick }: { at: Vec3; turn: number; lines: number; onClick: () => void }) {
  const timber = regionMaterial("Timber", 3);
  const iron = regionMaterial("Iron", 3);
  const rows = Math.max(3, lines);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); its chip is the keyboard way
    <group position={at} rotation={[0, turn, 0]} onClick={onClick}>
      <mesh position={[0, 1.45, -0.03]} material={timber}>
        <boxGeometry args={[1.3, 1.0, 0.08]} />
      </mesh>
      <mesh position={[0, 1.45, 0.02]}>
        <boxGeometry args={[1.14, 0.84, 0.02]} />
        <meshStandardMaterial color={PAPER} emissive={PAPER_GLOW} roughness={0.95} />
      </mesh>
      {Array.from({ length: rows }, (_, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed ruled lines
          key={i}
          position={[-0.05 + (i % 2) * 0.04, 1.73 - (i * 0.6) / rows, 0.035]}
        >
          <boxGeometry args={[0.86 - (i % 3) * 0.12, 0.022, 0.004]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      ))}
      {/* A little roof over the board keeps the rain off. */}
      <mesh position={[0, 2.02, 0.04]} rotation={[0.35, 0, 0]} material={timber}>
        <boxGeometry args={[1.42, 0.05, 0.3]} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.98, -0.05]} material={timber}>
          <boxGeometry args={[0.09, 1.96, 0.09]} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, -0.05]} material={iron}>
        <boxGeometry args={[1.4, 0.06, 0.2]} />
      </mesh>
    </group>
  );
}

function Chip({ at, label, tab, onClick }: { at: Vec3; label: string; tab: number; onClick: () => void }) {
  return (
    <Html center position={at} zIndexRange={[10, 0]}>
      <button type="button" className="world-chip" data-tone="town" data-tab={tab} onClick={onClick}>
        {label}
      </button>
    </Html>
  );
}

function RegisterCard({ houses, streets, onClose }: { houses: House[]; streets: boolean; onClose: () => void }) {
  return (
    <Card title={town.register.title} onClose={onClose}>
      <p className="panel-note">{town.register.about}</p>
      <table className="town-table">
        <thead>
          <tr>
            <th>{town.register.house}</th>
            <th>{town.register.address}</th>
          </tr>
        </thead>
        <tbody>
          {houses.map((h) => (
            <tr key={h.id} aria-label={fill(town.register.row, { name: h.id, address: h.address })}>
              <td>{h.id}</td>
              <td>
                {streets ? (
                  <Address cidr={`${h.address}/${h.prefix}`} streets />
                ) : (
                  <span className="plate-addr">{h.address}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** The census board: a lamp for each house on the census, lit once it has answered your ping. */
function CensusBoard({
  room,
  houses,
  open,
  setOpen,
}: {
  room: RoomDef;
  houses: House[];
  open: boolean;
  setOpen: (o: Open) => void;
}) {
  const events = useSession((s) => s.events);
  const heard = useMemo(() => {
    const me = room.playerDevice;
    const macs = new Set(room.topology.devices.find((d) => d.id === me)?.interfaces.map((i) => i.mac));
    return answered(events, me, macs, houses);
  }, [events, room, houses]);
  const at: Vec3 = [-1.7, 0, 2.5];
  const turn = 0.75;
  const timber = regionMaterial("Timber", 3);
  const brass = regionMaterial("Brass", 3);
  const count = fill(town.census.count, { n: String(heard.size), all: String(houses.length) });
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); its chip is the keyboard way */}
      <group position={at} rotation={[0, turn, 0]} onClick={() => setOpen("census")}>
        {/* An easel: two legs and a prop behind, the board leaning on them. */}
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x, 0.9, 0.06]} rotation={[-0.12, 0, 0]} material={timber}>
            <boxGeometry args={[0.08, 1.85, 0.08]} />
          </mesh>
        ))}
        <mesh position={[0, 0.85, -0.3]} rotation={[0.3, 0, 0]} material={timber}>
          <boxGeometry args={[0.07, 1.75, 0.07]} />
        </mesh>
        <group position={[0, 1.3, 0]} rotation={[-0.12, 0, 0]}>
          <mesh position={[0, 0, -0.02]} material={timber}>
            <boxGeometry args={[1.25, 1.05, 0.06]} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[1.1, 0.9, 0.02]} />
            <meshStandardMaterial color={PAPER} emissive={PAPER_GLOW} roughness={0.95} />
          </mesh>
          {houses.map((h, i) => {
            const y = 0.32 - (i * 0.64) / Math.max(1, houses.length - 1);
            const lit = heard.has(h.id);
            return (
              <group key={h.id} position={[0, y, 0.04]}>
                {/* The house's line on the board, and its lamp at the end. */}
                <mesh position={[-0.12, 0, 0]}>
                  <boxGeometry args={[0.62, 0.03, 0.004]} />
                  <meshBasicMaterial color={INK} />
                </mesh>
                <mesh position={[0.36, 0, 0.02]} material={brass}>
                  <boxGeometry args={[0.13, 0.13, 0.03]} />
                </mesh>
                <mesh position={[0.36, 0, 0.045]}>
                  <boxGeometry args={[0.08, 0.08, 0.02]} />
                  <meshStandardMaterial
                    color={lit ? LAMP_LIT : "#3a3630"}
                    emissive={lit ? LAMP_LIT : "#000000"}
                    emissiveIntensity={lit ? 1.1 : 0}
                    toneMapped={!lit}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      </group>
      <Chip
        at={[at[0], 2.25, at[2]]}
        label={`${town.census.name} · ${count}`}
        tab={TAB.furniture + 6}
        onClick={() => setOpen("census")}
      />
      {open && (
        <Html position={[at[0], 1.6, at[2]]} zIndexRange={[20, 10]}>
          <Card title={town.census.title} onClose={() => setOpen(null)}>
            <p className="panel-note">{town.census.about}</p>
            <table className="town-table">
              <tbody>
                {houses.map((h) => {
                  const lit = heard.has(h.id);
                  const state = lit ? town.census.answered : town.census.waiting;
                  return (
                    <tr
                      key={h.id}
                      data-answered={lit ? "yes" : "no"}
                      aria-label={fill(town.census.row, { name: h.id, address: h.address, state })}
                    >
                      <td>{h.id}</td>
                      <td>
                        <Address cidr={`${h.address}/${h.prefix}`} streets />
                      </td>
                      <td className="town-state">{lit ? `● ${state}` : `○ ${state}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="panel-note">{count}</p>
          </Card>
        </Html>
      )}
    </>
  );
}

/** The street sign: a plank on the corner post, its street painted on it (crisp text, as the brief asks). */
function StreetSign({ street, open, setOpen }: { street: string; open: boolean; setOpen: (o: Open) => void }) {
  const timber = regionMaterial("Timber", 3);
  const iron = regionMaterial("Iron", 3);
  const [x, y, z] = STREET_SIGN_AT;
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); its label is the keyboard way */}
      <group position={[x, y, z]} rotation={[0, Math.PI / 4, 0]} onClick={() => setOpen("sign")}>
        <mesh position={[0, 0.88, -0.06]} material={timber}>
          <boxGeometry args={[0.09, 1.76, 0.09]} />
        </mesh>
        <mesh position={[0, 0.03, -0.06]} material={iron}>
          <boxGeometry args={[0.24, 0.06, 0.24]} />
        </mesh>
        <mesh position={[0, SIGN_HEIGHT, 0.0]} material={timber}>
          <boxGeometry args={[1.05, 0.3, 0.05]} />
        </mesh>
        {[-0.4, 0.4].map((dx) => (
          <mesh key={dx} position={[dx, SIGN_HEIGHT, 0.03]} material={iron}>
            <boxGeometry args={[0.03, 0.03, 0.02]} />
          </mesh>
        ))}
      </group>
      <Html center position={[x + 0.05, y + SIGN_HEIGHT, z + 0.05]} zIndexRange={[10, 0]}>
        <button
          type="button"
          className="town-sign"
          data-tab={TAB.furniture + 4}
          aria-label={fill(town.streetSign.aria, { street })}
          onClick={() => setOpen("sign")}
        >
          {street}
        </button>
      </Html>
      {open && (
        <Html position={[x + 0.5, y + 1.2, z + 0.5]} zIndexRange={[20, 10]}>
          <Card title={town.streetSign.title} onClose={() => setOpen(null)}>
            <p>
              <RichText text={fill(town.streetSign.street, { street: `\`${street}\`` })} />
            </p>
            {street.endsWith("/24") && (
              <p className="panel-note">
                <RichText text={fill(town.streetSign.about, { start: streetStart(street) })} />
              </p>
            )}
          </Card>
        </Html>
      )}
    </>
  );
}

/** Each house's number on the balustrade, above its door in the square. */
function HouseNumbers({ room, square }: { room: RoomDef; square: string }) {
  const order = useMemo(() => [...doorOrder(room, square).entries()], [room, square]);
  return (
    <>
      {order.map(([device, i]) => {
        const n = houseNumber(room, device);
        const slot = HALL_SLOTS[i];
        if (!n || !slot) return null;
        const g = doorGeometry(slot);
        const at: Vec3 = slot.wall === "back" ? [g.doorway[0], 3.32, -3.9] : [-3.9, 3.32, g.doorway[2]];
        return (
          <Html key={device} center position={at} zIndexRange={[5, 0]}>
            <span className="town-number" role="img" aria-label={fill(town.houseNumber, { name: device, n })}>
              {n}
            </span>
          </Html>
        );
      })}
    </>
  );
}

/** The square's readable things, for the square's own room in the Lantern Town. */
export function TownSquare({ device }: { device: string }) {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const [open, setOpen] = useState<Open>(null);
  const houses = useMemo(() => (room ? register(room) : []), [room]);
  const street = useMemo(() => (room ? squareStreet(room) : undefined), [room]);
  const censusHouses = useMemo(() => (room && CENSUS_ROOMS.has(room.id) ? census(room) : []), [room]);
  if (room?.region !== 3 || room.floor < 5 || houses.length === 0 || squareOf(room) !== device) return null;
  const streets = room.floor >= 7;
  const registerAt: Vec3 = [3.1, 0, -0.3];
  return (
    <>
      <NoticeBoard at={registerAt} turn={0.35} lines={houses.length} onClick={() => setOpen("register")} />
      {/* Its own lamp, so the paper reads from across the square. */}
      <pointLight position={[2.5, 2.3, 0.4]} color={LAMP_LIT} intensity={1.6} distance={3.5} decay={2} />
      <Chip
        at={[registerAt[0], 2.45, registerAt[2]]}
        label={town.register.name}
        tab={TAB.furniture + 5}
        onClick={() => setOpen("register")}
      />
      {open === "register" && (
        <Html position={[registerAt[0] - 0.5, 1.6, registerAt[2] + 0.5]} zIndexRange={[20, 10]}>
          <RegisterCard houses={houses} streets={streets} onClose={() => setOpen(null)} />
        </Html>
      )}
      {streets && street && <StreetSign street={street} open={open === "sign"} setOpen={setOpen} />}
      {censusHouses.length > 0 && (
        <CensusBoard room={room} houses={censusHouses} open={open === "census"} setOpen={setOpen} />
      )}
      <HouseNumbers room={room} square={device} />
    </>
  );
}
