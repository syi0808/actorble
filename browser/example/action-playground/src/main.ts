import '../../shared/styles.css'
import { createActorble, testId, type TypeOptions } from '../../../src/index.js'
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
type ScenarioId = 'github' | 'form' | 'search'

type ScenarioDefinition = Readonly<{
  id: ScenarioId
  navLabel: string
  eyebrow: string
  title: string
  summary: string
  successMessage: string
  render(): string
  bind(): void
  run(): Promise<void>
  typeFirstField(): Promise<void>
  clickPrimary(): Promise<void>
}>

const scenarios: readonly ScenarioDefinition[] = [
  {
    id: 'github',
    navLabel: 'GitHub',
    eyebrow: 'Repository work',
    title: 'GitHub issue triage',
    summary: 'Search a repository, open the issues tab, and inspect a specific issue.',
    successMessage: 'GitHub scenario complete',
    render: renderGitHubScenario,
    bind: bindGitHubScenario,
    run: runGitHubScenario,
    typeFirstField: typeGitHubQuery,
    clickPrimary: clickGitHubPrimary,
  },
  {
    id: 'form',
    navLabel: 'Form',
    eyebrow: 'Data entry',
    title: 'Request form fill',
    summary: 'Fill a realistic request form, toggle a confirmation checkbox, and submit it.',
    successMessage: 'Form scenario complete',
    render: renderFormScenario,
    bind: bindFormScenario,
    run: runFormScenario,
    typeFirstField: typeFormFirstField,
    clickPrimary: clickFormPrimary,
  },
  {
    id: 'search',
    navLabel: 'Search',
    eyebrow: 'Web search',
    title: 'Search result exploration',
    summary: 'Run a search query and open a result from a browser-like result page.',
    successMessage: 'Search scenario complete',
    render: renderSearchScenario,
    bind: bindSearchScenario,
    run: runSearchScenario,
    typeFirstField: typeSearchQuery,
    clickPrimary: clickSearchPrimary,
  },
]

let currentScenarioId: ScenarioId = 'github'
let visualMode: VisualMode = 'quiet'
let actorble: DemoActorble = createDemoActorble()
const domEvents: string[] = []
const app = byId<HTMLDivElement>('app')
const humanFocusClick = {
  motion: { kind: 'ease', easing: 'ease-in-out', duration: 180 },
  pressDwell: 80,
} as const

app.innerHTML = `
  <main class="app-shell task-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Actorble browser</p>
        <h1>Browser task scenarios</h1>
      </div>
      <a class="secondary-action" href="/">Examples</a>
    </header>

    <section class="task-workspace" aria-label="Browser task scenarios">
      <aside class="scenario-rail" aria-label="Scenario list">
        ${scenarios
          .map(
            (scenario) => `
              <button
                class="scenario-tab"
                id="scenario-${scenario.id}"
                data-testid="scenario-${scenario.id}"
                data-scenario-id="${scenario.id}"
                type="button"
              >
                <span>${escapeHtml(scenario.navLabel)}</span>
                <strong>${escapeHtml(scenario.title)}</strong>
              </button>
            `,
          )
          .join('')}
      </aside>

      <section class="stage-panel task-stage-panel" id="stage-panel" aria-live="polite">
        <div class="panel-heading">
          <div>
            <p class="eyebrow" id="scenario-eyebrow"></p>
            <h2 id="scenario-title"></h2>
          </div>
          <small class="scenario-summary" id="scenario-summary"></small>
        </div>
        <div class="scenario-stage" id="scenario-stage"></div>
      </section>
    </section>

    ${renderUtilityPanel({
      id: 'action-utility-panel',
      label: 'Task scenario controls',
      title: 'Task scenarios',
      sections: [
        {
          id: 'action-actions',
          eyebrow: 'Actions',
          title: 'Run browser tasks',
          body: `
            <div class="status-pill" id="run-status">Ready</div>
            <div class="scenario-readout result-block">
              <strong id="selected-scenario-title"></strong>
              <small id="selected-scenario-summary"></small>
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
const stagePanel = byId<HTMLElement>('stage-panel')
const scenarioEyebrow = byId<HTMLElement>('scenario-eyebrow')
const scenarioTitle = byId<HTMLElement>('scenario-title')
const scenarioSummary = byId<HTMLElement>('scenario-summary')
const scenarioStage = byId<HTMLDivElement>('scenario-stage')
const selectedScenarioTitle = byId<HTMLElement>('selected-scenario-title')
const selectedScenarioSummary = byId<HTMLElement>('selected-scenario-summary')
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
const scenarioButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-scenario-id]'),
)

for (const button of scenarioButtons) {
  button.addEventListener('click', () => {
    currentScenarioId = button.dataset.scenarioId as ScenarioId
    renderCurrentScenario()
    setStatus(runStatus, 'Ready')
  })
}

resetStageButton.addEventListener('click', () => {
  renderCurrentScenario()
  setStatus(runStatus, 'Ready')
})

runCurrentButton.addEventListener('click', () => {
  const scenario = getCurrentScenario()

  void runWithStatus(
    runStatus,
    scenario.successMessage,
    runCurrentButton,
    async () => {
      actionUtilityPanel.collapse()
      renderCurrentScenario()
      await scenario.run()
    },
    afterActionRun,
  )
})

runTypeFirstButton.addEventListener('click', () => {
  const scenario = getCurrentScenario()

  void runWithStatus(
    runStatus,
    'First field typed',
    runTypeFirstButton,
    async () => {
      actionUtilityPanel.collapse()
      renderCurrentScenario()
      await scenario.typeFirstField()
    },
    afterActionRun,
  )
})

runClickPrimaryButton.addEventListener('click', () => {
  const scenario = getCurrentScenario()

  void runWithStatus(
    runStatus,
    'Primary click complete',
    runClickPrimaryButton,
    async () => {
      actionUtilityPanel.collapse()
      renderCurrentScenario()
      await scenario.clickPrimary()
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
    actorble = createDemoActorble()
    renderFidelity()
    setStatus(runStatus, visualModeStatus(visualMode))
  })
}

renderCurrentScenario()
renderFidelity()

function renderCurrentScenario(): void {
  const scenario = getCurrentScenario()

  stagePanel.dataset.scenario = scenario.id
  scenarioEyebrow.textContent = scenario.eyebrow
  scenarioTitle.textContent = scenario.title
  scenarioSummary.textContent = scenario.summary
  selectedScenarioTitle.textContent = scenario.title
  selectedScenarioSummary.textContent = scenario.summary
  scenarioStage.innerHTML = scenario.render()

  for (const button of scenarioButtons) {
    const isCurrent = button.dataset.scenarioId === scenario.id

    button.dataset.state = isCurrent ? 'active' : 'idle'
    button.setAttribute('aria-pressed', String(isCurrent))
  }

  domEvents.splice(0)
  renderEvents()
  scenario.bind()
}

function getCurrentScenario(): ScenarioDefinition {
  const scenario = scenarios.find((candidate) => candidate.id === currentScenarioId)

  if (!scenario) {
    throw new Error(`Unknown scenario: ${currentScenarioId}`)
  }

  return scenario
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

function renderGitHubScenario(): string {
  return `
    <div class="browser-frame github-surface" data-testid="github-surface">
      <div class="browser-chrome" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <div class="address-bar">https://github.com/actorble/browser</div>
      </div>

      <div class="github-workspace">
        <aside class="surface-panel repo-jump">
          <div>
            <p class="eyebrow">GitHub</p>
            <h3>Repository jump</h3>
          </div>
          <label for="github-query">Repository or issue</label>
          <div class="inline-form">
            <input
              id="github-query"
              data-testid="github-query"
              autocomplete="off"
              placeholder="actorble browser"
            />
            <button id="github-search" data-testid="github-search" type="button">Open</button>
          </div>
          <button
            class="repo-result"
            id="github-repo-result"
            data-testid="github-repo-result"
            data-state="empty"
            type="button"
            disabled
          >
            No repository selected
          </button>
        </aside>

        <section class="surface-panel repo-main">
          <div class="repo-header">
            <div>
              <strong>actorble/browser</strong>
              <small id="github-repo-status" data-state="idle">Ready for repository search</small>
            </div>
            <span class="repo-chip">TypeScript</span>
          </div>

          <nav class="repo-tabs" aria-label="Repository sections">
            <button id="github-code-tab" type="button" disabled>Code</button>
            <button
              id="github-issues-tab"
              data-testid="github-issues-tab"
              data-state="idle"
              type="button"
              disabled
            >
              Issues <span>3</span>
            </button>
          </nav>

          <div class="issue-list" id="github-issues" data-state="idle">
            <div class="issue-placeholder">Open the repository, then choose Issues.</div>
            <button
              class="issue-row"
              id="github-issue-example"
              data-testid="github-issue-example"
              type="button"
              hidden
            >
              <span class="issue-state"></span>
              <span>
                <strong>Improve browser examples</strong>
                <small>#42 opened by yein-agent</small>
              </span>
              <small>needs-design</small>
            </button>
            <button class="issue-row secondary-issue" type="button" hidden>
              <span class="issue-state"></span>
              <span>
                <strong>Document visual fidelity limits</strong>
                <small>#41 opened by docs-bot</small>
              </span>
              <small>docs</small>
            </button>
          </div>

          <div class="outcome-strip" id="github-outcome" data-state="idle">
            Waiting for an issue selection
          </div>
        </section>
      </div>
    </div>
  `
}

function bindGitHubScenario(): void {
  const queryInput = byId<HTMLInputElement>('github-query')
  const searchButton = byId<HTMLButtonElement>('github-search')
  const repoResult = byId<HTMLButtonElement>('github-repo-result')
  const issuesTab = byId<HTMLButtonElement>('github-issues-tab')
  const issueButton = byId<HTMLButtonElement>('github-issue-example')

  searchButton.addEventListener('click', openGitHubSearch)
  repoResult.addEventListener('click', openGitHubRepository)
  issuesTab.addEventListener('click', openGitHubIssues)
  issueButton.addEventListener('click', openGitHubIssue)

  bindDomEvents('repoInput', queryInput)
  bindDomEvents('openRepo', searchButton)
  bindDomEvents('repoResult', repoResult)
  bindDomEvents('issuesTab', issuesTab)
  bindDomEvents('issueRow', issueButton)
}

async function runGitHubScenario(): Promise<void> {
  await typeGitHubQuery()
  await actorble.click(testId('github-search'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('github-repo-result')?.dataset.state === 'ready',
  })
  await actorble.click(testId('github-repo-result'), { pressDwell: 90, timeout: 1500 })
  await actorble.click(testId('github-issues-tab'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('github-issues')?.dataset.state === 'open',
  })
  await actorble.click(testId('github-issue-example'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('github-outcome')?.dataset.state === 'issue-open',
  })
}

async function typeGitHubQuery(): Promise<void> {
  await actorble.moveTo(testId('github-query'), {
    motion: { kind: 'ease', easing: 'ease-in-out', duration: 160 },
    timeout: 1500,
  })
  await actorble.typeInto(testId('github-query'), 'actorble browser', {
    ...clickFocusTyping(45, 5000),
  })
}

async function clickGitHubPrimary(): Promise<void> {
  ensureInputValue('github-query', 'actorble browser')
  await actorble.click(testId('github-search'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('github-repo-result')?.dataset.state === 'ready',
  })
}

function openGitHubSearch(): void {
  const query = byId<HTMLInputElement>('github-query').value.trim() || 'actorble browser'
  const repoResult = byId<HTMLButtonElement>('github-repo-result')
  const repoStatus = byId<HTMLElement>('github-repo-status')
  const outcome = byId<HTMLElement>('github-outcome')

  repoResult.disabled = false
  repoResult.dataset.state = 'ready'
  repoResult.textContent = `actorble/browser matches "${query}"`
  repoStatus.dataset.state = 'searched'
  repoStatus.textContent = 'Repository result ready'
  outcome.dataset.state = 'searched'
  outcome.textContent = 'Repository result is ready to open'
}

function openGitHubRepository(): void {
  const repoStatus = byId<HTMLElement>('github-repo-status')
  const issuesTab = byId<HTMLButtonElement>('github-issues-tab')
  const outcome = byId<HTMLElement>('github-outcome')

  repoStatus.dataset.state = 'repo-open'
  repoStatus.textContent = 'Repository opened'
  issuesTab.disabled = false
  outcome.dataset.state = 'repo-open'
  outcome.textContent = 'Repository open; Issues tab is available'
}

function openGitHubIssues(): void {
  const issues = byId<HTMLElement>('github-issues')
  const issuesTab = byId<HTMLButtonElement>('github-issues-tab')
  const issueButton = byId<HTMLButtonElement>('github-issue-example')
  const secondaryIssue = document.querySelector<HTMLButtonElement>('.secondary-issue')
  const placeholder = document.querySelector<HTMLElement>('.issue-placeholder')
  const outcome = byId<HTMLElement>('github-outcome')

  issues.dataset.state = 'open'
  issuesTab.dataset.state = 'active'
  issueButton.hidden = false

  if (secondaryIssue) {
    secondaryIssue.hidden = false
  }

  if (placeholder) {
    placeholder.hidden = true
  }

  outcome.dataset.state = 'issues-open'
  outcome.textContent = 'Issues loaded; choose an issue to inspect'
}

function openGitHubIssue(): void {
  const outcome = byId<HTMLElement>('github-outcome')

  outcome.dataset.state = 'issue-open'
  outcome.textContent = 'Opened issue #42: Improve browser examples'
}

function renderFormScenario(): string {
  return `
    <div class="browser-frame form-surface" data-testid="form-surface">
      <div class="browser-chrome" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <div class="address-bar">https://ops.example/request/new</div>
      </div>

      <div class="form-workspace">
        <section class="surface-panel form-card">
          <div>
            <p class="eyebrow">Ops form</p>
            <h3>Automation support request</h3>
          </div>
          <form class="scenario-form" id="request-form">
            <label for="request-name">Full name</label>
            <input
              id="request-name"
              data-testid="request-name"
              autocomplete="off"
              placeholder="Mina Park"
            />

            <label for="request-email">Email</label>
            <input
              id="request-email"
              data-testid="request-email"
              autocomplete="off"
              placeholder="mina@example.com"
            />

            <label for="request-company">Company</label>
            <input
              id="request-company"
              data-testid="request-company"
              autocomplete="off"
              placeholder="Northstar Labs"
            />

            <label for="request-details">Request details</label>
            <textarea
              id="request-details"
              data-testid="request-details"
              rows="4"
              placeholder="Describe the workflow to automate"
            ></textarea>

            <label class="check-row" for="request-copy">
              <input id="request-copy" data-testid="request-copy" type="checkbox" />
              <span>Send me a copy of this request</span>
            </label>

            <button id="request-submit" data-testid="request-submit" type="submit">
              Submit request
            </button>
          </form>
        </section>

        <aside class="surface-panel submission-panel">
          <p class="eyebrow">Submission</p>
          <h3>Request state</h3>
          <div class="outcome-strip" id="form-status" data-state="idle">Draft not submitted</div>
          <dl class="submission-summary" id="form-summary">
            <div>
              <dt>Name</dt>
              <dd>Waiting</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>Waiting</dd>
            </div>
            <div>
              <dt>Copy</dt>
              <dd>No</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  `
}

function bindFormScenario(): void {
  const requestForm = byId<HTMLFormElement>('request-form')
  const nameInput = byId<HTMLInputElement>('request-name')
  const emailInput = byId<HTMLInputElement>('request-email')
  const companyInput = byId<HTMLInputElement>('request-company')
  const detailsInput = byId<HTMLTextAreaElement>('request-details')
  const copyCheckbox = byId<HTMLInputElement>('request-copy')
  const submitButton = byId<HTMLButtonElement>('request-submit')

  requestForm.addEventListener('submit', (event) => {
    event.preventDefault()
    submitRequestForm()
  })

  bindDomEvents('requestForm', requestForm)
  bindDomEvents('nameInput', nameInput)
  bindDomEvents('emailInput', emailInput)
  bindDomEvents('companyInput', companyInput)
  bindDomEvents('detailsInput', detailsInput)
  bindDomEvents('copyCheckbox', copyCheckbox)
  bindDomEvents('submitRequest', submitButton)
}

async function runFormScenario(): Promise<void> {
  await typeFormFirstField()
  await actorble.typeInto(testId('request-email'), 'mina@example.com', {
    ...clickFocusTyping(25, 5000),
  })
  await actorble.typeInto(testId('request-company'), 'Northstar Labs', {
    ...clickFocusTyping(25, 5000),
  })
  await actorble.typeInto(
    testId('request-details'),
    'Please automate a browser QA pass for the new onboarding form.',
    {
      ...clickFocusTyping(15, 7000),
    },
  )
  await actorble.click(testId('request-copy'), { pressDwell: 80, timeout: 1500 })
  await actorble.click(testId('request-submit'), { pressDwell: 100, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('form-status')?.dataset.state === 'submitted',
  })
}

async function typeFormFirstField(): Promise<void> {
  await actorble.moveTo(testId('request-name'), {
    motion: { kind: 'ease', easing: 'ease-in-out', duration: 160 },
    timeout: 1500,
  })
  await actorble.typeInto(testId('request-name'), 'Mina Park', {
    ...clickFocusTyping(35, 5000),
  })
}

async function clickFormPrimary(): Promise<void> {
  ensureInputValue('request-name', 'Mina Park')
  ensureInputValue('request-email', 'mina@example.com')
  ensureInputValue('request-company', 'Northstar Labs')
  ensureInputValue('request-details', 'Please review this automated request.')
  await actorble.click(testId('request-submit'), { pressDwell: 100, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('form-status')?.dataset.state === 'submitted',
  })
}

function submitRequestForm(): void {
  const nameInput = byId<HTMLInputElement>('request-name')
  const emailInput = byId<HTMLInputElement>('request-email')
  const copyCheckbox = byId<HTMLInputElement>('request-copy')
  const status = byId<HTMLElement>('form-status')
  const summary = byId<HTMLElement>('form-summary')
  const name = nameInput.value.trim() || 'Unknown requester'
  const email = emailInput.value.trim() || 'unknown@example.com'

  status.dataset.state = 'submitted'
  status.textContent = `Submitted request for ${name}`
  summary.innerHTML = `
    <div>
      <dt>Name</dt>
      <dd>${escapeHtml(name)}</dd>
    </div>
    <div>
      <dt>Email</dt>
      <dd>${escapeHtml(email)}</dd>
    </div>
    <div>
      <dt>Copy</dt>
      <dd>${copyCheckbox.checked ? 'Yes' : 'No'}</dd>
    </div>
  `
}

function renderSearchScenario(): string {
  return `
    <div class="browser-frame search-surface" data-testid="search-surface">
      <div class="browser-chrome" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <div class="address-bar">https://google.com/search</div>
      </div>

      <div class="search-workspace">
        <section class="surface-panel search-main">
          <form class="search-form" id="search-form">
            <label for="search-query">Search query</label>
            <div class="search-box">
              <input
                id="search-query"
                data-testid="search-query"
                autocomplete="off"
                placeholder="browser automation event dispatch"
              />
              <button id="search-submit" data-testid="search-submit" type="submit">Search</button>
            </div>
          </form>

          <div class="search-results" id="search-results" data-state="empty">
            <p id="search-count">Results will appear here.</p>
            <button
              class="search-result"
              id="search-result-docs"
              data-testid="search-result-docs"
              type="button"
              hidden
            >
              <span>actorble.dev/docs</span>
              <strong>Actorble browser automation API</strong>
              <small>Target resolution, pointer actions, text input, and wait observation.</small>
            </button>
            <button class="search-result secondary-result" type="button" hidden>
              <span>developer.example/blog</span>
              <strong>Testing synthetic browser interactions</strong>
              <small>Patterns for deterministic DOM event dispatch in local demos.</small>
            </button>
          </div>
        </section>

        <aside class="surface-panel search-preview" id="search-preview" data-state="idle">
          <p class="eyebrow">Preview</p>
          <h3>Selected result</h3>
          <div class="outcome-strip">No result opened</div>
        </aside>
      </div>
    </div>
  `
}

function bindSearchScenario(): void {
  const searchForm = byId<HTMLFormElement>('search-form')
  const queryInput = byId<HTMLInputElement>('search-query')
  const submitButton = byId<HTMLButtonElement>('search-submit')
  const resultButton = byId<HTMLButtonElement>('search-result-docs')

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    runSearch()
  })
  resultButton.addEventListener('click', openSearchResult)

  bindDomEvents('searchForm', searchForm)
  bindDomEvents('searchInput', queryInput)
  bindDomEvents('searchButton', submitButton)
  bindDomEvents('searchResult', resultButton)
}

async function runSearchScenario(): Promise<void> {
  await typeSearchQuery()
  await actorble.click(testId('search-submit'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('search-results')?.dataset.state === 'ready',
  })
  await actorble.click(testId('search-result-docs'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('search-preview')?.dataset.state === 'open',
  })
}

async function typeSearchQuery(): Promise<void> {
  await actorble.moveTo(testId('search-query'), {
    motion: { kind: 'ease', easing: 'ease-in-out', duration: 160 },
    timeout: 1500,
  })
  await actorble.typeInto(
    testId('search-query'),
    'browser automation event dispatch',
    {
      ...clickFocusTyping(30, 5000),
    },
  )
}

async function clickSearchPrimary(): Promise<void> {
  ensureInputValue('search-query', 'browser automation event dispatch')
  await actorble.click(testId('search-submit'), { pressDwell: 90, timeout: 1500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('search-results')?.dataset.state === 'ready',
  })
}

function runSearch(): void {
  const query = byId<HTMLInputElement>('search-query').value.trim() || 'browser automation'
  const results = byId<HTMLElement>('search-results')
  const count = byId<HTMLElement>('search-count')
  const resultButton = byId<HTMLButtonElement>('search-result-docs')
  const secondaryResult = document.querySelector<HTMLButtonElement>('.secondary-result')

  results.dataset.state = 'ready'
  count.textContent = `Top results for "${query}"`
  resultButton.hidden = false

  if (secondaryResult) {
    secondaryResult.hidden = false
  }
}

function openSearchResult(): void {
  const preview = byId<HTMLElement>('search-preview')

  preview.dataset.state = 'open'
  preview.innerHTML = `
    <p class="eyebrow">Preview</p>
    <h3>Actorble browser automation API</h3>
    <div class="outcome-strip" data-state="open">
      Opened result about target resolution and DOM event dispatch
    </div>
  `
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

function clickFocusTyping(delay: number, timeout: number): TypeOptions {
  return {
    delay,
    timeout,
    focusStrategy: 'click',
    focusClick: humanFocusClick,
    afterFocusDelay: 40,
  }
}

function bindDomEvents(labelText: string, target: HTMLElement): void {
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
    target.addEventListener(eventName, (event) => recordDomEvent(labelText, event))
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

function recordDomEvent(labelText: string, event: Event): void {
  if (event.type === 'pointermove') {
    return
  }

  const inputData =
    'data' in event && typeof event.data === 'string' && event.data.length > 0
      ? `:${event.data}`
      : ''

  domEvents.unshift(`${labelText}.${event.type}${inputData}`)
  domEvents.splice(40)
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
