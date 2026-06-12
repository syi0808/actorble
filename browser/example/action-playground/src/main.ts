import '../../shared/styles.css'
import { createActorble, label, testId } from '../../../src/index.js'
import {
  byId,
  escapeHtml,
  renderRows,
  renderUtilityPanel,
  runWithStatus,
  setStatus,
  setupUtilityPanel,
} from '../../shared/example-utils.js'

type DemoActorble = ReturnType<typeof createActorble>
type VisualMode = 'quiet' | 'debug' | 'off'

let visualMode: VisualMode = 'quiet'
let actorble: DemoActorble = createDemoActorble()
const app = byId<HTMLDivElement>('app')

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Example 02</p>
        <h1>Action playground</h1>
      </div>
      <a class="secondary-action" href="/">Examples</a>
    </header>

    <section class="workspace" aria-label="Action playground">
      <div class="stage-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Target surface</p>
            <h2>Project console</h2>
          </div>
        </div>

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
      </div>
    </section>

    ${renderUtilityPanel({
      id: 'action-utility-panel',
      label: 'Action playground controls',
      title: 'Action playground',
      sections: [
        {
          id: 'action-actions',
          eyebrow: 'Actions',
          title: 'Success flows',
          body: `
            <div class="status-pill" id="run-status">Ready</div>
            <div class="result-block">
              <div class="action-grid">
                <button id="run-flow" type="button">Create project</button>
                <button id="run-complete-checklist" type="button">Complete checklist</button>
                <button id="run-invite-operator" type="button">Invite operator</button>
                <button id="run-ready-review" type="button">Ready for review</button>
                <button id="run-type" type="button">Type project name</button>
                <button id="run-click" type="button">Click create</button>
              </div>
            </div>
          `,
        },
        {
          id: 'action-settings',
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
            <div class="result-block">
              <button class="secondary-action" id="reset-stage" type="button">Reset</button>
            </div>
          `,
        },
        {
          id: 'action-diagnostics',
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

const actionUtilityPanel = setupUtilityPanel('action-utility-panel')

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
const resetStageButton = byId<HTMLButtonElement>('reset-stage')
const visualModeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="visual-mode"]'),
)
const runFlowButton = byId<HTMLButtonElement>('run-flow')
const runCompleteChecklistButton = byId<HTMLButtonElement>('run-complete-checklist')
const runInviteOperatorButton = byId<HTMLButtonElement>('run-invite-operator')
const runReadyReviewButton = byId<HTMLButtonElement>('run-ready-review')
const runTypeButton = byId<HTMLButtonElement>('run-type')
const runClickButton = byId<HTMLButtonElement>('run-click')
const eventLog = byId<HTMLOListElement>('event-log')
const fidelityOutput = byId<HTMLDivElement>('fidelity-output')

let createdCount = 0
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

operatorEmailInput.addEventListener('click', () => {
  operatorEmailInput.focus()
})

resetStageButton.addEventListener('click', () => {
  resetStage()
  setStatus(runStatus, 'Ready')
})

for (const input of visualModeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return
    }

    visualMode = input.value as VisualMode
    actorble.destroy()
    actorble = createDemoActorble()
    renderFidelity()
    setStatus(runStatus, visualModeStatus(visualMode))
  })
}

runFlowButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Flow complete',
    runFlowButton,
    async () => {
      actionUtilityPanel.collapse()
      resetStage()
      await createProjectFlow(`Atlas ${createdCount + 1}`)
    },
    afterActionRun,
  )
})

runCompleteChecklistButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Checklist complete',
    runCompleteChecklistButton,
    async () => {
      actionUtilityPanel.collapse()
      resetStage()
      await createProjectFlow(`Checklist ${createdCount + 1}`)
      await completeChecklistFlow()
    },
    afterActionRun,
  )
})

runInviteOperatorButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Operator invited',
    runInviteOperatorButton,
    async () => {
      actionUtilityPanel.collapse()
      resetStage()
      await createProjectFlow(`Invite ${createdCount + 1}`)
      await inviteOperatorFlow('operator@example.com')
    },
    afterActionRun,
  )
})

runReadyReviewButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Ready for review',
    runReadyReviewButton,
    async () => {
      actionUtilityPanel.collapse()
      resetStage()
      await createProjectFlow(`Review ${createdCount + 1}`)
      await completeChecklistFlow()
      await inviteOperatorFlow('reviewer@example.com')
      await actorble.click(testId('mark-review-ready'), { pressDwell: 100, timeout: 1500 })
      await actorble.waitFor({
        kind: 'custom',
        predicate: () => reviewState.dataset.state === 'ready',
      })
    },
    afterActionRun,
  )
})

runTypeButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Typed name',
    runTypeButton,
    async () => {
      actionUtilityPanel.collapse()
      prepareInput('')
      await actorble.typeInto(label('Project name', { exact: true }), 'Atlas', {
        delay: 80,
        timeout: 3000,
      })
    },
    afterActionRun,
  )
})

runClickButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Clicked create',
    runClickButton,
    async () => {
      actionUtilityPanel.collapse()
      if (projectNameInput.value.trim().length === 0) {
        prepareInput('Manual launch')
      }

      await actorble.click(testId('create-project'), { timeout: 1500 })
    },
    afterActionRun,
  )
})

renderEvents()
renderFidelity()

function createDemoActorble(): DemoActorble {
  return createActorble({
    mode: 'interactive',
    debug: true,
    visual: visualOptionsForMode(visualMode),
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

function afterActionRun(): void {
  renderFidelity()
  actionUtilityPanel.expand()
}

async function createProjectFlow(projectName: string): Promise<void> {
  await actorble.moveTo(label('Project name', { exact: true }), {
    motion: { kind: 'ease', easing: 'ease-in-out', duration: 180 },
    timeout: 1500,
  })
  await actorble.typeInto(label('Project name', { exact: true }), projectName, {
    delay: 80,
    timeout: 5000,
  })
  await actorble.moveTo(testId('create-project'), { timeout: 1500 })
  await actorble.click(testId('create-project'), { pressDwell: 120, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => projectStatus.dataset.state === 'created',
  })
}

async function completeChecklistFlow(): Promise<void> {
  await actorble.click(testId('complete-checklist'), { pressDwell: 100, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => taskState.dataset.state === 'complete',
  })
}

async function inviteOperatorFlow(email: string): Promise<void> {
  await actorble.typeInto(label('Operator email', { exact: true }), email, {
    delay: 35,
    timeout: 5000,
    focusStrategy: 'click',
  })
  await actorble.click(testId('invite-operator'), { pressDwell: 100, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => operatorState.dataset.state === 'invited',
  })
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
  prepareInput('')
  operatorEmailInput.value = ''
  operatorEmailInput.setSelectionRange(0, 0)
  projectStatus.dataset.state = 'idle'
  projectStatus.textContent = 'No project created'
  taskState.dataset.state = 'waiting'
  taskState.textContent = 'waiting'
  operatorState.dataset.state = 'queued'
  operatorState.textContent = 'queued'
  reviewState.dataset.state = 'blocked'
  reviewState.textContent = 'blocked'
  reviewStateDetail.textContent = 'Blocked'
  domEvents.splice(0)
  renderEvents()
}

function prepareInput(value: string): void {
  projectNameInput.value = value
  projectNameInput.focus()
  projectNameInput.setSelectionRange(value.length, value.length)
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

  domEvents.unshift(`${labelText}.${event.type}${inputData}`)
  domEvents.splice(12)
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
