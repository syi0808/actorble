import { describe, expect, it } from 'vitest'
import { createActorble } from '../src/actorble-facade/index.js'
import { BrowserCapabilityFidelityReporter } from '../src/capability-fidelity/index.js'

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
      dragAndDrop: 'none',
    })

    expect(reporter.getFidelity()).toEqual({
      pointerInput: 'synthetic-dom-events',
      keyboardInput: 'synthetic-dom-events',
      textInput: 'synthetic-dom-events',
      pseudoState: 'mirror',
      visualOverlay: 'non-interactive',
      trustedEvents: false,
      limits: [
        'Events are synthetic DOM events and are not browser-trusted user input.',
        'Cross-origin frames and closed shadow roots cannot be inspected from in-page JavaScript.',
        'Drag and drop is not implemented in the initial browser vertical slice.',
      ],
    })
  })

  it('is wired into the default facade graph', () => {
    const actorble = createActorble()

    expect(actorble.getCapabilities()).toMatchObject({
      pointerInput: 'synthetic',
      pseudoState: 'mirror',
      trustedEvents: false,
      dragAndDrop: 'none',
    })
    expect(actorble.getFidelity()).toMatchObject({
      pointerInput: 'synthetic-dom-events',
      visualOverlay: 'non-interactive',
    })
  })
})
