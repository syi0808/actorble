import { createActorble, type TypeOptions } from '../../src/index.js'
import {
  byId,
  renderRows,
  renderUtilityPanel,
  runWithStatus,
  setStatus,
  setupUtilityPanel,
  escapeHtml,
} from './example-utils.js'

export type DemoActorble = ReturnType<typeof createActorble>
export type VisualMode = 'quiet' | 'debug' | 'off'

export type TaskExampleContext = Readonly<{
  actorble(): DemoActorble
  bindDomEvents(label: string, target: HTMLElement): void
  ensureInputValue(id: string, value: string): void
}>

export type TaskExampleOptions = Readonly<{
  title: string
  eyebrow: string
  summary: string
  stageLabel: string
  stageHtml: string
  successMessage: string
  bindStage(context: TaskExampleContext): void
  run(context: TaskExampleContext): Promise<void>
  typeFirstField(context: TaskExampleContext): Promise<void>
  clickPrimary(context: TaskExampleContext): Promise<void>
}>

const humanFocusClick = {
  motion: { kind: 'ease', easing: 'ease-in-out', duration: 180 },
  pressDwell: 80,
} as const

export function clickFocusTyping(delay: number, timeout: number): TypeOptions {
  return {
    delay,
    timeout,
    focusStrategy: 'click',
    focusClick: humanFocusClick,
    afterFocusDelay: 40,
  }
}

export function mountTaskExample(options: TaskExampleOptions): void {
  let visualMode: VisualMode = 'quiet'
  let actorble: DemoActorble = createDemoActorble(visualMode)
  const domEvents: string[] = []
  const app = byId<HTMLDivElement>('app')

  app.innerHTML = `
    <main class="app-shell task-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Actorble browser</p>
          <h1>${escapeHtml(options.title)}</h1>
        </div>
        <a class="secondary-action" href="/">Examples</a>
      </header>

      <section class="single-task-workspace" aria-label="${escapeHtml(options.stageLabel)}">
        <section class="stage-panel task-stage-panel" id="stage-panel" aria-live="polite">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">${escapeHtml(options.eyebrow)}</p>
              <h2>${escapeHtml(options.title)}</h2>
            </div>
            <small class="scenario-summary">${escapeHtml(options.summary)}</small>
          </div>
          <div class="scenario-stage" id="scenario-stage"></div>
        </section>
      </section>

      ${renderUtilityPanel({
        id: 'task-utility-panel',
        label: `${options.title} controls`,
        title: options.title,
        sections: [
          {
            id: 'task-actions',
            eyebrow: 'Actions',
            title: 'Run browser task',
            body: `
              <div class="status-pill" id="run-status">Ready</div>
              <div class="scenario-readout result-block">
                <strong>${escapeHtml(options.title)}</strong>
                <small>${escapeHtml(options.summary)}</small>
              </div>
              <div class="result-block">
                <div class="action-grid">
                  <button id="run-current" data-testid="run-current" type="button">Run scenario</button>
                  <button id="run-type-first" data-testid="run-type-first" type="button">Type first field</button>
                  <button id="run-click-primary" data-testid="run-click-primary" type="button">Click primary</button>
                  <button id="reset-stage" type="button">Reset</button>
                </div>
              </div>
            `,
          },
          {
            id: 'task-settings',
            eyebrow: 'Settings',
            title: 'Visual detail',
            body: `
              <fieldset class="segmented-control" aria-label="Visual detail">
                <label>
                  <input
                    id="visual-mode-quiet"
                    data-testid="visual-mode-quiet"
                    name="visual-mode"
                    type="radio"
                    value="quiet"
                    checked
                  />
                  <span>Quiet</span>
                </label>
                <label>
                  <input
                    id="visual-mode-debug"
                    data-testid="visual-mode-debug"
                    name="visual-mode"
                    type="radio"
                    value="debug"
                  />
                  <span>Debug</span>
                </label>
                <label>
                  <input
                    id="visual-mode-off"
                    data-testid="visual-mode-off"
                    name="visual-mode"
                    type="radio"
                    value="off"
                  />
                  <span>Off</span>
                </label>
              </fieldset>
            `,
          },
          {
            id: 'task-diagnostics',
            eyebrow: 'Diagnostics',
            title: 'Events and fidelity',
            body: `
              <div class="result-block">
                <h3>DOM events</h3>
                <ol id="event-log" class="event-log" aria-live="polite"></ol>
              </div>
              <div class="result-block">
                <h3>Runtime fidelity</h3>
                <div id="fidelity-output" class="capability-list"></div>
              </div>
            `,
          },
        ],
      })}
    </main>
  `

  const utilityPanel = setupUtilityPanel('task-utility-panel')
  const runStatus = byId<HTMLDivElement>('run-status')
  const resetStageButton = byId<HTMLButtonElement>('reset-stage')
  const runCurrentButton = byId<HTMLButtonElement>('run-current')
  const runTypeFirstButton = byId<HTMLButtonElement>('run-type-first')
  const runClickPrimaryButton = byId<HTMLButtonElement>('run-click-primary')
  const eventLog = byId<HTMLOListElement>('event-log')
  const fidelityOutput = byId<HTMLDivElement>('fidelity-output')
  const visualModeInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="visual-mode"]'),
  )
  const context: TaskExampleContext = {
    actorble: () => actorble,
    bindDomEvents,
    ensureInputValue,
  }

  resetStageButton.addEventListener('click', () => {
    renderStage()
    setStatus(runStatus, 'Ready')
  })

  runCurrentButton.addEventListener('click', () => {
    void runWithStatus(
      runStatus,
      options.successMessage,
      runCurrentButton,
      async () => {
        utilityPanel.collapse()
        renderStage()
        await options.run(context)
      },
      afterActionRun,
    )
  })

  runTypeFirstButton.addEventListener('click', () => {
    void runWithStatus(
      runStatus,
      'First field typed',
      runTypeFirstButton,
      async () => {
        utilityPanel.collapse()
        renderStage()
        await options.typeFirstField(context)
      },
      afterActionRun,
    )
  })

  runClickPrimaryButton.addEventListener('click', () => {
    void runWithStatus(
      runStatus,
      'Primary click complete',
      runClickPrimaryButton,
      async () => {
        utilityPanel.collapse()
        renderStage()
        await options.clickPrimary(context)
      },
      afterActionRun,
    )
  })

  for (const input of visualModeInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) {
        return
      }

      visualMode = input.value as VisualMode
      actorble.destroy()
      actorble = createDemoActorble(visualMode)
      renderFidelity()
      setStatus(runStatus, visualModeStatus(visualMode))
    })
  }

  renderStage()
  renderFidelity()

  function renderStage(): void {
    byId<HTMLDivElement>('scenario-stage').innerHTML = options.stageHtml
    domEvents.splice(0)
    renderEvents()
    options.bindStage(context)
  }

  function afterActionRun(): void {
    renderFidelity()
    utilityPanel.expand()
  }

  function bindDomEvents(label: string, target: HTMLElement): void {
    if (isTextEntryControl(target)) {
      target.addEventListener('click', () => {
        target.focus()
      })
    }

    for (const eventName of [
      'pointermove',
      'pointerdown',
      'pointerup',
      'mousedown',
      'mouseup',
      'click',
      'focus',
      'beforeinput',
      'input',
      'change',
      'submit',
    ] as const) {
      target.addEventListener(eventName, (event) => recordDomEvent(label, event))
    }
  }

  function recordDomEvent(label: string, event: Event): void {
    if (event.type === 'pointermove') {
      return
    }

    const inputData =
      'data' in event && typeof event.data === 'string' && event.data.length > 0
        ? `:${event.data}`
        : ''

    domEvents.unshift(`${label}.${event.type}${inputData}`)
    domEvents.splice(80)
    renderEvents()
  }

  function renderEvents(): void {
    eventLog.innerHTML =
      domEvents.length === 0
        ? '<li class="muted">No DOM events yet</li>'
        : domEvents.map((event) => `<li>${escapeHtml(event)}</li>`).join('')
  }

  function renderFidelity(): void {
    const fidelity = actorble.getFidelity()

    fidelityOutput.innerHTML = renderRows({
      overlay: fidelity.visualOverlay.implementation,
      runtime: fidelity.visualOverlay.runtime,
      interactivity: fidelity.visualOverlay.interactivity,
      hitTesting: fidelity.visualOverlay.hitTesting,
      pointer: fidelity.pointerInput,
      text: fidelity.textInput,
      trusted: fidelity.trustedEvents,
    })
  }
}

function createDemoActorble(
  mode: VisualMode,
): DemoActorble {
  return createActorble({
    mode: 'interactive',
    debug: true,
    visual: visualOptionsForMode(mode),
  })
}

function visualOptionsForMode(
  mode: VisualMode,
): true | { preset: 'debug'; textVisibility: 'masked' } | { enabled: false } {
  switch (mode) {
    case 'debug':
      return { preset: 'debug', textVisibility: 'masked' }
    case 'off':
      return { enabled: false }
    case 'quiet':
      return true
  }
}

function visualModeStatus(mode: VisualMode): string {
  switch (mode) {
    case 'debug':
      return 'Debug visual'
    case 'off':
      return 'Visual off'
    case 'quiet':
      return 'Quiet visual'
  }
}

function ensureInputValue(id: string, value: string): void {
  const input = byId<HTMLInputElement | HTMLTextAreaElement>(id)

  input.value = value
  input.focus()

  try {
    input.setSelectionRange(value.length, value.length)
  } catch {
    // Some text controls do not expose selection.
  }
}

function isTextEntryControl(target: HTMLElement): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) {
    return true
  }

  if (!(target instanceof HTMLInputElement)) {
    return false
  }

  return [
    '',
    'email',
    'password',
    'search',
    'tel',
    'text',
    'url',
  ].includes(target.type)
}
