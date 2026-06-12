import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const configFile = fileURLToPath(new URL('../example/vite.config.ts', import.meta.url))

const server = await createServer({
  configFile,
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
  },
})

const extraOverlaySelectors = [
  '[data-actorble-visual-highlight]',
  '[data-actorble-visual-click]',
  '[data-actorble-visual-focus]',
  '[data-actorble-visual-typing]',
  '[data-actorble-visual-keystroke]',
]

let browser

try {
  await server.listen()
  const baseUrl = server.resolvedUrls?.local[0]

  if (!baseUrl) {
    throw new Error('Vite did not expose a local server URL.')
  }

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.setDefaultTimeout(10_000)

  await page.goto(new URL('action-playground/', baseUrl).toString())
  await page.waitForSelector('#run-flow')
  await expectChecked(page, '[data-testid="visual-mode-quiet"]', true)
  await expectFidelityRuntime(page, 'enabled')
  await runFlow(page)
  await expectProjectCreated(page, 'Atlas 1')
  await expectInputValue(page, 'Atlas 1')
  await expectEventLogIncludes(page, ['button.click'])
  await expectOverlayHitTesting(page)
  await expectQuietOverlay(page)

  await setVisualMode(page, 'debug')
  await runFlow(page)
  await expectProjectCreated(page, 'Atlas 2')
  await expectDebugOverlay(page)

  await setVisualMode(page, 'off')
  await expectFidelityRuntime(page, 'disabled')
  await runClick(page)
  await expectEventLogIncludes(page, ['button.click'])
  await expectNoOverlayRoot(page)

  await page.goto(new URL('scenario-runner/', baseUrl).toString())
  await page.waitForSelector('#run-scenario')
  await expectChecked(page, '[data-testid="scenario-visual-mode-quiet"]', true)
  await expectCapabilityRow(page, '#capability-output', 'visualRuntime', 'enabled')

  const quietTracking = await runScenario(page)
  await expectCursorMoved(quietTracking.before, quietTracking.after)
  await expectProjectCreated(page, 'Scenario 1')
  await expectInputValue(page, 'Scenario 1')
  await expectEventSequence(page, [
    'input.pointerdown',
    'input.pointerup',
    'input.click',
    'input.focus',
    'input.beforeinput',
    'input.input',
    'button.click',
  ])
  await expectTraceIncludes(page, [
    'scenario.run',
    'scenario.step.delay',
    'scenario.pacing.delay',
  ])
  await expectOverlayHitTesting(page)
  await expectQuietOverlay(page)

  await setScenarioVisualMode(page, 'debug')
  const debugTracking = await runScenario(page)
  await expectCursorMoved(debugTracking.before, debugTracking.after)
  await expectProjectCreated(page, 'Scenario 2')
  await expectTraceIncludes(page, [
    'scenario.run',
    'scenario.step.delay',
    'scenario.pacing.delay',
  ])
  await expectOverlayHitTesting(page)
  await expectDebugOverlay(page)
} finally {
  await browser?.close()
  await server.close()
}

async function runFlow(page) {
  await page.locator('#run-flow').click()
  await expectStatus(page, 'Flow complete')
}

async function runClick(page) {
  await page.locator('#run-click').click()
  await expectStatus(page, 'Clicked create')
}

async function setVisualMode(page, mode) {
  await page.locator(`[data-testid="visual-mode-${mode}"]`).check()
  await expectChecked(page, `[data-testid="visual-mode-${mode}"]`, true)
}

async function setScenarioVisualMode(page, mode) {
  await page.locator(`[data-testid="scenario-visual-mode-${mode}"]`).check()
  await expectChecked(page, `[data-testid="scenario-visual-mode-${mode}"]`, true)
}

async function runScenario(page) {
  await page.locator('#run-scenario').click()
  await expectTrackingState(page, 'pending')
  const before = await readCursorPoint(page)
  await expectTrackingState(page, 'shifted')
  await expectCursorTracksTarget(page, '#project-name')
  const after = await readCursorPoint(page)
  await expectStatus(page, 'Scenario complete')

  return { before, after }
}

async function expectStatus(page, text) {
  await page.waitForFunction(
    (expected) => document.querySelector('#run-status')?.textContent === expected,
    text,
  )
}

async function expectChecked(page, selector, expected) {
  const checked = await page.locator(selector).isChecked()
  assertEqual(checked, expected, `${selector} checked state`)
}

async function expectFidelityRuntime(page, runtime) {
  await expectCapabilityRow(page, '#fidelity-output', 'runtime', runtime)
}

async function expectCapabilityRow(page, containerSelector, termText, valueText) {
  await page.waitForFunction(
    ({ containerSelector, termText, valueText }) =>
      Array.from(document.querySelectorAll(`${containerSelector} dt`)).some(
        (term) =>
          term.textContent === termText && term.nextElementSibling?.textContent === valueText,
      ),
    { containerSelector, termText, valueText },
  )
}

async function expectProjectCreated(page, projectName) {
  await page.waitForFunction(
    (expected) => document.querySelector('#project-status')?.textContent?.includes(expected),
    projectName,
  )
}

async function expectInputValue(page, value) {
  await page.waitForFunction(
    (expected) => document.querySelector('#project-name')?.value === expected,
    value,
  )
}

async function expectEventLogIncludes(page, expectedEvents) {
  const events = await page
    .locator('#event-log li')
    .evaluateAll((items) => items.map((item) => item.textContent ?? ''))

  for (const expected of expectedEvents) {
    assert(
      events.some((event) => event.startsWith(expected)),
      `Expected DOM event log to include ${expected}; got ${events.join(', ')}`,
    )
  }
}

async function expectEventSequence(page, expectedEvents) {
  const events = await page
    .locator('#event-log li')
    .evaluateAll((items) => items.map((item) => item.textContent ?? ''))
  let searchStart = 0

  for (const expected of expectedEvents) {
    const foundIndex = events.findIndex(
      (event, index) => index >= searchStart && event.startsWith(expected),
    )

    assert(
      foundIndex >= 0,
      `Expected DOM event log sequence to include ${expected}; got ${events.join(', ')}`,
    )
    searchStart = foundIndex + 1
  }
}

async function expectTrackingState(page, state) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="tracking-state"]')?.dataset.state === expected,
    state,
  )
}

async function readCursorPoint(page) {
  return page.evaluate(() => {
    const cursor = document.querySelector('[data-actorble-visual-cursor]')

    if (!(cursor instanceof HTMLElement)) {
      return null
    }

    const left = Number.parseFloat(cursor.style.left)
    const top = Number.parseFloat(cursor.style.top)
    const hotspotX = Number(cursor.getAttribute('data-actorble-cursor-hotspot-x') ?? 0)
    const hotspotY = Number(cursor.getAttribute('data-actorble-cursor-hotspot-y') ?? 0)

    return { x: left + hotspotX, y: top + hotspotY }
  })
}

async function expectCursorTracksTarget(page, targetSelector) {
  await page.waitForFunction((targetSelector) => {
    const cursor = document.querySelector('[data-actorble-visual-cursor]')
    const target = document.querySelector(targetSelector)

    if (!(cursor instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return false
    }

    const left = Number.parseFloat(cursor.style.left)
    const top = Number.parseFloat(cursor.style.top)
    const hotspotX = Number(cursor.getAttribute('data-actorble-cursor-hotspot-x') ?? 0)
    const hotspotY = Number(cursor.getAttribute('data-actorble-cursor-hotspot-y') ?? 0)
    const rect = target.getBoundingClientRect()
    const cursorPoint = { x: left + hotspotX, y: top + hotspotY }
    const targetPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }

    return (
      Math.abs(cursorPoint.x - targetPoint.x) <= 3 &&
      Math.abs(cursorPoint.y - targetPoint.y) <= 3
    )
  }, targetSelector)
}

async function expectCursorMoved(before, after) {
  assert(before, 'Expected cursor point before layout shift.')
  assert(after, 'Expected cursor point after layout shift.')

  const distance = Math.hypot(after.x - before.x, after.y - before.y)

  assert(distance >= 8, `Expected cursor to move after layout shift; moved ${distance}px.`)
}

async function expectTraceIncludes(page, spanNames) {
  const traces = await page
    .locator('#trace-output .trace-title strong')
    .evaluateAll((items) => items.map((item) => item.textContent ?? ''))

  for (const spanName of spanNames) {
    assert(
      traces.includes(spanName),
      `Expected trace output to include ${spanName}; got ${traces.join(', ')}`,
    )
  }
}

async function expectOverlayHitTesting(page) {
  const overlay = page.locator('[data-actorble-overlay-root]')
  await expectCount(overlay, 1, 'quiet overlay root')
  await expectCssValue(overlay, 'pointer-events', 'none')

  const hitTest = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="create-project"]')
    const rect = button?.getBoundingClientRect()

    if (!rect) {
      return null
    }

    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return hit?.getAttribute('data-testid') ?? hit?.id ?? hit?.tagName ?? null
  })

  assertEqual(hitTest, 'create-project', 'overlay hit-test target')
}

async function expectQuietOverlay(page) {
  const overlay = page.locator('[data-actorble-overlay-root]')
  await expectCount(overlay.locator('[data-actorble-visual-cursor]'), 1, 'quiet cursor')

  for (const selector of extraOverlaySelectors) {
    await expectCount(overlay.locator(selector), 0, `quiet ${selector}`)
  }
}

async function expectDebugOverlay(page) {
  const overlay = page.locator('[data-actorble-overlay-root]')
  await expectCount(overlay.locator('[data-actorble-visual-cursor]'), 1, 'debug cursor')
  await expectCount(overlay.locator('[data-actorble-visual-highlight]'), 1, 'debug highlight')
  await expectCount(overlay.locator('[data-actorble-visual-click]'), 1, 'debug click feedback')
  await expectCount(
    overlay.locator('[data-actorble-visual-keystroke]'),
    1,
    'debug keystroke feedback',
  )
}

async function expectNoOverlayRoot(page) {
  await expectCount(page.locator('[data-actorble-overlay-root]'), 0, 'disabled overlay root')
}

async function expectCount(locator, expected, label) {
  const count = await locator.count()
  assertEqual(count, expected, `${label} count`)
}

async function expectCssValue(locator, property, expected) {
  const value = await locator.evaluate((element, name) => getComputedStyle(element)[name], property)
  assertEqual(value, expected, `${property} CSS value`)
}

function assertEqual(actual, expected, label) {
  assert(
    Object.is(actual, expected),
    `Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
  )
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
