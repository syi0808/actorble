import '../../shared/styles.css'
import { testId } from '../../../src/index.js'
import { byId, escapeHtml } from '../../shared/example-utils.js'
import {
  clickFocusTyping,
  mountTaskExample,
  type TaskExampleContext,
} from '../../shared/task-example.js'

const articleCopy =
  'Research note: visible verification before a captured quote is trusted before it enters a selection-driven automation brief.'
const selectedQuote = 'visible verification before a captured quote is trusted'
const noteText = 'Use in weekly automation brief.'
const selectedQuoteOffset = articleCopy.indexOf(selectedQuote)

if (selectedQuoteOffset < 0) {
  throw new Error('Research quote is not present in the source copy.')
}

const stageHtml = `
  <div class="browser-frame research-surface" data-testid="research-surface">
    <div class="browser-chrome" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <div class="address-bar">https://research.example/clippings/new</div>
    </div>

    <div class="research-workspace">
      <section class="surface-panel research-source-panel">
        <div>
          <p class="eyebrow">Research source</p>
          <h3>Automation reliability note</h3>
        </div>
        <p
          class="research-source-copy"
          id="research-source-copy"
          data-testid="research-source-copy"
        >${escapeHtml(articleCopy)}</p>
        <dl class="source-metadata">
          <div>
            <dt>Source</dt>
            <dd>Internal browser automation brief</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>QA research desk</dd>
          </div>
        </dl>
      </section>

      <aside class="surface-panel clipping-panel">
        <div>
          <p class="eyebrow">Clipping desk</p>
          <h3>Quote capture</h3>
        </div>
        <div class="outcome-strip" id="clipping-status" data-state="idle">Waiting for quote</div>
        <dl class="clipping-summary">
          <div>
            <dt>Preview</dt>
            <dd id="quote-preview-output">Waiting</dd>
          </div>
          <div>
            <dt>Saved</dt>
            <dd id="saved-quote-output">Waiting</dd>
          </div>
          <div>
            <dt>Note</dt>
            <dd id="published-note-output">Waiting</dd>
          </div>
        </dl>
        <button id="save-quote" data-testid="save-quote" type="button">Save quote</button>
        <label for="quote-note">Brief note</label>
        <textarea
          id="quote-note"
          data-testid="quote-note"
          rows="4"
          placeholder="Add editorial context"
        ></textarea>
        <button id="publish-clipping" data-testid="publish-clipping" type="button">
          Publish clipping
        </button>
      </aside>
    </div>
  </div>
`

mountTaskExample({
  title: 'Research clipping',
  eyebrow: 'Text selection workflow',
  summary: 'Select a source quote, save it as a clipping, add a note, and publish the result.',
  stageLabel: 'Research clipping example',
  stageHtml,
  successMessage: 'Research clipping complete',
  actionLabels: {
    typeFirst: 'Select quote',
    clickPrimary: 'Save quote',
  },
  actionSuccessMessages: {
    typeFirst: 'Quote selected',
    clickPrimary: 'Quote saved',
  },
  bindStage,
  run: runResearchClippingScenario,
  typeFirstField: selectResearchQuote,
  clickPrimary: saveResearchQuote,
})

function bindStage(context: TaskExampleContext): void {
  const sourceCopy = byId<HTMLElement>('research-source-copy')
  const saveButton = byId<HTMLButtonElement>('save-quote')
  const noteInput = byId<HTMLTextAreaElement>('quote-note')
  const publishButton = byId<HTMLButtonElement>('publish-clipping')

  saveButton.addEventListener('click', saveSelectedQuote)
  publishButton.addEventListener('click', publishClipping)

  context.bindDomEvents('researchSource', sourceCopy)
  context.bindDomEvents('saveQuote', saveButton)
  context.bindDomEvents('quoteNote', noteInput)
  context.bindDomEvents('publishClipping', publishButton)
}

async function runResearchClippingScenario(context: TaskExampleContext): Promise<void> {
  await selectResearchQuote(context)
  await saveResearchQuote(context)
  await typeResearchNote(context)
  await publishResearchClipping(context)
  await context.actorble().waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('clipping-status')?.dataset.state === 'published',
  })
}

async function selectResearchQuote(context: TaskExampleContext): Promise<void> {
  const target = testId('research-source-copy')

  await context.actorble().selectText({
    anchor: { target, offset: selectedQuoteOffset },
    focus: { target, offset: selectedQuoteOffset + selectedQuote.length },
  }, {
    duration: 720,
    motion: { kind: 'ease', timing: 'ease-in-out', duration: 720 },
  })
  updateQuotePreview()
}

async function saveResearchQuote(context: TaskExampleContext): Promise<void> {
  if (!currentQuotePreview()) {
    await selectResearchQuote(context)
  }

  await context.actorble().click(testId('save-quote'), { pressDwell: 90, timeout: 1500 })
  await context.actorble().waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('clipping-status')?.dataset.state === 'saved',
  })
}

async function typeResearchNote(context: TaskExampleContext): Promise<void> {
  await context.actorble().typeInto(testId('quote-note'), noteText, {
    ...clickFocusTyping(20, 5000),
  })
}

async function publishResearchClipping(context: TaskExampleContext): Promise<void> {
  await context.actorble().click(testId('publish-clipping'), {
    pressDwell: 90,
    timeout: 1500,
  })
}

function updateQuotePreview(): void {
  const quote = selectedDocumentText()
  const status = byId<HTMLElement>('clipping-status')

  byId<HTMLElement>('quote-preview-output').textContent = quote || 'Waiting'
  status.dataset.state = quote ? 'selected' : 'idle'
  status.textContent = quote ? 'Quote selected' : 'Waiting for quote'
}

function saveSelectedQuote(): void {
  const quote = currentQuotePreview()
  const status = byId<HTMLElement>('clipping-status')

  if (!quote) {
    status.dataset.state = 'error'
    status.textContent = 'Quote missing'
    return
  }

  byId<HTMLElement>('saved-quote-output').textContent = quote
  status.dataset.state = 'saved'
  status.textContent = 'Quote saved'
}

function publishClipping(): void {
  const quote = currentSavedQuote()
  const status = byId<HTMLElement>('clipping-status')

  if (!quote) {
    status.dataset.state = 'error'
    status.textContent = 'Saved quote missing'
    return
  }

  const note = byId<HTMLTextAreaElement>('quote-note').value.trim()

  byId<HTMLElement>('published-note-output').textContent = note || 'No note'
  status.dataset.state = 'published'
  status.textContent = 'Clipping published'
}

function currentQuotePreview(): string {
  return readOutputText('quote-preview-output')
}

function currentSavedQuote(): string {
  return readOutputText('saved-quote-output')
}

function readOutputText(id: string): string {
  const text = byId<HTMLElement>(id).textContent?.trim() ?? ''

  return text === 'Waiting' ? '' : text
}

function selectedDocumentText(): string {
  return document.getSelection()?.toString() ?? ''
}
