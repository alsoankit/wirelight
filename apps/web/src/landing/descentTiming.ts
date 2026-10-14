// How long the descent takes (ONB-05, ONB-07), apart from its path (descent.ts, which needs three.js):
// the landing's first chunk reads these without loading three.

export const DESCENT_SECONDS = { full: 2.8, quick: 0.9, faster: 3 }; // `faster`: speed-up on click or key

/** If the descent hasn't arrived this long after its planned end, the game opens anyway (slow GPUs). */
export const DESCENT_GRACE_MS = 2500;
