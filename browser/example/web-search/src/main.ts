import '../../shared/styles.css'
import { testId } from '../../../src/index.js'
import { byId } from '../../shared/example-utils.js'
import {
  clickFocusTyping,
  mountTaskExample,
  type TaskExampleContext,
} from '../../shared/task-example.js'

const stageHtml = `
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

mountTaskExample({
  title: 'Web search',
  eyebrow: 'Search task',
  summary: 'Run a search query and open a result from a browser-like result page.',
  stageLabel: 'Web search example',
  stageHtml,
  successMessage: 'Search scenario complete',
  bindStage,
  run: runSearchScenario,
  typeFirstField: typeSearchQuery,
  clickPrimary: clickSearchPrimary,
})

function bindStage(context: TaskExampleContext): void {
  const searchForm = byId<HTMLFormElement>('search-form')
  const queryInput = byId<HTMLInputElement>('search-query')
  const submitButton = byId<HTMLButtonElement>('search-submit')
  const resultButton = byId<HTMLButtonElement>('search-result-docs')

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    runSearch()
  })
  resultButton.addEventListener('click', openSearchResult)

  context.bindDomEvents('searchInput', queryInput)
  context.bindDomEvents('searchButton', submitButton)
  context.bindDomEvents('searchResult', resultButton)
}

async function runSearchScenario(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  await typeSearchQuery(context)
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

async function typeSearchQuery(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

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

async function clickSearchPrimary(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  context.ensureInputValue('search-query', 'browser automation event dispatch')
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
