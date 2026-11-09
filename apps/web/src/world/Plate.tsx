import { Html } from "@react-three/drei";
import { voice } from "@wirelight/content";
import { type MouseEvent, type ReactNode, useState } from "react";
import { streetColour } from "../play/names";
import { copyPlateValue } from "./plateCopy";

// A plate's values can be copied without activating its separate open action.
type Props = {
  position: [number, number, number];
  name: string;
  mac?: string;
  addrs?: string[];
  streets?: boolean;
  linkUp: boolean;
  onOpen?: () => void;
  tab?: number;
};

/** Two overlapping sheets: the usual "copy" mark, drawn in the text colour. */
function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.5 10.5h-.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function CopyValue({ value, label, children }: { value: string; label: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await copyPlateValue(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span className="plate-value">
      {children ?? value}
      <button
        type="button"
        className="plate-copy"
        aria-label={voice.plate.copy.replace("{value}", label)}
        onClick={copy}
      >
        {copied ? <span className="plate-copied">{voice.plate.copied}</span> : <CopyIcon />}
      </button>
    </span>
  );
}

/** `10.0.0.7/24` with its street and house number told apart. */
export function Address({ cidr, streets }: { cidr: string; streets: boolean }) {
  const [ip = "", prefix = "32"] = cidr.split("/");
  if (!streets) return <span>{cidr}</span>;
  const octets = ip.split(".");
  const street = Math.min(4, Math.floor(Number(prefix) / 8));
  return (
    <span>
      <span className="street" style={{ color: streetColour(octets.slice(0, street).join(".")) }}>
        {octets.slice(0, street).join(".")}
      </span>
      {street < 4 && (
        <>
          .<span className="house">{octets.slice(street).join(".")}</span>
        </>
      )}
      <span className="prefix">/{prefix}</span>
    </span>
  );
}

// The plate on the wall shows only the door's name (the owner, 2026-11-10); its MAC and addresses,
// each with a copy button, are in the panel that opens when it's clicked (PlatePanel).
export function Plate({ position, name, linkUp, onOpen, tab }: Props) {
  const light = (
    <span className="plate-light" role="img" aria-label={linkUp ? voice.plate.lightUp : voice.plate.lightDown}>
      {linkUp ? "◆" : "◇"}
    </span>
  );
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <div className="plate plate-row" data-link={linkUp ? "up" : "down"}>
        {onOpen ? (
          <button type="button" className="plate-open" data-tab={tab} onClick={onOpen}>
            {light}
            <span className="plate-name">{name}</span>
          </button>
        ) : (
          <span className="plate-open" data-tab={tab}>
            {light}
            <span className="plate-name">{name}</span>
          </span>
        )}
      </div>
    </Html>
  );
}
