import '../../shared/styles.css'
import { testId, type Scenario } from '../../../src/index.js'
import { byId, escapeHtml } from '../../shared/example-utils.js'
import {
  clickFocusTyping,
  mountTaskExample,
  type TaskExampleContext,
} from '../../shared/task-example.js'

const defaultPatient = 'Jisoo Han'
const defaultReason = 'Follow-up consultation'
const humanStepPacing = 520
const humanTypingDelay = 170
const humanPressDelay = 280
const humanPressDwell = 340
const humanMoveDuration = 840
const humanDragDuration = 1040
const humanMoveMotion = { kind: 'ease', timing: 'ease-in-out', duration: humanMoveDuration } as const
const humanDragMotion = { kind: 'ease', timing: 'ease-in-out', duration: humanDragDuration } as const
let bindDynamicAppointmentEvents: ((target: HTMLElement) => void) | undefined

const stageHtml = `
  <div class="browser-frame scheduler-surface" data-testid="scheduler-surface">
    <div class="browser-chrome" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <div class="address-bar">https://clinic.example/schedule</div>
    </div>

    <div class="scheduler-workspace">
      <aside class="surface-panel patient-panel">
        <div>
          <p class="eyebrow">Clinic desk</p>
          <h3>Find patient</h3>
        </div>
        <label for="patient-search">Patient name</label>
        <div class="inline-form patient-search-form">
          <input
            id="patient-search"
            data-testid="patient-search"
            autocomplete="off"
            placeholder="Jisoo Han"
          />
          <button id="patient-search-submit" data-testid="patient-search-submit" type="button">
            Search
          </button>
        </div>
        <button
          class="patient-result"
          id="patient-result"
          data-testid="patient-result"
          data-state="empty"
          type="button"
          disabled
        >
          No patient selected
        </button>
        <div
          class="scheduler-card-tray"
          id="appointment-tray"
          data-testid="appointment-tray"
          data-state="empty"
        >
          <p class="muted">Open a patient to create an appointment card.</p>
        </div>
      </aside>

      <section class="surface-panel schedule-panel">
        <div class="schedule-heading">
          <div>
            <p class="eyebrow">Today</p>
            <h3>Dr. Lee schedule</h3>
          </div>
          <span id="schedule-date">Jun 15</span>
        </div>
        <div class="schedule-grid" aria-label="Appointment slots">
          <section class="schedule-slot" aria-label="09:00 slot">
            <strong>09:00</strong>
            <div class="slot-dropzone" data-testid="slot-0900" data-state="occupied">
              <button class="scheduled-chip" type="button" disabled>
                Seo Jun - annual exam
              </button>
            </div>
          </section>
          <section class="schedule-slot" aria-label="10:30 slot">
            <strong>10:30</strong>
            <div
              class="slot-dropzone target-slot"
              id="slot-1030"
              data-testid="slot-1030"
              data-state="empty"
            >
              <span>Available</span>
            </div>
          </section>
          <section class="schedule-slot" aria-label="14:00 slot">
            <strong>14:00</strong>
            <div class="slot-dropzone" data-testid="slot-1400" data-state="occupied">
              <button class="scheduled-chip" type="button" disabled>
                Amara Cho - vaccination
              </button>
            </div>
          </section>
        </div>
      </section>

      <aside class="surface-panel appointment-panel">
        <p class="eyebrow">Appointment</p>
        <h3>Visit details</h3>
        <div class="outcome-strip" id="appointment-status" data-state="idle">
          Search for a patient
        </div>
        <label for="appointment-reason">Reason</label>
        <input
          id="appointment-reason"
          data-testid="appointment-reason"
          autocomplete="off"
          placeholder="Visit reason"
          disabled
        />
        <button
          id="appointment-confirm"
          data-testid="appointment-confirm"
          type="button"
          disabled
        >
          Confirm appointment
        </button>
        <dl class="appointment-summary" id="appointment-summary">
          <div>
            <dt>Patient</dt>
            <dd>Waiting</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>Unscheduled</dd>
          </div>
        </dl>
      </aside>
    </div>
  </div>
`

mountTaskExample({
  title: 'Appointment scheduler',
  eyebrow: 'Scheduling task',
  summary: 'Search for a patient, create an appointment, drag it into an open time slot, and confirm it.',
  stageLabel: 'Appointment scheduling example',
  stageHtml,
  successMessage: 'Scheduler scenario complete',
  bindStage,
  run: runSchedulerScenario,
  typeFirstField: typePatientSearch,
  clickPrimary: clickSchedulerPrimary,
})

function bindStage(context: TaskExampleContext): void {
  const searchInput = byId<HTMLInputElement>('patient-search')
  const searchButton = byId<HTMLButtonElement>('patient-search-submit')
  const patientResult = byId<HTMLButtonElement>('patient-result')
  const appointmentTray = byId<HTMLElement>('appointment-tray')
  const targetSlot = byId<HTMLElement>('slot-1030')
  const reasonInput = byId<HTMLInputElement>('appointment-reason')
  const confirmButton = byId<HTMLButtonElement>('appointment-confirm')

  searchButton.addEventListener('click', () => searchPatient(searchInput.value))
  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    searchPatient(searchInput.value)
  })
  patientResult.addEventListener('click', (event) => {
    if (event.detail >= 2) {
      openPatientAppointment()
    }
  })
  targetSlot.addEventListener('pointerup', scheduleAppointment)
  confirmButton.addEventListener('click', confirmAppointment)

  context.bindDomEvents('patientSearch', searchInput)
  context.bindDomEvents('searchButton', searchButton)
  context.bindDomEvents('patientResult', patientResult)
  context.bindDomEvents('appointmentTray', appointmentTray)
  context.bindDomEvents('targetSlot', targetSlot)
  context.bindDomEvents('reasonInput', reasonInput)
  context.bindDomEvents('confirmButton', confirmButton)
  bindDynamicAppointmentEvents = (target) => context.bindDomEvents('appointmentCard', target)
}

async function runSchedulerScenario(context: TaskExampleContext): Promise<void> {
  await context.actorble().run(schedulerScenario(), {
    pacing: { betweenSteps: humanStepPacing },
    timeout: 20000,
  })
}

async function typePatientSearch(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  await actorble.typeInto(testId('patient-search'), defaultPatient, {
    ...clickFocusTyping(humanTypingDelay, 7000),
  })
}

async function clickSchedulerPrimary(context: TaskExampleContext): Promise<void> {
  const actorble = context.actorble()

  context.ensureInputValue('patient-search', defaultPatient)
  await actorble.moveTo(testId('patient-search-submit'), {
    motion: humanMoveMotion,
    timeout: 2500,
  })
  await actorble.clickCurrent({ pressDwell: humanPressDwell, timeout: 2500 })
  await actorble.waitFor({
    kind: 'custom',
    predicate: () => document.getElementById('patient-result')?.dataset.state === 'ready',
  })
}

function schedulerScenario(): Scenario {
  return {
    id: 'appointment-scheduler-booking',
    name: 'Appointment scheduler booking',
    steps: [
      {
        action: 'typeInto',
        target: testId('patient-search'),
        input: defaultPatient,
        options: clickFocusTyping(humanTypingDelay, 7000),
      },
      { action: 'press', input: 'Enter', options: { delay: humanPressDelay, timeout: 2500 } },
      { action: 'delay', duration: 640, reason: 'let search result appear' },
      {
        action: 'waitFor',
        input: {
          kind: 'custom',
          predicate: () => document.getElementById('patient-result')?.dataset.state === 'ready',
        },
        options: { timeout: 2500 },
      },
      {
        action: 'doubleClick',
        target: testId('patient-result'),
        options: {
          pressDwell: humanPressDwell,
          duration: humanMoveDuration,
          motion: humanMoveMotion,
          timeout: 3000,
        },
      },
      { action: 'delay', duration: 720, reason: 'let appointment draft open' },
      {
        action: 'waitFor',
        input: {
          kind: 'custom',
          predicate: () => document.getElementById('appointment-card') !== null,
        },
        options: { timeout: 2500 },
      },
      { action: 'fill', target: testId('appointment-reason'), input: defaultReason, options: { timeout: 2500 } },
      { action: 'delay', duration: 1240, reason: 'show appointment details before scheduling' },
      {
        action: 'drag',
        from: testId('appointment-card'),
        to: testId('slot-1030'),
        options: {
          duration: humanDragDuration,
          motion: humanDragMotion,
          timeout: 3500,
        },
      },
      { action: 'delay', duration: 840, reason: 'show scheduled slot before confirmation' },
      {
        action: 'waitFor',
        input: {
          kind: 'custom',
          predicate: () => document.getElementById('slot-1030')?.dataset.state === 'scheduled',
        },
        options: { timeout: 2500 },
      },
      {
        action: 'moveTo',
        target: testId('appointment-confirm'),
        options: { duration: humanMoveDuration, motion: humanMoveMotion, timeout: 2500 },
      },
      { action: 'clickCurrent', options: { pressDwell: humanPressDwell, timeout: 2500 } },
      { action: 'delay', duration: 640, reason: 'let confirmation state settle' },
      {
        action: 'waitFor',
        input: {
          kind: 'custom',
          predicate: () => document.getElementById('appointment-status')?.dataset.state === 'confirmed',
        },
        options: { timeout: 2500 },
      },
    ],
  }
}

function searchPatient(rawQuery: string): void {
  const query = rawQuery.trim() || defaultPatient
  const result = byId<HTMLButtonElement>('patient-result')
  const status = byId<HTMLElement>('appointment-status')

  result.disabled = false
  result.dataset.state = 'ready'
  result.innerHTML = `
    <strong>${escapeHtml(query)}</strong>
    <small>MRN 2048 - last visit May 22</small>
  `
  status.dataset.state = 'patient-ready'
  status.textContent = 'Patient found; open the result'
}

function openPatientAppointment(): void {
  const tray = byId<HTMLElement>('appointment-tray')
  const reason = byId<HTMLInputElement>('appointment-reason')
  const confirm = byId<HTMLButtonElement>('appointment-confirm')
  const status = byId<HTMLElement>('appointment-status')

  tray.dataset.state = 'ready'
  tray.innerHTML = appointmentCardHtml(defaultPatient)
  reason.disabled = false
  confirm.disabled = false
  status.dataset.state = 'draft'
  status.textContent = 'Appointment draft ready'
  bindAppointmentCard()
  renderSummary('Unscheduled')
}

function bindAppointmentCard(): void {
  const card = byId<HTMLButtonElement>('appointment-card')

  card.addEventListener('pointerdown', () => {
    document.body.dataset.activeAppointment = card.id
  })
  card.addEventListener('pointerup', () => {
    delete document.body.dataset.activeAppointment
  })
  card.addEventListener('pointercancel', () => {
    delete document.body.dataset.activeAppointment
  })
  bindDynamicAppointmentEvents?.(card)
}

function scheduleAppointment(): void {
  const activeAppointment = document.body.dataset.activeAppointment

  if (!activeAppointment) {
    return
  }

  const card = byId<HTMLButtonElement>(activeAppointment)
  const tray = byId<HTMLElement>('appointment-tray')
  const slot = byId<HTMLElement>('slot-1030')
  const status = byId<HTMLElement>('appointment-status')

  slot.innerHTML = ''
  slot.append(card)
  slot.dataset.state = 'scheduled'
  tray.dataset.state = 'empty'
  tray.innerHTML = '<p class="muted">Appointment moved to the schedule.</p>'
  status.dataset.state = 'scheduled'
  status.textContent = 'Appointment scheduled for 10:30'
  delete document.body.dataset.activeAppointment
  renderSummary('10:30')
}

function confirmAppointment(): void {
  const reason = byId<HTMLInputElement>('appointment-reason').value.trim() || defaultReason
  const status = byId<HTMLElement>('appointment-status')
  const card = byId<HTMLButtonElement>('appointment-card')

  card.dataset.state = 'confirmed'
  card.querySelector('small')!.textContent = reason
  status.dataset.state = 'confirmed'
  status.textContent = `Confirmed 10:30 visit for ${defaultPatient}`
  renderSummary('10:30', reason)
}

function appointmentCardHtml(patient: string): string {
  return `
    <button
      class="appointment-card"
      id="appointment-card"
      data-testid="appointment-card"
      data-state="draft"
      type="button"
    >
      <span>New visit</span>
      <strong>${escapeHtml(patient)}</strong>
      <small>Drag to an open slot</small>
    </button>
  `
}

function renderSummary(time: string, reason = 'Pending'): void {
  byId<HTMLElement>('appointment-summary').innerHTML = `
    <div>
      <dt>Patient</dt>
      <dd>${escapeHtml(defaultPatient)}</dd>
    </div>
    <div>
      <dt>Time</dt>
      <dd>${escapeHtml(time)}</dd>
    </div>
    <div>
      <dt>Reason</dt>
      <dd>${escapeHtml(reason)}</dd>
    </div>
  `
}
