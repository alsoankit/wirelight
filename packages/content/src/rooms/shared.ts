// Text more than one room uses.

export const SEALED = "You can't enter this machine. You can still watch its door and send it messages.";

export const DETECTORS = {
  "not-addressed-to-them": {
    note: "Your frame reached their door, but its To wasn't their MAC address, so they ignored it. Check the name you wrote in To.",
  },
  "own-message-not-repeat": {
    note: "That got through. But your repeating frame is still going to the wrong name.",
  },
  "sending-into-a-dark-door": {
    note: "Your machine didn't send anything, because your own door is down. Check your door first.",
  },
  "didnt-read-the-answer": {
    note: "Someone answered. Open the answer and read its From: that's the door that sent it.",
  },
};
