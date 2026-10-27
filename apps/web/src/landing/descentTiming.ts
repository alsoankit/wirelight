// How long the way in takes (ONB-05, ONB-07; since 0088 an approach through the gate, still called the
// descent here and in App.tsx), apart from its path (approach.ts, which needs three.js): the landing's
// first chunk reads these without loading three.

export const DESCENT_SECONDS = { full: 2.8, quick: 0.9, faster: 3 }; // `faster`: speed-up on click or key

/** If the approach hasn't arrived this long after its planned end, the game opens anyway (slow GPUs). */
export const DESCENT_GRACE_MS = 2500;
