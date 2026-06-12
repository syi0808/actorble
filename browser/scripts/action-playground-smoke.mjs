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
  await page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll('#fidelity-output dt')).some(
        (term) =>
          term.textContent === 'runtime' &&
          term.nextElementSibling?.textContent === expected,
      ),
    runtime,
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
