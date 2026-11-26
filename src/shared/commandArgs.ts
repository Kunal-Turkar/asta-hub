/**
 * Splits a Windows-friendly CLI argument string into an argv array,
 * preserving quoted segments (single or double quotes) without invoking a shell.
 */
export function splitCommandArgs(raw: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let tokenStarted = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && raw[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (tokenStarted) {
        args.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }

    current += ch;
    tokenStarted = true;
  }

  if (tokenStarted) {
    args.push(current);
  }

  return args;
}
