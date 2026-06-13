import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  renderActorbleFaviconSvg,
  renderActorbleLogoSvg,
} from '../src/brand/actorble-symbol.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const docsRoot = resolve(scriptDir, '..')
const checkOnly = process.argv.includes('--check')

const outputs = [
  {
    path: resolve(docsRoot, 'src/assets/actorble-logo.svg'),
    svg: renderActorbleLogoSvg(),
  },
  {
    path: resolve(docsRoot, 'public/favicon.svg'),
    svg: renderActorbleFaviconSvg(),
  },
]

let hasMismatch = false

for (const output of outputs) {
  if (checkOnly) {
    const current = await readFile(output.path, 'utf8').catch(() => '')

    if (current !== output.svg) {
      hasMismatch = true
      console.error(`Outdated generated asset: ${relativeToDocs(output.path)}`)
    }

    continue
  }

  await writeFile(output.path, output.svg, 'utf8')
  console.log(`Generated ${relativeToDocs(output.path)}`)
}

if (hasMismatch) {
  console.error('Run `pnpm brand:build` in docs to update generated SVG assets.')
  process.exitCode = 1
}

function relativeToDocs(path) {
  return path.slice(docsRoot.length + 1)
}
