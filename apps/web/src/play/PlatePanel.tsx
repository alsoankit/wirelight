import { fill, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { useSession } from "../engine/store";
import { Address } from "../world/Plate";

// A door's plate, opened (UI-03): its name, its MAC address (Floor 2 on), whether its link works, and
// the controls the room gives it (0040): the door's switch, working or worn out, and pulling its cable.
// Acting closes the panel so the player watches what happens (UI-04); Esc closes it (UI-05).

export function PlatePanel() {
  const panel = useSession((s) => s.panel);
  const roomId = useSession((s) => s.roomId);
  const door = useSession((s) =>
    s.panel?.kind === "plate" ? s.status?.doors[`${s.panel.device}:${s.panel.iface}`] : undefined,
  );
  const end = useSession((s) =>
    s.panel?.kind === "plate" ? s.status?.cableEnds[`${s.panel.device}:${s.panel.iface}`] : undefined,
  );
  const exec = useSession((s) => s.exec);
  const touch = useSession((s) => s.touch);
  const close = useSession((s) => s.closePanel);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const room = roomId ? roomById(roomId) : undefined;
  if (panel?.kind !== "plate" || !room || !door) return null;
  const key = `${panel.device}:${panel.iface}`;
  const sw = room.controls.plateSwitches?.[key];
  const cable = room.controls.cableEnds?.[key];
  const slot = room.controls.addressSlots?.[key];
  const act = (line: string) => {
    close();
    void exec(panel.device, line, "click");
  };

  return (
    <section className="panel" aria-label={fill(voice.plate.title, { door: panel.iface })}>
      <h2>{fill(voice.plate.title, { door: panel.iface })}</h2>
      <p className="panel-plate" data-link={door.up ? "up" : "down"}>
        <span className="plate-light">{door.up ? "◆" : "◇"}</span> {panel.iface}
        {room.floor !== 1 && <span className="plate-mac"> {door.mac}</span>}
      </p>
      <p>{door.up ? voice.plate.linkUp : voice.plate.linkDown}</p>
      {room.floor >= 5 && (
        <div className="field">
          <span>{voice.plate.address}</span>
          {door.addrs.length === 0 && <span className="panel-note">{voice.plate.noAddress}</span>}
          {door.addrs.map((a) => (
            <div key={a} className="addr-row">
              <Address cidr={a} streets={room.floor >= 7} />
              {slot === "works" && (
                <button
                  type="button"
                  className="link inline"
                  onClick={() => act(`ip addr del ${a} dev ${panel.iface}`)}
                >
                  {voice.plate.removeAddress}
                </button>
              )}
            </div>
          ))}
          {slot === "works" && (
            <form
              className="addr-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) act(`ip addr add ${draft.trim()} dev ${panel.iface}`);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="10.0.1.5/24"
                spellCheck={false}
              />
              <button type="submit">{voice.plate.addAddress}</button>
            </form>
          )}
          {slot === "broken" && <span className="panel-note">{voice.plate.slotBroken}</span>}
        </div>
      )}
      <div className="panel-actions">
        {sw === "works" && (
          <button type="button" onClick={() => act(`ip link set ${panel.iface} ${door.adminUp ? "down" : "up"}`)}>
            {door.adminUp ? voice.plate.switchOff : voice.plate.switchOn}
          </button>
        )}
        {sw === "broken" && (
          // A worn-out switch (0040): it rattles and nothing moves; the room notices the touch.
          <button type="button" className="broken" onClick={() => void touch(panel.device, `switch:${panel.iface}`)}>
            {voice.plate.switchBroken}
          </button>
        )}
        {cable === "works" && end === "in" && (
          <button type="button" onClick={() => act(`lab cable unplug ${panel.iface}`)}>
            {voice.plate.unplug}
          </button>
        )}
        <button type="button" className="quiet" onClick={close}>
          {voice.plate.close}
        </button>
      </div>
    </section>
  );
}
