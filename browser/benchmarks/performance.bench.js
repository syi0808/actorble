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
import { BrowserTargetResolver } from '../src/targeting/target-resolver/index.js'
import { BrowserVisualLayer } from '../src/visual/visual-layer/index.js'
import { BrowserPseudoStateMirror } from '../src/visual/pseudo-state-mirror/index.js'

const BENCH_OPTIONS = {
  time: 80,
  warmupTime: 20,
}

const LARGE_DOM_SIZE = 80
const TARGET_INDEX = LARGE_DOM_SIZE - 1
const STYLE_RULE_COUNT = 50

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

beforeAll(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  buildLargeDomFixture()
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
