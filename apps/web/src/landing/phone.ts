// A phone or a tablet without a keyboard: Wirelight needs typing and a bigger screen, so the landing
// says so instead of letting them in. A touch screen with a mouse or trackpad attached plays.

export function onPhone(): boolean {
  const touchOnly = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
  const small = Math.min(window.screen.width, window.screen.height) < 600;
  return touchOnly || small;
}
