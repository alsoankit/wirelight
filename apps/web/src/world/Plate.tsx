import { Html } from "@react-three/drei";

// A door's plate (CORE-08): its name, its MAC address (from Floor 2) and the link light. Plates are
// HTML so the text stays crisp at every quality tier (principle 11). Filled diamond = link up, hollow
// ring = down. Clicking a plate opens it (UI-03).

type Props = {
  position: [number, number, number];
  name: string;
  mac?: string;
  linkUp: boolean;
  onOpen?: () => void;
};

export function Plate({ position, name, mac, linkUp, onOpen }: Props) {
  const content = (
    <>
      <span className="plate-light" role="img" aria-label={linkUp ? "link up" : "link down"}>
        {linkUp ? "◆" : "◇"}
      </span>
      <span className="plate-name">{name}</span>
      {mac && <span className="plate-mac">{mac}</span>}
    </>
  );
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      {onOpen ? (
        <button type="button" className="plate" data-link={linkUp ? "up" : "down"} onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="plate" data-link={linkUp ? "up" : "down"}>
          {content}
        </div>
      )}
    </Html>
  );
}
