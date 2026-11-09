// Text more than one room uses.

export const SEALED = "You can't enter this machine. You can still watch its door and send it messages.";

export const DETECTORS = {
  "not-addressed-to-them": {
    note: "Your message reached their door. They looked at it and decided it wasn't for them. Whose name did you write on it?",
  },
  "own-message-not-repeat": {
    note: "That got through. But your repeating frame is still going to the wrong name.",
  },
  "sending-into-a-dark-door": { note: "Your machine didn't even try to send. Look at your own door first." },
  "didnt-read-the-answer": { note: "Someone answered. Did you look at who it was from?" },
};
