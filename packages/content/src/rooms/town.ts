/**
 * The Lantern Town's readable things (Region 3; floors/floor-5.md and floor-7.md): the Lamplighter's
 * register on the square's wall, the street sign, the census board, and the numbers on the houses'
 * doors. The world fills in names and addresses from the room's topology (never written here).
 * Also the secret rooms' doors in every region (decision 0065), found once a floor's boss is cleared.
 */
export const town = {
  register: {
    /** The label on the register board in the square. */
    name: "Register",
    title: "The Lamplighter's register",
    about: "Every house on the street, and its address.",
    house: "House",
    address: "Address",
    /** A row's spoken form. */
    row: "{name} lives at {address}",
  },
  streetSign: {
    name: "Street sign",
    title: "Street sign",
    /** The street, e.g. `10.0.1.0/24`. */
    street: "This street: {street}",
    /** Floors 7 on: the first numbers are the street. {start} is e.g. `10.0.1.` */
    about: "Every house on this street has an address that starts `{start}`, then its house number.",
    aria: "Street sign: {street}",
  },
  census: {
    name: "Census board",
    title: "The census",
    about: "Every house on the board must answer a ping from your house.",
    answered: "answered",
    waiting: "not yet",
    /** How many have answered, e.g. "3 of 5 answered". */
    count: "{n} of {all} answered",
    row: "{name}, {address}: {state}",
  },
  /** The number on a house's front door (its house number). */
  houseNumber: "{name}'s house, number {n}",
  /** A house's own name plaque inside its room. */
  plaque: "{name}'s house",
  close: "Close",
} as const;

/** The secret rooms' doors (decision 0065): what the player sees once the floor's boss is cleared. */
export const secretDoors = {
  /** Region 1, 2.2's corridor: a moss-covered plate, and a narrow door in the corridor wall. */
  "f2.secret-48-bits": {
    label: "A narrow door",
    note: "Under the moss, a little plate: someone kept a door here, out of the way.",
  },
  /** Region 2, 4.B: where span-2 used to run. */
  "f4.secret-peacekeeper": {
    label: "A small door",
    note: "Where the spare cable ran, a small door has opened in the wall.",
  },
  /** Region 3, the square after the census: behind the street sign. */
  "f7.secret-binary": {
    label: "A narrow door",
    note: "Behind the street sign, a narrow door stands open.",
  },
  /** Region 4, after the finale: at the foot of the spire. */
  "f9.secret-home-router": {
    label: "A small door",
    note: "At the foot of the spire, a small door hums with blinking lights.",
  },
  /** The button that goes through. */
  enter: "Go through",
  aria: "{label}: {note} Go through to {title}.",
} as const;
