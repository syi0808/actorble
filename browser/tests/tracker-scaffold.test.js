import { describe, expect, it } from 'vitest'
import {
  NoopLayoutInvalidationTracker,
} from '../src/layout-invalidation-tracker/index.js'
import {
  NoopPointerVisualTracker,
} from '../src/pointer-visual-tracker/index.js'

function targetHandle(id = 'target-1') {
  const element = document.createElement('button')
  document.body.append(element)

  return {
    id,
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: { description: `button#${id}` },
  }
}

describe('runner tracking scaffold', () => {
  it('provides a no-op layout invalidation tracker lifecycle', () => {
    const tracker = new NoopLayoutInvalidationTracker()

    expect(tracker.isRunning()).toBe(false)

    tracker.start()
    tracker.markDirty('manual')

    expect(tracker.isRunning()).toBe(true)

    tracker.stop()
    expect(tracker.isRunning()).toBe(false)

    expect(() => tracker.dispose()).not.toThrow()
  })

  it('stores pointer visual scaffold mode without applying runtime visuals', () => {
    const tracker = new NoopPointerVisualTracker()
    const target = targetHandle()

    tracker.setMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
    })

    expect(tracker.getSnapshot()).toEqual({
      mode: {
        kind: 'targetAnchor',
        target,
        anchor: { kind: 'clickablePoint' },
        commandId: 1,
        pressed: false,
      },
    })

    tracker.clear()
    expect(tracker.getSnapshot()).toEqual({ mode: null })
  })
})
