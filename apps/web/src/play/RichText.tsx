import { Fragment, type ReactNode } from "react";

// Player text in the content is plain strings with three light marks (voice.md): `code` for what a
// machine says or what you type, *italics* for a word being named (the *to*, the *from*), and
// [[Esc]] for a key to press. This shows them as code, emphasis and key caps, never as raw marks.

/** One piece of a line: plain text, or text in one of the marks. */
type Piece = { kind: "text" | "code" | "em" | "kbd"; text: string };

// Code first (an asterisk inside code is code), then keys, then italics. An italic needs a
// non-space just inside each star, so "2 * 3" or a lone "*" stays as it is.
const MARKS = /`([^`]+)`|\[\[(.+?)\]\]|\*(?=\S)([^*]*?\S)\*/g;

/** Splits a line into its pieces (exported for tests). */
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKS)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "kbd", text: m[2] });
    else out.push({ kind: "em", text: m[3] ?? "" });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The text without its marks (for aria-labels and anything that can't hold elements). */
export function plain(text: string): string {
  return pieces(text)
    .map((p) => p.text)
    .join("");
}

/** A line of player text with its marks shown: `code`, *italics*, [[key]]. */
export function RichText({ text }: { text: string | undefined | null }): ReactNode {
  if (!text) return null;
  return (
    <>
      {pieces(text).map((p, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one fixed line, in order
        if (p.kind === "code") return <code key={i}>{p.text}</code>;
        // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one fixed line, in order
        if (p.kind === "em") return <em key={i}>{p.text}</em>;
        // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one fixed line, in order
        if (p.kind === "kbd") return <kbd key={i}>{p.text}</kbd>;
        // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one fixed line, in order
        return <Fragment key={i}>{p.text}</Fragment>;
      })}
    </>
  );
}
