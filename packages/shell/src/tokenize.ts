/** Splits a command line into pipeline stages of words, with bash-like quoting. */
export type Tokenized = { ok: true; stages: string[][] } | { ok: false; error: string };

export function tokenize(line: string): Tokenized {
  const stages: string[][] = [[]];
  let word = "";
  let inWord = false;
  let quote: '"' | "'" | null = null;
  const push = () => {
    if (inWord) stages[stages.length - 1]?.push(word);
    word = "";
    inWord = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && (line[i + 1] === '"' || line[i + 1] === "\\")) word += line[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < line.length) {
      word += line[++i];
      inWord = true;
    } else if (c === "|") {
      push();
      stages.push([]);
    } else if (c === " " || c === "\t") {
      push();
    } else {
      word += c;
      inWord = true;
    }
  }
  if (quote) return { ok: false, error: `bash: unexpected EOF while looking for matching \`${quote}'` };
  push();
  return { ok: true, stages };
}
