import { commandMemories, voice } from "@wirelight/content";
import { rooms } from "@wirelight/rooms";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { remindersFor } from "./reminders";

// Beside the terminal: the commands learned in earlier rooms that haven't stuck yet (0109). New ones
// show every form with its meaning; once typed in a later room, the forms alone; after a few rooms,
// nothing (the Command book keeps them all).

const ORDER = rooms.map((r) => r.id);
const BOOK = Object.values(commandMemories);
const FORMS_FULL = 3;
const FORMS_SHORT = 2;

export function CommandReminders() {
  const roomId = useSession((s) => s.roomId);
  const uses = useProgress((s) => s.commandUses);
  if (!roomId) return null;
  const list = remindersFor(roomId, ORDER, BOOK, uses);
  if (list.length === 0) return null;
  return (
    <aside className="console-remind" aria-label={voice.reminders.title}>
      <h3>{voice.reminders.title}</h3>
      <ul>
        {list.map((r) => {
          const entry = BOOK.find((c) => c.command === r.command);
          if (!entry) return null;
          const forms = entry.forms.slice(0, r.level === "full" ? FORMS_FULL : FORMS_SHORT);
          return (
            <li key={r.command}>
              {forms.map((f) => (
                <div key={f.line} className="console-remind-form">
                  <code>{f.line}</code>
                  {r.level === "full" && <span>{f.meaning}</span>}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="console-remind-note">{voice.reminders.note}</p>
    </aside>
  );
}
