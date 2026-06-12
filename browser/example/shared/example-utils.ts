import type { Trace } from '../../src/index.js'

export type UtilityPanelSection = Readonly<{
  id: string
  eyebrow?: string
  title: string
  body: string
}>

export type UtilityPanelOptions = Readonly<{
  id: string
  label: string
  title: string
  sections: readonly UtilityPanelSection[]
}>

export type UtilityPanelController = Readonly<{
  setExpanded(expanded: boolean): void
  expand(): void
  collapse(): void
}>

export function byId<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id)

  if (!element) {
    throw new Error(`Missing example element: #${id}`)
  }

  return element as TElement
}

export function renderUtilityPanel(options: UtilityPanelOptions): string {
  const panelId = escapeHtml(options.id)
  const contentId = `${panelId}-content`

  return `
    <aside
      class="utility-panel"
      id="${panelId}"
      data-testid="${panelId}"
      data-state="collapsed"
      aria-label="${escapeHtml(options.label)}"
    >
      <button
        class="utility-panel-toggle"
        id="${panelId}-toggle"
        data-testid="${panelId}-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="${contentId}"
      >
        <span>Controls</span>
      </button>
      <div
        class="utility-panel-content"
        id="${contentId}"
        data-testid="${contentId}"
        hidden
      >
        <div class="utility-panel-header">
          <p class="eyebrow">Utility panel</p>
          <h2>${escapeHtml(options.title)}</h2>
        </div>
        ${options.sections.map(renderUtilityPanelSection).join('')}
      </div>
    </aside>
  `
}

export function setupUtilityPanel(id: string): UtilityPanelController {
  const panel = byId<HTMLElement>(id)
  const toggle = byId<HTMLButtonElement>(`${id}-toggle`)
  const content = byId<HTMLElement>(`${id}-content`)

  const setExpanded = (expanded: boolean): void => {
    panel.dataset.state = expanded ? 'expanded' : 'collapsed'
    toggle.setAttribute('aria-expanded', String(expanded))
    content.hidden = !expanded
  }

  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true')
  })
  setExpanded(false)

  return {
    setExpanded,
    expand: () => setExpanded(true),
    collapse: () => setExpanded(false),
  }
}

export async function runWithStatus(
  status: HTMLElement,
  successMessage: string,
  button: HTMLButtonElement,
  operation: () => Promise<void>,
  afterRun?: () => void,
): Promise<void> {
  setBusy(button, true)
  setStatus(status, 'Running')

  try {
    await operation()
    setStatus(status, successMessage)
  } catch (error) {
    setStatus(status, errorMessage(error), true)
  } finally {
    setBusy(button, false)
    afterRun?.()
  }
}

export function setStatus(status: HTMLElement, message: string, isError = false): void {
  status.textContent = message
  status.dataset.state = isError ? 'error' : 'ok'
}

export function setBusy(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy
  button.setAttribute('aria-busy', String(busy))
}

export function renderTrace(trace: Trace, target: HTMLElement): void {
  const spans = trace.spans.slice(-20).reverse()

  target.innerHTML =
    spans.length === 0
      ? '<p class="muted">No trace spans yet</p>'
      : spans
          .map((span) => {
            const duration =
              span.endedAt === undefined
                ? 'open'
                : `${formatNumber(span.endedAt - span.startedAt)}ms`
            const attributes = span.attributes ? safeJson(span.attributes) : ''

            return `
              <article class="trace-row" data-status="${escapeHtml(span.status)}">
                <div class="trace-title">
                  <strong>${escapeHtml(span.name)}</strong>
                  <span>${escapeHtml(span.status)} / ${escapeHtml(duration)}</span>
                </div>
                ${attributes ? `<pre>${escapeHtml(attributes)}</pre>` : ''}
              </article>
            `
          })
          .join('')
}

export function renderRows(rows: Readonly<Record<string, unknown>>): string {
  return `
    <dl class="capability-rows">
      ${Object.entries(rows)
        .map(
          ([key, value]) => `
            <div>
              <dt>${escapeHtml(key)}</dt>
              <dd>${escapeHtml(String(value))}</dd>
            </div>
          `,
        )
        .join('')}
    </dl>
  `
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

function renderUtilityPanelSection(section: UtilityPanelSection): string {
  const sectionId = escapeHtml(section.id)

  return `
    <section class="utility-section" id="${sectionId}">
      <div class="utility-section-heading">
        <div>
          ${section.eyebrow ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : ''}
          <h3>${escapeHtml(section.title)}</h3>
        </div>
      </div>
      <div class="utility-section-body">${section.body}</div>
    </section>
  `
}
