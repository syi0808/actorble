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

const actorble = createActorble({ mode: 'interactive', debug: true })
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
            <p class="eyebrow">Scenario</p>
            <h2>Ordered steps</h2>
          </div>
          <a class="secondary-action" href="/">Examples</a>
        </div>
        <div class="action-grid">
          <button id="run-scenario" type="button">Run scenario</button>
          <button id="reset-stage" type="button">Reset</button>
        </div>
        <div class="result-block">
          <h3>Scenario steps</h3>
          <ol class="event-log">
            <li>typeInto label("Project name")</li>
            <li>click role("button", "Create project")</li>
            <li>waitFor custom predicate</li>
          </ol>
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
const projectStatus = byId<HTMLElement>('project-status')
const taskState = document.querySelector<HTMLElement>('[data-testid="task-state"]')
const runScenarioButton = byId<HTMLButtonElement>('run-scenario')
const resetStageButton = byId<HTMLButtonElement>('reset-stage')
const refreshTraceButton = byId<HTMLButtonElement>('refresh-trace')
const traceOutput = byId<HTMLDivElement>('trace-output')
const capabilityOutput = byId<HTMLDivElement>('capability-output')

let createdCount = 0
let scenarioCount = 0

projectForm.addEventListener('submit', (event) => {
  event.preventDefault()
  createProject()
})

runScenarioButton.addEventListener('click', () => {
  void runWithStatus(runStatus, 'Scenario complete', runScenarioButton, runScenario, drawTrace)
})

resetStageButton.addEventListener('click', () => {
  resetStage()
  setStatus(runStatus, 'Ready')
})

refreshTraceButton.addEventListener('click', drawTrace)

renderCapabilities()
drawTrace()

async function runScenario(): Promise<void> {
  scenarioCount += 1
  resetStage()

  const projectName = `Scenario ${scenarioCount}`
  const scenario: Scenario = {
    id: 'create-project-demo',
    name: 'Create project demo',
    steps: [
      {
        action: 'typeInto',
        target: label('Project name', { exact: true }),
        input: projectName,
      },
      {
        action: 'click',
        target: role('button', { name: 'Create project', exact: true }),
        options: { timeout: 1500 },
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

  await actorble.run(scenario, { timeout: 4000 })
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
  projectNameInput.value = ''
  projectNameInput.focus()
  projectNameInput.setSelectionRange(0, 0)
  projectStatus.dataset.state = 'idle'
  projectStatus.textContent = 'No project created'

  if (taskState) {
    taskState.textContent = 'waiting'
  }
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
        visualOverlay: fidelity.visualOverlay,
        trustedEvents: fidelity.trustedEvents,
      })}
      <ul class="limit-list">
        ${fidelity.limits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}
      </ul>
    </section>
  `
}
