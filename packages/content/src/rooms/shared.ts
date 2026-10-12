// Text more than one room uses.

export const SEALED = "This room has been sealed for ages. You can watch its door, but you can't go in.";

export const DETECTORS = {
  "not-addressed-to-them": {
    note: "Your message reached their door. They looked at it and decided it wasn't for them. Whose name did you write on it?",
  },
  "own-message-not-messenger": {
    note: "That got through. But your machine's own messenger is still calling the wrong name.",
  },
  "sending-into-a-dark-door": { note: "Your machine didn't even try to send. Look at your own door first." },
  "didnt-read-the-answer": { note: "Someone answered. Did you look at who it was from?" },
};
