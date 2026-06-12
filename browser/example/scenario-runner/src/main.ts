import '../../shared/styles.css'
import { createActorble, label, role, testId, type Scenario } from '../../../src/index.js'
import {
  byId,
  escapeHtml,
  renderRows,
  renderTrace,
  renderUtilityPanel,
  runWithStatus,
  setStatus,
  setupUtilityPanel,
} from '../../shared/example-utils.js'

type DemoActorble = ReturnType<typeof createActorble>
type VisualMode = 'quiet' | 'debug'
type ScenarioPreset = Readonly<{
  id: 'create-project' | 'complete-checklist' | 'invite-operator' | 'ready-for-review'
  name: string
  projectPrefix: string
  successMessage: string
  steps: readonly string[]
}>

const scenarioPresets: readonly ScenarioPreset[] = [
  {
    id: 'create-project',
    name: 'Create project',
    projectPrefix: 'Scenario',
    successMessage: 'Scenario complete',
    steps: [
      'typeInto label("Project name") with focusStrategy "click"',
      'delay 900ms for layout tracking',
      'click role("button", "Create project")',
      'waitFor project created',
    ],
  },
  {
    id: 'complete-checklist',
    name: 'Complete checklist',
    projectPrefix: 'Checklist',
    successMessage: 'Checklist complete',
    steps: [
      'create project',
      'click testId("complete-checklist")',
      'waitFor checklist complete',
    ],
  },
  {
    id: 'invite-operator',
    name: 'Invite operator',
    projectPrefix: 'Invite',
    successMessage: 'Operator invited',
    steps: [
      'create project',
      'typeInto label("Operator email")',
      'click testId("invite-operator")',
      'waitFor operator invited',
    ],
  },
  {
    id: 'ready-for-review',
    name: 'Ready for review',
    projectPrefix: 'Review',
    successMessage: 'Ready for review',
    steps: [
      'create project',
      'complete checklist',
      'invite operator',
      'click testId("mark-review-ready")',
      'waitFor review ready',
    ],
  },
]

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
      <a class="secondary-action" href="/">Examples</a>
    </header>

    <section class="workspace" aria-label="Scenario runner">
      <div class="stage-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Target surface</p>
            <h2>Project console</h2>
          </div>
        </div>

        <div
          class="tracking-scrollport"
          id="tracking-scrollport"
          data-testid="tracking-scrollport"
          data-state="idle"
        >
          <div class="tracking-content">
            <div class="tracking-layout-offset" aria-hidden="true"></div>
            <div class="surface-stack">
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
                  <li>
                    <span>Launch checklist</span>
                    <small id="task-state" data-testid="task-state">waiting</small>
                    <button id="complete-checklist" data-testid="complete-checklist" type="button">
                      Complete
                    </button>
                  </li>
                  <li>
                    <span>Invite operators</span>
                    <small id="operator-state" data-testid="operator-state">queued</small>
                    <span></span>
                  </li>
                  <li>
                    <span>Review traces</span>
                    <small id="review-state" data-testid="review-state">blocked</small>
                    <span></span>
                  </li>
                </ul>
              </div>

              <form class="operator-form" id="operator-form">
                <label for="operator-email">Operator email</label>
                <input
                  id="operator-email"
                  data-testid="operator-email"
                  name="operatorEmail"
                  autocomplete="off"
                  placeholder="operator@example.com"
                />
                <button id="invite-operator" data-testid="invite-operator" type="submit">
                  Invite operator
                </button>
              </form>

              <div class="review-panel">
                <div>
                  <strong>Review readiness</strong>
                  <small id="review-state-detail">Blocked</small>
                </div>
                <button id="mark-review-ready" data-testid="mark-review-ready" type="button">
                  Mark ready
                </button>
              </div>
            </div>
            <div class="tracking-scroll-spacer" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </section>

    ${renderUtilityPanel({
      id: 'scenario-utility-panel',
      label: 'Scenario runner controls',
      title: 'Scenario runner',
      sections: [
        {
          id: 'scenario-actions',
          eyebrow: 'Scenario',
          title: 'Success presets',
          body: `
            <div class="status-pill" id="run-status">Ready</div>
            <div class="result-block field-stack">
              <label for="scenario-preset">Preset</label>
              <select id="scenario-preset" data-testid="scenario-preset">
                ${scenarioPresets
                  .map(
                    (preset) =>
                      `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`,
                  )
                  .join('')}
              </select>
            </div>
            <div class="result-block">
              <div class="action-grid">
                <button id="run-scenario" type="button">Run scenario</button>
                <button id="reset-stage" type="button">Reset</button>
              </div>
            </div>
          `,
        },
        {
          id: 'scenario-settings',
          eyebrow: 'Settings',
          title: 'Visual detail',
          body: `
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
          `,
        },
        {
          id: 'scenario-diagnostics',
          eyebrow: 'Diagnostics',
          title: 'Scenario details',
          body: `
            <div class="tracking-readout">
              <span>Tracking</span>
              <strong id="tracking-state" data-testid="tracking-state" data-state="idle">idle</strong>
            </div>
            <div class="result-block">
              <h3>Scenario steps</h3>
              <ol id="scenario-steps" class="event-log"></ol>
            </div>
            <div class="result-block">
              <h3>DOM events</h3>
              <ol id="event-log" class="event-log" aria-live="polite"></ol>
            </div>
          `,
        },
        {
          id: 'scenario-trace',
          eyebrow: 'Diagnostics',
          title: 'Trace',
          body: `
            <div class="action-grid">
              <button class="secondary-action" id="refresh-trace" type="button">Refresh</button>
            </div>
            <div class="result-block">
              <div id="trace-output" class="trace-list" aria-live="polite"></div>
            </div>
          `,
        },
        {
          id: 'scenario-runtime',
          eyebrow: 'Runtime',
          title: 'Capability and fidelity',
          body: '<div id="capability-output" class="capability-list"></div>',
        },
      ],
    })}
  </main>
`

const scenarioUtilityPanel = setupUtilityPanel('scenario-utility-panel')

const runStatus = byId<HTMLDivElement>('run-status')
const projectForm = byId<HTMLFormElement>('project-form')
const projectNameInput = byId<HTMLInputElement>('project-name')
const createProjectButton = byId<HTMLButtonElement>('create-project')
const completeChecklistButton = byId<HTMLButtonElement>('complete-checklist')
const operatorForm = byId<HTMLFormElement>('operator-form')
const operatorEmailInput = byId<HTMLInputElement>('operator-email')
const inviteOperatorButton = byId<HTMLButtonElement>('invite-operator')
const markReviewReadyButton = byId<HTMLButtonElement>('mark-review-ready')
const projectStatus = byId<HTMLElement>('project-status')
const taskState = byId<HTMLElement>('task-state')
const operatorState = byId<HTMLElement>('operator-state')
const reviewState = byId<HTMLElement>('review-state')
const reviewStateDetail = byId<HTMLElement>('review-state-detail')
const trackingScrollport = byId<HTMLDivElement>('tracking-scrollport')
const trackingState = byId<HTMLElement>('tracking-state')
const scenarioPresetSelect = byId<HTMLSelectElement>('scenario-preset')
const scenarioStepsOutput = byId<HTMLOListElement>('scenario-steps')
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

operatorForm.addEventListener('submit', (event) => {
  event.preventDefault()
  inviteOperator()
})

completeChecklistButton.addEventListener('click', completeChecklist)
markReviewReadyButton.addEventListener('click', markReviewReady)

bindDomEvents('input', projectNameInput)
bindDomEvents('button', createProjectButton)
bindDomEvents('checklist', completeChecklistButton)
bindDomEvents('operatorInput', operatorEmailInput)
bindDomEvents('invite', inviteOperatorButton)
bindDomEvents('review', markReviewReadyButton)

projectNameInput.addEventListener('click', () => {
  projectNameInput.focus()
})

operatorEmailInput.addEventListener('click', () => {
  operatorEmailInput.focus()
})

projectNameInput.addEventListener('input', scheduleTrackingShiftWhenReady)

scenarioPresetSelect.addEventListener('change', () => {
  renderScenarioSteps()
  setStatus(runStatus, currentPreset().name)
})

runScenarioButton.addEventListener('click', () => {
  const preset = currentPreset()

  void runWithStatus(runStatus, preset.successMessage, runScenarioButton, runScenario, () => {
    drawTrace()
    renderScenarioSteps()
    scenarioUtilityPanel.expand()
  })
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
renderScenarioSteps()
drawTrace()

async function runScenario(): Promise<void> {
  const preset = currentPreset()

  scenarioUtilityPanel.collapse()
  scenarioCount += 1
  resetStage()

  const projectName = `${preset.projectPrefix} ${scenarioCount}`
  const operatorEmail = `${preset.id}-${scenarioCount}@example.com`
  pendingTrackingProjectName = projectName
  setTrackingState('awaiting')

  await actorble.run(buildScenario(preset.id, projectName, operatorEmail), {
    timeout: 12000,
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

function buildScenario(
  presetId: ScenarioPreset['id'],
  projectName: string,
  operatorEmail: string,
): Scenario {
  switch (presetId) {
    case 'create-project':
      return {
        id: 'create-project-demo',
        name: 'Create project demo',
        steps: projectCreationSteps(projectName),
      }
    case 'complete-checklist':
      return {
        id: 'complete-checklist-demo',
        name: 'Complete checklist demo',
        steps: [
          ...projectCreationSteps(projectName),
          { action: 'delay', duration: 240, reason: 'show created project' },
          {
            action: 'click',
            target: testId('complete-checklist'),
            options: { pressDwell: 100, timeout: 1500 },
          },
          {
            action: 'waitFor',
            input: {
              kind: 'custom',
              predicate: () => taskState.dataset.state === 'complete',
            },
            options: { timeout: 1500 },
          },
        ],
      }
    case 'invite-operator':
      return {
        id: 'invite-operator-demo',
        name: 'Invite operator demo',
        steps: [
          ...projectCreationSteps(projectName),
          {
            action: 'typeInto',
            target: label('Operator email', { exact: true }),
            input: operatorEmail,
            options: {
              delay: 20,
              timeout: 5000,
              focusStrategy: 'click',
            },
          },
          {
            action: 'click',
            target: testId('invite-operator'),
            options: { pressDwell: 100, timeout: 1500 },
          },
          {
            action: 'waitFor',
            input: {
              kind: 'custom',
              predicate: () => operatorState.dataset.state === 'invited',
            },
            options: { timeout: 1500 },
          },
        ],
      }
    case 'ready-for-review':
      return {
        id: 'ready-for-review-demo',
        name: 'Ready for review demo',
        steps: [
          ...projectCreationSteps(projectName),
          {
            action: 'click',
            target: testId('complete-checklist'),
            options: { pressDwell: 100, timeout: 1500 },
          },
          {
            action: 'typeInto',
            target: label('Operator email', { exact: true }),
            input: operatorEmail,
            options: {
              delay: 20,
              timeout: 5000,
              focusStrategy: 'click',
            },
          },
          {
            action: 'click',
            target: testId('invite-operator'),
            options: { pressDwell: 100, timeout: 1500 },
          },
          {
            action: 'click',
            target: testId('mark-review-ready'),
            options: { pressDwell: 100, timeout: 1500 },
          },
          {
            action: 'waitFor',
            input: {
              kind: 'custom',
              predicate: () => reviewState.dataset.state === 'ready',
            },
            options: { timeout: 1500 },
          },
        ],
      }
  }
}

function projectCreationSteps(projectName: string): Scenario['steps'] {
  return [
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
  ]
}

function currentPreset(): ScenarioPreset {
  const selected = scenarioPresets.find((preset) => preset.id === scenarioPresetSelect.value)

  if (!selected) {
    return scenarioPresets[0]
  }

  return selected
}

function createProject(): void {
  createdCount += 1

  const projectName = projectNameInput.value.trim() || 'Untitled project'
  projectStatus.dataset.state = 'created'
  projectStatus.textContent = `Created ${projectName} (#${createdCount})`
}

function completeChecklist(): void {
  taskState.dataset.state = 'complete'
  taskState.textContent = 'complete'
}

function inviteOperator(): void {
  const email = operatorEmailInput.value.trim() || 'operator@example.com'

  operatorState.dataset.state = 'invited'
  operatorState.textContent = 'invited'
  operatorEmailInput.value = email
}

function markReviewReady(): void {
  reviewState.dataset.state = 'ready'
  reviewState.textContent = 'ready'
  reviewStateDetail.textContent = 'Ready'
}

function resetStage(): void {
  clearTrackingTimer()
  pendingTrackingProjectName = null
  projectNameInput.value = ''
  projectNameInput.setSelectionRange(0, 0)
  projectNameInput.blur()
  operatorEmailInput.value = ''
  operatorEmailInput.setSelectionRange(0, 0)
  operatorEmailInput.blur()
  projectStatus.dataset.state = 'idle'
  projectStatus.textContent = 'No project created'
  taskState.dataset.state = 'waiting'
  taskState.textContent = 'waiting'
  operatorState.dataset.state = 'queued'
  operatorState.textContent = 'queued'
  reviewState.dataset.state = 'blocked'
  reviewState.textContent = 'blocked'
  reviewStateDetail.textContent = 'Blocked'
  trackingScrollport.scrollTop = 0
  setTrackingState('idle')
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

function bindDomEvents(labelText: string, target: HTMLElement): void {
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
    target.addEventListener(eventName, (event) => recordDomEvent(labelText, event))
  }
}

function recordDomEvent(labelText: string, event: Event): void {
  if (event.type === 'pointermove') {
    return
  }

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

function renderScenarioSteps(): void {
  const preset = currentPreset()

  scenarioStepsOutput.innerHTML = preset.steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('')
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
