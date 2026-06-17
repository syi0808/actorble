import '../../shared/styles.css'
import { testId } from '../../../src/index.js'
import { byId } from '../../shared/example-utils.js'
import {
  clickFocusTyping,
  mountTaskExample,
  type TaskExampleContext,
} from '../../shared/task-example.js'

const stageHtml = `
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

mountTaskExample({
  title: 'GitHub explorer',
  eyebrow: 'Repository work',
  summary: 'Search a repository, open the issues tab, and inspect a specific issue.',
  stageLabel: 'GitHub repository explorer',
  stageHtml,
  successMessage: 'GitHub scenario complete',
  bindStage,
  run: runGitHubScenario,
  typeFirstField: typeGitHubQuery,
  clickPrimary: clickGitHubPrimary,
})

function bindStage(context: TaskExampleContext): void {
  const queryInput = byId<HTMLInputElement>('github-query')
  const searchButton = byId<HTMLButtonElement>('github-search')
  const repoResult = byId<HTMLButtonElement>('github-repo-result')
  const issuesTab = byId<HTMLButtonElement>('github-issues-tab')
  const issueButton = byId<HTMLButtonElement>('github-issue-example')

  searchButton.addEventListener('click', openGitHubSearch)
  repoResult.addEventListener('click', openGitHubRepository)
  issuesTab.addEventListener('click', openGitHubIssues)
  issueButton.addEventListener('click', openGitHubIssue)

  context.bindDomEvents('repoInput', queryInput)
  context.bindDomEvents('openRepo', searchButton)
  context.bindDomEvents('repoResult', repoResult)
  context.bindDomEvents('issuesTab', issuesTab)
  context.bindDomEvents('issueRow', issueButton)
}

async function runGitHubScenario(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  await typeGitHubQuery(context)
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

async function typeGitHubQuery(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  await actorble.moveTo(testId('github-query'), {
    motion: { kind: 'ease', timing: 'ease-in-out', duration: 160 },
    timeout: 1500,
  })
  await actorble.typeInto(testId('github-query'), 'actorble browser', {
    ...clickFocusTyping(45, 5000),
  })
}

async function clickGitHubPrimary(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  context.ensureInputValue('github-query', 'actorble browser')
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
