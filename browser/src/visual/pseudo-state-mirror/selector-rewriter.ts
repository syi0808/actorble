export function rewritePseudoStateSelector(selectorText: string): string[] {
  const rewritten: string[] = [];

  for (const branch of splitSelectorList(selectorText)) {
    const next = rewriteSelectorBranch(branch.trim());

    if (next) {
      rewritten.push(next);
    }
  }

  return rewritten;
}

export function containsPseudoStateSelector(selectorText: string): boolean {
  return pseudoStateReplacements.some(({ pseudo }) => selectorText.includes(pseudo));
}

function rewriteSelectorBranch(selector: string): string | null {
  if (selector.length === 0) {
    return null;
  }

  let rewritten = '';
  let replaced = false;
  let quote: string | null = null;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];

    if (quote) {
      rewritten += char;

      if (char === '\\') {
        index += 1;
        rewritten += selector[index] ?? '';
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      rewritten += char;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      rewritten += char;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      rewritten += char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      rewritten += char;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      rewritten += char;
      continue;
    }

    if (bracketDepth === 0 && parenDepth === 0) {
      const replacement = replacementAt(selector, index);

      if (replacement) {
        rewritten += `[${replacement.attribute}]`;
        index += replacement.pseudo.length - 1;
        replaced = true;
        continue;
      }
    }

    rewritten += char;
  }

  return replaced ? rewritten : null;
}

function splitSelectorList(selectorText: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let quote: string | null = null;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];

    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
      selectors.push(selectorText.slice(start, index));
      start = index + 1;
    }
  }

  selectors.push(selectorText.slice(start));

  return selectors;
}

function replacementAt(selector: string, index: number): PseudoStateReplacement | null {
  for (const replacement of pseudoStateReplacements) {
    if (
      selector.startsWith(replacement.pseudo, index) &&
      isSelectorTokenBoundary(selector[index + replacement.pseudo.length])
    ) {
      return replacement;
    }
  }

  return null;
}

function isSelectorTokenBoundary(char: string | undefined): boolean {
  return char === undefined || !/[a-zA-Z0-9_-]/.test(char);
}

type PseudoStateReplacement = Readonly<{
  pseudo: string;
  attribute: string;
}>;

const pseudoStateReplacements: readonly PseudoStateReplacement[] = [
  { pseudo: ':focus-visible', attribute: 'data-actorble-focus-visible' },
  { pseudo: ':hover', attribute: 'data-actorble-hover' },
  { pseudo: ':active', attribute: 'data-actorble-active' },
];
