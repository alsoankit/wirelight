import { Fragment, type ReactNode } from "react";

/** Renders `[[Esc]]` in content text as a key cap. */
export function withKeys(text: string): ReactNode {
  return text.split(/(\[\[[^\]]+\]\])/).map((part, i) => {
    const m = /^\[\[(.+)\]\]$/.exec(part);
    return m ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static split of a fixed string
      <kbd key={i} className="kbd mx-0.5 align-[1px]">
        {m[1]}
      </kbd>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: static split of a fixed string
      <Fragment key={i}>{part}</Fragment>
    );
  });
}
