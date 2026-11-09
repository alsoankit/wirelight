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

function CopyValue({ value, label, children }: { value: string; label: string; children?: ReactNode }) {
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
        {copied ? voice.plate.copied : "▢"}
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

export function Plate({ position, name, mac, addrs, streets = false, linkUp, onOpen, tab }: Props) {
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <div className="plate plate-row" data-link={linkUp ? "up" : "down"}>
        {onOpen ? (
          <button type="button" className="plate-open" data-tab={tab} onClick={onOpen}>
            <span className="plate-light" role="img" aria-label={linkUp ? voice.plate.lightUp : voice.plate.lightDown}>
              {linkUp ? "◆" : "◇"}
            </span>
            <span className="plate-name">{name}</span>
          </button>
        ) : (
          <span className="plate-open" data-tab={tab}>
            <span className="plate-light" role="img" aria-label={linkUp ? voice.plate.lightUp : voice.plate.lightDown}>
              {linkUp ? "◆" : "◇"}
            </span>
            <span className="plate-name">{name}</span>
          </span>
        )}
        <CopyValue value={name} label={`${name}'s name`} />
        {mac && <CopyValue value={mac} label={`${name}'s MAC`} />}
        {addrs?.map((address) => (
          <CopyValue key={address} value={address} label={`${name}'s address`}>
            <Address cidr={address} streets={streets} />
          </CopyValue>
        ))}
      </div>
    </Html>
  );
}
