import { regions, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useLoading } from "../render/loading";

/** Over everything while a room loads (render/loading.ts): the region's name, its topic and a bar to 100%. */
export function LoadingScreen() {
  const shown = useLoading((s) => s.shown);
  const progress = useLoading((s) => s.progress);
  const roomId = useLoading((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const region = room ? regions[room.region] : undefined;
  const percent = Math.round(progress * 100);
  return (
    <div className="loading-screen" data-shown={shown ? "yes" : "no"} aria-hidden={!shown}>
      <div className="loading-card" role="status">
        {region && <p className="loading-region">{region.name}</p>}
        {region && <p className="loading-topic">{region.topic}</p>}
        <div
          className="loading-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={voice.loading.label}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="loading-label">
          {voice.loading.label} {percent}%
        </p>
      </div>
    </div>
  );
}
