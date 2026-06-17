import '../../shared/styles.css'
import { testId } from '../../../src/index.js'
import { byId, escapeHtml } from '../../shared/example-utils.js'
import {
  clickFocusTyping,
  mountTaskExample,
  type TaskExampleContext,
} from '../../shared/task-example.js'

const stageHtml = `
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

mountTaskExample({
  title: 'Form filling',
  eyebrow: 'Data entry',
  summary: 'Fill a realistic request form, toggle a confirmation checkbox, and submit it.',
  stageLabel: 'Form filling example',
  stageHtml,
  successMessage: 'Form scenario complete',
  bindStage,
  run: runFormScenario,
  typeFirstField: typeFormFirstField,
  clickPrimary: clickFormPrimary,
})

function bindStage(context: TaskExampleContext): void {
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

  context.bindDomEvents('nameInput', nameInput)
  context.bindDomEvents('emailInput', emailInput)
  context.bindDomEvents('companyInput', companyInput)
  context.bindDomEvents('detailsInput', detailsInput)
  context.bindDomEvents('copyCheckbox', copyCheckbox)
  context.bindDomEvents('submitRequest', submitButton)
}

async function runFormScenario(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  await typeFormFirstField(context)
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

async function typeFormFirstField(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  await actorble.moveTo(testId('request-name'), {
    motion: { kind: 'ease', timing: 'ease-in-out', duration: 160 },
    timeout: 1500,
  })
  await actorble.typeInto(testId('request-name'), 'Mina Park', {
    ...clickFocusTyping(35, 5000),
  })
}

async function clickFormPrimary(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  context.ensureInputValue('request-name', 'Mina Park')
  context.ensureInputValue('request-email', 'mina@example.com')
  context.ensureInputValue('request-company', 'Northstar Labs')
  context.ensureInputValue('request-details', 'Please review this automated request.')
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
