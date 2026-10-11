import { Html } from "@react-three/drei";

// A door's plate (CORE-08): its name, its MAC address and the link light. Plates are HTML so the
// text stays crisp at every quality tier (principle 11). Filled diamond = link up, hollow ring = down.

type Props = { position: [number, number, number]; name: string; mac?: string; linkUp: boolean };

export function Plate({ position, name, mac, linkUp }: Props) {
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <div className="plate" data-link={linkUp ? "up" : "down"}>
        <span className="plate-light" role="img" aria-label={linkUp ? "link up" : "link down"}>
          {linkUp ? "◆" : "◇"}
        </span>
        <span className="plate-name">{name}</span>
        {mac && <span className="plate-mac">{mac}</span>}
      </div>
    </Html>
  );
}
