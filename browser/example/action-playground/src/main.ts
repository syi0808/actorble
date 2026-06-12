import '../../shared/styles.css'
import { createActorble, label, testId } from '../../../src/index.js'
import {
  byId,
  escapeHtml,
  renderRows,
  runWithStatus,
  setStatus,
} from '../../shared/example-utils.js'

type DemoActorble = ReturnType<typeof createActorble>

let visualEnabled = true
let actorble: DemoActorble = createDemoActorble()
const app = byId<HTMLDivElement>('app')

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Example 02</p>
        <h1>Action playground</h1>
      </div>
      <div class="status-pill" id="run-status">Ready</div>
    </header>

    <section class="workspace" aria-label="Action playground">
      <div class="stage-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Target surface</p>
            <h2>Project console</h2>
          </div>
          <a class="secondary-action" href="/">Examples</a>
        </div>

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
      </div>

      <div class="control-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Actions</p>
            <h2>Human-like flow</h2>
          </div>
          <label class="toggle-row" for="visual-toggle">
            <input id="visual-toggle" type="checkbox" checked />
            <span>Visual feedback</span>
          </label>
          <button class="secondary-action" id="reset-stage" type="button">Reset</button>
        </div>
        <div class="action-grid">
          <button id="run-flow" type="button">Run visual flow</button>
          <button id="run-type" type="button">Type project name</button>
          <button id="run-click" type="button">Click create</button>
        </div>
        <div class="result-block">
          <h3>DOM events</h3>
          <ol id="event-log" class="event-log" aria-live="polite"></ol>
        </div>
        <div class="result-block">
          <h3>Runtime fidelity</h3>
          <div id="fidelity-output" class="capability-list"></div>
        </div>
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
const resetStageButton = byId<HTMLButtonElement>('reset-stage')
const visualToggle = byId<HTMLInputElement>('visual-toggle')
const runFlowButton = byId<HTMLButtonElement>('run-flow')
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

resetStageButton.addEventListener('click', () => {
  resetStage()
  setStatus(runStatus, 'Ready')
})

visualToggle.addEventListener('change', () => {
  visualEnabled = visualToggle.checked
  actorble.destroy()
  actorble = createDemoActorble()
  renderFidelity()
  setStatus(runStatus, visualEnabled ? 'Visual on' : 'Visual off')
})

runFlowButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Flow complete',
    runFlowButton,
    async () => {
      resetStage()

      const projectName = `Atlas ${createdCount + 1}`
      await actorble.moveTo(label('Project name', { exact: true }), {
        motion: { kind: 'ease', easing: 'ease-in-out', duration: 180 },
        timeout: 1500,
      })
      await actorble.typeInto(label('Project name', { exact: true }), projectName, {
        delay: 80,
        timeout: 5000,
      })
      await actorble.moveTo(testId('create-project'), { timeout: 1500 })
      await actorble.click(testId('create-project'), { timeout: 1500 })
    },
    renderFidelity,
  )
})

runTypeButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Typed name',
    runTypeButton,
    async () => {
      prepareInput('')
      await actorble.typeInto(label('Project name', { exact: true }), 'Atlas', {
        delay: 80,
        timeout: 3000,
      })
    },
    renderFidelity,
  )
})

runClickButton.addEventListener('click', () => {
  void runWithStatus(
    runStatus,
    'Clicked create',
    runClickButton,
    async () => {
      if (projectNameInput.value.trim().length === 0) {
        prepareInput('Manual launch')
      }

      await actorble.click(testId('create-project'), { timeout: 1500 })
    },
    renderFidelity,
  )
})

renderEvents()
renderFidelity()

function createDemoActorble(): DemoActorble {
  return createActorble({
    mode: 'interactive',
    debug: true,
    visual: visualEnabled ? { enabled: true, textVisibility: 'masked' } : { enabled: false },
  })
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
  prepareInput('')
  projectStatus.dataset.state = 'idle'
  projectStatus.textContent = 'No project created'

  if (taskState) {
    taskState.textContent = 'waiting'
  }

  domEvents.splice(0)
  renderEvents()
}

function prepareInput(value: string): void {
  projectNameInput.value = value
  projectNameInput.focus()
  projectNameInput.setSelectionRange(value.length, value.length)
}

function recordDomEvent(labelText: string, event: Event): void {
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
    visualImplementation: fidelity.visualOverlay.implementation,
    visualRuntime: fidelity.visualOverlay.runtime,
    visualInteractivity: fidelity.visualOverlay.interactivity,
    visualHitTesting: fidelity.visualOverlay.hitTesting,
    pointerInput: fidelity.pointerInput,
    textInput: fidelity.textInput,
    trustedEvents: fidelity.trustedEvents,
  })
}
