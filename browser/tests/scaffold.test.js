import { describe, expect, it } from 'vitest'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

const componentDirectories = [
  'src/api/actorble-facade',
  'src/runtime/scenario-runner',
  'src/runtime/action-orchestrator',
  'src/runtime/timeline-engine',
  'src/runtime/wait-observation-engine',
  'src/targeting/target-resolver',
  'src/targeting/surface-engine',
  'src/targeting/geometry-engine',
  'src/targeting/interactability-engine',
  'src/targeting/layout-invalidation-tracker',
  'src/input/gesture-engine',
  'src/input/pointer-engine',
  'src/input/pointer-signals',
  'src/input/focus-engine',
  'src/input/keyboard-engine',
  'src/input/text-input-engine',
  'src/state/interaction-state-store',
  'src/visual/pointer-visual-tracker',
  'src/visual/pseudo-state-mirror',
  'src/visual/visual-layer',
  'src/platform/platform-adapter',
  'src/platform/platform-adapter/dom-adapter',
  'src/platform/platform-adapter/event-dispatcher',
  'src/platform/platform-adapter/state-applier',
  'src/platform/platform-adapter/style-adapter',
  'src/capability/capability-fidelity',
  'src/diagnostics/diagnostics-trace',
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
