import { useFrame } from "@react-three/fiber";
import { type Dispatch, type SetStateAction, useRef } from "react";
import { useSession } from "../engine/store";
import { ruin } from "../world/ruin";
import { frameTimes } from "./frameTimes";
import { TIERS, type Tier } from "./quality";
import { qualityJudge } from "./qualityJudge";

// Automatic quality (0020): steps down when frames stay slow and back up when they recover; the
// judging is in qualityJudge.ts. ?tier= and a choice in Settings pin the tier (the caller passes
// auto = false). It also times every frame for the play logs (frameTimes.ts).

export function AutoQuality({
  auto,
  setTier,
  ceiling,
}: {
  auto: boolean;
  setTier: Dispatch<SetStateAction<Tier>>;
  /** The best tier the renderer starts on; auto never goes above it. */
  ceiling: Tier;
}) {
  const judge = useRef(qualityJudge());
  const lastRuin = useRef(ruin.value);

  useFrame((_, delta) => {
    // Before the check: the play logs time every frame, whether the tier is automatic or chosen by hand.
    frameTimes.add(delta);
    if (!auto) return;
    const s = useSession.getState();
    const ruinMoving = Math.abs(ruin.value - lastRuin.current) > 1e-4;
    lastRuin.current = ruin.value;
    const step = judge.current(delta, `${s.roomId}:${s.here}`, ruinMoving);
    if (step === "down") setTier((t) => TIERS[Math.min(TIERS.indexOf(t) + 1, TIERS.length - 1)] as Tier);
    else if (step === "up") setTier((t) => TIERS[Math.max(TIERS.indexOf(t) - 1, TIERS.indexOf(ceiling))] as Tier);
  });
  return null;
}
