/**
 * Plain meanings for the fields of a caught frame (FR-PKT-10), and the sealed-layer text (FR-PKT-11).
 * Names are the real field names; meanings never name an idea before its room (P-9).
 */
export const fields = {
  frame: {
    title: "Frame",
    to: {
      name: "Destination",
      meaning: "Who this frame is for: the address of the door that should take it in. All f's means everyone.",
    },
    from: { name: "Source", meaning: "Who sent it: the address of the door it left through." },
    type: { name: "EtherType", meaning: "What kind of thing is inside. 0x88b5 means a Wirelight lab message." },
    length: { name: "Length", meaning: "How many bytes the whole frame is. Short frames are padded out to 60." },
  },
  lab: {
    title: "Message",
    text: { name: "Text", meaning: "The message itself." },
  },
  sealed: {
    title: "Sealed",
    text: "There's more in here. You'll learn to open it later.",
  },
  jar: {
    title: "Capture jar",
    empty: "Nothing caught yet. Click a message as it passes to catch a copy.",
    hint: "Catches stay here while you're in this room, even after a reset.",
    open: "Open",
    back: "Back to the jar",
  },
  card: {
    title: "The address card",
    about: "The Knight's messenger sends to whatever address is written here, every few seconds.",
    to: "Sends to",
    every: "Every",
    message: "Message",
    newTo: "New address",
    write: "Write it on the card",
    runs: "runs in the console:",
  },
};

export const ETHERTYPE_NAMES: Record<number, string> = {
  34997: "lab message",
  2048: "sealed",
};
