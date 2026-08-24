import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTORBLE_WORDMARK_LETTER_BOUNDS,
  renderActorbleFaviconSvg,
  renderActorbleLogoSvg,
  renderActorbleWordmarkLightSvg,
  renderActorbleWordmarkSvg,
} from '../src/brand/actorble-symbol.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(scriptDir, '..');
const checkOnly = process.argv.includes('--check');

const outputs = [
  {
    path: resolve(docsRoot, 'src/assets/actorble-logo.svg'),
    svg: renderActorbleLogoSvg(),
  },
  {
    path: resolve(docsRoot, 'src/assets/actorble-wordmark.svg'),
    svg: renderActorbleWordmarkSvg(),
  },
  {
    path: resolve(docsRoot, 'src/assets/actorble-wordmark-light.svg'),
    svg: renderActorbleWordmarkLightSvg(),
  },
  {
    path: resolve(docsRoot, 'public/favicon.svg'),
    svg: renderActorbleFaviconSvg(),
  },
];

let hasMismatch = false;

for (const output of outputs) {
  validateGeneratedSvg(output);

  if (checkOnly) {
    const current = await readFile(output.path, 'utf8').catch(() => '');

    if (current !== output.svg) {
      hasMismatch = true;
      console.error(`Outdated generated asset: ${relativeToDocs(output.path)}`);
    }

    continue;
  }

  await writeFile(output.path, output.svg, 'utf8');
  console.log(`Generated ${relativeToDocs(output.path)}`);
}

if (hasMismatch) {
  console.error('Run `pnpm brand:build` in docs to update generated SVG assets.');
  process.exitCode = 1;
}

function relativeToDocs(path) {
  return path.slice(docsRoot.length + 1);
}

function validateGeneratedSvg(output) {
  if (!output.path.includes('actorble-wordmark')) {
    return;
  }

  const forbiddenPatterns = ['<text', 'font-', 'textLength', 'lengthAdjust'];
  const matchedPattern = forbiddenPatterns.find((pattern) => output.svg.includes(pattern));

  if (matchedPattern) {
    throw new Error(`Generated wordmark must be standalone path SVG; found ${matchedPattern}.`);
  }

  for (const { letter } of ACTORBLE_WORDMARK_LETTER_BOUNDS) {
    if (!output.svg.includes(`actorble-wordmark-letter-${letter}`)) {
      throw new Error(`Generated wordmark is missing class for letter ${letter}.`);
    }
  }

  for (let index = 1; index < ACTORBLE_WORDMARK_LETTER_BOUNDS.length; index += 1) {
    const previous = ACTORBLE_WORDMARK_LETTER_BOUNDS[index - 1];
    const current = ACTORBLE_WORDMARK_LETTER_BOUNDS[index];
    const gap = current.minX - previous.maxX;
    const minimumGap = getMinimumGap(previous, current);

    if (gap < minimumGap) {
      throw new Error(
        `Generated wordmark letter spacing is too tight: ${previous.letter}->${current.letter} gap ${gap}.`,
      );
    }
  }
}

function getMinimumGap(previous, current) {
  if (previous.letter === 'c' && current.letter === 't') {
    return 1;
  }

  return 2;
}
