import { beforeAll, bench, describe } from 'vitest'
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js'
import { BrowserPointerEngine } from '../src/input/pointer-engine/index.js'
import {
  BrowserDomAdapter,
  BrowserStateApplier,
  BrowserStyleAdapter,
} from '../src/platform/platform-adapter/index.js'
import { BrowserActionOrchestrator } from '../src/runtime/action-orchestrator/index.js'
import { BrowserWaitObservationEngine } from '../src/runtime/wait-observation-engine/index.js'
import { css, label, role, text } from '../src/shared/index.js'
import { createFrameGeometrySurfaceCache } from '../src/targeting/frame-geometry-surface-cache/index.js'
import { BrowserGeometryEngine } from '../src/targeting/geometry-engine/index.js'
import { BrowserSurfaceEngine } from '../src/targeting/surface-engine/index.js'
import { BrowserTargetResolver } from '../src/targeting/target-resolver/index.js'
import { BrowserVisualLayer } from '../src/visual/visual-layer/index.js'
import { BrowserPseudoStateMirror } from '../src/visual/pseudo-state-mirror/index.js'

const BENCH_OPTIONS = {
  time: 80,
  warmupTime: 20,
}

const LARGE_DOM_SIZE = 80
const TARGET_INDEX = LARGE_DOM_SIZE - 1
const NESTED_TEXT_ROW_COUNT = 120
const STYLE_RULE_COUNT = 50
const GEOMETRY_REPEAT_COUNT = 200
const GEOMETRY_SCROLL_ANCESTOR_COUNT = 8

function createClock() {
  let current = 1

  return {
    now() {
      return current++
    },
  }
}

function createFrameTimeline() {
  let current = 0

  return {
    now() {
      return current
    },
    async delay(duration) {
      current += Math.max(0, duration)
    },
    async nextFrame() {
      current += 16
      return current
    },
    async settle() {
      current += 16
    },
    withTimeout(operation) {
      return operation
    },
  }
}

function createHeldFrameTimeline() {
  let current = 0

  return {
    now() {
      return current
    },
    nextFrame() {
      current += 16
      return new Promise(() => {})
    },
  }
}

function createPassthroughGeometrySurfaceCache() {
  return {
    getBoundingRect(_element, read) {
      return read()
    },
    getViewportRect(_root, read) {
      return read()
    },
    getScrollMetrics(_target, read) {
      return read()
    },
    getComputedStyle(_element, read) {
      return read()
    },
    getScrollableAncestors(_target, read) {
      return read()
    },
    invalidate() {},
    dispose() {},
  }
}

function targetHandle(id, element) {
  return {
    id,
    element,
    root: document,
    resolvedAt: 1,
    validity: 'live',
    debug: {
      selector: `#${id}`,
      description: `${element.tagName.toLowerCase()}#${id}`,
    },
  }
}

function createInstrumentedGeometryFixture(
  cache = createFrameGeometrySurfaceCache({ timeline: createHeldFrameTimeline() }),
) {
  const clips = Array.from({ length: GEOMETRY_SCROLL_ANCESTOR_COUNT }, () =>
    document.createElement('section'),
  )
  const target = document.createElement('button')
  const counts = {
    rect: 0,
    style: 0,
    scrollMetrics: 0,
    viewport: 0,
  }
  const rects = new Map([
    [target, { x: 10, y: 20, width: 100, height: 50 }],
  ])

  clips.forEach((clip, index) => {
    rects.set(clip, {
      x: index,
      y: 10 + index,
      width: 100 - index * 2,
      height: 70 - index,
    })
  })
  const dom = {
    getRoot: () => document,
    querySelectorAll: () => [],
    getBoundingClientRect(element) {
      counts.rect += 1
      return rects.get(element) ?? { x: 0, y: 0, width: 0, height: 0 }
    },
    getComputedStyle() {
      counts.style += 1
      return {
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'scroll',
      }
    },
    getViewportRect() {
      counts.viewport += 1
      return { x: 0, y: 0, width: 1024, height: 768 }
    },
    getViewportScrollTarget: () => window,
    getParentElement(element) {
      if (element === target) {
        return clips[0]
      }

      const index = clips.indexOf(element)

      return index >= 0 ? (clips[index + 1] ?? null) : null
    },
    getScrollMetrics() {
      counts.scrollMetrics += 1
      return {
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 80,
        scrollHeight: 160,
        clientWidth: 80,
        clientHeight: 60,
      }
    },
    elementFromPoint: () => null,
    getAttribute: () => null,
    getTextContent: () => '',
    getRootTextContent: () => '',
    contains: (parent, child) => parent.contains(child),
    isConnected: () => true,
    getActiveElement: () => null,
    describeElement: (element) => ({
      selector: element === target ? '#bench-geometry-target' : '#bench-geometry-clip',
      description: element === target ? 'button#bench-geometry-target' : 'section#bench-geometry-clip',
    }),
    observeLayoutInvalidations: () => ({ dispose() {} }),
    focus() {},
    blur() {},
    scrollIntoView() {},
    scrollTo() {},
  }
  const surface = new BrowserSurfaceEngine({ dom, cache })
  const geometry = new BrowserGeometryEngine({
    dom,
    surface,
    cache,
    clock: createClock(),
  })
  const handle = targetHandle('bench-geometry-target', target)

  return { cache, counts, geometry, handle, rects, surface, target }
}

function createResolver() {
  return new BrowserTargetResolver({
    dom: new BrowserDomAdapter(document),
    clock: createClock(),
  })
}

function buildLargeDomFixture() {
  const root = document.createElement('main')
  root.id = 'bench-root'

  const chunks = []
  for (let index = 0; index < LARGE_DOM_SIZE; index += 1) {
    chunks.push(`
      <section class="bench-row" data-row="${index}">
        <h2>Item heading ${index}</h2>
        <p>Searchable copy for item ${index} and shared Save text.</p>
        <label for="bench-input-${index}">Email ${index}</label>
        <input id="bench-input-${index}" type="text" value="" />
        <button id="bench-save-${index}" aria-label="Save item ${index}">
          Save item ${index}
        </button>
      </section>
    `)
  }

  root.innerHTML = chunks.join('')
  document.body.append(root)

  const visibleTarget = document.querySelector(`#bench-save-${TARGET_INDEX}`)
  visibleTarget.getBoundingClientRect = () => ({
    x: 20,
    y: 30,
    width: 120,
    height: 32,
    top: 30,
    right: 140,
    bottom: 62,
    left: 20,
    toJSON() {},
  })
}

function buildNestedTextFixture() {
  const root = document.createElement('main')
  root.id = 'bench-nested-text-root'

  const chunks = []
  for (let index = 0; index < NESTED_TEXT_ROW_COUNT; index += 1) {
    chunks.push(`
      <section class="nested-text-row" data-row="${index}">
        <article class="nested-text-card">
          <div class="nested-text-copy">
            <span id="nested-text-leaf-${index}">Nested performance target ${index}</span>
          </div>
        </article>
      </section>
    `)
  }

  root.innerHTML = chunks.join('')
  document.body.append(root)
}

function buildStylesheetFixture() {
  const style = document.createElement('style')
  const rules = []

  for (let index = 0; index < STYLE_RULE_COUNT; index += 1) {
    rules.push(`
      .bench-row[data-row="${index}"] .action:hover { color: rgb(${index % 255}, 20, 40); }
      .bench-row[data-row="${index}"] button:active { transform: scale(0.98); }
      @media (min-width: 1px) {
        .bench-row[data-row="${index}"] input:focus-visible { outline: 1px solid blue; }
      }
    `)
  }

  style.textContent = rules.join('\n')
  document.head.append(style)
}

function createBenchmarkLayoutInvalidationTracker() {
  const listeners = new Set()
  let running = true

  return {
    start() {
      running = true
    },
    stop() {
      running = false
    },
    isRunning() {
      return running
    },
    markDirty(reason) {
      if (!running) {
        return
      }

      for (const listener of [...listeners]) {
        listener({
          reason,
          reasons: [reason],
          at: 0,
          coalesced: 1,
        })
      }
    },
    subscribe(listener) {
      listeners.add(listener)

      return {
        dispose() {
          listeners.delete(listener)
        },
      }
    },
    dispose() {
      listeners.clear()
      running = false
    },
  }
}

function createBenchmarkGesture() {
  return {
    async click(_target, point, options = {}) {
      await options.refreshPointBeforeDown?.(point)
      return { completed: true }
    },
    async doubleClick(_target, point, options = {}) {
      const firstPoint = (await options.refreshPointBeforeDown?.(point)) ?? point
      await options.refreshPointBeforeDown?.(firstPoint)
      return { completed: true }
    },
    async hover() {
      return { completed: true }
    },
    async drag() {
      return { completed: true }
    },
    async cancel() {
      return { completed: false }
    },
  }
}

function createActionOrchestratorBenchmarkFixture(kind = 'button') {
  const element =
    kind === 'input' ? document.createElement('input') : document.createElement('button')
  element.id = `bench-action-${kind}`
  document.body.append(element)

  const target = targetHandle(element.id, element)
  const geometrySnapshot = {
    target,
    rect: { x: 20, y: 30, width: 120, height: 32 },
    visibleRect: { x: 20, y: 30, width: 120, height: 32 },
    center: { x: 80, y: 46 },
    clickablePoint: {
      ok: true,
      point: { x: 80, y: 46 },
      strategy: 'center',
    },
    coordinateSpace: 'viewport',
    computedAt: 1,
  }
  const counts = {
    geometrySnapshots: 0,
    clickPreflights: 0,
  }
  const resolver = {
    resolve: async () => target,
    resolveAll: async () => [target],
    exists: async () => true,
    inspect: async () => ({ target, debug: target.debug, validity: 'live' }),
    validate: async () => target,
  }
  const surface = {
    getSurfaceFor: () => ({
      id: 'viewport',
      root: document,
      coordinateSpace: 'viewport',
      viewport: null,
      clippingChain: [],
    }),
    getScrollableAncestors: () => [],
    ensureVisible: async () => {},
    scrollTo: async () => {},
    mapPoint: (point) => point,
  }
  const geometry = {
    snapshot: async () => {
      counts.geometrySnapshots += 1
      return geometrySnapshot
    },
  }
  const interactability = {
    inspect: async () => ({ target, canClick: true, blockingReasons: [] }),
    canClick: async () => {
      counts.clickPreflights += 1
      return clickReport(target)
    },
    canFocus: async () => clickReport(target),
    canType: async () => clickReport(target),
  }
  const focus = {
    focus: async () => ({ active: target, previous: null, focusVisible: false }),
    blur: async () => {},
    getFocused: async () => ({ active: target, previous: null, focusVisible: false }),
    tab: async () => ({ active: target, previous: null, focusVisible: true }),
  }
  const orchestrator = new BrowserActionOrchestrator({
    resolver,
    surface,
    geometry,
    interactability,
    gesture: createBenchmarkGesture(),
    focus,
    keyboard: {
      getState: () => ({ pressedKeys: [], modifiers: [] }),
      keyDown: async () => ({ pressedKeys: [], modifiers: [] }),
      keyUp: async () => ({ pressedKeys: [], modifiers: [] }),
      press: async () => ({ pressedKeys: [], modifiers: [] }),
    },
    text: {
      type: async (_text) => ({ strategy: 'type', text: _text }),
      typeInto: async (_target, textValue) => ({ strategy: 'typeInto', text: textValue }),
      fill: async (_target, textValue) => ({ strategy: 'fill', text: textValue }),
    },
    wait: {
      waitFor: async () => ({ satisfied: true, strategy: 'immediate' }),
      settle: async () => null,
      invalidateGeometry() {},
    },
    state: {
      applyStateEffects() {},
      cleanup() {},
    },
    layoutInvalidation: createBenchmarkLayoutInvalidationTracker(),
    visualFeedback: { enabled: false },
  })

  return { counts, orchestrator, target }
}

function clickReport(target) {
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
}

beforeAll(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  buildLargeDomFixture()
  buildNestedTextFixture()
  buildStylesheetFixture()
})

describe('target resolver', () => {
  const resolver = createResolver()

  bench(
    'css locator resolves an indexed target',
    async () => {
      await resolver.resolve(css(`#bench-save-${TARGET_INDEX}`))
    },
    BENCH_OPTIONS,
  )

  bench(
    'role locator scans accessible names in a large DOM',
    async () => {
      await resolver.resolve(role('button', { name: `Save item ${TARGET_INDEX}` }))
    },
    BENCH_OPTIONS,
  )

  bench(
    'label locator resolves a native label association',
    async () => {
      await resolver.resolve(label(`Email ${TARGET_INDEX}`))
    },
    BENCH_OPTIONS,
  )

  bench(
    'partial text locator ranks many text matches',
    async () => {
      await resolver.resolveAll(text('Save item'))
    },
    BENCH_OPTIONS,
  )

  bench(
    'partial text locator prunes large nested matches',
    async () => {
      await resolver.resolveAll(text('Nested performance target'))
    },
    BENCH_OPTIONS,
  )
})

describe('wait observation', () => {
  const engine = new BrowserWaitObservationEngine({
    dom: new BrowserDomAdapter(document),
    timeline: createFrameTimeline(),
  })

  bench(
    'visible wait resolves and inspects an already-visible role target',
    async () => {
      await engine.waitFor({
        kind: 'visible',
        target: role('button', { name: `Save item ${TARGET_INDEX}` }),
      })
    },
    BENCH_OPTIONS,
  )

  bench(
    'root text wait scans and normalizes document text',
    async () => {
      await engine.waitFor({
        kind: 'text',
        value: `Searchable copy for item ${TARGET_INDEX}`,
      })
    },
    BENCH_OPTIONS,
  )
})

describe('geometry and surface cache', () => {
  const uncachedFixture = createInstrumentedGeometryFixture(createPassthroughGeometrySurfaceCache())
  const fixture = createInstrumentedGeometryFixture()

  bench(
    'uncached repeated geometry snapshots baseline',
    async () => {
      for (let index = 0; index < GEOMETRY_REPEAT_COUNT; index += 1) {
        await uncachedFixture.geometry.snapshot(uncachedFixture.handle)
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'same-frame repeated geometry snapshots reuse cached surface reads',
    async () => {
      fixture.cache.invalidate('manual')

      for (let index = 0; index < GEOMETRY_REPEAT_COUNT; index += 1) {
        await fixture.geometry.snapshot(fixture.handle)
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'uncached repeated surface snapshots baseline',
    () => {
      for (let index = 0; index < GEOMETRY_REPEAT_COUNT; index += 1) {
        uncachedFixture.surface.getSurfaceFor(uncachedFixture.handle)
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'same-frame repeated surface snapshots reuse scrollable ancestors',
    () => {
      fixture.cache.invalidate('manual')

      for (let index = 0; index < GEOMETRY_REPEAT_COUNT; index += 1) {
        fixture.surface.getSurfaceFor(fixture.handle)
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'geometry cache refreshes after invalidation',
    async () => {
      fixture.cache.invalidate('manual')
      await fixture.geometry.snapshot(fixture.handle)
      fixture.rects.set(fixture.target, { x: 20, y: 30, width: 100, height: 50 })
      fixture.cache.invalidate('mutation')
      await fixture.geometry.snapshot(fixture.handle)
    },
    BENCH_OPTIONS,
  )
})

describe('action orchestrator dispatch geometry refresh', () => {
  let clickFixture
  let doubleClickFixture
  let typeIntoFixture

  bench(
    'orchestrator clean click skips dispatch geometry refresh',
    async () => {
      clickFixture ??= createActionOrchestratorBenchmarkFixture('button')
      await clickFixture.orchestrator.click(css('#bench-action-button'), {
        duration: 0,
        pressDwell: 0,
      })
    },
    BENCH_OPTIONS,
  )

  bench(
    'orchestrator clean doubleClick skips dispatch geometry refresh',
    async () => {
      doubleClickFixture ??= createActionOrchestratorBenchmarkFixture('button')
      await doubleClickFixture.orchestrator.doubleClick(css('#bench-action-button'), {
        duration: 0,
        pressDwell: 0,
      })
    },
    BENCH_OPTIONS,
  )

  bench(
    'orchestrator clean typeInto click-focus skips dispatch geometry refresh',
    async () => {
      typeIntoFixture ??= createActionOrchestratorBenchmarkFixture('input')
      await typeIntoFixture.orchestrator.typeInto(css('#bench-action-input'), 'x', {
        delay: 0,
        focusStrategy: 'click',
        focusClick: { duration: 0, pressDwell: 0 },
      })
    },
    BENCH_OPTIONS,
  )
})

describe('pseudo-state mirror', () => {
  let target

  bench(
    'stylesheet scan and pseudo-state rewrite on first apply',
    () => {
      target ??= targetHandle(
        `bench-save-${TARGET_INDEX}`,
        document.querySelector(`#bench-save-${TARGET_INDEX}`),
      )
      const mirror = new BrowserPseudoStateMirror({
        state: new BrowserStateApplier(),
        style: new BrowserStyleAdapter(document),
      })

      mirror.apply({ target, states: ['hover', 'active', 'focus-visible'] })
      mirror.cleanup()
    },
    BENCH_OPTIONS,
  )
})

describe('visual layer', () => {
  const layer = new BrowserVisualLayer({ root: document })
  let cursorIndex = 0
  const cursorKinds = ['default', 'pointer', 'text', 'grab', 'grabbing', 'wait']

  bench(
    'cursor overlay update with SVG cursor variants',
    () => {
      const cursor = cursorKinds[cursorIndex % cursorKinds.length]
      cursorIndex += 1
      layer.showCursor({
        point: { x: cursorIndex % 300, y: (cursorIndex * 3) % 300 },
        cursor,
        pressed: cursor === 'grabbing',
      })
    },
    BENCH_OPTIONS,
  )
})

describe('pointer engine', () => {
  const signals = new BrowserPointerSignalBus()
  const pointer = new BrowserPointerEngine({
    signals,
    timeline: createFrameTimeline(),
  })
  let direction = 1

  bench(
    'animated pointer movement updates state across frames',
    async () => {
      direction *= -1
      await pointer.moveTo(
        direction > 0 ? { x: 300, y: 200 } : { x: 0, y: 0 },
        { motion: { kind: 'ease', duration: 250 } },
      )
    },
    BENCH_OPTIONS,
  )
})
