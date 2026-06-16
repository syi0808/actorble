import { beforeAll, bench, describe } from 'vitest'
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js'
import { BrowserPointerEngine } from '../src/input/pointer-engine/index.js'
import {
  BrowserDomAdapter,
  BrowserStateApplier,
  BrowserStyleAdapter,
} from '../src/platform/platform-adapter/index.js'
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
const WAIT_RETRY_REPEAT_COUNT = 50
const PSEUDO_STATE_REPEAT_COUNT = 20
const EXPENSIVE_WAIT_DOM_SIZE = 160
const EXPENSIVE_WAIT_TARGET_INDEX = EXPENSIVE_WAIT_DOM_SIZE - 1
const EXPENSIVE_WAIT_UNCHANGED_RETRIES = 5
const EXPENSIVE_WAIT_BENCH_OPTIONS = {
  time: 240,
  warmupTime: 40,
}

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

function createManualLayoutInvalidationTracker() {
  const listeners = []

  return {
    tracker: {
      start() {},
      stop() {},
      isRunning: () => true,
      markDirty() {},
      subscribe(listener) {
        listeners.push(listener)

        return {
          dispose() {
            const index = listeners.indexOf(listener)

            if (index >= 0) {
              listeners.splice(index, 1)
            }
          },
        }
      },
      dispose() {},
    },
    emit(reason = 'mutation') {
      for (const listener of [...listeners]) {
        listener({
          reason,
          reasons: [reason],
          at: 1,
          coalesced: 1,
        })
      }
    },
  }
}

function createVisibleWaitRetryFixture({ dirtyAfterSettles }) {
  const element = document.querySelector(`#bench-save-${TARGET_INDEX}`)
  const target = targetHandle('bench-wait-visible-target', element)
  const layoutInvalidation = createManualLayoutInvalidationTracker()
  const counts = {
    resolve: 0,
    validate: 0,
    geometry: 0,
    inspect: 0,
  }
  let settleAttempts = 0
  let visible = false
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
  const timeline = {
    ...createFrameTimeline(),
    async settle() {
      settleAttempts += 1

      if (settleAttempts === dirtyAfterSettles) {
        visible = true
        layoutInvalidation.emit('mutation')
      }
    },
  }
  const engine = new BrowserWaitObservationEngine({
    layoutInvalidation: layoutInvalidation.tracker,
    timeline,
    resolver: {
      async resolve() {
        counts.resolve += 1
        return target
      },
      async resolveAll() {
        return [target]
      },
      async exists() {
        return true
      },
      async inspect() {
        return { target, debug: target.debug, validity: 'live' }
      },
      async validate(handle) {
        counts.validate += 1
        return handle
      },
    },
    geometry: {
      async snapshot() {
        counts.geometry += 1
        return geometrySnapshot
      },
      getBoundingRect: () => geometrySnapshot.rect,
      getVisibleRect: () => geometrySnapshot.visibleRect,
      getCenter: () => geometrySnapshot.center,
      getClickablePoint: () => geometrySnapshot.clickablePoint,
    },
    interactability: {
      async inspect() {
        counts.inspect += 1

        return {
          target,
          visible,
          visibilityRatio: visible ? 1 : 0,
          enabled: true,
          editable: false,
          focusable: false,
          receivesPointerEvents: true,
          canClick: visible,
          canFocus: false,
          canType: false,
          blockingReasons: visible ? [] : ['not-visible'],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      },
      async canClick() {},
      async canFocus() {},
      async canType() {},
    },
  })

  return {
    counts,
    engine,
    reset() {
      counts.resolve = 0
      counts.validate = 0
      counts.geometry = 0
      counts.inspect = 0
      settleAttempts = 0
      visible = false
    },
  }
}

function createRootTextWaitRetryFixture() {
  const layoutInvalidation = createManualLayoutInvalidationTracker()
  const counts = {
    rootText: 0,
  }
  let settleAttempts = 0
  let ready = false
  const timeline = {
    ...createFrameTimeline(),
    async settle() {
      settleAttempts += 1

      if (settleAttempts === 2) {
        ready = true
        layoutInvalidation.emit('mutation')
      }
    },
  }
  const engine = new BrowserWaitObservationEngine({
    layoutInvalidation: layoutInvalidation.tracker,
    timeline,
    dom: {
      getRoot: () => document,
      getRootTextContent() {
        counts.rootText += 1
        return ready ? 'Project created' : 'Loading'
      },
    },
  })

  return {
    counts,
    engine,
    reset() {
      counts.rootText = 0
      settleAttempts = 0
      ready = false
    },
  }
}

function assertCounts(actual, expected) {
  for (const [name, value] of Object.entries(expected)) {
    if (actual[name] !== value) {
      throw new Error(`Expected ${name} count ${value}, received ${actual[name]}.`)
    }
  }
}

function createExpensiveWaitTimeline({ dirtyAfterSettles, onDirty }) {
  const timeline = createFrameTimeline()
  let settleAttempts = 0

  return {
    ...timeline,
    async settle() {
      settleAttempts += 1

      if (settleAttempts === dirtyAfterSettles) {
        onDirty()
      }
    },
    reset() {
      settleAttempts = 0
    },
  }
}

function createExpensiveRoleWaitRetryFixture() {
  ensureExpensiveWaitFixture()
  const dom = new BrowserDomAdapter(document)
  const resolver = new BrowserTargetResolver({ dom, clock: createClock() })
  const layoutInvalidation = createManualLayoutInvalidationTracker()
  const counts = {
    resolve: 0,
    validate: 0,
    geometry: 0,
    inspect: 0,
  }
  let visible = false
  const timeline = createExpensiveWaitTimeline({
    dirtyAfterSettles: EXPENSIVE_WAIT_UNCHANGED_RETRIES + 1,
    onDirty() {
      visible = true
      layoutInvalidation.emit('mutation')
    },
  })
  const engine = new BrowserWaitObservationEngine({
    layoutInvalidation: layoutInvalidation.tracker,
    timeline,
    resolver: {
      async resolve(locator, options) {
        counts.resolve += 1
        return await resolver.resolve(locator, options)
      },
      async resolveAll(locator, options) {
        return await resolver.resolveAll(locator, options)
      },
      async exists(locator, options) {
        return await resolver.exists(locator, options)
      },
      async inspect(target) {
        return await resolver.inspect(target)
      },
      async validate(handle) {
        counts.validate += 1
        return await resolver.validate(handle)
      },
    },
    geometry: {
      async snapshot(target) {
        counts.geometry += 1

        return {
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
      },
      getBoundingRect: () => ({ x: 20, y: 30, width: 120, height: 32 }),
      getVisibleRect: () => ({ x: 20, y: 30, width: 120, height: 32 }),
      getCenter: () => ({ x: 80, y: 46 }),
      getClickablePoint: () => ({
        ok: true,
        point: { x: 80, y: 46 },
        strategy: 'center',
      }),
    },
    interactability: {
      async inspect(target) {
        counts.inspect += 1

        return {
          target,
          visible,
          visibilityRatio: visible ? 1 : 0,
          enabled: true,
          editable: false,
          focusable: false,
          receivesPointerEvents: true,
          canClick: visible,
          canFocus: false,
          canType: false,
          blockingReasons: visible ? [] : ['not-visible'],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      },
      async canClick() {},
      async canFocus() {},
      async canType() {},
    },
  })

  return {
    counts,
    engine,
    locator: role('button', {
      name: `Launch expensive wait item ${EXPENSIVE_WAIT_TARGET_INDEX}`,
    }),
    reset() {
      counts.resolve = 0
      counts.validate = 0
      counts.geometry = 0
      counts.inspect = 0
      visible = false
      timeline.reset()
    },
  }
}

function createExpensiveRootTextWaitRetryFixture() {
  ensureExpensiveWaitFixture()
  const realDom = new BrowserDomAdapter(document)
  const layoutInvalidation = createManualLayoutInvalidationTracker()
  const status = document.querySelector('#bench-expensive-wait-status')
  const counts = {
    rootText: 0,
  }
  const timeline = createExpensiveWaitTimeline({
    dirtyAfterSettles: EXPENSIVE_WAIT_UNCHANGED_RETRIES + 1,
    onDirty() {
      status.textContent = 'Expensive wait benchmark completed'
      layoutInvalidation.emit('mutation')
    },
  })
  const engine = new BrowserWaitObservationEngine({
    layoutInvalidation: layoutInvalidation.tracker,
    timeline,
    dom: {
      getRoot: () => document,
      getRootTextContent(root) {
        counts.rootText += 1
        return realDom.getRootTextContent(root)
      },
    },
  })

  return {
    counts,
    engine,
    reset() {
      counts.rootText = 0
      status.textContent = 'Expensive wait benchmark loading'
      timeline.reset()
    },
  }
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

function buildExpensiveWaitFixture() {
  if (document.querySelector('#bench-expensive-wait-root') !== null) {
    return
  }

  const root = document.createElement('main')
  root.id = 'bench-expensive-wait-root'

  const chunks = [
    '<div id="bench-expensive-wait-status">Expensive wait benchmark loading</div>',
  ]

  for (let index = 0; index < EXPENSIVE_WAIT_DOM_SIZE; index += 1) {
    chunks.push(`
      <section class="expensive-wait-row" data-row="${index}">
        <h2>Workflow checkpoint ${index}</h2>
        <p>
          Large wait observation copy ${index}
          repeats searchable document text and accessible content to make
          role and root text observation expensive in jsdom.
        </p>
        <label for="expensive-wait-input-${index}">Expensive wait email ${index}</label>
        <input id="expensive-wait-input-${index}" type="text" value="" />
        <button
          id="expensive-wait-save-${index}"
          aria-label="Launch expensive wait item ${index}"
        >
          Launch expensive wait item ${index}
        </button>
      </section>
    `)
  }

  root.innerHTML = chunks.join('')
  document.body.append(root)
}

function ensureExpensiveWaitFixture() {
  buildExpensiveWaitFixture()
}

function buildStylesheetFixture() {
  const style = document.createElement('style')
  style.id = 'bench-pseudo-source'
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

  const mutationStyle = document.createElement('style')
  mutationStyle.id = 'bench-pseudo-mutation-source'
  mutationStyle.textContent = '.bench-pseudo-mutation:hover { color: rgb(0, 20, 40); }'
  document.head.append(mutationStyle)
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
  let unchangedVisibleRetry
  let dirtyVisibleRetry
  let unchangedRootTextRetry
  let expensiveRoleRetry
  let expensiveRootTextRetry

  const getUnchangedVisibleRetry = () => {
    unchangedVisibleRetry ??= createVisibleWaitRetryFixture({ dirtyAfterSettles: 2 })
    return unchangedVisibleRetry
  }
  const getDirtyVisibleRetry = () => {
    dirtyVisibleRetry ??= createVisibleWaitRetryFixture({ dirtyAfterSettles: 1 })
    return dirtyVisibleRetry
  }
  const getUnchangedRootTextRetry = () => {
    unchangedRootTextRetry ??= createRootTextWaitRetryFixture()
    return unchangedRootTextRetry
  }
  const getExpensiveRoleRetry = () => {
    expensiveRoleRetry ??= createExpensiveRoleWaitRetryFixture()
    return expensiveRoleRetry
  }
  const getExpensiveRootTextRetry = () => {
    expensiveRootTextRetry ??= createExpensiveRootTextWaitRetryFixture()
    return expensiveRootTextRetry
  }

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

  bench(
    'unchanged visible wait retry reuses target observation until dirty',
    async () => {
      const fixture = getUnchangedVisibleRetry()

      for (let index = 0; index < WAIT_RETRY_REPEAT_COUNT; index += 1) {
        fixture.reset()

        await fixture.engine.waitFor({
          kind: 'visible',
          target: css(`#bench-save-${TARGET_INDEX}`),
        })

        assertCounts(fixture.counts, {
          resolve: 1,
          validate: 2,
          geometry: 2,
          inspect: 2,
        })
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'dirty-after-retry visible wait refreshes target observation',
    async () => {
      const fixture = getDirtyVisibleRetry()

      for (let index = 0; index < WAIT_RETRY_REPEAT_COUNT; index += 1) {
        fixture.reset()

        await fixture.engine.waitFor({
          kind: 'visible',
          target: css(`#bench-save-${TARGET_INDEX}`),
        })

        assertCounts(fixture.counts, {
          resolve: 1,
          validate: 2,
          geometry: 2,
          inspect: 2,
        })
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'unchanged root text wait retry reuses normalized text until mutation',
    async () => {
      const fixture = getUnchangedRootTextRetry()

      for (let index = 0; index < WAIT_RETRY_REPEAT_COUNT; index += 1) {
        fixture.reset()

        await fixture.engine.waitFor({
          kind: 'text',
          value: 'Project created',
        })

        assertCounts(fixture.counts, {
          rootText: 2,
        })
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'expensive role wait reuses unchanged retries until mutation',
    async () => {
      const fixture = getExpensiveRoleRetry()

      fixture.reset()

      await fixture.engine.waitFor({
        kind: 'visible',
        target: fixture.locator,
      })

      assertCounts(fixture.counts, {
        resolve: 1,
        validate: 2,
        geometry: 2,
        inspect: 2,
      })
    },
    EXPENSIVE_WAIT_BENCH_OPTIONS,
  )

  bench(
    'expensive root text wait reuses unchanged retries until mutation',
    async () => {
      const fixture = getExpensiveRootTextRetry()

      fixture.reset()

      await fixture.engine.waitFor({
        kind: 'text',
        value: 'Expensive wait benchmark completed',
      })

      assertCounts(fixture.counts, {
        rootText: 2,
      })
    },
    EXPENSIVE_WAIT_BENCH_OPTIONS,
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

describe('pseudo-state mirror', () => {
  let target
  let cachedTarget
  let cachedMirror
  let mutationTarget
  let mutationMirror
  let mutationIndex = 0

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

  bench(
    'repeated mirror apply reuses cached pseudo-state rewrite',
    () => {
      cachedTarget ??= targetHandle(
        `bench-save-${TARGET_INDEX}`,
        document.querySelector(`#bench-save-${TARGET_INDEX}`),
      )
      cachedMirror ??= new BrowserPseudoStateMirror({
        state: new BrowserStateApplier(),
        style: new BrowserStyleAdapter(document),
      })

      for (let index = 0; index < PSEUDO_STATE_REPEAT_COUNT; index += 1) {
        cachedMirror.apply({
          target: cachedTarget,
          states: ['hover', 'active', 'focus-visible'],
        })
        cachedMirror.cleanup()
      }
    },
    BENCH_OPTIONS,
  )

  bench(
    'stylesheet mutation refreshes pseudo-state mirror cache',
    () => {
      mutationTarget ??= targetHandle(
        `bench-save-${TARGET_INDEX}`,
        document.querySelector(`#bench-save-${TARGET_INDEX}`),
      )
      mutationMirror ??= new BrowserPseudoStateMirror({
        state: new BrowserStateApplier(),
        style: new BrowserStyleAdapter(document),
      })

      for (let index = 0; index < PSEUDO_STATE_REPEAT_COUNT; index += 1) {
        mutationIndex += 1
        document.querySelector('#bench-pseudo-mutation-source').textContent =
          `.bench-pseudo-mutation:hover { color: rgb(${mutationIndex % 255}, 20, 40); }`
        mutationMirror.apply({
          target: mutationTarget,
          states: ['hover', 'active', 'focus-visible'],
        })
        mutationMirror.cleanup()
      }
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
