/** The messenger's pings (a house address on its card, from Floor 5): their answers, heard. */
import { deviceOf, type Kernel } from "./kernel";
import type { DeviceId, Ip } from "./types";

/** An echo reply reached `device`: if one of its messengers sent the request, the trace says so. */
export function messengerHears(
  k: Kernel,
  device: DeviceId,
  e: { from: Ip; id: number; seq: number; frameId: number | null },
): void {
  const d = deviceOf(k, device);
  const index = d?.messengers.findIndex((m) => m.echoId === e.id && e.seq >= 1 && e.seq <= m.seq) ?? -1;
  if (index < 0) return;
  k.emit({ kind: "echo.heard", t: k.s.t, device, messenger: index + 1, from: e.from, seq: e.seq, frameId: e.frameId });
}
