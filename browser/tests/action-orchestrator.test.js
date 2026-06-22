import { describe, expect, it, vi } from 'vitest'
import { BrowserActionOrchestrator } from '../src/runtime/action-orchestrator/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { resolveActionOptions } from '../src/options/index.js'
import { BrowserInteractionStateStore } from '../src/state/interaction-state-store/index.js'
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js'
import { BrowserDomAdapter } from '../src/platform/platform-adapter/index.js'
import { BrowserPseudoStateMirror } from '../src/visual/pseudo-state-mirror/index.js'
import { actorbleError, cancellationError, css } from '../src/shared/index.js'

function targetHandle(id = 'target-1') {
  const target = document.createElement('button')
  target.id = id
  document.body.append(target)

  return {
    id,
    element: target,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `button#${id}` },
  }
}

function inputTargetHandle(id = 'target-1') {
  const target = document.createElement('input')
  target.id = id
  document.body.append(target)

  return {
    id,
    element: target,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `input#${id}` },
  }
}

function geometryFor(target, point = { x: 20, y: 30 }) {
  return {
    target,
    rect: { x: 10, y: 20, width: 20, height: 20 },
    visibleRect: { x: 10, y: 20, width: 20, height: 20 },
    center: point,
    clickablePoint: {
      ok: true,
      point,
      strategy: 'center',
    },
    coordinateSpace: 'viewport',
    computedAt: 2000,
  }
}

function clickReportFor(target, overrides = {}) {
  return {
    target,
    visible: true,
    enabled: true,
    receivesPointerEvents: true,
    canClick: true,
    canFocus: true,
    canType: true,
    blockingReasons: [],
    forceBypassedReasons: [],
    unforceableReasons: [],
    ...overrides,
  }
}

function createTrace() {
  let now = 5000

  return new BrowserDiagnosticsTrace({
    idPrefix: 'action',
    clock: {
      now() {
        return now++
      },
    },
  })
}

function createFrameTimeline(frameInterval = 125) {
  let now = 0

  return {
    now: vi.fn(() => now),
    delay: vi.fn(async (duration) => {
      now += duration
    }),
    nextFrame: vi.fn(async () => {
      now += frameInterval
      return now
    }),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn(async (operation) => operation),
  }
}

function createBlockingTimeline() {
  let now = 0
  const pendingDelays = []

  return {
    timeline: {
      now: vi.fn(() => now),
      delay: vi.fn(
        (duration, options = {}) =>
          new Promise((resolve, reject) => {
            if (options.signal?.aborted) {
              reject(cancellationError('timeline.delay', options.signal.reason))
              return
            }

            const onAbort = () => {
              reject(cancellationError('timeline.delay', options.signal?.reason))
            }

            options.signal?.addEventListener('abort', onAbort, { once: true })
            pendingDelays.push({
              duration,
              resolve: () => {
                options.signal?.removeEventListener('abort', onAbort)
                now += duration
                resolve()
              },
            })
          }),
      ),
      nextFrame: vi.fn(async () => now),
      settle: vi.fn(async () => {}),
      withTimeout: vi.fn(async (operation) => operation),
    },
    get pendingDelayCount() {
      return pendingDelays.length
    },
    resolveNextDelay() {
      const pending = pendingDelays.shift()

      if (!pending) {
        throw new Error('No pending delay to resolve.')
      }

      pending.resolve()
    },
  }
}

function createManualLayoutInvalidationTracker(options = {}) {
  const listeners = []
  let running = options.running ?? false

  return {
    tracker: {
      start: vi.fn(() => {
        running = true
      }),
      stop: vi.fn(() => {
        running = false
      }),
      isRunning: vi.fn(() => running),
      markDirty: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.push(listener)

        return {
          dispose() {
            const index = listeners.indexOf(listener)

            if (index >= 0) {
              listeners.splice(index, 1)
            }
          },
        }
      }),
      dispose: vi.fn(),
    },
    emit(reason = 'scroll') {
      for (const listener of [...listeners]) {
        listener({
          reason,
          reasons: [reason],
          at: 123,
          coalesced: 1,
        })
      }
    },
  }
}

function createLayoutEmittingTimeline(layoutInvalidation, options = {}) {
  let now = 0
  let frame = 0
  const frameInterval = options.frameInterval ?? 25

  return {
    now: vi.fn(() => now),
    delay: vi.fn(async (duration) => {
      now += duration
    }),
    nextFrame: vi.fn(async () => {
      frame += 1
      now += frameInterval

      if (frame === (options.emitFrame ?? 1)) {
        layoutInvalidation.emit(options.reason ?? 'scroll')
      }

      return now
    }),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn(async (operation) => operation),
  }
}

async function flushMicrotasks(count = 10) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve()
  }
}

function expectCancellationSignal(signal) {
  expect(signal).toEqual(
    expect.objectContaining({
      aborted: false,
      addEventListener: expect.any(Function),
      removeEventListener: expect.any(Function),
    }),
  )
}

function cursorFromStyle(style) {
  return { cursor: style }
}

function createPointerVisualTrackerDouble() {
  return {
    setMode: vi.fn(),
    refresh: vi.fn(async () => {}),
    clear: vi.fn(),
    getSnapshot: vi.fn(() => ({ mode: null })),
    dispose: vi.fn(),
  }
}

function createSelectionDouble(snapshot = {}) {
  return {
    readSelection: vi.fn(() => snapshot),
    applySelection: vi.fn((range) => ({
      surface: 'input',
      strategy: 'input-range-api',
      selectedText: 'Selected',
      anchorNode: range.anchor.target,
      focusNode: range.focus.target,
      anchorOffset: range.anchor.offset,
      focusOffset: range.focus.offset,
      collapsed: range.anchor.offset === range.focus.offset,
      ...snapshot,
    })),
    clearSelection: vi.fn(),
    measureEndpoint: vi.fn((endpoint) => ({ x: endpoint.offset, y: 0 })),
  }
}

function createHarness(options = {}) {
  const calls = []
  const target = options.target ?? targetHandle()
  const resolveTargets = [...(options.resolveTargets ?? [])]
  const hitTestResults = [...(options.hitTestResults ?? [])]
  const geometrySnapshots = [...(options.geometrySnapshots ?? [])]
  const geometry = options.geometry ?? geometrySnapshots[0] ?? geometryFor(target)
  let currentGeometry = geometry
  const clickReports = [...(options.clickReports ?? [])]
  const signals = new BrowserPointerSignalBus()
  const trace = options.trace ?? createTrace()
  const store = new BrowserInteractionStateStore()
  const resolver = {
    resolve: vi.fn(async () => {
      calls.push('resolver.resolve')
      return resolveTargets.shift() ?? target
    }),
    resolveAll: vi.fn(async () => [target]),
    exists: vi.fn(async () => true),
    inspect: vi.fn(async () => ({ target, debug: target.debug, validity: 'live' })),
    validate: vi.fn(async (candidate = target) => {
      calls.push('resolver.validate')
      if (options.validateFailure) {
        throw options.validateFailure
      }

      return candidate
    }),
  }
  const surface = {
    getSurfaceFor: vi.fn(() => ({
      id: 'viewport',
      root: document,
      coordinateSpace: 'viewport',
      viewport: null,
      clippingChain: [],
    })),
    getScrollableAncestors: vi.fn(() => []),
    ensureVisible: vi.fn(async () => {
      calls.push('surface.ensureVisible')
    }),
    scrollTo: vi.fn(async () => {
      calls.push('surface.scrollTo')
    }),
    mapPoint: vi.fn((point) => point),
  }
  const geometryEngine = {
    snapshot: vi.fn(async () => {
      calls.push('geometry.snapshot')
      currentGeometry = geometrySnapshots.shift() ?? currentGeometry
      return currentGeometry
    }),
    getBoundingRect: vi.fn(() => currentGeometry.rect),
    getVisibleRect: vi.fn(() => currentGeometry.visibleRect),
    getCenter: vi.fn(() => currentGeometry.center),
    getClickablePoint: vi.fn(() => currentGeometry.clickablePoint),
  }
  const interactability = {
    inspect: vi.fn(async () => ({ target, canClick: true, blockingReasons: [] })),
    canClick: vi.fn(async () => {
      calls.push('interactability.canClick')
      return (
        clickReports.shift() ??
        options.clickReport ?? {
          target,
          visible: true,
          enabled: true,
          receivesPointerEvents: true,
          canClick: true,
          canFocus: true,
          canType: true,
          blockingReasons: [],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      )
    }),
    canFocus: vi.fn(async () => {
      calls.push('interactability.canFocus')
      return (
        options.focusReport ?? {
          target,
          visible: true,
          enabled: true,
          receivesPointerEvents: true,
          canClick: true,
          canFocus: true,
          canType: true,
          blockingReasons: [],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      )
    }),
    canType: vi.fn(async () => {
      calls.push('interactability.canType')
      return (
        options.typeReport ?? {
          target,
          visible: true,
          enabled: true,
          receivesPointerEvents: true,
          canClick: true,
          canFocus: true,
          canType: true,
          blockingReasons: [],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      )
    }),
  }
  const fakeGesture = {
    click: vi.fn(async () => {
      calls.push('gesture.click')
      signals.emit({
        type: 'pointer:moved',
        point: currentGeometry.clickablePoint.point,
        previousPoint: null,
      })
      signals.emit({
        type: 'pointer:down',
        point: currentGeometry.clickablePoint.point,
        button: 'primary',
      })

      if (options.clickFailure) {
        throw options.clickFailure
      }

      signals.emit({
        type: 'pointer:up',
        point: currentGeometry.clickablePoint.point,
        button: 'primary',
      })
      return { completed: true }
    }),
    hover: vi.fn(async (point) => {
      calls.push('gesture.hover')
      signals.emit({ type: 'pointer:moved', point, previousPoint: null })
      return { completed: true }
    }),
    doubleClick: vi.fn(async () => {
      calls.push('gesture.doubleClick')
      signals.emit({
        type: 'pointer:moved',
        point: currentGeometry.clickablePoint.point,
        previousPoint: null,
      })
      signals.emit({
        type: 'pointer:down',
        point: currentGeometry.clickablePoint.point,
        button: 'primary',
      })

      if (options.doubleClickFailure) {
        throw options.doubleClickFailure
      }

      signals.emit({
        type: 'pointer:up',
        point: currentGeometry.clickablePoint.point,
        button: 'primary',
      })
      signals.emit({
        type: 'pointer:down',
        point: currentGeometry.clickablePoint.point,
        button: 'primary',
      })
      signals.emit({
        type: 'pointer:up',
        point: currentGeometry.clickablePoint.point,
        button: 'primary',
      })
      return { completed: true }
    }),
    drag: vi.fn(async (from, to) => {
      calls.push('gesture.drag')
      signals.emit({ type: 'pointer:moved', point: from, previousPoint: null })
      signals.emit({
        type: 'pointer:down',
        point: from,
        button: 'primary',
      })

      if (options.dragFailure) {
        throw options.dragFailure
      }

      signals.emit({ type: 'pointer:moved', point: to, previousPoint: from })
      signals.emit({
        type: 'pointer:up',
        point: to,
        button: 'primary',
      })
      return { completed: true }
    }),
    pointerSequence: vi.fn(async (sequence) => {
      calls.push('gesture.pointerSequence')

      for (const step of sequence) {
        if (step.type === 'move') {
          signals.emit({ type: 'pointer:moved', point: step.to, previousPoint: null })
        } else if (step.type === 'down') {
          signals.emit({
            type: 'pointer:down',
            point: currentGeometry.clickablePoint.point,
            button: step.button ?? 'primary',
          })
        } else if (step.type === 'up') {
          signals.emit({
            type: 'pointer:up',
            point: currentGeometry.clickablePoint.point,
            button: step.button ?? 'primary',
          })
        }
      }

      if (options.pointerSequenceFailure) {
        throw options.pointerSequenceFailure
      }

      return { completed: true }
    }),
    cancel: vi.fn(async () => {
      calls.push('gesture.cancel')
      if (options.cancelFailure) {
        throw options.cancelFailure
      }

      signals.emit({ type: 'pointer:cancelled' })
      return { completed: false }
    }),
  }
  const gesture = options.gesture ?? (options.useRealGesture ? undefined : fakeGesture)
  const focus = options.focus ?? {
    focus: vi.fn(async (focusTarget, focusOptions = {}) => {
      calls.push('focus.focus')
      store.setFocused(focusTarget, focusOptions.focusVisible === true)

      return {
        active: focusTarget,
        previous: null,
        focusVisible: focusOptions.focusVisible === true,
      }
    }),
    blur: vi.fn(),
    getFocused: vi.fn(async () => (
      options.focusedSnapshot ?? {
        active: target,
        previous: null,
        focusVisible: false,
      }
    )),
    tab: vi.fn(),
  }
  const text = {
    type: vi.fn(async () => {
      calls.push('text.type')
      return { strategy: 'type', text: 'hello' }
    }),
    typeInto: vi.fn(async () => {
      calls.push('text.typeInto')
      return { strategy: 'typeInto', text: 'hello' }
    }),
    fill: vi.fn(async () => {
      calls.push('text.fill')
      return { strategy: 'fill', text: 'filled' }
    }),
  }
  const keyboard = options.keyboard ?? {
    getState: vi.fn(() => ({ pressedKeys: [], modifiers: [] })),
    keyDown: vi.fn(async () => ({ pressedKeys: [], modifiers: [] })),
    keyUp: vi.fn(async () => ({ pressedKeys: [], modifiers: [] })),
    press: vi.fn(async () => {
      calls.push('keyboard.press')
      return options.keyboardResult ?? { pressedKeys: [], modifiers: [] }
    }),
  }
  const wait = options.wait ?? {
    waitFor: vi.fn(),
    settle: vi.fn(async () => {
      calls.push('wait.settle')
      return null
    }),
    invalidateGeometry: vi.fn(),
  }
  const events = {
    dispatchPointerEvent: vi.fn((event) => {
      calls.push(`event.${event.type}`)
      return options.pointerDispatchResult?.[event.type] ?? true
    }),
    dispatchMouseEvent: vi.fn((event) => {
      calls.push(`event.${event.type}`)
      return options.mouseDispatchResult?.[event.type] ?? true
    }),
    dispatchKeyboardEvent: vi.fn(() => true),
    dispatchTextInputEvent: vi.fn(() => true),
  }
  const state = options.state ?? {
    applyStateEffects: vi.fn((effects) => {
      if (effects.length > 0) {
        calls.push(`state.${effects.map((effect) => `${effect.kind}:${effect.active}`).join(',')}`)
      }
    }),
    cleanup: vi.fn(() => {
      calls.push('state.cleanup')
    }),
  }
  const selection = options.selection ?? createSelectionDouble(options.selectionSnapshot)
  const dom = options.dom ?? {
    getRoot: vi.fn(() => options.root ?? document),
    elementFromPoint: vi.fn((point, hitOptions) => {
      if (options.trackHitTests) {
        calls.push(`dom.hit:${point.x},${point.y}:${hitOptions?.ignoreActorbleInternal}`)
      }

      if (typeof options.elementFromPoint === 'function') {
        return options.elementFromPoint(point, hitOptions)
      }

      return hitTestResults.shift() ?? target.element
    }),
    getComputedStyle: vi.fn((element) => {
      if (options.trackCursorReads) {
        calls.push(`dom.cursor:${element.id}`)
      }

      const cursor =
        typeof options.cursorStyle === 'function'
          ? options.cursorStyle(element)
          : (options.cursorStyles?.get(element) ?? 'default')

      return cursorFromStyle(cursor)
    }),
    getParentElement: vi.fn((element) => element.parentElement),
    contains: vi.fn((root, node) => root.contains(node)),
    isConnected: vi.fn((element) => element.isConnected),
    describeElement: vi.fn((element) => ({
      description: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`,
      selector: element.id ? `#${element.id}` : undefined,
      attributes: Object.fromEntries(
        Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]),
      ),
    })),
  }
  const visual =
    options.visual ??
    (options.enableVisual
      ? {
          showCursor: vi.fn((request) => {
            const point = 'point' in request ? request.point : request
            const cursor = 'point' in request ? (request.cursor ?? 'default') : 'default'

            calls.push(`visual.cursor:${point.x},${point.y}:${cursor}`)
          }),
          highlightTarget: vi.fn(() => {
            calls.push('visual.highlight')
          }),
          showClick: vi.fn(() => {
            calls.push('visual.click')
          }),
          showFocus: vi.fn((request) => {
            calls.push(`visual.focus:${request.active}`)
          }),
          showTyping: vi.fn((request) => {
            calls.push(`visual.typing:${request.active}`)
          }),
          showKeystroke: vi.fn((request) => {
            calls.push(`visual.keystroke:${request.text}`)
          }),
          clearFeedback: vi.fn(() => {
            calls.push('visual.clearFeedback')
          }),
          hide: vi.fn(),
          destroy: vi.fn(),
        }
      : undefined)
  const orchestrator = new BrowserActionOrchestrator({
    resolver,
    surface,
    geometry: geometryEngine,
    interactability,
    ...(gesture === undefined ? {} : { gesture }),
    focus,
    keyboard,
    text,
    selection,
    wait,
    trace,
    timeline: options.timeline,
    store,
    events,
    state,
    dom,
    signals,
    visual,
    visualFeedback: options.visualFeedback,
    pointer: options.pointer,
    pointerVisual: options.pointerVisual,
    layoutInvalidation: options.layoutInvalidation,
  })

  return {
    calls,
    dom,
    events,
    focus,
    gesture,
    geometry,
    interactability,
    keyboard,
    orchestrator,
    resolver,
    selection,
    state,
    store,
    surface,
    target,
    text,
    trace,
    visual,
    wait,
  }
}

function createRealTextHarness(options = {}) {
  const target = options.target ?? inputTargetHandle()
  const geometry = options.geometry ?? geometryFor(target)
  const trace = options.trace ?? createTrace()
  const timeline = options.timeline ?? createFrameTimeline()
  const store = options.store ?? new BrowserInteractionStateStore()
  const calls = []
  const resolver = {
    resolve: vi.fn(async () => {
      calls.push('resolver.resolve')
      return target
    }),
    resolveAll: vi.fn(async () => [target]),
    exists: vi.fn(async () => true),
    inspect: vi.fn(async () => ({ target, debug: target.debug, validity: 'live' })),
    validate: vi.fn(async () => {
      calls.push('resolver.validate')
      return target
    }),
  }
  const surface = {
    getSurfaceFor: vi.fn(() => ({
      id: 'viewport',
      root: document,
      coordinateSpace: 'viewport',
      viewport: null,
      clippingChain: [],
    })),
    getScrollableAncestors: vi.fn(() => []),
    ensureVisible: vi.fn(async () => {
      calls.push('surface.ensureVisible')
    }),
    scrollTo: vi.fn(),
    mapPoint: vi.fn((point) => point),
  }
  const geometryEngine = {
    snapshot: vi.fn(async () => {
      calls.push('geometry.snapshot')
      return geometry
    }),
    getBoundingRect: vi.fn(() => geometry.rect),
    getVisibleRect: vi.fn(() => geometry.visibleRect),
    getCenter: vi.fn(() => geometry.center),
    getClickablePoint: vi.fn(() => geometry.clickablePoint),
  }
  const interactability = {
    inspect: vi.fn(async () => ({ target, canClick: true, blockingReasons: [] })),
    canClick: vi.fn(async () => ({
      target,
      visible: true,
      enabled: true,
      receivesPointerEvents: true,
      canClick: true,
      canFocus: true,
      canType: true,
      blockingReasons: [],
      forceBypassedReasons: [],
      unforceableReasons: [],
    })),
    canFocus: vi.fn(async () => ({ target, canFocus: true, blockingReasons: [] })),
    canType: vi.fn(async () => {
      calls.push('interactability.canType')
      return {
        target,
        visible: true,
        enabled: true,
        receivesPointerEvents: true,
        canClick: true,
        canFocus: true,
        canType: true,
        blockingReasons: [],
        forceBypassedReasons: [],
        unforceableReasons: [],
      }
    }),
  }
  const wait = {
    waitFor: vi.fn(),
    settle: vi.fn(async () => {
      calls.push('wait.settle')
      return null
    }),
    invalidateGeometry: vi.fn(),
  }
  const state = {
    applyStateEffects: vi.fn(),
    cleanup: vi.fn(),
  }
  const visual =
    options.visual ??
    (options.enableVisual
      ? {
          showCursor: vi.fn(),
          highlightTarget: vi.fn(),
          showClick: vi.fn(),
          showFocus: vi.fn(),
          showTyping: vi.fn((request) => {
            calls.push(`visual.typing:${request.active}`)
          }),
          showKeystroke: vi.fn(),
          clearFeedback: vi.fn(() => {
            calls.push('visual.clearFeedback')
          }),
          hide: vi.fn(),
          destroy: vi.fn(),
        }
      : undefined)
  const orchestrator = new BrowserActionOrchestrator({
    resolver,
    surface,
    geometry: geometryEngine,
    interactability,
    wait,
    trace,
    timeline,
    store,
    state,
    dom: new BrowserDomAdapter(document),
    visual,
    visualFeedback: options.visualFeedback,
  })

  return {
    calls,
    input: target.element,
    orchestrator,
    store,
    target,
    timeline,
    trace,
    visual,
    wait,
  }
}

describe('BrowserActionOrchestrator', () => {
  it('delegates geometry snapshots to the injected geometry engine', async () => {
    const { calls, geometry, orchestrator, target } = createHarness()

    await expect(orchestrator.geometry(target)).resolves.toBe(geometry)

    expect(calls).toEqual(['geometry.snapshot'])
  })

  it('selectText applies input range selection, syncs state, traces metadata, and waits', async () => {
    const input = document.createElement('input')
    input.id = 'message'
    input.value = 'Hello selection'
    document.body.append(input)
    const target = {
      id: 'input-target',
      element: input,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#message', description: 'input#message' },
    }
    const selection = createSelectionDouble({
      surface: 'input',
      strategy: 'input-range-api',
      selectedText: 'PRIVATE_TOKEN',
      anchorNode: input,
      focusNode: input,
      anchorOffset: 6,
      focusOffset: 15,
      collapsed: false,
    })
    const { calls, orchestrator, store, trace, wait } = createHarness({
      target,
      selection,
    })

    await expect(
      orchestrator.selectText({
        anchor: { target, offset: 6 },
        focus: { target, offset: 15 },
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.validate',
      'resolver.validate',
      'surface.ensureVisible',
      'wait.settle',
    ])
    expect(selection.applySelection).toHaveBeenCalledWith({
      anchor: { target: input, offset: 6 },
      focus: { target: input, offset: 15 },
    })
    expect(store.snapshot().selection).toMatchObject({
      active: true,
      target,
      text: 'PRIVATE_TOKEN',
      surface: 'input',
      strategy: 'input-range-api',
      collapsed: false,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans).toEqual([
      expect.objectContaining({
        name: 'action.selectText',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'selectText',
          completed: true,
          targetIds: ['input-target'],
          output: {
            surface: 'input',
            strategy: 'input-range-api',
            collapsed: false,
            selectedTextLength: 13,
          },
        }),
      }),
    ])
    expect(JSON.stringify(trace.getTrace())).not.toContain('PRIVATE_TOKEN')
  })

  it('selectText maps document element offsets to text node ranges', async () => {
    const paragraph = document.createElement('p')
    paragraph.id = 'copy'
    paragraph.textContent = 'Readable document text'
    document.body.append(paragraph)
    const textNode = paragraph.firstChild
    const target = {
      id: 'copy-target',
      element: paragraph,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy', description: 'p#copy' },
    }
    const selection = createSelectionDouble({
      surface: 'document-text',
      strategy: 'selection-api',
      selectedText: 'document',
      anchorNode: textNode,
      focusNode: textNode,
      anchorOffset: 9,
      focusOffset: 17,
      collapsed: false,
    })
    const { orchestrator } = createHarness({ target, selection })

    await expect(
      orchestrator.selectText({
        anchor: { target, offset: 9 },
        focus: { target, offset: 17 },
      }),
    ).resolves.toBeUndefined()

    expect(selection.applySelection).toHaveBeenCalledWith({
      anchor: { target: textNode, offset: 9 },
      focus: { target: textNode, offset: 17 },
    })
  })

  it('selectText selects all text for a direct target', async () => {
    const input = document.createElement('input')
    input.id = 'message'
    input.value = 'Hello selection'
    document.body.append(input)
    const target = {
      id: 'input-target',
      element: input,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#message', description: 'input#message' },
    }
    const selection = createSelectionDouble()
    const { orchestrator } = createHarness({ target, selection })

    await expect(orchestrator.selectText(target)).resolves.toBeUndefined()

    expect(selection.applySelection).toHaveBeenCalledWith({
      anchor: { target: input, offset: 0 },
      focus: { target: input, offset: input.value.length },
    })
  })

  it('selectText selects all document text for a direct target', async () => {
    const paragraph = document.createElement('p')
    paragraph.id = 'copy'
    paragraph.textContent = 'Readable document text'
    document.body.append(paragraph)
    const textNode = paragraph.firstChild
    const target = {
      id: 'copy-target',
      element: paragraph,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy', description: 'p#copy' },
    }
    const selection = createSelectionDouble()
    const { orchestrator } = createHarness({ target, selection })

    await expect(orchestrator.selectText(target)).resolves.toBeUndefined()

    expect(selection.applySelection).toHaveBeenCalledWith({
      anchor: { target: textNode, offset: 0 },
      focus: { target: textNode, offset: paragraph.textContent.length },
    })
  })

  it('selectText animates a human-like selection gesture when movement options are provided', async () => {
    const paragraph = document.createElement('p')
    paragraph.id = 'copy'
    paragraph.textContent = 'Readable document text'
    document.body.append(paragraph)
    const textNode = paragraph.firstChild
    const target = {
      id: 'copy-target',
      element: paragraph,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy', description: 'p#copy' },
    }
    const selection = createSelectionDouble({
      surface: 'document-text',
      strategy: 'selection-api',
      selectedText: 'document',
      anchorNode: textNode,
      focusNode: textNode,
      anchorOffset: 9,
      focusOffset: 17,
      collapsed: false,
    })
    const timeline = createFrameTimeline(50)
    const pointerVisual = createPointerVisualTrackerDouble()
    const visualEvents = []
    const visual = {
      showCursor: vi.fn((request) => {
        visualEvents.push(request)
      }),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    const { events, orchestrator } = createHarness({
      target,
      selection,
      timeline,
      visual,
      pointerVisual,
      visualFeedback: 'debug',
    })

    await expect(
      orchestrator.selectText(
        {
          anchor: { target, offset: 9 },
          focus: { target, offset: 17 },
        },
        { duration: 100, motion: { kind: 'ease', timing: 'linear', duration: 100 } },
      ),
    ).resolves.toBeUndefined()

    expect(events.dispatchPointerEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'pointermove',
      'pointerdown',
      'pointermove',
      'pointermove',
      'pointerup',
    ])
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(selection.applySelection.mock.calls.map(([range]) => range.focus.offset)).toEqual(
      expect.arrayContaining([13, 17]),
    )
    expect(selection.applySelection).toHaveBeenLastCalledWith({
      anchor: { target: textNode, offset: 9 },
      focus: { target: textNode, offset: 17 },
    })
    expect(visualEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cursor: 'text', pressed: true }),
        expect.objectContaining({ cursor: 'text', pressed: false }),
      ]),
    )
    expect(pointerVisual.setMode).toHaveBeenCalledWith({
      kind: 'freePoint',
      point: { x: 17, y: 0 },
      pressed: false,
    })
  })

  it('selectText keeps the visual cursor on the progressively selected focus caret', async () => {
    const paragraph = document.createElement('p')
    paragraph.id = 'copy'
    paragraph.textContent = 'abcdefghij'
    document.body.append(paragraph)
    const target = {
      id: 'copy-target',
      element: paragraph,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy', description: 'p#copy' },
    }
    const selection = createSelectionDouble()
    const timeline = createFrameTimeline(50)
    const visualEvents = []
    const visual = {
      showCursor: vi.fn((request) => {
        visualEvents.push(request)
      }),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    selection.measureEndpoint.mockImplementation((endpoint) => ({
      x: endpoint.offset,
      y: endpoint.offset >= 10 ? 20 : 0,
    }))
    const { orchestrator } = createHarness({
      target,
      selection,
      timeline,
      visual,
      visualFeedback: 'debug',
    })

    await expect(
      orchestrator.selectText(
        {
          anchor: { target, offset: 0 },
          focus: { target, offset: 10 },
        },
        { duration: 100, motion: { kind: 'ease', timing: 'linear', duration: 100 } },
      ),
    ).resolves.toBeUndefined()

    expect(selection.applySelection.mock.calls.map(([range]) => range.focus.offset)).toEqual(
      expect.arrayContaining([5, 10]),
    )
    expect(visualEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cursor: 'text',
          point: { x: 0, y: 0 },
          pressed: true,
        }),
        expect.objectContaining({
          cursor: 'text',
          point: { x: 5, y: 0 },
          pressed: true,
        }),
        expect.objectContaining({
          cursor: 'text',
          point: { x: 10, y: 20 },
          pressed: false,
        }),
      ]),
    )
    expect(visualEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cursor: 'text',
          point: { x: 5, y: 10 },
          pressed: true,
        }),
      ]),
    )
  })

  it('selectText keeps following pointer actions continuous from the selection focus', async () => {
    const paragraph = document.createElement('p')
    paragraph.id = 'copy'
    paragraph.textContent = 'abcdefghij'
    document.body.append(paragraph)
    const textNode = paragraph.firstChild
    const selectionTarget = {
      id: 'copy-target',
      element: paragraph,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy', description: 'p#copy' },
    }
    const clickTarget = targetHandle('save')
    const selection = createSelectionDouble()
    const timeline = createFrameTimeline(50)
    const visualEvents = []
    const visual = {
      showCursor: vi.fn((request) => {
        visualEvents.push(request)
      }),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    selection.measureEndpoint.mockImplementation((endpoint) => ({
      x: endpoint.offset * 30,
      y: 0,
    }))
    const { orchestrator } = createHarness({
      target: selectionTarget,
      selection,
      timeline,
      visual,
      visualFeedback: 'debug',
      useRealGesture: true,
      geometrySnapshots: [geometryFor(clickTarget, { x: 400, y: 0 })],
    })

    await expect(
      orchestrator.selectText(
        {
          anchor: { target: selectionTarget, offset: 0 },
          focus: { target: selectionTarget, offset: 10 },
        },
        { duration: 100, motion: { kind: 'ease', timing: 'linear', duration: 100 } },
      ),
    ).resolves.toBeUndefined()

    expect(visualEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cursor: 'text',
          point: { x: 300, y: 0 },
          pressed: false,
        }),
      ]),
    )

    visualEvents.splice(0)

    await expect(
      orchestrator.click(clickTarget, {
        duration: 100,
        motion: { kind: 'ease', timing: 'linear', duration: 100 },
        pressDwell: 0,
      }),
    ).resolves.toBeUndefined()

    expect(visualEvents[0]).toEqual(
      expect.objectContaining({
        point: { x: 350, y: 0 },
      }),
    )
    expect(visualEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point: { x: 200, y: 0 },
        }),
      ]),
    )
    expect(selection.applySelection).toHaveBeenLastCalledWith({
      anchor: { target: textNode, offset: 0 },
      focus: { target: textNode, offset: 10 },
    })
  })

  it('selectText progressively expands visual gestures across text nodes', async () => {
    const paragraph = document.createElement('p')
    const start = document.createElement('span')
    const end = document.createElement('span')
    start.id = 'copy-start'
    end.id = 'copy-end'
    start.textContent = 'Hello '
    end.textContent = 'world text'
    paragraph.append(start, end)
    document.body.append(paragraph)
    const startText = start.firstChild
    const endText = end.firstChild
    const startTarget = {
      id: 'copy-start',
      element: start,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy-start', description: 'span#copy-start' },
    }
    const endTarget = {
      id: 'copy-end',
      element: end,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#copy-end', description: 'span#copy-end' },
    }
    const selection = createSelectionDouble()
    const timeline = createFrameTimeline(50)
    selection.measureEndpoint.mockImplementation((endpoint) => {
      if (endpoint.target === endText) {
        return { x: 6 + endpoint.offset, y: 0 }
      }

      return { x: endpoint.offset, y: 0 }
    })
    const { orchestrator } = createHarness({
      target: startTarget,
      resolveTargets: [startTarget, endTarget],
      selection,
      timeline,
    })

    await expect(
      orchestrator.selectText(
        {
          anchor: { target: css('#copy-start'), offset: 1 },
          focus: { target: css('#copy-end'), offset: 4 },
        },
        { duration: 100, motion: { kind: 'ease', timing: 'linear', duration: 100 } },
      ),
    ).resolves.toBeUndefined()

    expect(selection.applySelection.mock.calls.map(([range]) => range.focus)).toEqual(
      expect.arrayContaining([
        { target: startText, offset: 6 },
        { target: endText, offset: 4 },
      ]),
    )
  })

  it('selectText propagates unsupported surface failures from the selection adapter', async () => {
    const unsupported = actorbleError(
      'TEXT_SELECTION_UNSUPPORTED',
      'Input selection is not supported for this input type.',
      {
        details: {
          boundary: 'selection-adapter',
          reason: 'unsupported-input-type',
        },
      },
    )
    const selection = createSelectionDouble()
    selection.applySelection.mockImplementation(() => {
      throw unsupported
    })
    const input = document.createElement('input')
    input.id = 'quantity'
    input.type = 'number'
    input.value = '42'
    document.body.append(input)
    const target = {
      id: 'number-target',
      element: input,
      root: document,
      resolvedAt: 1000,
      validity: 'live',
      debug: { selector: '#quantity', description: 'input#quantity' },
    }
    const { orchestrator } = createHarness({ target, selection })

    await expect(orchestrator.selectText(target)).rejects.toThrowError(
      expect.objectContaining({
        code: 'TEXT_SELECTION_UNSUPPORTED',
        details: expect.objectContaining({
          reason: 'unsupported-input-type',
        }),
      }),
    )
  })

  it('selectText rejects point endpoints with actionable text selection errors', async () => {
    const { orchestrator, target } = createHarness()

    await expect(
      orchestrator.selectText({
        anchor: { target, point: { x: 1, y: 2 } },
        focus: { target, offset: 4 },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'TEXT_SELECTION_UNSUPPORTED',
        details: expect.objectContaining({
          action: 'selectText',
          reason: 'point-endpoints-not-yet-supported',
        }),
      }),
    )
  })

  it('selectText fails stale target validation before applying selection', async () => {
    const stale = actorbleError('TARGET_STALE', 'Target is stale.')
    const selection = createSelectionDouble()
    const { orchestrator, target } = createHarness({ validateFailure: stale, selection })

    await expect(orchestrator.selectText(target)).rejects.toThrowError(
      expect.objectContaining({ code: 'TARGET_STALE' }),
    )
    expect(selection.applySelection).not.toHaveBeenCalled()
  })

  it('click resolves and validates the target before dispatching pointer and activation events', async () => {
    const { calls, events, orchestrator, target, trace, wait } = createHarness()

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'event.pointermove',
      'state.active:true',
      'event.pointerdown',
      'state.active:false',
      'event.pointerup',
      'event.click',
      'wait.settle',
    ])
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans).toEqual([
      expect.objectContaining({
        name: 'action.click',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'click',
          completed: true,
          targetId: 'target-1',
          output: expect.objectContaining({
            activationDispatched: true,
          }),
        }),
      }),
    ])
  })

  it('doubleClick resolves, preflights, dispatches two click activations, and waits', async () => {
    const { calls, events, gesture, orchestrator, target, trace, wait } = createHarness()

    await expect(
      orchestrator.doubleClick(css('#target-1'), resolveActionOptions('doubleClick')),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canClick',
      'gesture.doubleClick',
      'state.hover:true',
      'event.pointermove',
      'state.active:true',
      'event.pointerdown',
      'state.active:false',
      'event.pointerup',
      'event.click',
      'state.active:true',
      'event.pointerdown',
      'state.active:false',
      'event.pointerup',
      'event.click',
      'wait.settle',
    ])
    expect(events.dispatchMouseEvent).toHaveBeenNthCalledWith(1, {
      type: 'click',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(events.dispatchMouseEvent).toHaveBeenNthCalledWith(2, {
      type: 'click',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
      detail: 2,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.doubleClick',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'doubleClick',
          completed: true,
          targetId: 'target-1',
          output: expect.objectContaining({
            activationDispatchCount: 2,
          }),
        }),
      }),
    )
    expect(gesture.doubleClick).toHaveBeenCalledWith(
      target,
      { x: 20, y: 30 },
      expect.objectContaining({
        motion: { kind: 'ease', timing: 'ease-in-out', duration: 250 },
      }),
    )
  })

  it('doubleClick forwards explicit public pointer timing options without force', async () => {
    const motion = { kind: 'ease', timing: 'ease-in-out', duration: 420 }
    const { gesture, orchestrator } = createHarness()

    await expect(
      orchestrator.doubleClick(css('#target-1'), {
        button: 'primary',
        duration: 420,
        motion,
        pressDwell: 160,
        timeout: 3000,
        force: true,
      }),
    ).resolves.toBeUndefined()

    const gestureOptions = gesture.doubleClick.mock.calls[0][2]

    expect(gestureOptions).toEqual(
      expect.objectContaining({
        button: 'primary',
        duration: 420,
        motion,
        pressDwell: 160,
        timeout: 3000,
      }),
    )
    expect(gestureOptions).not.toHaveProperty('force')
  })

  it('click with clickCount dispatches a public multi-click sequence', async () => {
    const { calls, events, orchestrator } = createHarness({ useRealGesture: true })

    await expect(
      orchestrator.click(css('#target-1'), { clickCount: 2, duration: 0, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    expect(calls.filter((call) => call.startsWith('event.'))).toEqual([
      'event.pointermove',
      'event.pointerdown',
      'event.pointerup',
      'event.click',
      'event.pointerdown',
      'event.pointerup',
      'event.click',
    ])
    expect(events.dispatchMouseEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'click', detail: 1 }),
    )
    expect(events.dispatchMouseEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'click', detail: 2 }),
    )
  })

  it('skips activation but still settles when pointer down or up is canceled by the page', async () => {
    const { events, orchestrator, trace, wait } = createHarness({
      pointerDispatchResult: { pointerdown: false },
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        status: 'ok',
        attributes: expect.objectContaining({
          output: expect.objectContaining({
            activationDispatched: false,
          }),
        }),
      }),
    )
  })

  it('cancels pointer state and cleans up active effects when doubleClick fails after pointer down', async () => {
    const { events, gesture, orchestrator, state, trace } = createHarness({
      doubleClickFailure: cancellationError('doubleClick', 'scenario stopped'),
    })

    await expect(orchestrator.doubleClick(css('#target-1'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(gesture.cancel).toHaveBeenCalledOnce()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.doubleClick',
        status: 'cancelled',
      }),
    )
  })

  it('cancels pointer state and cleans up active effects when click fails after pointer down', async () => {
    const { events, gesture, orchestrator, state, trace } = createHarness({
      clickFailure: cancellationError('click', 'scenario stopped'),
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(gesture.cancel).toHaveBeenCalledOnce()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.click',
        status: 'cancelled',
      }),
    )
  })

  it('does not fail click when pseudo state mirror application only records a warning', async () => {
    const trace = createTrace()
    const failingMirrorState = {
      applyStateEffects: vi.fn(() => {
        throw new Error('mirror blocked by runtime style policy')
      }),
      cleanup: vi.fn(),
    }
    const mirror = new BrowserPseudoStateMirror({
      state: failingMirrorState,
      trace,
    })
    const { orchestrator } = createHarness({ state: mirror, trace })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.click',
        status: 'ok',
      }),
    )
    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Pseudo state mirror apply failed.',
          details: expect.objectContaining({
            error: 'mirror blocked by runtime style policy',
          }),
        }),
      ]),
    )
  })

  it('records visual hook failures as warnings without failing the action', async () => {
    const visual = {
      showCursor: vi.fn(() => {
        throw new Error('overlay blocked')
      }),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    const { orchestrator, trace } = createHarness({ visual })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Visual layer update failed.',
          details: expect.objectContaining({
            effect: 'showCursor',
            error: 'overlay blocked',
          }),
        }),
      ]),
    )
  })

  it('fails preflight without performing a gesture when click is not interactable', async () => {
    const { events, gesture, orchestrator, trace } = createHarness({
      clickReport: {
        target: targetHandle('blocked'),
        visible: true,
        enabled: false,
        receivesPointerEvents: true,
        canClick: false,
        canFocus: false,
        canType: false,
        blockingReasons: ['disabled'],
        forceBypassedReasons: [],
        unforceableReasons: ['disabled'],
      },
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'click',
        blockingReasons: ['disabled'],
      }),
    })

    expect(gesture.click).not.toHaveBeenCalled()
    expect(events.dispatchPointerEvent).not.toHaveBeenCalled()
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        attributes: expect.objectContaining({ phase: 'preflight' }),
      }),
    )
  })

  it('refreshes click geometry before pointer down and dispatches at the fresh point', async () => {
    const target = targetHandle()
    const initialGeometry = geometryFor(target, { x: 20, y: 30 })
    const freshGeometry = geometryFor(target, { x: 80, y: 90 })
    const { events, orchestrator, trace } = createHarness({
      target,
      geometry: initialGeometry,
      geometrySnapshots: [initialGeometry, freshGeometry],
      useRealGesture: true,
    })

    await expect(
      orchestrator.click(css('#target-1'), { duration: 0, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(1, {
      type: 'pointermove',
      target: target.element,
      point: { x: 20, y: 30 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(2, {
      type: 'pointermove',
      target: target.element,
      point: { x: 80, y: 90 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(3, {
      type: 'pointerdown',
      target: target.element,
      point: { x: 80, y: 90 },
      button: 'primary',
      buttons: ['primary'],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(4, {
      type: 'pointerup',
      target: target.element,
      point: { x: 80, y: 90 },
      button: 'primary',
      buttons: [],
    })
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 80, y: 90 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pointer:fresh-geometry',
          data: expect.objectContaining({
            action: 'click',
            changed: true,
            freshPoint: { x: 80, y: 90 },
            initialPoint: { x: 20, y: 30 },
            targetId: 'target-1',
          }),
        }),
      ]),
    )
  })

  it('retargets click movement when layout invalidation moves the target before pointer down', async () => {
    const target = targetHandle()
    const initialGeometry = geometryFor(target, { x: 100, y: 0 })
    const movedGeometry = geometryFor(target, { x: 200, y: 0 })
    const layoutInvalidation = createManualLayoutInvalidationTracker()
    const timeline = createLayoutEmittingTimeline(layoutInvalidation, { frameInterval: 25 })
    const { events, orchestrator, trace } = createHarness({
      target,
      geometry: initialGeometry,
      geometrySnapshots: [initialGeometry, movedGeometry, movedGeometry],
      layoutInvalidation: layoutInvalidation.tracker,
      timeline,
      useRealGesture: true,
    })

    await expect(
      orchestrator.click(css('#target-1'), { duration: 100, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    const pointerMoves = events.dispatchPointerEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === 'pointermove')

    expect(layoutInvalidation.tracker.start).toHaveBeenCalledOnce()
    expect(layoutInvalidation.tracker.stop).toHaveBeenCalledOnce()
    expect(pointerMoves.map((event) => event.point.x)).toEqual([
      25,
      83.33333333333333,
      141.66666666666666,
      200,
    ])
    expect(events.dispatchPointerEvent).toHaveBeenCalledWith({
      type: 'pointerdown',
      target: target.element,
      point: { x: 200, y: 0 },
      button: 'primary',
      buttons: ['primary'],
    })
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 200, y: 0 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pointer:endpoint-refresh',
          data: expect.objectContaining({
            action: 'click',
            changed: true,
            freshPoint: { x: 200, y: 0 },
            previousPoint: { x: 100, y: 0 },
            reason: 'scroll',
            targetId: 'target-1',
          }),
        }),
      ]),
    )
  })

  it('preserves an already running layout invalidation tracker during pointer actions', async () => {
    const layoutInvalidation = createManualLayoutInvalidationTracker({ running: true })
    const { orchestrator } = createHarness({ layoutInvalidation: layoutInvalidation.tracker })

    await expect(
      orchestrator.click(css('#target-1'), { duration: 0, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    expect(layoutInvalidation.tracker.start).not.toHaveBeenCalled()
    expect(layoutInvalidation.tracker.stop).not.toHaveBeenCalled()
  })

  it('fails fresh click preflight before pointer down and cleans up perform state', async () => {
    const target = targetHandle()
    const initialGeometry = geometryFor(target, { x: 20, y: 30 })
    const freshGeometry = geometryFor(target, { x: 80, y: 90 })
    const { events, orchestrator, state, trace } = createHarness({
      target,
      geometry: initialGeometry,
      geometrySnapshots: [initialGeometry, freshGeometry],
      clickReports: [
        clickReportFor(target),
        clickReportFor(target, {
          enabled: false,
          canClick: false,
          canFocus: false,
          canType: false,
          blockingReasons: ['disabled'],
          unforceableReasons: ['disabled'],
        }),
      ],
      useRealGesture: true,
    })

    await expect(
      orchestrator.click(css('#target-1'), { duration: 0, pressDwell: 0 }),
    ).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'click',
        blockingReasons: ['disabled'],
        targetId: 'target-1',
      }),
    })

    expect(events.dispatchPointerEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'pointermove',
    ])
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.click',
        status: 'error',
        attributes: expect.objectContaining({ phase: 'perform' }),
      }),
    )
  })

  it('moveTo resolves, reveals, moves to the clickable point, and waits for settlement', async () => {
    const { calls, orchestrator } = createHarness()

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'gesture.hover',
      'state.hover:true',
      'event.pointermove',
      'wait.settle',
    ])
  })

  it('pointerSequence executes a cleanup-safe transaction and records trace output', async () => {
    const { calls, gesture, orchestrator, trace, wait } = createHarness()
    const sequence = [
      { type: 'move', to: { x: 1, y: 2 }, duration: 10 },
      { type: 'down', button: 'primary' },
      { type: 'pause', duration: 20 },
      { type: 'move', to: { x: 5, y: 6 } },
      { type: 'up', button: 'primary' },
    ]
    const options = { timeout: 100 }

    await expect(orchestrator.pointerSequence(sequence, options)).resolves.toBeUndefined()

    expect(calls).toEqual([
      'gesture.pointerSequence',
      'state.hover:true',
      'event.pointermove',
      'state.active:true',
      'event.pointerdown',
      'event.pointermove',
      'state.active:false',
      'event.pointerup',
      'wait.settle',
    ])
    expect(gesture.pointerSequence).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({ timeout: 100, signal: expect.any(AbortSignal) }),
    )
    expect(wait.settle).toHaveBeenCalledWith('settled', { timeout: 100 })
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pointer-sequence:started',
          data: expect.objectContaining({
            stepCount: 5,
            stepTypes: ['move', 'down', 'pause', 'move', 'up'],
          }),
        }),
        expect.objectContaining({
          name: 'pointer-sequence:completed',
          data: expect.objectContaining({ stepCount: 5 }),
        }),
      ]),
    )
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.pointerSequence',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'pointerSequence',
          completed: true,
          output: expect.objectContaining({ stepCount: 5 }),
        }),
      }),
    )
  })

  it('pointerSequence cleans up gesture and interaction state after failed perform', async () => {
    const failure = actorbleError(
      'POINTER_SEQUENCE_INCOMPLETE',
      'Pointer sequence ended while pressed.',
      {
        details: { boundary: 'gesture-engine', pressedButtons: ['primary'] },
      },
    )
    const { gesture, orchestrator, state, trace } = createHarness({
      pointerSequenceFailure: failure,
    })

    await expect(
      orchestrator.pointerSequence([{ type: 'down', button: 'primary' }]),
    ).rejects.toMatchObject({
      code: 'POINTER_SEQUENCE_INCOMPLETE',
      details: {
        boundary: 'gesture-engine',
        pressedButtons: ['primary'],
      },
    })

    expect(gesture.cancel).toHaveBeenCalledOnce()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.pointerSequence',
        status: 'error',
        attributes: expect.objectContaining({
          action: 'pointerSequence',
          phase: 'perform',
        }),
      }),
    )
  })

  it('scrollTo resolves, validates, scrolls the target, invalidates geometry, and waits', async () => {
    const { calls, orchestrator, surface, target, trace, wait } = createHarness()
    const controller = new AbortController()
    const options = {
      timeout: 100,
      behavior: 'instant',
      signal: controller.signal,
    }

    await expect(orchestrator.scrollTo(css('#target-1'), options)).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.scrollTo',
      'wait.settle',
    ])
    expect(surface.scrollTo).toHaveBeenCalledWith(target, options)
    expect(wait.invalidateGeometry).toHaveBeenCalledWith('scroll')
    expect(wait.settle).toHaveBeenCalledWith('settled', {
      timeout: 100,
      signal: controller.signal,
    })
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'surface:scrolled',
          data: expect.objectContaining({
            action: 'scrollTo',
            targetId: 'target-1',
            inputKind: 'target',
          }),
        }),
      ]),
    )
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.scrollTo',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'scrollTo',
          completed: true,
          targetId: 'target-1',
          output: expect.objectContaining({
            inputKind: 'target',
          }),
        }),
      }),
    )
  })

  it('scrollTo passes positions to the surface engine and leaves coordinate policy there', async () => {
    const { calls, orchestrator, resolver, surface, trace, wait } = createHarness()
    const position = { x: 10, y: 20, coordinateSpace: 'viewport' }

    await expect(orchestrator.scrollTo(position, { behavior: 'smooth' })).resolves.toBeUndefined()

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(calls).toEqual(['surface.scrollTo', 'wait.settle'])
    expect(surface.scrollTo).toHaveBeenCalledWith(position, { behavior: 'smooth' })
    expect(wait.invalidateGeometry).toHaveBeenCalledWith('scroll')
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'surface:scrolled',
          data: expect.objectContaining({
            action: 'scrollTo',
            inputKind: 'position',
          }),
        }),
      ]),
    )
  })

  it('scrollTo reports unsupported position coordinate spaces from the perform phase', async () => {
    const { calls, orchestrator, resolver, surface, trace, wait } = createHarness()
    const position = { x: 10, y: 20, coordinateSpace: 'screen' }
    const failure = actorbleError(
      'PLATFORM_UNSUPPORTED',
      'Scroll position coordinate space screen is not supported by the surface engine yet.',
      {
        details: {
          action: 'scrollTo',
          coordinateSpace: 'screen',
          supportedCoordinateSpaces: ['viewport', 'document'],
        },
      },
    )
    surface.scrollTo.mockImplementationOnce(async () => {
      calls.push('surface.scrollTo')
      throw failure
    })

    await expect(orchestrator.scrollTo(position)).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: expect.objectContaining({
        action: 'scrollTo',
        coordinateSpace: 'screen',
        supportedCoordinateSpaces: ['viewport', 'document'],
      }),
    })

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(calls).toEqual(['surface.scrollTo'])
    expect(wait.invalidateGeometry).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.scrollTo',
        status: 'error',
        attributes: expect.objectContaining({
          phase: 'perform',
        }),
      }),
    )
  })

  it('scrollTo fails stale target validation with target context before scrolling', async () => {
    const staleTarget = {
      ...targetHandle('stale-scroll'),
      locator: css('#stale-scroll'),
      validity: 'stale',
    }
    const { orchestrator, surface, trace } = createHarness({
      target: staleTarget,
      validateFailure: actorbleError('TARGET_STALE', 'Target stale-scroll is stale.', {
        details: {
          targetId: 'stale-scroll',
          locator: { kind: 'css', selector: '#stale-scroll' },
        },
      }),
    })

    await expect(orchestrator.scrollTo(css('#stale-scroll'))).rejects.toMatchObject({
      code: 'TARGET_STALE',
      details: expect.objectContaining({
        targetId: 'stale-scroll',
      }),
    })

    expect(surface.scrollTo).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.scrollTo',
        status: 'error',
        attributes: expect.objectContaining({
          phase: 'validate',
          targetId: 'stale-scroll',
        }),
      }),
    )
  })

  it('drag resolves both endpoints, refreshes geometry before dispatch, preflights, settles, and traces synthetic pointer drag', async () => {
    const source = targetHandle('drag-source')
    const destination = targetHandle('drop-target')
    const sourceInitial = geometryFor(source, { x: 10, y: 20 })
    const destinationInitial = geometryFor(destination, { x: 100, y: 110 })
    const sourceFresh = geometryFor(source, { x: 12, y: 22 })
    const destinationFresh = geometryFor(destination, { x: 112, y: 122 })
    const { calls, events, gesture, orchestrator, trace, wait } = createHarness({
      target: source,
      resolveTargets: [source, destination],
      geometrySnapshots: [sourceInitial, destinationInitial, sourceFresh, destinationFresh],
      clickReports: [
        clickReportFor(source),
        clickReportFor(destination),
        clickReportFor(source),
        clickReportFor(destination),
      ],
      hitTestResults: [source.element, source.element, destination.element, destination.element],
    })

    await expect(
      orchestrator.drag(css('#drag-source'), css('#drop-target'), resolveActionOptions('drag')),
    ).resolves.toBeUndefined()

    expect(calls.slice(0, 15)).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canClick',
      'interactability.canClick',
      'geometry.snapshot',
      'geometry.snapshot',
      'interactability.canClick',
      'interactability.canClick',
      'gesture.drag',
    ])
    expect(gesture.drag).toHaveBeenCalledWith(
      { x: 12, y: 22 },
      { x: 112, y: 122 },
      expect.objectContaining({
        motion: { kind: 'ease', timing: 'ease-in-out', duration: 250 },
        resolveFromEndpoint: expect.any(Function),
        resolveToEndpoint: expect.any(Function),
      }),
    )
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(1, {
      type: 'pointermove',
      target: source.element,
      point: { x: 12, y: 22 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(2, {
      type: 'pointerdown',
      target: source.element,
      point: { x: 12, y: 22 },
      button: 'primary',
      buttons: ['primary'],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(3, {
      type: 'pointermove',
      target: destination.element,
      point: { x: 112, y: 122 },
      buttons: ['primary'],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(4, {
      type: 'pointerup',
      target: destination.element,
      point: { x: 112, y: 122 },
      button: 'primary',
      buttons: [],
    })
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pointer:synthetic-drag',
          data: expect.objectContaining({
            action: 'drag',
            capability: 'pointer-gesture',
            nativeDnD: false,
            sourceTargetId: 'drag-source',
            destinationTargetId: 'drop-target',
            sourcePoint: { x: 12, y: 22 },
            destinationPoint: { x: 112, y: 122 },
          }),
        }),
      ]),
    )
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.drag',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'drag',
          completed: true,
          targetId: 'drag-source',
          output: expect.objectContaining({
            sourceTargetId: 'drag-source',
            destinationTargetId: 'drop-target',
            capability: 'pointer-gesture',
            nativeDnD: false,
            gestureCompleted: true,
          }),
        }),
      }),
    )
  })

  it('drag forwards public pointer movement timing options to the gesture engine', async () => {
    const source = targetHandle('drag-source')
    const destination = targetHandle('drop-target')
    const motion = { kind: 'ease', timing: 'ease-in-out', duration: 520 }
    const { gesture, orchestrator } = createHarness({
      target: source,
      resolveTargets: [source, destination],
      geometrySnapshots: [
        geometryFor(source, { x: 10, y: 20 }),
        geometryFor(destination, { x: 100, y: 110 }),
        geometryFor(source, { x: 12, y: 22 }),
        geometryFor(destination, { x: 112, y: 122 }),
      ],
      clickReports: [
        clickReportFor(source),
        clickReportFor(destination),
        clickReportFor(source),
        clickReportFor(destination),
      ],
      hitTestResults: [source.element, source.element, destination.element, destination.element],
    })

    await expect(
      orchestrator.drag(css('#drag-source'), css('#drop-target'), {
        duration: 520,
        motion,
        timeout: 3500,
        force: true,
      }),
    ).resolves.toBeUndefined()

    expect(gesture.drag).toHaveBeenCalledWith(
      { x: 12, y: 22 },
      { x: 112, y: 122 },
      expect.objectContaining({
        duration: 520,
        motion,
        timeout: 3500,
      }),
    )
  })

  it('keeps drag pointer moves pressed for visual cursor and pointer event buttons', async () => {
    const source = targetHandle('drag-source')
    const destination = targetHandle('drop-target')
    const { events, orchestrator, visual } = createHarness({
      target: source,
      enableVisual: true,
      resolveTargets: [source, destination],
      geometrySnapshots: [
        geometryFor(source, { x: 10, y: 20 }),
        geometryFor(destination, { x: 100, y: 110 }),
        geometryFor(source, { x: 12, y: 22 }),
        geometryFor(destination, { x: 112, y: 122 }),
      ],
      clickReports: [
        clickReportFor(source),
        clickReportFor(destination),
        clickReportFor(source),
        clickReportFor(destination),
      ],
      hitTestResults: [source.element, source.element, destination.element, destination.element],
    })

    await expect(orchestrator.drag(css('#drag-source'), css('#drop-target'))).resolves.toBeUndefined()

    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'pointermove',
        target: destination.element,
        point: { x: 112, y: 122 },
        buttons: ['primary'],
      }),
    )
    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 12, y: 22 },
      cursor: 'default',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 12, y: 22 },
      cursor: 'default',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(3, {
      point: { x: 112, y: 122 },
      cursor: 'default',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(4, {
      point: { x: 112, y: 122 },
      cursor: 'default',
      pressed: false,
    })
  })

  it('drag fails endpoint preflight without dispatching gesture events', async () => {
    const source = targetHandle('drag-source')
    const destination = targetHandle('drop-target')
    const { events, gesture, orchestrator, trace } = createHarness({
      target: source,
      resolveTargets: [source, destination],
      geometrySnapshots: [
        geometryFor(source, { x: 10, y: 20 }),
        geometryFor(destination, { x: 100, y: 110 }),
      ],
      clickReports: [
        clickReportFor(source),
        clickReportFor(destination, {
          enabled: false,
          canClick: false,
          canFocus: false,
          canType: false,
          blockingReasons: ['disabled'],
          unforceableReasons: ['disabled'],
        }),
      ],
    })

    await expect(orchestrator.drag(css('#drag-source'), css('#drop-target'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'drag',
        targetId: 'drop-target',
        blockingReasons: ['disabled'],
      }),
    })

    expect(gesture.drag).not.toHaveBeenCalled()
    expect(events.dispatchPointerEvent).not.toHaveBeenCalled()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.drag',
        status: 'error',
        attributes: expect.objectContaining({ phase: 'preflight' }),
      }),
    )
  })

  it('drag cancellation after pointer down cleans up pressed and dragging state', async () => {
    const source = targetHandle('drag-source')
    const destination = targetHandle('drop-target')
    const { gesture, orchestrator, state, trace, visual } = createHarness({
      target: source,
      enableVisual: true,
      resolveTargets: [source, destination],
      geometrySnapshots: [
        geometryFor(source, { x: 10, y: 20 }),
        geometryFor(destination, { x: 100, y: 110 }),
        geometryFor(source, { x: 10, y: 20 }),
        geometryFor(destination, { x: 100, y: 110 }),
      ],
      clickReports: [
        clickReportFor(source),
        clickReportFor(destination),
        clickReportFor(source),
        clickReportFor(destination),
      ],
      hitTestResults: [source.element, source.element],
      dragFailure: cancellationError('drag', 'scenario stopped'),
      cursorStyle: () => 'grab',
    })

    await expect(orchestrator.drag(css('#drag-source'), css('#drop-target'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(gesture.cancel).toHaveBeenCalledOnce()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 10, y: 20 },
      cursor: 'grab',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 10, y: 20 },
      cursor: 'grab',
      pressed: false,
    })
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.drag',
        status: 'cancelled',
      }),
    )
  })

  it('clickCurrent clicks the current hover target and point without resolving a target', async () => {
    const { calls, events, gesture, orchestrator, resolver, target, trace, wait } = createHarness()

    await expect(orchestrator.moveTo(css('#target-1'), { duration: 0 })).resolves.toBeUndefined()

    calls.length = 0
    events.dispatchPointerEvent.mockClear()
    events.dispatchMouseEvent.mockClear()
    gesture.click.mockClear()
    resolver.resolve.mockClear()
    resolver.validate.mockClear()

    await expect(orchestrator.clickCurrent({ duration: 0, pressDwell: 0 })).resolves.toBeUndefined()

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(calls).toEqual([
      'geometry.snapshot',
      'interactability.canClick',
      'gesture.click',
      'event.pointermove',
      'state.active:true',
      'event.pointerdown',
      'state.active:false',
      'event.pointerup',
      'event.click',
      'wait.settle',
    ])
    expect(gesture.click).toHaveBeenCalledWith(
      target,
      { x: 20, y: 30 },
      {
        duration: 0,
        pressDwell: 0,
        refreshPointBeforeDown: expect.any(Function),
      },
    )
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.clickCurrent',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'clickCurrent',
          completed: true,
          targetId: 'target-1',
          output: expect.objectContaining({
            point: { x: 20, y: 30 },
            activationDispatched: true,
          }),
        }),
      }),
    )
  })

  it('clickCurrent reports an actionable error when no current pointer target exists', async () => {
    const { events, gesture, orchestrator, trace } = createHarness()

    await expect(orchestrator.clickCurrent()).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND',
      details: expect.objectContaining({
        action: 'clickCurrent',
        capability: 'current-pointer-target',
        hasCurrentPoint: false,
        hoveredCount: 0,
      }),
    })

    expect(gesture.click).not.toHaveBeenCalled()
    expect(events.dispatchPointerEvent).not.toHaveBeenCalled()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.clickCurrent',
        status: 'error',
        attributes: expect.objectContaining({ phase: 'resolve' }),
      }),
    )
  })

  it('clickCurrent falls back to hit-testing the last pointer point when hover is empty', async () => {
    const { calls, dom, events, gesture, orchestrator, resolver, store, target } = createHarness({
      trackHitTests: true,
    })

    await expect(orchestrator.moveTo(css('#target-1'), { duration: 0 })).resolves.toBeUndefined()
    store.reset()
    calls.length = 0
    events.dispatchPointerEvent.mockClear()
    events.dispatchMouseEvent.mockClear()
    gesture.click.mockClear()
    resolver.resolve.mockClear()
    resolver.validate.mockClear()
    dom.elementFromPoint.mockClear()

    await expect(
      orchestrator.clickCurrent({ duration: 0, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(dom.elementFromPoint).toHaveBeenCalledWith(
      { x: 20, y: 30 },
      { ignoreActorbleInternal: true },
    )
    expect(gesture.click).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^pointer-hit-/),
        element: target.element,
      }),
      { x: 20, y: 30 },
      {
        duration: 0,
        pressDwell: 0,
        refreshPointBeforeDown: expect.any(Function),
      },
    )
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'click',
        target: target.element,
        point: { x: 20, y: 30 },
      }),
    )
  })

  it('clickCurrent fails stale current targets without re-resolving them', async () => {
    const staleTarget = {
      ...targetHandle('stale-current'),
      locator: css('#stale-current'),
      validity: 'stale',
    }
    const { events, gesture, orchestrator, resolver, trace } = createHarness({
      target: staleTarget,
    })

    await expect(
      orchestrator.moveTo(css('#stale-current'), { duration: 0 }),
    ).resolves.toBeUndefined()

    resolver.resolve.mockClear()
    resolver.validate.mockClear()
    gesture.click.mockClear()
    events.dispatchPointerEvent.mockClear()
    events.dispatchMouseEvent.mockClear()

    await expect(orchestrator.clickCurrent()).rejects.toMatchObject({
      code: 'TARGET_STALE',
      details: expect.objectContaining({
        action: 'clickCurrent',
        targetId: 'stale-current',
        validity: 'stale',
      }),
    })

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(gesture.click).not.toHaveBeenCalled()
    expect(events.dispatchPointerEvent).not.toHaveBeenCalled()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.clickCurrent',
        status: 'error',
        attributes: expect.objectContaining({ phase: 'validate' }),
      }),
    )
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'current-target:validate',
          data: expect.objectContaining({
            action: 'clickCurrent',
            targetId: 'stale-current',
            validity: 'stale',
          }),
        }),
      ]),
    )
  })

  it('clickCurrent fails preflight without dispatching gesture events', async () => {
    const blockedTarget = targetHandle('blocked-current')
    const { events, gesture, orchestrator, trace } = createHarness({
      target: blockedTarget,
      clickReport: clickReportFor(blockedTarget, {
        enabled: false,
        canClick: false,
        canFocus: false,
        canType: false,
        blockingReasons: ['disabled'],
        unforceableReasons: ['disabled'],
      }),
    })

    await expect(
      orchestrator.moveTo(css('#blocked-current'), { duration: 0 }),
    ).resolves.toBeUndefined()

    gesture.click.mockClear()
    events.dispatchPointerEvent.mockClear()
    events.dispatchMouseEvent.mockClear()

    await expect(orchestrator.clickCurrent()).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'clickCurrent',
        blockingReasons: ['disabled'],
        targetId: 'blocked-current',
      }),
    })

    expect(gesture.click).not.toHaveBeenCalled()
    expect(events.dispatchPointerEvent).not.toHaveBeenCalled()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.clickCurrent',
        status: 'error',
        attributes: expect.objectContaining({ phase: 'preflight' }),
      }),
    )
  })

  it('focus resolves, reveals, checks focusability, focuses, and waits for settlement', async () => {
    const { calls, focus, orchestrator, target, trace, wait } = createHarness()
    const controller = new AbortController()

    await expect(
      orchestrator.focus(css('#target-1'), {
        timeout: 100,
        focusVisible: true,
        signal: controller.signal,
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'interactability.canFocus',
      'focus.focus',
      'state.focus:true,focus-visible:true',
      'wait.settle',
    ])
    expect(focus.focus).toHaveBeenCalledWith(target, {
      timeout: 100,
      focusVisible: true,
      signal: controller.signal,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {
      timeout: 100,
      signal: controller.signal,
    })
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.focus',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'focus',
          completed: true,
          targetId: 'target-1',
          output: expect.objectContaining({
            focusedTargetId: 'target-1',
            focusVisible: true,
          }),
        }),
      }),
    )
  })

  it('fails focus preflight without requesting focus when the target is not focusable', async () => {
    const { focus, orchestrator, trace } = createHarness({
      focusReport: {
        target: targetHandle('blocked-focus'),
        visible: true,
        enabled: true,
        receivesPointerEvents: true,
        canClick: true,
        canFocus: false,
        canType: false,
        blockingReasons: ['not-focusable'],
        forceBypassedReasons: [],
        unforceableReasons: ['not-focusable'],
      },
    })

    await expect(orchestrator.focus(css('#target-1'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'focus',
        blockingReasons: ['not-focusable'],
      }),
    })

    expect(focus.focus).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.focus',
        status: 'error',
        attributes: expect.objectContaining({ phase: 'preflight' }),
      }),
    )
  })

  it('cleans transient focus visual feedback after successful focus settlement', async () => {
    const { orchestrator, store, target, visual, wait } = createHarness({
      enableVisual: true,
      visualFeedback: { focusOverlay: true },
    })

    await expect(
      orchestrator.focus(css('#target-1'), { focusVisible: true }),
    ).resolves.toBeUndefined()

    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(store.snapshot().focused).toMatchObject({ id: target.id })
    expect(visual.showFocus).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
    expect(visual.clearFeedback).toHaveBeenCalledOnce()
  })

  it('cleans focus visual state when focus wait is cancelled after platform focus', async () => {
    const wait = {
      waitFor: vi.fn(),
      settle: vi.fn(async () => {
        throw cancellationError('wait.settle', 'scenario stopped')
      }),
      invalidateGeometry: vi.fn(),
    }
    const { orchestrator, state, store, visual } = createHarness({
      enableVisual: true,
      visualFeedback: { focusOverlay: true },
      wait,
    })

    await expect(
      orchestrator.focus(css('#target-1'), { focusVisible: true }),
    ).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(store.snapshot().focused).toBeNull()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(visual.showFocus).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: 'target-1' }),
      active: false,
    })
    expect(visual.clearFeedback).toHaveBeenCalledOnce()
  })

  it('applies hover effects to hit-tested elements during timed pointer movement', async () => {
    const target = targetHandle()
    const intermediate = targetHandle('intermediate')
    const timeline = createFrameTimeline()
    const { dom, orchestrator, state } = createHarness({
      target,
      timeline,
      useRealGesture: true,
      elementFromPoint: (point) => (point.x < 20 ? intermediate.element : target.element),
    })

    await expect(
      orchestrator.moveTo(css('#target-1'), resolveActionOptions('moveTo')),
    ).resolves.toBeUndefined()

    expect(dom.elementFromPoint).toHaveBeenCalledWith(
      { x: 10, y: 15 },
      { ignoreActorbleInternal: true },
    )
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(1, [
      {
        kind: 'hover',
        target: expect.objectContaining({ element: intermediate.element }),
        active: true,
      },
    ])
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(2, [
      {
        kind: 'hover',
        target: expect.objectContaining({ element: intermediate.element }),
        active: false,
      },
      {
        kind: 'hover',
        target: expect.objectContaining({ element: target.element }),
        active: true,
      },
    ])
  })

  it('consumes resolved public ease movement options for moveTo', async () => {
    const { gesture, orchestrator } = createHarness()

    await expect(
      orchestrator.moveTo(css('#target-1'), resolveActionOptions('moveTo')),
    ).resolves.toBeUndefined()

    expect(gesture.hover).toHaveBeenCalledWith(
      { x: 20, y: 30 },
      expect.objectContaining({
        motion: { kind: 'ease', timing: 'ease-in-out', duration: 250 },
        resolveEndpoint: expect.any(Function),
      }),
    )
  })

  it('does not synthesize public movement defaults for unresolved moveTo options', async () => {
    const { gesture, orchestrator } = createHarness()

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(gesture.hover).toHaveBeenCalledWith(
      { x: 20, y: 30 },
      {
        resolveEndpoint: expect.any(Function),
      },
    )
  })

  it('preserves explicit zero-duration public movement', async () => {
    const { gesture, orchestrator } = createHarness()

    await expect(
      orchestrator.moveTo(css('#target-1'), { duration: 0, timeout: 100 }),
    ).resolves.toBeUndefined()

    expect(gesture.hover).toHaveBeenCalledWith(
      { x: 20, y: 30 },
      expect.objectContaining({ duration: 0, timeout: 100 }),
    )
  })

  it('routes resolved public click movement options before pointer down', async () => {
    const timeline = createFrameTimeline()
    const { calls, events, orchestrator } = createHarness({
      timeline,
      useRealGesture: true,
    })

    await expect(
      orchestrator.click(css('#target-1'), resolveActionOptions('click')),
    ).resolves.toBeUndefined()

    expect(timeline.nextFrame).toHaveBeenCalledTimes(2)
    expect(timeline.delay).toHaveBeenCalledWith(80, {})
    expect(calls.filter((call) => call.startsWith('event.'))).toEqual([
      'event.pointermove',
      'event.pointermove',
      'event.pointerdown',
      'event.pointerup',
      'event.click',
    ])
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(1, {
      type: 'pointermove',
      target: expect.any(HTMLButtonElement),
      point: { x: 10, y: 15 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(2, {
      type: 'pointermove',
      target: expect.any(HTMLButtonElement),
      point: { x: 20, y: 30 },
      buttons: [],
    })
  })

  it('does not synthesize public click motion or dwell defaults for unresolved click options', async () => {
    const { gesture, orchestrator, target } = createHarness()

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(gesture.click).toHaveBeenCalledWith(target, { x: 20, y: 30 }, {
      refreshPointBeforeDown: expect.any(Function),
      resolveEndpoint: expect.any(Function),
    })
  })

  it('starts real pointer movement from the configured initial position', async () => {
    const timeline = createFrameTimeline()
    const { events, orchestrator } = createHarness({
      pointer: { initialPosition: { x: 80, y: 90 } },
      timeline,
      useRealGesture: true,
    })

    await expect(
      orchestrator.click(css('#target-1'), resolveActionOptions('click')),
    ).resolves.toBeUndefined()

    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(1, {
      type: 'pointermove',
      target: expect.any(HTMLButtonElement),
      point: { x: 50, y: 60 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(2, {
      type: 'pointermove',
      target: expect.any(HTMLButtonElement),
      point: { x: 20, y: 30 },
      buttons: [],
    })
  })

  it('keeps click dispatch on the command target while hover follows pointer hit-testing', async () => {
    const target = targetHandle()
    const intermediate = targetHandle('intermediate-click-hover')
    const timeline = createFrameTimeline()
    const { events, orchestrator, state } = createHarness({
      target,
      timeline,
      useRealGesture: true,
      elementFromPoint: (point) => (point.x < 20 ? intermediate.element : target.element),
    })

    await expect(
      orchestrator.click(css('#target-1'), {
        ...resolveActionOptions('click'),
        pressDwell: 0,
      }),
    ).resolves.toBeUndefined()

    expect(state.applyStateEffects).toHaveBeenNthCalledWith(1, [
      {
        kind: 'hover',
        target: expect.objectContaining({ element: intermediate.element }),
        active: true,
      },
    ])
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(2, [
      {
        kind: 'hover',
        target: expect.objectContaining({ element: intermediate.element }),
        active: false,
      },
      {
        kind: 'hover',
        target: expect.objectContaining({ element: target.element }),
        active: true,
      },
    ])
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(3, {
      type: 'pointerdown',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: ['primary'],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(4, {
      type: 'pointerup',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
    })
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
  })

  it('preserves explicit inertia movement as unsupported pointer opt-in behavior', async () => {
    const { gesture, orchestrator, target } = createHarness()
    const motion = { kind: 'inertia', initialVelocity: 1200 }

    await expect(
      orchestrator.click(css('#target-1'), { motion, timeout: 1500 }),
    ).resolves.toBeUndefined()

    expect(gesture.click).toHaveBeenCalledWith(
      target,
      { x: 20, y: 30 },
      expect.objectContaining({
        motion,
        timeout: 1500,
        refreshPointBeforeDown: expect.any(Function),
      }),
    )
  })

  it('routes pointer and click visual hooks without changing core dispatch order', async () => {
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      visualFeedback: 'debug',
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'visual.cursor:20,30:default',
      'event.pointermove',
      'state.active:true',
      'visual.cursor:20,30:default',
      'event.pointerdown',
      'state.active:false',
      'visual.cursor:20,30:default',
      'event.pointerup',
      'event.click',
      'visual.click',
      'wait.settle',
    ])
    expect(visual.highlightTarget).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: 'target-1' }),
      rect: { x: 10, y: 20, width: 20, height: 20 },
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 20, y: 30 },
      cursor: 'default',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'default',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(3, {
      point: { x: 20, y: 30 },
      cursor: 'default',
      pressed: false,
    })
    expect(visual.showClick).toHaveBeenCalledTimes(1)
  })

  it('anchors moveTo visuals after success so hover tracking can follow layout changes', async () => {
    const pointerVisual = createPointerVisualTrackerDouble()
    const { orchestrator, target } = createHarness({ pointerVisual })

    await expect(
      orchestrator.moveTo(css('#target-1'), resolveActionOptions('moveTo')),
    ).resolves.toBeUndefined()

    const modes = pointerVisual.setMode.mock.calls.map(([mode]) => mode)
    const freePointModes = modes.filter((mode) => mode.kind === 'freePoint')
    const targetAnchorModes = modes.filter((mode) => mode.kind === 'targetAnchor')

    expect(freePointModes).toEqual([
      {
        kind: 'freePoint',
        point: { x: 20, y: 30 },
        pressed: false,
      },
    ])
    expect(targetAnchorModes).toHaveLength(1)
    expect(targetAnchorModes[0]).toMatchObject({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
      lastPoint: { x: 20, y: 30 },
    })
  })

  it('keeps click visuals at the final pointer coordinate after success', async () => {
    const pointerVisual = createPointerVisualTrackerDouble()
    const { orchestrator } = createHarness({ pointerVisual })

    await expect(
      orchestrator.click(css('#target-1'), { duration: 0, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    const modes = pointerVisual.setMode.mock.calls.map(([mode]) => mode)

    expect(modes).toEqual([
      {
        kind: 'freePoint',
        point: { x: 20, y: 30 },
        pressed: false,
      },
      {
        kind: 'freePoint',
        point: { x: 20, y: 30 },
        pressed: true,
      },
      {
        kind: 'freePoint',
        point: { x: 20, y: 30 },
        pressed: false,
      },
    ])
  })

  it('keeps timed pointer movement modes on free point coordinates until success', async () => {
    const pointerVisual = createPointerVisualTrackerDouble()
    const timeline = createFrameTimeline()
    const { orchestrator } = createHarness({
      pointerVisual,
      timeline,
      useRealGesture: true,
    })

    await expect(
      orchestrator.moveTo(css('#target-1'), resolveActionOptions('moveTo')),
    ).resolves.toBeUndefined()

    const modes = pointerVisual.setMode.mock.calls.map(([mode]) => mode)
    const freePointModes = modes.filter((mode) => mode.kind === 'freePoint')
    const targetAnchorModes = modes.filter((mode) => mode.kind === 'targetAnchor')

    expect(freePointModes).toEqual([
      {
        kind: 'freePoint',
        point: { x: 10, y: 15 },
        pressed: false,
      },
      {
        kind: 'freePoint',
        point: { x: 20, y: 30 },
        pressed: false,
      },
    ])
    expect(targetAnchorModes).toEqual([
      expect.objectContaining({
        kind: 'targetAnchor',
        commandId: 1,
        pressed: false,
        lastPoint: { x: 20, y: 30 },
      }),
    ])
  })

  it('clears free-point cursor follow state when pointer perform is cancelled', async () => {
    const pointerVisual = createPointerVisualTrackerDouble()
    const { orchestrator } = createHarness({
      pointerVisual,
      clickFailure: cancellationError('click', 'scenario stopped'),
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })

    expect(pointerVisual.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'freePoint',
        point: { x: 20, y: 30 },
        pressed: true,
      }),
    )
    expect(pointerVisual.setMode.mock.calls.map(([mode]) => mode.kind)).not.toContain(
      'targetAnchor',
    )
    expect(pointerVisual.clear).toHaveBeenCalled()
  })

  it('honors granular visual feedback options at the orchestrator boundary', async () => {
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      visualFeedback: {
        cursor: false,
        targetHighlight: true,
        clickFeedback: false,
      },
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'event.pointermove',
      'state.active:true',
      'event.pointerdown',
      'state.active:false',
      'event.pointerup',
      'event.click',
      'wait.settle',
    ])
    expect(visual.highlightTarget).toHaveBeenCalledTimes(1)
    expect(visual.showCursor).not.toHaveBeenCalled()
    expect(visual.showClick).not.toHaveBeenCalled()
  })

  it('uses quiet-based defaults when orchestrator visual feedback options are explicit', () => {
    const { store, target, visual } = createHarness({
      enableVisual: true,
      visualFeedback: { focusOverlay: true },
    })

    store.setFocused(target, true)
    store.setTyping(target)

    expect(visual.showFocus).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
    expect(visual.showTyping).not.toHaveBeenCalled()
  })

  it('shows focus overlay for ordinary focus effects when focus feedback is enabled', () => {
    const { store, target, visual } = createHarness({
      enableVisual: true,
      visualFeedback: { focusOverlay: true },
    })

    store.setFocused(target, false)

    expect(visual.showFocus).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
  })

  it('routes computed cursor after hover state effects on pointer move', async () => {
    const target = targetHandle()
    const cursorStyles = new Map([[target.element, 'pointer']])
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyles,
      trackCursorReads: true,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'gesture.hover',
      'state.hover:true',
      'dom.cursor:target-1',
      'visual.cursor:20,30:pointer',
      'event.pointermove',
      'wait.settle',
    ])
    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('reads pointer cursor style from the current hit-tested hover target', async () => {
    const target = targetHandle()
    const hoverTarget = targetHandle('cursor-hover-target')
    const cursorStyles = new Map([
      [target.element, 'pointer'],
      [hoverTarget.element, 'crosshair'],
    ])
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyles,
      trackCursorReads: true,
      hitTestResults: [hoverTarget.element],
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'gesture.hover',
      'state.hover:true',
      'dom.cursor:cursor-hover-target',
      'visual.cursor:20,30:crosshair',
      'event.pointermove',
      'wait.settle',
    ])
    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'crosshair',
      pressed: false,
    })
  })

  it('refreshes cursor visuals after active state effects on pointer down and up', async () => {
    const target = targetHandle()
    const cursors = ['pointer', 'grabbing', 'pointer']
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyle: () => cursors.shift() ?? 'pointer',
      trackCursorReads: true,
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'dom.cursor:target-1',
      'visual.cursor:20,30:pointer',
      'event.pointermove',
      'state.active:true',
      'dom.cursor:target-1',
      'visual.cursor:20,30:grabbing',
      'event.pointerdown',
      'state.active:false',
      'dom.cursor:target-1',
      'visual.cursor:20,30:pointer',
      'event.pointerup',
      'event.click',
      'visual.click',
      'wait.settle',
    ])
    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'grabbing',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(3, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('restores pressed cursor visual when click is cancelled during press dwell', async () => {
    const controlled = createBlockingTimeline()
    const controller = new AbortController()
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      useRealGesture: true,
      timeline: controlled.timeline,
      cursorStyle: () => 'pointer',
    })

    const click = orchestrator.click(css('#target-1'), {
      duration: 0,
      pressDwell: 80,
      signal: controller.signal,
    })

    await vi.waitFor(() => {
      expect(controlled.pendingDelayCount).toBe(1)
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: true,
    })

    controller.abort('scenario stopped')

    await expect(click).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('times out click perform during press dwell with action timeout cleanup', async () => {
    vi.useFakeTimers()
    const controlled = createBlockingTimeline()
    const controller = new AbortController()
    const { orchestrator, state, trace, visual } = createHarness({
      enableVisual: true,
      useRealGesture: true,
      timeline: controlled.timeline,
      cursorStyle: () => 'pointer',
    })
    let click

    try {
      click = orchestrator.click(css('#target-1'), {
        duration: 0,
        pressDwell: 80,
        timeout: 25,
        signal: controller.signal,
      })
      const clickResult = click.then(
        () => 'resolved',
        (error) => error,
      )

      await vi.waitFor(() => {
        expect(controlled.pendingDelayCount).toBe(1)
      })
      expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
        point: { x: 20, y: 30 },
        cursor: 'pointer',
        pressed: true,
      })

      const missedDeadline = Symbol('missedDeadline')
      const deadline = new Promise((resolve) => {
        setTimeout(() => resolve(missedDeadline), 25)
      })

      await vi.advanceTimersByTimeAsync(25)
      const result = await Promise.race([clickResult, deadline])

      expect(result).toMatchObject({
        code: 'ACTION_TIMEOUT',
        details: {
          operation: 'action.click',
          timeout: 25,
        },
      })
      expect(state.cleanup).toHaveBeenCalledOnce()
      expect(visual.showCursor).toHaveBeenLastCalledWith({
        point: { x: 20, y: 30 },
        cursor: 'pointer',
        pressed: false,
      })
      expect(trace.getTrace().spans.at(-1)).toEqual(
        expect.objectContaining({
          name: 'action.click',
          status: 'error',
          attributes: expect.objectContaining({
            action: 'click',
            phase: 'perform',
          }),
        }),
      )
    } finally {
      controller.abort('test cleanup')
      await click?.catch(() => {})
      vi.useRealTimers()
    }
  })

  it('passes one perform signal to pointer actions with public timeouts', async () => {
    const move = createHarness()

    await expect(
      move.orchestrator.moveTo(css('#target-1'), { timeout: 100 }),
    ).resolves.toBeUndefined()

    expectCancellationSignal(move.gesture.hover.mock.calls[0][1].signal)

    const click = createHarness()

    await expect(
      click.orchestrator.click(css('#target-1'), { timeout: 100 }),
    ).resolves.toBeUndefined()

    expectCancellationSignal(click.gesture.click.mock.calls[0][2].signal)

    const doubleClick = createHarness()

    await expect(
      doubleClick.orchestrator.doubleClick(css('#target-1'), { timeout: 100 }),
    ).resolves.toBeUndefined()

    expectCancellationSignal(doubleClick.gesture.doubleClick.mock.calls[0][2].signal)

    const current = createHarness()

    await expect(
      current.orchestrator.moveTo(css('#target-1'), { duration: 0 }),
    ).resolves.toBeUndefined()
    current.gesture.click.mockClear()

    await expect(
      current.orchestrator.clickCurrent({ timeout: 100 }),
    ).resolves.toBeUndefined()

    expectCancellationSignal(current.gesture.click.mock.calls[0][2].signal)

    const typeTarget = inputTargetHandle()
    const typeInto = createHarness({ target: typeTarget })

    await expect(
      typeInto.orchestrator.typeInto(css('#target-1'), 'H', {
        delay: 0,
        focusStrategy: 'click',
        timeout: 100,
        focusClick: { duration: 0, pressDwell: 0 },
      }),
    ).resolves.toBeUndefined()

    expectCancellationSignal(typeInto.gesture.click.mock.calls[0][2].signal)

    const source = targetHandle('drag-source')
    const destination = targetHandle('drop-target')
    const drag = createHarness({
      target: source,
      resolveTargets: [source, destination],
      geometrySnapshots: [
        geometryFor(source, { x: 10, y: 20 }),
        geometryFor(destination, { x: 100, y: 110 }),
        geometryFor(source, { x: 12, y: 22 }),
        geometryFor(destination, { x: 112, y: 122 }),
      ],
      clickReports: [
        clickReportFor(source),
        clickReportFor(destination),
        clickReportFor(source),
        clickReportFor(destination),
      ],
    })

    await expect(
      drag.orchestrator.drag(css('#drag-source'), css('#drop-target'), { timeout: 100 }),
    ).resolves.toBeUndefined()

    expectCancellationSignal(drag.gesture.drag.mock.calls[0][2].signal)
  })

  it('restores pressed cursor visual when click cancellation emits pointer cancelled', async () => {
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      clickFailure: cancellationError('click', 'scenario stopped'),
      cursorStyle: () => 'pointer',
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })

    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('restores pressed cursor visual during failed perform cleanup without a cancellation signal', async () => {
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      clickFailure: new Error('perform failed after pointer down'),
      cancelFailure: new Error('cancel failed before signal'),
      cursorStyle: () => 'pointer',
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
    })

    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('falls back through indirect cursor values and lets unsupported cursors reach the visual layer', async () => {
    const parent = document.createElement('section')
    parent.id = 'parent'
    const target = targetHandle()
    parent.append(target.element)
    document.body.append(parent)
    const cursorStyles = new Map([
      [target.element, 'inherit'],
      [parent, 'url(cursor.svg), copy'],
    ])
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyles,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'url(cursor.svg), copy',
      pressed: false,
    })
  })

  it('uses a text cursor visual for editable text targets when resolved cursor is indirect', async () => {
    const target = inputTargetHandle()
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyle: () => 'auto',
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'text',
      pressed: false,
    })
  })

  it('keeps explicit cursor values ahead of editable semantic fallback', async () => {
    const target = inputTargetHandle()
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyle: () => 'pointer',
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('keeps ancestor-resolved cursor values ahead of editable semantic fallback', async () => {
    const parent = document.createElement('section')
    parent.id = 'parent'
    const target = inputTargetHandle()
    parent.append(target.element)
    document.body.append(parent)
    const cursorStyles = new Map([
      [target.element, 'inherit'],
      [parent, 'wait'],
    ])
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyles,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'wait',
      pressed: false,
    })
  })

  it('does not use editable semantic cursor fallback for disabled text targets', async () => {
    const target = inputTargetHandle()
    target.element.setAttribute('disabled', '')
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyle: () => 'auto',
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      pressed: false,
    })
  })

  it('records cursor resolution failures as warnings without failing the action', async () => {
    const dom = {
      getComputedStyle: vi.fn(() => {
        throw new Error('style read blocked')
      }),
      getParentElement: vi.fn((element) => element.parentElement),
    }
    const { orchestrator, trace, visual } = createHarness({
      enableVisual: true,
      dom,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      pressed: false,
    })
    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Cursor style resolution failed.',
          details: expect.objectContaining({
            error: 'style read blocked',
            targetId: 'target-1',
          }),
        }),
      ]),
    )
  })

  it('typeInto resolves and checks type interactability before delegating text input', async () => {
    const { calls, orchestrator, target, text } = createHarness()
    const controller = new AbortController()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'hello', {
        delay: 8,
        timeout: 100,
        signal: controller.signal,
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canType',
      'text.typeInto',
      'wait.settle',
    ])
    expect(text.typeInto).toHaveBeenCalledWith(target, 'hello', {
      delay: 8,
      timeout: 100,
      signal: controller.signal,
    })
  })

  it('keeps explicit programmatic typeInto focus from performing a pointer click', async () => {
    const { gesture, orchestrator, target, text } = createHarness()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'hello', {
        delay: 0,
        focusStrategy: 'programmatic',
        focusClick: { duration: 0, pressDwell: 0 },
      }),
    ).resolves.toBeUndefined()

    expect(gesture.click).not.toHaveBeenCalled()
    expect(text.typeInto).toHaveBeenCalledWith(target, 'hello', {
      delay: 0,
    })
  })

  it('clicks to acquire focus before dispatching typeInto input events', async () => {
    const { input, orchestrator, timeline } = createRealTextHarness()
    const seen = []

    for (const eventName of [
      'pointermove',
      'pointerdown',
      'pointerup',
      'beforeinput',
      'input',
      'change',
    ]) {
      input.addEventListener(eventName, (event) => {
        seen.push(event.type)
      })
    }
    input.addEventListener('click', (event) => {
      seen.push(event.type)
      input.focus()
    })

    await expect(
      orchestrator.typeInto(css('#target-1'), 'H', {
        delay: 0,
        focusStrategy: 'click',
        focusClick: { duration: 0, pressDwell: 0 },
        afterFocusDelay: 5,
      }),
    ).resolves.toBeUndefined()

    expect(seen).toEqual([
      'pointermove',
      'pointerdown',
      'pointerup',
      'click',
      'beforeinput',
      'input',
      'change',
    ])
    expect(input.value).toBe('H')
    expect(timeline.delay).toHaveBeenCalledWith(5, {})
  })

  it('uses fresh geometry for click-focused typeInto focus clicks', async () => {
    const target = inputTargetHandle()
    const initialGeometry = geometryFor(target, { x: 20, y: 30 })
    const freshGeometry = geometryFor(target, { x: 80, y: 90 })
    const { events, orchestrator, text } = createHarness({
      target,
      geometry: initialGeometry,
      geometrySnapshots: [initialGeometry, freshGeometry],
      useRealGesture: true,
    })

    await expect(
      orchestrator.typeInto(css('#target-1'), 'H', {
        delay: 0,
        focusStrategy: 'click',
        focusClick: { duration: 0, pressDwell: 0 },
      }),
    ).resolves.toBeUndefined()

    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(2, {
      type: 'pointermove',
      target: target.element,
      point: { x: 80, y: 90 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(3, {
      type: 'pointerdown',
      target: target.element,
      point: { x: 80, y: 90 },
      button: 'primary',
      buttons: ['primary'],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(4, {
      type: 'pointerup',
      target: target.element,
      point: { x: 80, y: 90 },
      button: 'primary',
      buttons: [],
    })
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 80, y: 90 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(text.typeInto).toHaveBeenCalledWith(target, 'H', {
      delay: 0,
      focusStrategy: 'none',
    })
  })

  it('fails click-focused typeInto when the click does not focus the target', async () => {
    const other = inputTargetHandle('other-target')
    const { events, orchestrator, text } = createHarness({
      target: inputTargetHandle(),
      focusedSnapshot: {
        active: other,
        previous: null,
        focusVisible: false,
      },
    })

    await expect(
      orchestrator.typeInto(css('#target-1'), 'hello', {
        focusStrategy: 'click',
        focusClick: { duration: 0, pressDwell: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'typeInto',
        focusStrategy: 'click',
        targetId: 'target-1',
        focusedTargetId: 'other-target',
      }),
    })

    expect(events.dispatchMouseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'click' }),
    )
    expect(text.typeInto).not.toHaveBeenCalled()
  })

  it('cleans up pointer state when click-focused typeInto is cancelled during press', async () => {
    const { gesture, orchestrator, state, text, visual } = createHarness({
      enableVisual: true,
      target: inputTargetHandle(),
      clickFailure: cancellationError('typeInto click focus', 'scenario stopped'),
      cursorStyle: () => 'text',
    })

    await expect(
      orchestrator.typeInto(css('#target-1'), 'hello', {
        focusStrategy: 'click',
        focusClick: { duration: 0, pressDwell: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(gesture.cancel).toHaveBeenCalledOnce()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(text.typeInto).not.toHaveBeenCalled()
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'text',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'text',
      pressed: false,
    })
  })

  it('fill resolves and checks type interactability before replacing target text', async () => {
    const controller = new AbortController()
    const { calls, orchestrator, target, text, wait } = createHarness()

    await expect(
      orchestrator.fill(css('#target-1'), 'filled', {
        timeout: 100,
        signal: controller.signal,
        clear: false,
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canType',
      'text.fill',
      'wait.settle',
    ])
    expect(text.fill).toHaveBeenCalledWith(target, 'filled', {
      timeout: 100,
      signal: controller.signal,
      clear: false,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {
      timeout: 100,
      signal: controller.signal,
    })
  })

  it('does not apply typing cadence options to public fill', async () => {
    const { orchestrator, target, text } = createHarness()

    await expect(
      orchestrator.fill(css('#target-1'), 'filled', {
        delay: 25,
        timeout: 100,
      }),
    ).resolves.toBeUndefined()

    expect(text.fill).toHaveBeenCalledWith(target, 'filled', {
      timeout: 100,
    })
  })

  it('fills a target through the public action path without typing cadence', async () => {
    const { input, orchestrator, timeline, trace } = createRealTextHarness()
    input.value = 'old value'

    await expect(orchestrator.fill(css('#target-1'), 'new value')).resolves.toBeUndefined()

    expect(input.value).toBe('new value')
    expect(timeline.delay).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.fill',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'fill',
          completed: true,
          targetId: 'target-1',
          output: { textLength: 9 },
        }),
      }),
    )
  })

  it('clears typing state and visual feedback when public fill is cancelled', async () => {
    const { calls, orchestrator, store, target, text, visual } = createHarness({
      enableVisual: true,
      visualFeedback: { typingIndicator: true },
    })
    text.fill.mockImplementationOnce(async () => {
      calls.push('text.fill')
      store.setTyping(target)
      throw cancellationError('text.fill', 'user stopped')
    })

    await expect(orchestrator.fill(css('#target-1'), 'filled')).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'user stopped' },
    })

    expect(store.snapshot().typing).toBeNull()
    expect(calls).toEqual(
      expect.arrayContaining([
        'visual.typing:true',
        'text.fill',
        'visual.typing:false',
        'visual.clearFeedback',
      ]),
    )
    expect(visual.showTyping).toHaveBeenLastCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: false,
    })
  })

  it('reports fill preflight failures with fill action context', async () => {
    const { orchestrator, text, trace } = createHarness({
      typeReport: {
        target: inputTargetHandle(),
        visible: true,
        enabled: false,
        receivesPointerEvents: true,
        canClick: true,
        canFocus: true,
        canType: false,
        blockingReasons: ['disabled'],
        forceBypassedReasons: [],
        unforceableReasons: ['disabled'],
      },
    })

    await expect(orchestrator.fill(css('#target-1'), 'filled')).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'fill',
        blockingReasons: ['disabled'],
        unforceableReasons: ['disabled'],
      }),
    })

    expect(text.fill).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.fill',
        status: 'error',
        attributes: expect.objectContaining({
          action: 'fill',
          phase: 'preflight',
        }),
      }),
    )
  })

  it('types through the current focus path without resolving a target', async () => {
    const controller = new AbortController()
    const { calls, focus, gesture, interactability, orchestrator, resolver, text, wait } =
      createHarness()

    await expect(
      orchestrator.type('abc', {
        timeout: 100,
        signal: controller.signal,
        delay: 0,
        focusStrategy: 'click',
        focusClick: { duration: 10, pressDwell: 5 },
        afterFocusDelay: 12,
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual(['text.type', 'wait.settle'])
    expect(text.type).toHaveBeenCalledWith('abc', {
      timeout: 100,
      signal: controller.signal,
      delay: 0,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {
      timeout: 100,
      signal: controller.signal,
    })
    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(interactability.canType).not.toHaveBeenCalled()
    expect(focus.focus).not.toHaveBeenCalled()
    expect(gesture.click).not.toHaveBeenCalled()
  })

  it('consumes resolved public type cadence options', async () => {
    const { orchestrator, text } = createHarness()

    await expect(orchestrator.type('abc', resolveActionOptions('type'))).resolves.toBeUndefined()

    expect(text.type).toHaveBeenCalledWith('abc', {
      delay: 60,
    })
  })

  it('preserves explicit zero delay as public type cadence opt-out', async () => {
    const { orchestrator, text } = createHarness()

    await expect(orchestrator.type('abc', { delay: 0 })).resolves.toBeUndefined()

    expect(text.type).toHaveBeenCalledWith('abc', {
      delay: 0,
    })
  })

  it('does not synthesize public type cadence for unresolved type options', async () => {
    const { orchestrator, text } = createHarness()

    await expect(orchestrator.type('abc')).resolves.toBeUndefined()

    expect(text.type).toHaveBeenCalledWith('abc', {})
  })

  it('types into the currently focused editable target through the public action path', async () => {
    const { input, orchestrator, timeline, trace } = createRealTextHarness()
    input.value = 'A'
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)

    await expect(orchestrator.type('BC', { delay: 0 })).resolves.toBeUndefined()

    expect(input.value).toBe('ABC')
    expect(timeline.delay).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.type',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'type',
          completed: true,
          output: { textLength: 2 },
        }),
      }),
    )
  })

  it('reports an actionable error when type has no focused editable target', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    const { orchestrator, trace } = createRealTextHarness()

    await expect(orchestrator.type('A', { delay: 0 })).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        boundary: 'text-input-engine',
      }),
    })
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.type',
        status: 'error',
        attributes: expect.objectContaining({
          action: 'type',
          phase: 'perform',
        }),
      }),
    )
  })

  it('clears typing state and visual feedback when public type is cancelled during cadence', async () => {
    const controlledTimeline = createBlockingTimeline()
    const controller = new AbortController()
    const { calls, input, orchestrator, store, visual } = createRealTextHarness({
      timeline: controlledTimeline.timeline,
      enableVisual: true,
      visualFeedback: { typingIndicator: true },
    })
    input.focus()

    const result = orchestrator.type('ab', {
      ...resolveActionOptions('type'),
      signal: controller.signal,
    })

    await vi.waitFor(() => {
      expect(controlledTimeline.pendingDelayCount).toBe(1)
    })
    expect(input.value).toBe('a')
    expect(store.snapshot().typing).toMatchObject({ element: input })

    controller.abort('user stopped')

    await expect(result).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })
    expect(store.snapshot().typing).toBeNull()
    expect(calls).toEqual(
      expect.arrayContaining([
        'visual.typing:true',
        'visual.typing:false',
        'visual.clearFeedback',
      ]),
    )
    expect(visual.showTyping).toHaveBeenLastCalledWith({
      target: expect.objectContaining({ element: input }),
      active: false,
    })
  })

  it('clears typing state when public type times out during cadence', async () => {
    vi.useFakeTimers()
    const controlledTimeline = createBlockingTimeline()
    const { input, orchestrator, store } = createRealTextHarness({
      timeline: controlledTimeline.timeline,
    })
    input.focus()

    try {
      const result = orchestrator.type('ab', {
        ...resolveActionOptions('type'),
        timeout: 25,
      })

      await vi.waitFor(() => {
        expect(controlledTimeline.pendingDelayCount).toBe(1)
      })
      expect(input.value).toBe('a')
      expect(store.snapshot().typing).toMatchObject({ element: input })

      const expectation = expect(result).rejects.toMatchObject({
        code: 'ACTION_TIMEOUT',
        details: { operation: 'text.type', timeout: 25 },
      })

      await vi.advanceTimersByTimeAsync(25)
      await expectation
      expect(store.snapshot().typing).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('presses through the keyboard engine without resolving a target', async () => {
    const controller = new AbortController()
    const {
      calls,
      focus,
      gesture,
      interactability,
      keyboard,
      orchestrator,
      resolver,
      trace,
      wait,
    } = createHarness()

    await expect(
      orchestrator.press('Shift+K', {
        timeout: 100,
        signal: controller.signal,
        delay: 7,
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual(['keyboard.press', 'wait.settle'])
    expect(keyboard.press).toHaveBeenCalledWith('Shift+K', {
      timeout: 100,
      signal: controller.signal,
      delay: 7,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {
      timeout: 100,
      signal: controller.signal,
    })
    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.validate).not.toHaveBeenCalled()
    expect(interactability.canType).not.toHaveBeenCalled()
    expect(focus.focus).not.toHaveBeenCalled()
    expect(gesture.click).not.toHaveBeenCalled()
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.press',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'press',
          completed: true,
          output: {
            keys: 'Shift+K',
            pressedKeys: [],
            modifiers: [],
          },
        }),
      }),
    )
  })

  it('reports focused-target keyboard failures with the perform phase', async () => {
    const keyboard = {
      getState: vi.fn(() => ({ pressedKeys: [], modifiers: [] })),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
      press: vi.fn(async () => {
        throw actorbleError(
          'INTERACTABILITY_FAILED',
          'Keyboard Engine requires an active target.',
          {
            details: { boundary: 'keyboard-engine', key: 'Enter' },
          },
        )
      }),
    }
    const { orchestrator, trace } = createHarness({ keyboard })

    await expect(orchestrator.press('Enter')).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: { boundary: 'keyboard-engine', key: 'Enter' },
    })
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.press',
        status: 'error',
        attributes: expect.objectContaining({
          action: 'press',
          phase: 'perform',
        }),
      }),
    )
  })

  it('releases keys left pressed when public press is cancelled', async () => {
    const pressedKeys = []
    const keyboard = {
      getState: vi.fn(() => ({
        pressedKeys: [...pressedKeys],
        modifiers: pressedKeys.filter((key) => key === 'Shift'),
      })),
      keyDown: vi.fn(),
      keyUp: vi.fn(async (key) => {
        pressedKeys.splice(pressedKeys.indexOf(key), 1)
        return {
          pressedKeys: [...pressedKeys],
          modifiers: pressedKeys.filter((pressedKey) => pressedKey === 'Shift'),
        }
      }),
      press: vi.fn(async () => {
        pressedKeys.push('Shift', 'K')
        throw cancellationError('keyboard.press', 'scenario stopped')
      }),
    }
    const { orchestrator, trace } = createHarness({ keyboard })

    await expect(orchestrator.press('Shift+K')).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(pressedKeys).toEqual([])
    expect(keyboard.keyUp.mock.calls.map(([key]) => key)).toEqual(['K', 'Shift'])
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.press',
        status: 'cancelled',
      }),
    )
  })

  it('consumes resolved public typeInto cadence options', async () => {
    const { orchestrator, target, text } = createHarness()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'abc', resolveActionOptions('typeInto')),
    ).resolves.toBeUndefined()

    expect(text.typeInto).toHaveBeenCalledWith(target, 'abc', {
      delay: 60,
    })
  })

  it('preserves explicit zero delay as public typeInto cadence opt-out', async () => {
    const { orchestrator, target, text } = createHarness()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'abc', { delay: 0 }),
    ).resolves.toBeUndefined()

    expect(text.typeInto).toHaveBeenCalledWith(target, 'abc', {
      delay: 0,
    })
  })

  it('does not synthesize public typeInto cadence for unresolved typeInto options', async () => {
    const { orchestrator, target, text } = createHarness()

    await expect(orchestrator.typeInto(css('#target-1'), 'abc')).resolves.toBeUndefined()

    expect(text.typeInto).toHaveBeenCalledWith(target, 'abc', {})
  })

  it('uses the default public typeInto cadence between grapheme inputs', async () => {
    const { input, orchestrator, timeline } = createRealTextHarness()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'abc', resolveActionOptions('typeInto')),
    ).resolves.toBeUndefined()

    expect(timeline.delay).toHaveBeenCalledTimes(2)
    expect(timeline.delay).toHaveBeenNthCalledWith(1, 60, {})
    expect(timeline.delay).toHaveBeenNthCalledWith(2, 60, {})
    expect(input.value).toBe('abc')
  })

  it('clears typing state when public typeInto is cancelled during default cadence', async () => {
    const controlledTimeline = createBlockingTimeline()
    const controller = new AbortController()
    const { input, orchestrator, store } = createRealTextHarness({
      timeline: controlledTimeline.timeline,
    })

    const result = orchestrator.typeInto(css('#target-1'), 'ab', {
      ...resolveActionOptions('typeInto'),
      signal: controller.signal,
    })

    await vi.waitFor(() => {
      expect(controlledTimeline.pendingDelayCount).toBe(1)
    })
    expect(input.value).toBe('a')
    expect(store.snapshot().typing).toMatchObject({ id: 'target-1' })

    controller.abort('user stopped')

    await expect(result).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })
    expect(store.snapshot().typing).toBeNull()
  })

  it('clears typing state when public typeInto times out during default cadence', async () => {
    vi.useFakeTimers()
    const controlledTimeline = createBlockingTimeline()
    const { input, orchestrator, store } = createRealTextHarness({
      timeline: controlledTimeline.timeline,
    })

    try {
      const result = orchestrator.typeInto(css('#target-1'), 'ab', {
        ...resolveActionOptions('typeInto'),
        timeout: 25,
      })

      await vi.waitFor(() => {
        expect(controlledTimeline.pendingDelayCount).toBe(1)
      })
      expect(input.value).toBe('a')
      expect(store.snapshot().typing).toMatchObject({ id: 'target-1' })

      const expectation = expect(result).rejects.toMatchObject({
        code: 'ACTION_TIMEOUT',
        details: { operation: 'text.typeInto', timeout: 25 },
      })

      await vi.advanceTimersByTimeAsync(25)
      await expectation
      expect(store.snapshot().typing).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('surrounds typeInto with visual highlight and typing hooks', async () => {
    const { calls, orchestrator } = createHarness({ enableVisual: true })

    await expect(orchestrator.typeInto(css('#target-1'), 'hello')).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canType',
      'visual.typing:true',
      'text.typeInto',
      'visual.typing:false',
      'wait.settle',
    ])
  })

  it('routes focus and typing state effects to DOM state and visual feedback independently', () => {
    const { state, store, target, visual } = createHarness({ enableVisual: true })

    store.setFocused(target, true)
    store.setTyping(target)
    store.setTyping(null)

    expect(state.applyStateEffects).toHaveBeenNthCalledWith(1, [
      { kind: 'focus', target: expect.objectContaining({ id: target.id }), active: true },
      {
        kind: 'focus-visible',
        target: expect.objectContaining({ id: target.id }),
        active: true,
      },
    ])
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(2, [
      { kind: 'typing', target: expect.objectContaining({ id: target.id }), active: true },
    ])
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(3, [
      { kind: 'typing', target: expect.objectContaining({ id: target.id }), active: false },
    ])
    expect(visual.showFocus).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
    expect(visual.showTyping).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
    expect(visual.showTyping).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: false,
    })
  })

  it('records focus visual failures as warnings without failing state updates', () => {
    const visual = {
      showCursor: vi.fn(),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(() => {
        throw new Error('focus overlay blocked')
      }),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    const { store, target, trace } = createHarness({ visual })

    expect(() => store.setFocused(target, true)).not.toThrow()

    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Visual layer update failed.',
          details: expect.objectContaining({
            effect: 'showFocus',
            error: 'focus overlay blocked',
          }),
        }),
      ]),
    )
  })

  it('waitFor delegates to the wait observation engine and records an action span', async () => {
    const { orchestrator, trace, wait } = createHarness()
    const condition = { kind: 'custom', predicate: () => true }
    const result = { condition, satisfied: true, strategy: 'settled' }
    wait.waitFor.mockResolvedValue(result)

    await expect(orchestrator.waitFor(condition, { timeout: 10 })).resolves.toBe(result)

    expect(wait.waitFor).toHaveBeenCalledWith(condition, { timeout: 10 })
    expect(trace.getTrace().spans.find((span) => span.name === 'action.waitFor')).toEqual(
      expect.objectContaining({
        name: 'action.waitFor',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'waitFor',
          completed: true,
          output: {
            conditionKind: 'custom',
            satisfied: true,
            strategy: 'settled',
          },
        }),
      }),
    )
  })

  it('default waitFor path supports visible conditions through target observation engines', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const dom = new BrowserDomAdapter(document)
    vi.spyOn(dom, 'getBoundingClientRect').mockImplementation((element) =>
      element === save
        ? { x: 10, y: 20, width: 100, height: 40 }
        : { x: 0, y: 0, width: 0, height: 0 },
    )
    vi.spyOn(dom, 'elementFromPoint').mockReturnValue(save)
    const trace = createTrace()
    const condition = { kind: 'visible', target: css('#save') }
    const orchestrator = new BrowserActionOrchestrator({
      dom,
      timeline: createFrameTimeline(),
      trace,
      visualFeedback: 'off',
    })

    await expect(orchestrator.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'settled',
    })

    expect(trace.getTrace().spans.find((span) => span.name === 'action.waitFor')).toEqual(
      expect.objectContaining({
        name: 'action.waitFor',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'waitFor',
          completed: true,
          output: {
            conditionKind: 'visible',
            satisfied: true,
            strategy: 'settled',
          },
        }),
      }),
    )
  })
})
