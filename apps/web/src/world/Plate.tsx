import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";

// A door's plate (CORE-08): its name, its MAC address (from Floor 2) and the link light. Plates are
// HTML so the text stays crisp at every quality tier (principle 11). Filled diamond = link up, hollow
// ring = down. Clicking a plate opens it (UI-03).

type Props = {
  position: [number, number, number];
  name: string;
  mac?: string;
  /** Its house addresses (Floor 5 on, CORE-08), as `10.0.1.7/24`. */
  addrs?: string[];
  /** Show the street part apart from the house number (Floor 7 on, CORE-09). */
  streets?: boolean;
  linkUp: boolean;
  onOpen?: () => void;
  /** Its place in the room's Tab order (UI-18). */
  tab?: number;
};

/** `10.0.1.7/24` with the street (the prefix's whole numbers) and the house number told apart. */
export function Address({ cidr, streets }: { cidr: string; streets: boolean }) {
  const [ip = "", prefix = "32"] = cidr.split("/");
  if (!streets) return <span className="plate-addr">{ip}</span>;
  const octets = ip.split(".");
  const street = Math.min(4, Math.floor(Number(prefix) / 8));
  return (
    <span className="plate-addr">
      <span className="street">{octets.slice(0, street).join(".")}</span>
      {street < 4 && (
        <>
          .<span className="house">{octets.slice(street).join(".")}</span>
        </>
      )}
      <span className="prefix">/{prefix}</span>
    </span>
  );
}

export function Plate({ position, name, mac, addrs, streets = false, linkUp, onOpen, tab }: Props) {
  const content = (
    <>
      <span className="plate-light" role="img" aria-label={linkUp ? voice.plate.lightUp : voice.plate.lightDown}>
        {linkUp ? "◆" : "◇"}
      </span>
      <span className="plate-name">{name}</span>
      {mac && <span className="plate-mac">{mac}</span>}
      {addrs?.map((a) => (
        <Address key={a} cidr={a} streets={streets} />
      ))}
    </>
  );
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      {onOpen ? (
        <button type="button" className="plate" data-link={linkUp ? "up" : "down"} data-tab={tab} onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="plate" data-link={linkUp ? "up" : "down"} data-tab={tab}>
          {content}
        </div>
      )}
    </Html>
  );
}
