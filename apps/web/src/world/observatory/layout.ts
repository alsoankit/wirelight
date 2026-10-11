// B0 mock layout of the Observatory (the player's computer room, Region 1), built from the Ruins kit.
// Mock data only: in B1 rooms come from packages/rooms and their layout files.
//
// The room is 8 × 8 m, centred on the origin. The camera looks from the front right, so only the
// back wall (z = −4) and the left wall (x = −4) are built: a cutaway, as in art-direction.md.
// The doorway is a round arch in the back wall at x = 0, leading to the corridor (−z).
//
// It should read as a ruin, not a tiled room: broken wall tops, a collapsed corner where the moon
// gets in, rubble, roots and holes in the floor, and an uneven edge to the floor itself.

export type Placement = {
  piece: string;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
};

const QUARTER = Math.PI / 2;
const TILES = [-3, -1, 1, 3];

// Floor tiles by grid position; a few are broken, dirt or missing so the edge isn't a clean square.
const FLOOR_SPECIAL: Record<string, Placement | null> = {
  "-3,-3": { piece: "Floor_Tree", position: [-3, 0, -3] }, // the dead tree's roots broke through here
  "3,3": null, // the front-right corner has fallen away
  "1,3": { piece: "Floor_Hole_Corner", position: [1, 0, 3], rotationY: QUARTER },
  "3,1": { piece: "Floor_Hole_Straight", position: [3, 0, 1], rotationY: -QUARTER },
  "-1,1": { piece: "Floor_Squares", position: [-1, 0, 1] },
  "1,-1": { piece: "Floor_Squares", position: [1, 0, -1] },
};

function floor(): Placement[] {
  const tiles: Placement[] = [];
  for (const x of TILES) {
    for (const z of TILES) {
      const special = FLOOR_SPECIAL[`${x},${z}`];
      if (special === null) continue;
      tiles.push(special ?? { piece: "Floor_Standard", position: [x, 0, z] });
    }
  }
  return tiles;
}

// Back wall: the overgrown arch is broken at the top; the right end has collapsed down to one row,
// which is where the moonlight comes in.
function backWall(): Placement[] {
  return [
    { piece: "Wall_ArchRound_Overgrown_Broken", position: [0, 0, -4] },
    { piece: "Wall_Overgrown", position: [-3, 0, -4] },
    { piece: "Wall_Broken", position: [-3, 2, -4] },
    { piece: "Wall_Hole", position: [3, 0, -4] },
  ];
}

// Left wall: walls turned a quarter so their inner face looks into the room (+x). It crumbles
// toward the front: full height at the back, broken in the middle, a low stub at the front.
function leftWall(): Placement[] {
  const turn = QUARTER;
  return [
    { piece: "Wall", position: [-4, 0, -3], rotationY: turn },
    { piece: "Window_Bars_Overgrown", position: [-4, 2, -3], rotationY: turn },
    { piece: "Wall_Overgrown", position: [-4, 0, -1], rotationY: turn },
    { piece: "Wall_Broken", position: [-4, 2, -1], rotationY: turn },
    { piece: "Wall", position: [-4, 0, 1], rotationY: turn },
    { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: turn },
  ];
}

function pillars(): Placement[] {
  return [
    { piece: "Column_Round", position: [-4, 0, -4] },
    { piece: "Column_Round_Short", position: [4, 0, -4] }, // a broken pillar where the wall fell
  ];
}

// Fallen stone, roots and growth: the room has been left alone for a very long time.
function ruin(): Placement[] {
  return [
    { piece: "DeadTree_2", position: [-3.1, 0, -3.2], rotationY: 0.6 },
    { piece: "Bricks", position: [3.0, 0, -2.9], rotationY: 0.4 },
    { piece: "Bricks", position: [-3.2, 0, 3.4], rotationY: 2.1 },
    { piece: "Bricks", position: [3.3, 0, 2.4], rotationY: -0.9, scale: 0.8 },
    { piece: "Brick", position: [1.9, 0, 2.2], rotationY: 0.7 },
    { piece: "Brick", position: [2.5, 0, -1.4], rotationY: 2.4 },
    { piece: "Brick", position: [-1.8, 0, 3.1], rotationY: 1.2 },
    { piece: "Brick", position: [-2.6, 0, -0.2], rotationY: 0.3 },
    { piece: "Bush_2x1", position: [-3.5, 0, -1.6] },
    { piece: "Bush_Large", position: [-3.3, 0, 3.0], scale: 0.8 },
    { piece: "Bush_1x1", position: [3.4, 0, -3.4] },
    { piece: "Grass", position: [-3.6, 0, -0.4] },
    { piece: "Grass", position: [1.3, 0, -3.6] },
    { piece: "Grass", position: [-1.3, 0, -3.7] },
    { piece: "Grass", position: [2.7, 0, 1.6] },
    { piece: "Grass", position: [0.6, 0, 2.6] },
    { piece: "Grass", position: [-2.4, 0, 2.2] },
  ];
}

function props(): Placement[] {
  return [
    { piece: "Bookcase_Full", position: [-3.6, 0, 1], rotationY: QUARTER },
    { piece: "Candles_2", position: [-3.3, 0, 2.1] },
    { piece: "Candles_1", position: [1.6, 0, -3.4] },
    { piece: "Torch", position: [-1.9, 2.2, -3.85] },
    { piece: "Pot1", position: [3.3, 0, -0.4] },
    { piece: "Pot2_Broken", position: [2.7, 0, -0.1] },
  ];
}

export const OBSERVATORY: Placement[] = [...floor(), ...backWall(), ...leftWall(), ...pillars(), ...ruin(), ...props()];

// Where things are, for the scene and the message paths.
export const DOORWAY = { x: 0, z: -4 } as const;
export const KEEPER = { position: [0, 0, -0.6] as [number, number, number] } as const;
// The corridor itself isn't built in the room view: beyond the doorway is darkness, and the cable
// runs a little way into it and fades. (Anything built behind the walls shows outside the cutaway.)
export const CORRIDOR_END_Z = -6.5;

// Flames that light the room (candles and the remaining torch).
export const FLAMES: { position: [number, number, number]; colour: string; strength: number }[] = [
  { position: [-3.3, 0.9, 2.1], colour: "#FFC46B", strength: 7 },
  { position: [1.6, 0.9, -3.3], colour: "#FFC46B", strength: 6 },
  { position: [-1.9, 2.9, -3.5], colour: "#FFB35A", strength: 6 },
];
