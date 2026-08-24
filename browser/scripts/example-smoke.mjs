import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const configFile = fileURLToPath(new URL('../example/vite.config.ts', import.meta.url));

const server = await createServer({
  configFile,
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
  },
});

const extraOverlaySelectors = [
  '[data-actorble-visual-highlight]',
  '[data-actorble-visual-click]',
  '[data-actorble-visual-focus]',
  '[data-actorble-visual-typing]',
  '[data-actorble-visual-keystroke]',
];
const searchFeedbackModes = ['cursor', 'debug', 'off'];
const feedbackModeTestIds = {
  cursor: 'feedback-mode-cursor',
  debug: 'feedback-mode-debug',
  off: 'feedback-mode-off',
};

let browser;
let page;

try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];

  if (!baseUrl) {
    throw new Error('Vite did not expose a local server URL.');
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.setDefaultTimeout(20_000);

  await page.goto(baseUrl);
  await expectIndexLinks(page);

  await page.goto(new URL('github-explorer/', baseUrl).toString());
  await expectPageTitle(page, 'GitHub explorer');
  await openUtilityPanel(page, 'task-utility-panel');
  await expectChecked(page, '[data-testid="feedback-mode-cursor"]', true);
  await expectFidelityRuntime(page, 'enabled');
  await runCurrentScenario(page, 'GitHub scenario complete');
  await expectState(page, '#github-outcome', 'issue-open');
  await expectEventLogIncludes(page, ['repoInput.focus', 'issueRow.click', 'issuesTab.click']);
  await expectTraceIncludes(page, ['action.click', 'action.waitFor']);
  await closeUtilityPanel(page, 'task-utility-panel');
  await expectOverlayHitTesting(page, '[data-testid="github-issue-example"]', 'github issue row');
  await expectCursorOverlay(page);

  await page.goto(new URL('form-filling/', baseUrl).toString());
  await expectPageTitle(page, 'Form filling');
  await openUtilityPanel(page, 'task-utility-panel');
  await runTypeFirst(page);
  await expectStatus(page, 'First field typed');
  await expectInputValue(page, '#request-name', 'Mina Park');
  await expectEventLogIncludes(page, ['nameInput.focus']);
  await runCurrentScenario(page, 'Form scenario complete');
  await expectState(page, '#form-status', 'submitted');
  await expectInputValue(page, '#request-name', 'Mina Park');
  await expectInputValue(page, '#request-email', 'mina@example.com');
  await expectChecked(page, '[data-testid="request-copy"]', true);
  await expectEventLogIncludes(page, ['submitRequest.click', 'copyCheckbox.click']);

  for (const mode of searchFeedbackModes) {
    await runSearchFeedbackModeSmoke(page, baseUrl, mode);
  }

  await page.goto(new URL('appointment-scheduler/', baseUrl).toString());
  await expectPageTitle(page, 'Appointment scheduler');
  await openUtilityPanel(page, 'task-utility-panel');
  await runCurrentScenario(page, 'Scheduler scenario complete');
  await expectSchedulerScenarioComplete(page);

  await page.goto(new URL('selection-pointer-sequence/', baseUrl).toString());
  await expectPageTitle(page, 'Selection and pointer sequence');
  await openUtilityPanel(page, 'task-utility-panel');
  await runCurrentScenario(page, 'Selection scenario complete');
  await expectSelectionPointerSequenceComplete(page);

  await page.goto(new URL('research-clipping/', baseUrl).toString());
  await expectPageTitle(page, 'Research clipping');
  await expectManualResearchQuoteSave(page);
  await openUtilityPanel(page, 'task-utility-panel');
  await runCurrentScenarioWithObservation(page, 'Research clipping complete', () =>
    expectTextSelectionCursorMotion(page),
  );
  await expectResearchClippingComplete(page);

  await page.goto(new URL('nested-reveal-stability/', baseUrl).toString());
  await expectPageTitle(page, 'Nested reveal lab');
  await openUtilityPanel(page, 'task-utility-panel');
  await runCurrentScenario(page, 'Nested reveal scenario complete');
  await expectNestedRevealStabilityComplete(page);
} catch (error) {
  throw await withPageDiagnostics(error, page);
} finally {
  await browser?.close();
  await server.close();
}

async function expectIndexLinks(page) {
  await expectLink(page, '#open-github-explorer', '/github-explorer/');
  await expectLink(page, '#open-form-filling', '/form-filling/');
  await expectLink(page, '#open-web-search', '/web-search/');
  await expectLink(page, '#open-appointment-scheduler', '/appointment-scheduler/');
  await expectLink(page, '#open-selection-pointer-sequence', '/selection-pointer-sequence/');
  await expectLink(page, '#open-research-clipping', '/research-clipping/');
  await expectLink(page, '#open-nested-reveal-stability', '/nested-reveal-stability/');
}

async function expectLink(page, selector, hrefSuffix) {
  const href = await page.locator(selector).getAttribute('href');
  assertEqual(href, hrefSuffix, `${selector} href`);
}

async function runCurrentScenario(page, expectedStatus) {
  await page.locator('#run-current').click();
  await expectStatus(page, expectedStatus);
}

async function runCurrentScenarioWithObservation(page, expectedStatus, observation) {
  const observed = observation();

  await page.locator('#run-current').click();
  await Promise.all([expectStatus(page, expectedStatus), observed]);
}

async function runTypeFirst(page) {
  await page.locator('#run-type-first').click();
}

async function setFeedbackMode(page, mode) {
  const testId = feedbackModeTestIds[mode];

  await page.locator(`[data-testid="${testId}"]`).check();
  await expectChecked(page, `[data-testid="${testId}"]`, true);
}

async function runSearchFeedbackModeSmoke(page, baseUrl, mode) {
  await page.goto(new URL('web-search/', baseUrl).toString());
  await expectPageTitle(page, 'Web search');
  await openUtilityPanel(page, 'task-utility-panel');
  await setFeedbackMode(page, mode);
  await expectFidelityRuntime(page, mode === 'off' ? 'disabled' : 'enabled');

  if (mode === 'debug') {
    await runCurrentScenarioWithObservation(page, 'Search scenario complete', () =>
      expectDebugTypingFeedbackDuringRun(page),
    );
  } else {
    await runCurrentScenario(page, 'Search scenario complete');
  }

  await expectSearchScenarioComplete(page);
  await expectFeedbackModeOverlay(page, mode);
}

async function openUtilityPanel(page, panelId) {
  await expectUtilityPanelCollapsed(page, panelId);
  await page.locator(`#${panelId}-toggle`).click();
  await page.waitForFunction((id) => {
    const panel = document.getElementById(id);
    const content = document.getElementById(`${id}-content`);
    const toggle = document.getElementById(`${id}-toggle`);

    return (
      panel?.getAttribute('data-state') === 'expanded' &&
      content instanceof HTMLElement &&
      !content.hidden &&
      toggle?.getAttribute('aria-expanded') === 'true'
    );
  }, panelId);
}

async function expectUtilityPanelCollapsed(page, panelId) {
  const details = await page.locator(`#${panelId}`).evaluate((panel, id) => {
    const content = document.getElementById(`${id}-content`);
    const toggle = document.getElementById(`${id}-toggle`);
    const style = getComputedStyle(panel);

    return {
      state: panel.getAttribute('data-state'),
      position: style.position,
      hidden: content instanceof HTMLElement ? content.hidden : null,
      expanded: toggle?.getAttribute('aria-expanded'),
    };
  }, panelId);

  assertEqual(details.state, 'collapsed', `${panelId} state`);
  assert(
    details.position === 'fixed' || details.position === 'static',
    `Expected ${panelId} position to be fixed or static, got ${details.position}.`,
  );
  assertEqual(details.hidden, true, `${panelId} content hidden`);
  assertEqual(details.expanded, 'false', `${panelId} aria-expanded`);
}

async function closeUtilityPanel(page, panelId) {
  const expanded = await page
    .locator(`#${panelId}-toggle`)
    .evaluate((toggle) => toggle.getAttribute('aria-expanded') === 'true');

  if (!expanded) {
    return;
  }

  await page.locator(`#${panelId}-toggle`).click();
  await page.waitForFunction((id) => {
    const panel = document.getElementById(id);
    const content = document.getElementById(`${id}-content`);
    const toggle = document.getElementById(`${id}-toggle`);

    return (
      panel?.getAttribute('data-state') === 'collapsed' &&
      content instanceof HTMLElement &&
      content.hidden &&
      toggle?.getAttribute('aria-expanded') === 'false'
    );
  }, panelId);
}

async function expectPageTitle(page, text) {
  await page.waitForFunction(
    (expected) => document.querySelector('h1')?.textContent === expected,
    text,
  );
}

async function expectStatus(page, text) {
  await page.waitForFunction(
    (expected) => document.querySelector('#run-status')?.textContent === expected,
    text,
  );
}

async function expectChecked(page, selector, expected) {
  const checked = await page.locator(selector).isChecked();
  assertEqual(checked, expected, `${selector} checked state`);
}

async function expectInputValue(page, selector, value) {
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value === value,
    { selector, value },
  );
}

async function expectState(page, selector, expected) {
  await page.waitForFunction(
    ({ selector, expected }) =>
      document.querySelector(selector)?.getAttribute('data-state') === expected,
    { selector, expected },
  );
}

async function expectText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent === expected,
    { selector, expected },
  );
}

async function expectFidelityRuntime(page, runtime) {
  await expectCapabilityRow(page, '#fidelity-output', 'runtime', runtime);
}

async function expectCapabilityRow(page, containerSelector, termText, valueText) {
  await page.waitForFunction(
    ({ containerSelector, termText, valueText }) =>
      Array.from(document.querySelectorAll(`${containerSelector} dt`)).some(
        (term) =>
          term.textContent === termText && term.nextElementSibling?.textContent === valueText,
      ),
    { containerSelector, termText, valueText },
  );
}

async function expectEventLogIncludes(page, expectedEvents) {
  const events = await page
    .locator('#event-log li')
    .evaluateAll((items) => items.map((item) => item.textContent ?? ''));

  for (const expected of expectedEvents) {
    assert(
      events.some((event) => event.startsWith(expected)),
      `Expected DOM event log to include ${expected}; got ${events.join(', ')}`,
    );
  }
}

async function expectTraceIncludes(page, expectedSpans) {
  const spans = await page
    .locator('#trace-output .trace-row strong')
    .evaluateAll((items) => items.map((item) => item.textContent ?? ''));

  for (const expected of expectedSpans) {
    assert(
      spans.includes(expected),
      `Expected trace output to include ${expected}; got ${spans.join(', ')}`,
    );
  }
}

async function expectSearchScenarioComplete(page) {
  await expectState(page, '#search-preview', 'open');
  await expectInputValue(page, '#search-query', 'browser automation event dispatch');
  await expectEventLogIncludes(page, [
    'searchInput.focus',
    'searchButton.click',
    'searchResult.click',
  ]);
  await expectTraceIncludes(page, ['action.typeInto', 'action.click', 'action.waitFor']);
}

async function expectSchedulerScenarioComplete(page) {
  await expectState(page, '#appointment-status', 'confirmed');
  await expectState(page, '#slot-1030', 'scheduled');
  await expectInputValue(page, '#patient-search', 'Jisoo Han');
  await expectInputValue(page, '#appointment-reason', 'Follow-up consultation');
  await expectEventLogIncludes(page, [
    'patientSearch.click',
    'patientSearch.keydown',
    'patientResult.click',
    'targetSlot.pointerup',
    'confirmButton.click',
  ]);
  await expectTraceIncludes(page, [
    'scenario.run',
    'action.typeInto',
    'action.press',
    'action.doubleClick',
    'action.fill',
    'action.drag',
    'action.clickCurrent',
  ]);
}

async function expectSelectionPointerSequenceComplete(page) {
  await expectState(page, '#selection-status', 'complete');
  await expectState(page, '#selection-click-target', 'clicked');
  await expectState(page, '#selection-drop-target', 'dropped');
  await expectState(page, '#pointer-pad', 'complete');
  await expectText(page, '#document-selection-output', 'selection text');
  await expectText(page, '#textarea-selection-output', 'textarea range');
  await expectText(page, '#editor-selection-output', 'editable note');
  await expectEventLogIncludes(page, [
    'clickTarget.click',
    'dragSource.pointerdown',
    'dropTarget.pointerup',
    'pointerPad.pointerdown',
    'pointerPad.pointerup',
  ]);
  await expectTraceIncludes(page, [
    'action.selectText',
    'action.click',
    'action.drag',
    'action.pointerSequence',
  ]);
}

async function expectResearchClippingComplete(page) {
  const quote = 'visible verification before a captured quote\nis trusted';
  const note = 'Use in weekly automation brief.';

  await expectState(page, '#clipping-status', 'published');
  await expectText(page, '#quote-preview-output', quote);
  await expectText(page, '#saved-quote-output', quote);
  await expectText(page, '#published-note-output', note);
  await expectInputValue(page, '#quote-note', note);
  await expectEventLogIncludes(page, [
    'researchSource.pointerdown',
    'researchSource.mousedown',
    'researchSource.mouseup',
    'saveQuote.click',
    'quoteNote.input',
    'publishClipping.click',
  ]);
  await expectTraceIncludes(page, [
    'action.selectText',
    'action.click',
    'action.typeInto',
    'action.waitFor',
  ]);
}

async function expectNestedRevealStabilityComplete(page) {
  await expectInputValue(page, '#nested-target', 'Scenema');
  await expectState(page, '#async-result', 'moving');
  await expectEventLogIncludes(page, [
    'nestedInput.click',
    'nestedInput.focus',
    'nestedInput.change',
  ]);
  await expectTraceIncludes(page, [
    'action.reveal',
    'action.moveTo',
    'action.click',
    'action.typeInto',
    'action.waitFor',
  ]);

  const state = await page.evaluate(() => window.__actorbleNestedReveal);

  assert(state, 'Expected nested reveal smoke state.');
  const panelIndex = state.scrollOrder.findIndex((sample) => sample.surface === 'panel');
  const viewportIndex = state.scrollOrder.findIndex((sample) => sample.surface === 'viewport');
  assert(
    panelIndex >= 0,
    `Expected an inner panel scroll; got ${JSON.stringify(state.scrollOrder)}`,
  );
  assert(
    viewportIndex >= 0,
    `Expected an outer viewport scroll; got ${JSON.stringify(state.scrollOrder)}`,
  );
  assert(
    panelIndex < viewportIndex,
    `Expected inner-before-outer scroll order; got ${JSON.stringify(state.scrollOrder)}`,
  );
  assert(
    state.panelScrollTop > 0,
    `Expected positive panel scrollTop, got ${state.panelScrollTop}.`,
  );
  assert(
    state.viewportScrollY > 0,
    `Expected positive viewport scrollY, got ${state.viewportScrollY}.`,
  );
  assert(
    state.pointerInsideTarget,
    'Expected refreshed pointer coordinates inside the target input.',
  );
  assert(state.motionStartedAt !== null, 'Expected asynchronous result motion to start.');
  assert(state.motionEndedAt !== null, 'Expected asynchronous result motion to end.');
  assert(state.stableCompletedAt !== null, 'Expected visual-stable wait to complete.');
  assert(
    state.stableCompletedAt + 24 >= state.motionEndedAt,
    `Expected stable completion after result motion; got ${JSON.stringify({
      motionEndedAt: state.motionEndedAt,
      stableCompletedAt: state.stableCompletedAt,
    })}`,
  );
  assertEqual(state.alreadyVisibleChanged, false, 'already-visible reveal changed');
  assertEqual(state.oversizedFullyVisible, false, 'oversized reveal fullyVisible');
  assertEqual(state.timedAbortCode, 'ACTION_CANCELLED', 'timed reveal abort code');
  assert(
    Math.abs(state.timedStoppedPosition - state.timedAbortPosition) <= 0.5,
    `Expected timed reveal to stop in place; got ${JSON.stringify({
      aborted: state.timedAbortPosition,
      stopped: state.timedStoppedPosition,
    })}`,
  );
  assert(
    state.recoverySucceeded,
    'Expected the action after timed reveal cancellation to succeed.',
  );
  for (const eventName of [
    'reveal:start',
    'reveal:complete',
    'stability:start',
    'stability:complete',
  ]) {
    assert(
      state.revealTraceEvents.includes(eventName),
      `Expected trace event ${eventName}; got ${state.revealTraceEvents.join(', ')}.`,
    );
  }
  assertEqual(state.capabilities.scrolling, 'nested-dom', 'scrolling capability');
  assertEqual(state.capabilities.reveal, 'planned', 'reveal capability');
  assertEqual(state.capabilities.stability, 'observed', 'stability capability');
}

async function expectManualResearchQuoteSave(page) {
  const quote = 'captured quote\nis trusted before it enters';

  await page.evaluate((quote) => {
    const source = document.getElementById('research-source-copy');

    if (!source) {
      throw new Error('Research source copy was not found.');
    }

    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
      const offset = textNode.textContent?.indexOf(quote) ?? -1;

      if (offset >= 0) {
        const range = document.createRange();
        const selection = window.getSelection();

        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + quote.length);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return;
      }

      textNode = walker.nextNode();
    }

    throw new Error('Manual research quote text was not found.');
  }, quote);

  await expectText(page, '#quote-preview-output', quote);
  await page.locator('#save-quote').click();
  await expectState(page, '#clipping-status', 'saved');
  await expectText(page, '#saved-quote-output', quote);
}

async function expectFeedbackModeOverlay(page, mode) {
  await closeUtilityPanel(page, 'task-utility-panel');

  switch (mode) {
    case 'cursor':
      await expectOverlayHitTesting(
        page,
        '[data-testid="search-result-docs"]',
        'cursor feedback search result',
      );
      await expectCursorOverlay(page);
      break;
    case 'debug':
      await expectOverlayHitTesting(
        page,
        '[data-testid="search-result-docs"]',
        'debug search result',
      );
      await expectDebugOverlay(page);
      break;
    case 'off':
      await expectNoOverlayRoot(page);
      break;
    default:
      throw new Error(`Unsupported feedback smoke mode: ${mode}`);
  }
}

async function expectDebugTypingFeedbackDuringRun(page) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-actorble-overlay-root]');

    return Boolean(
      overlay?.querySelector('[data-actorble-visual-focus]') &&
      overlay?.querySelector('[data-actorble-visual-typing]'),
    );
  });
}

async function expectTextSelectionCursorMotion(page) {
  const result = await page.evaluate(async () => {
    const transforms = new Set();
    let pressedTextSamples = 0;
    const startedAt = performance.now();

    while (performance.now() - startedAt < 2000) {
      const cursor = document.querySelector('[data-actorble-visual-cursor]');

      if (
        cursor instanceof HTMLElement &&
        cursor.getAttribute('data-actorble-cursor-kind') === 'text' &&
        cursor.hasAttribute('data-actorble-cursor-pressed')
      ) {
        pressedTextSamples += 1;
        transforms.add(getComputedStyle(cursor).transform);
      }

      if (pressedTextSamples >= 32 && transforms.size >= 24) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    return {
      pressedTextSamples,
      uniqueTransforms: transforms.size,
    };
  });

  assert(
    result.pressedTextSamples >= 32 && result.uniqueTransforms >= 24,
    `Expected moving pressed text cursor samples; got ${JSON.stringify(result)}`,
  );
}

async function expectOverlayHitTesting(page, targetSelector, label) {
  const overlay = page.locator('[data-actorble-overlay-root]');
  await expectCount(overlay, 1, `${label} overlay root`);
  await expectCssValue(overlay, 'pointer-events', 'none');

  const hitTest = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    const rect = target?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const testTarget = hit?.closest('[data-testid]');

    return testTarget?.getAttribute('data-testid') ?? hit?.id ?? hit?.tagName ?? null;
  }, targetSelector);

  const expected = targetSelector.match(/\[data-testid="([^"]+)"\]/)?.[1];
  assertEqual(hitTest, expected, `${label} hit-test target`);
}

async function expectCursorOverlay(page) {
  const overlay = page.locator('[data-actorble-overlay-root]');
  await expectCount(overlay.locator('[data-actorble-visual-cursor]'), 1, 'cursor feedback cursor');

  for (const selector of extraOverlaySelectors) {
    await expectCount(overlay.locator(selector), 0, `cursor feedback ${selector}`);
  }
}

async function expectDebugOverlay(page) {
  const overlay = page.locator('[data-actorble-overlay-root]');
  await expectCount(overlay.locator('[data-actorble-visual-cursor]'), 1, 'debug cursor');
  await expectCount(overlay.locator('[data-actorble-visual-highlight]'), 1, 'debug highlight');
  await expectCount(overlay.locator('[data-actorble-visual-click]'), 1, 'debug click feedback');
  await expectCount(
    overlay.locator('[data-actorble-visual-keystroke]'),
    1,
    'debug keystroke feedback',
  );
}

async function expectNoOverlayRoot(page) {
  await expectCount(page.locator('[data-actorble-overlay-root]'), 0, 'disabled overlay root');
}

async function expectCount(locator, expected, label) {
  const count = await locator.count();
  assertEqual(count, expected, `${label} count`);
}

async function expectCssValue(locator, property, expected) {
  const value = await locator.evaluate(
    (element, name) => getComputedStyle(element)[name],
    property,
  );
  assertEqual(value, expected, `${property} CSS value`);
}

function assertEqual(actual, expected, label) {
  assert(
    Object.is(actual, expected),
    `Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function withPageDiagnostics(error, page) {
  const message = error instanceof Error ? error.message : String(error);

  if (!page) {
    return error instanceof Error ? error : new Error(message);
  }

  const diagnostics = await collectPageDiagnostics(page);

  return new Error(`${message}\n\n${formatDiagnostics(diagnostics)}`, {
    cause: error instanceof Error ? error : undefined,
  });
}

async function collectPageDiagnostics(page) {
  try {
    return await page.evaluate(() => {
      const text = (selector) => {
        const element = document.querySelector(selector);

        return element?.textContent?.trim() || '(missing)';
      };
      const list = (selector) =>
        Array.from(document.querySelectorAll(selector))
          .map((element) => element.textContent?.trim() ?? '')
          .filter(Boolean);
      const traceRows = () =>
        Array.from(document.querySelectorAll('#trace-output .trace-row'))
          .map((row) => {
            const name = row.querySelector('strong')?.textContent?.trim() || '(missing)';
            const summary = row.querySelector('.trace-title span')?.textContent?.trim() || '';

            return `${name}${summary ? ` ${summary}` : ''}`;
          })
          .filter(Boolean);
      const rows = (containerSelector) =>
        Array.from(document.querySelectorAll(`${containerSelector} dt`)).map((term) => {
          const name = term.textContent?.trim() || '(empty)';
          const value = term.nextElementSibling?.textContent?.trim() || '(empty)';

          return `${name}: ${value}`;
        });

      return {
        url: location.href,
        title: document.title || '(missing)',
        heading: text('h1'),
        runStatus: text('#run-status'),
        events: list('#event-log li'),
        traces: traceRows(),
        fidelity: rows('#fidelity-output'),
      };
    });
  } catch (diagnosticsError) {
    return {
      url: page.url(),
      title: '(unavailable)',
      heading: '(unavailable)',
      runStatus: '(unavailable)',
      events: [],
      traces: [],
      fidelity: [],
      diagnosticsError:
        diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError),
    };
  }
}

function formatDiagnostics(diagnostics) {
  return [
    'Smoke diagnostics:',
    `URL: ${diagnostics.url}`,
    `title: ${diagnostics.title}`,
    `heading: ${diagnostics.heading}`,
    `#run-status: ${diagnostics.runStatus}`,
    formatList('event log', diagnostics.events),
    formatList('trace', diagnostics.traces),
    formatList('fidelity', diagnostics.fidelity),
    diagnostics.diagnosticsError
      ? `diagnostics collection error: ${diagnostics.diagnosticsError}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatList(label, values) {
  if (values.length === 0) {
    return `${label}: (none)`;
  }

  return `${label}:\n${values
    .slice(0, 20)
    .map((value) => `  - ${value}`)
    .join('\n')}`;
}
