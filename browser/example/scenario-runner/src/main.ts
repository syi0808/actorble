import '../../shared/styles.css'
import { createActorble, label, role, type Scenario } from '../../../src/index.js'
import {
  byId,
  escapeHtml,
  renderRows,
  renderTrace,
  runWithStatus,
  setStatus,
} from '../../shared/example-utils.js'

type DemoActorble = ReturnType<typeof createActorble>
type VisualMode = 'quiet' | 'debug'

let visualMode: VisualMode = 'quiet'
let actorble: DemoActorble = createDemoActorble()
const app = byId<HTMLDivElement>('app')

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Example 03</p>
        <h1>Scenario runner</h1>
      </div>
      <div class="status-pill" id="run-status">Ready</div>
    </header>

    <section class="workspace" aria-label="Scenario runner">
      <div class="stage-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Target surface</p>
            <h2>Project console</h2>
          </div>
          <a class="secondary-action" href="/">Examples</a>
        </div>

        <div
          class="tracking-scrollport"
          id="tracking-scrollport"
          data-testid="tracking-scrollport"
          data-state="idle"
        >
          <div class="tracking-content">
            <div class="tracking-layout-offset" aria-hidden="true"></div>
            <form class="project-form" id="project-form">
              <label for="project-name">Project name</label>
              <input
                id="project-name"
                data-testid="project-name"
                name="projectName"
                autocomplete="off"
                placeholder="Untitled project"
              />
              <button id="create-project" data-testid="create-project" type="submit">
                Create project
              </button>
            </form>

            <div class="project-board" aria-live="polite">
              <div class="board-header">
                <span class="board-marker"></span>
                <strong id="project-status" data-state="idle">No project created</strong>
              </div>
              <ul class="task-list">
                <li><span>Launch checklist</span><small data-testid="task-state">waiting</small></li>
                <li><span>Invite operators</span><small>queued</small></li>
                <li><span>Review traces</span><small>queued</small></li>
              </ul>
            </div>
            <div class="tracking-scroll-spacer" aria-hidden="true"></div>
          </div>
        </div>
      </div>

      <div class="control-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Scenario</p>
            <h2>Ordered steps</h2>
          </div>
          <fieldset class="segmented-control" aria-label="Scenario visual detail">
            <label>
              <input
                id="scenario-visual-mode-quiet"
                data-testid="scenario-visual-mode-quiet"
                name="scenario-visual-mode"
                type="radio"
                value="quiet"
                checked
              />
              <span>Quiet</span>
            </label>
            <label>
              <input
                id="scenario-visual-mode-debug"
                data-testid="scenario-visual-mode-debug"
                name="scenario-visual-mode"
                type="radio"
                value="debug"
              />
              <span>Debug</span>
            </label>
          </fieldset>
          <a class="secondary-action" href="/">Examples</a>
        </div>
        <div class="action-grid">
          <button id="run-scenario" type="button">Run scenario</button>
          <button id="reset-stage" type="button">Reset</button>
        </div>
        <div class="tracking-readout">
          <span>Tracking</span>
          <strong id="tracking-state" data-testid="tracking-state" data-state="idle">idle</strong>
        </div>
        <div class="result-block">
          <h3>Scenario steps</h3>
          <ol class="event-log">
            <li>typeInto label("Project name") with focusStrategy "click"</li>
            <li>delay 900ms</li>
            <li>click role("button", "Create project")</li>
            <li>waitFor custom predicate</li>
          </ol>
        </div>
        <div class="result-block">
          <h3>DOM events</h3>
          <ol id="event-log" class="event-log" aria-live="polite"></ol>
        </div>
      </div>
    </section>

    <section class="diagnostics-grid" aria-label="Diagnostics">
      <div class="diagnostics-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Diagnostics</p>
            <h2>Trace</h2>
          </div>
          <button class="secondary-action" id="refresh-trace" type="button">Refresh</button>
        </div>
        <div id="trace-output" class="trace-list" aria-live="polite"></div>
      </div>

      <div class="diagnostics-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Runtime</p>
            <h2>Capability and fidelity</h2>
          </div>
        </div>
        <div id="capability-output" class="capability-list"></div>
      </div>
    </section>
  </main>
`

const runStatus = byId<HTMLDivElement>('run-status')
const projectForm = byId<HTMLFormElement>('project-form')
const projectNameInput = byId<HTMLInputElement>('project-name')
const createProjectButton = byId<HTMLButtonElement>('create-project')
const projectStatus = byId<HTMLElement>('project-status')
const taskState = document.querySelector<HTMLElement>('[data-testid="task-state"]')
const trackingScrollport = byId<HTMLDivElement>('tracking-scrollport')
const trackingState = byId<HTMLElement>('tracking-state')
const runScenarioButton = byId<HTMLButtonElement>('run-scenario')
const resetStageButton = byId<HTMLButtonElement>('reset-stage')
const refreshTraceButton = byId<HTMLButtonElement>('refresh-trace')
const traceOutput = byId<HTMLDivElement>('trace-output')
const capabilityOutput = byId<HTMLDivElement>('capability-output')
const eventLog = byId<HTMLOListElement>('event-log')
const visualModeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="scenario-visual-mode"]'),
)

let createdCount = 0
let scenarioCount = 0
let pendingTrackingProjectName: string | null = null
let trackingTimer: number | undefined
const domEvents: string[] = []

projectForm.addEventListener('submit', (event) => {
  event.preventDefault()
  createProject()
})

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
] as const) {
  projectNameInput.addEventListener(eventName, (event) => recordDomEvent('input', event))
  createProjectButton.addEventListener(eventName, (event) => recordDomEvent('button', event))
}

projectNameInput.addEventListener('click', () => {
  projectNameInput.focus()
})

projectNameInput.addEventListener('input', scheduleTrackingShiftWhenReady)

runScenarioButton.addEventListener('click', () => {
  void runWithStatus(runStatus, 'Scenario complete', runScenarioButton, runScenario, drawTrace)
})

resetStageButton.addEventListener('click', () => {
  resetStage()
  setStatus(runStatus, 'Ready')
})

refreshTraceButton.addEventListener('click', drawTrace)

for (const input of visualModeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return
    }

    visualMode = input.value as VisualMode
    actorble.destroy()
    actorble = createDemoActorble()
    renderCapabilities()
    drawTrace()
    setStatus(runStatus, visualModeStatus(visualMode))
  })
}

renderCapabilities()
renderEvents()
drawTrace()

async function runScenario(): Promise<void> {
  scenarioCount += 1
  resetStage()

  const projectName = `Scenario ${scenarioCount}`
  pendingTrackingProjectName = projectName
  setTrackingState('awaiting')

  const scenario: Scenario = {
    id: 'create-project-demo',
    name: 'Create project demo',
    steps: [
      {
        action: 'typeInto',
        target: label('Project name', { exact: true }),
        input: projectName,
        options: {
          delay: 20,
          timeout: 5000,
          focusStrategy: 'click',
          focusClick: {
            duration: 120,
            pressDwell: 100,
          },
          afterFocusDelay: 40,
        },
      },
      {
        action: 'delay',
        duration: 900,
        reason: 'cursor tracking while layout changes',
      },
      {
        action: 'click',
        target: role('button', { name: 'Create project', exact: true }),
        options: { pressDwell: 100, timeout: 1500 },
      },
      {
        action: 'waitFor',
        input: {
          kind: 'custom',
          predicate: () => projectStatus.dataset.state === 'created',
        },
        options: { timeout: 1500 },
      },
    ],
  }

  await actorble.run(scenario, {
    timeout: 7000,
    pacing: { betweenSteps: 90 },
  })
}

function createDemoActorble(): DemoActorble {
  return createActorble({
    mode: 'interactive',
    debug: true,
    visual: visualOptionsForMode(visualMode),
  })
}

function visualOptionsForMode(
  mode: VisualMode,
): true | { preset: 'debug'; textVisibility: 'masked' } {
  return mode === 'debug' ? { preset: 'debug', textVisibility: 'masked' } : true
}

function visualModeStatus(mode: VisualMode): string {
  return mode === 'debug' ? 'Debug visual' : 'Quiet visual'
}

function createProject(): void {
  createdCount += 1

  const projectName = projectNameInput.value.trim() || 'Untitled project'
  projectStatus.dataset.state = 'created'
  projectStatus.textContent = `Created ${projectName} (#${createdCount})`

  if (taskState) {
    taskState.textContent = 'created'
  }
}

function resetStage(): void {
  clearTrackingTimer()
  pendingTrackingProjectName = null
  projectNameInput.value = ''
  projectNameInput.setSelectionRange(0, 0)
  projectNameInput.blur()
  projectStatus.dataset.state = 'idle'
  projectStatus.textContent = 'No project created'
  trackingScrollport.scrollTop = 0
  setTrackingState('idle')

  if (taskState) {
    taskState.textContent = 'waiting'
  }

  domEvents.splice(0)
  renderEvents()
}

function scheduleTrackingShiftWhenReady(): void {
  if (
    trackingState.dataset.state !== 'awaiting' ||
    pendingTrackingProjectName === null ||
    projectNameInput.value !== pendingTrackingProjectName
  ) {
    return
  }

  setTrackingState('pending')
  clearTrackingTimer()
  trackingTimer = window.setTimeout(() => {
    trackingTimer = undefined
    trackingScrollport.dataset.state = 'shifted'
    trackingScrollport.scrollTop = 24
    setTrackingState('shifted')
  }, 300)
}

function clearTrackingTimer(): void {
  if (trackingTimer === undefined) {
    return
  }

  window.clearTimeout(trackingTimer)
  trackingTimer = undefined
}

function setTrackingState(state: 'idle' | 'awaiting' | 'pending' | 'shifted'): void {
  trackingState.dataset.state = state
  trackingState.textContent = state

  if (state !== 'shifted') {
    trackingScrollport.dataset.state = state
  }
}

function recordDomEvent(labelText: string, event: Event): void {
  const inputData =
    'data' in event && typeof event.data === 'string' && event.data.length > 0
      ? `:${event.data}`
      : ''
  const point =
    event instanceof MouseEvent
      ? `@${Math.round(event.clientX)},${Math.round(event.clientY)}`
      : ''

  domEvents.push(`${labelText}.${event.type}${inputData}${point}`)
  domEvents.splice(80)
  renderEvents()
}

function renderEvents(): void {
  eventLog.innerHTML =
    domEvents.length === 0
      ? '<li class="muted">No DOM events yet</li>'
      : domEvents.map((event) => `<li>${escapeHtml(event)}</li>`).join('')
}

function drawTrace(): void {
  renderTrace(actorble.getTrace(), traceOutput)
}

function renderCapabilities(): void {
  const capabilities = actorble.getCapabilities()
  const fidelity = actorble.getFidelity()

  capabilityOutput.innerHTML = `
    <section>
      <h3>Capabilities</h3>
      ${renderRows(capabilities)}
    </section>
    <section>
      <h3>Fidelity</h3>
      ${renderRows({
        pointerInput: fidelity.pointerInput,
        keyboardInput: fidelity.keyboardInput,
        textInput: fidelity.textInput,
        pseudoState: fidelity.pseudoState,
        visualImplementation: fidelity.visualOverlay.implementation,
        visualRuntime: fidelity.visualOverlay.runtime,
        visualInteractivity: fidelity.visualOverlay.interactivity,
        visualHitTesting: fidelity.visualOverlay.hitTesting,
        trustedEvents: fidelity.trustedEvents,
      })}
      <ul class="limit-list">
        ${fidelity.limits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}
      </ul>
    </section>
  `
}
