import type { Trace } from '../../src/index.js'

export function byId<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id)

  if (!element) {
    throw new Error(`Missing example element: #${id}`)
  }

  return element as TElement
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
  const spans = trace.spans.slice(-10).reverse()

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
