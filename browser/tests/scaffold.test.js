import { describe, expect, it } from 'vitest'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

const componentDirectories = [
  'src/actorble-facade',
  'src/scenario-runner',
  'src/action-orchestrator',
  'src/target-resolver',
  'src/surface-engine',
  'src/geometry-engine',
  'src/interactability-engine',
  'src/gesture-engine',
  'src/pointer-engine',
  'src/pointer-signals',
  'src/interaction-state-store',
  'src/focus-engine',
  'src/keyboard-engine',
  'src/text-input-engine',
  'src/timeline-engine',
  'src/wait-observation-engine',
  'src/platform-adapter',
  'src/platform-adapter/dom-adapter',
  'src/platform-adapter/event-dispatcher',
  'src/platform-adapter/state-applier',
  'src/platform-adapter/style-adapter',
  'src/pseudo-state-mirror',
  'src/visual-layer',
  'src/capability-fidelity',
  'src/diagnostics-trace',
  'src/shared',
]

describe('architecture scaffold', () => {
  it('tracks every documented browser component boundary with an index module', async () => {
    await Promise.all(
      componentDirectories.map(async (directory) => {
        await access(join(directory, 'index.ts'))
      }),
    )
  })
})
