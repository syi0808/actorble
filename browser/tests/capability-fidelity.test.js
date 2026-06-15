import { describe, expect, it } from 'vitest'
import { createActorble } from '../src/api/actorble-facade/index.js'
import { BrowserCapabilityFidelityReporter } from '../src/capability/capability-fidelity/index.js'

describe('BrowserCapabilityFidelityReporter', () => {
  it('reports browser in-page synthetic input capabilities and hard limits', () => {
    const reporter = new BrowserCapabilityFidelityReporter()

    expect(reporter.getCapabilities()).toEqual({
      pointerInput: 'synthetic',
      keyboardInput: 'synthetic',
      textInput: 'insert-text',
      pseudoState: 'mirror',
      trustedEvents: false,
      crossOriginFrame: false,
      closedShadowRoot: false,
      dragAndDrop: 'pointer-gesture',
    })

    expect(reporter.getFidelity()).toEqual({
      pointerInput: 'synthetic-dom-events',
      keyboardInput: 'synthetic-dom-events',
      textInput: 'synthetic-dom-events',
      pseudoState: 'mirror',
      visualOverlay: {
        implementation: 'browser-overlay',
        runtime: 'disabled',
        interactivity: 'none',
        hitTesting: 'not-applicable',
      },
      trustedEvents: false,
      limits: [
        'Events are synthetic DOM events and are not browser-trusted user input.',
        'Visual feedback is optional and does not make synthetic events browser-trusted.',
        'Cross-origin frames and closed shadow roots cannot be inspected from in-page JavaScript.',
        'Synthetic pointer drag is supported through pointer move/down/move/up DOM events.',
        'HTML5 DataTransfer drag/drop, native trusted drag/drop, editor selection drag, and custom drag adapters are not implemented yet.',
        'Debug event subscriptions are exact-name trace event subscriptions; span lifecycle snapshots are available through getTrace().',
      ],
    })
  })

  it('is wired into the default facade graph', () => {
    const actorble = createActorble()

    expect(actorble.getCapabilities()).toMatchObject({
      pointerInput: 'synthetic',
      pseudoState: 'mirror',
      trustedEvents: false,
      dragAndDrop: 'pointer-gesture',
    })
    expect(actorble.getFidelity()).toMatchObject({
      pointerInput: 'synthetic-dom-events',
      visualOverlay: {
        implementation: 'browser-overlay',
        runtime: 'disabled',
        interactivity: 'none',
        hitTesting: 'not-applicable',
      },
    })
  })

  it('reports enabled browser visual runtime separately from synthetic input limits', () => {
    const actorble = createActorble({ visual: true })

    expect(actorble.getFidelity()).toMatchObject({
      pointerInput: 'synthetic-dom-events',
      trustedEvents: false,
      visualOverlay: {
        implementation: 'browser-overlay',
        runtime: 'enabled',
        interactivity: 'non-interactive',
        hitTesting: 'ignored',
      },
    })
  })

  it('does not conflate visual runtime fidelity with feedback detail options', () => {
    const quiet = createActorble({ visual: true })
    const debug = createActorble({ visual: { preset: 'debug' } })

    expect(quiet.getFidelity().visualOverlay).toEqual(debug.getFidelity().visualOverlay)
  })

  it('reports custom visual layers as caller-owned runtime fidelity', () => {
    const visual = {
      showCursor() {},
      highlightTarget() {},
      showClick() {},
      showFocus() {},
      showTyping() {},
      showKeystroke() {},
      clearFeedback() {},
      hide() {},
      destroy() {},
    }
    const actorble = createActorble({ mode: 'headless', visual })

    expect(actorble.getFidelity()).toMatchObject({
      visualOverlay: {
        implementation: 'custom-layer',
        runtime: 'enabled',
        interactivity: 'caller-owned',
        hitTesting: 'caller-owned',
      },
    })
  })
})
