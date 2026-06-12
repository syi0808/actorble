import '../../shared/styles.css'
import {
  createActorble,
  css,
  label,
  role,
  testId,
  text,
  type GeometrySnapshot,
  type Locator,
  type TargetHandle,
  type TargetInspection,
} from '../../../src/index.js'
import {
  byId,
  escapeHtml,
  formatNumber,
  renderUtilityPanel,
  runWithStatus,
  setupUtilityPanel,
} from '../../shared/example-utils.js'

type LookupCase = Readonly<{
  name: string
  locator: Locator
}>

type LookupResult = Readonly<{
  name: string
  target: TargetHandle
  inspection: TargetInspection
  geometry: GeometrySnapshot
}>

const actorble = createActorble({ mode: 'interactive', debug: true })
const app = byId<HTMLDivElement>('app')

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Example 01</p>
        <h1>Locator inspector</h1>
      </div>
      <a class="secondary-action" href="/">Examples</a>
    </header>

    <section class="workspace" aria-label="Locator inspector">
      <div class="stage-panel" aria-label="Example target surface">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Target surface</p>
            <h2>Project console</h2>
          </div>
        </div>

        <form class="project-form">
          <label for="project-name">Project name</label>
          <input
            id="project-name"
            data-testid="project-name"
            name="projectName"
            autocomplete="off"
            value="Atlas"
          />
          <button id="create-project" data-testid="create-project" type="button">
            Create project
          </button>
        </form>

        <div class="project-board">
          <div class="board-header">
            <span class="board-marker"></span>
            <strong>Locator targets</strong>
          </div>
          <ul class="task-list">
            <li><span>Launch checklist</span><small data-testid="task-state">ready</small></li>
            <li><span>Invite operators</span><small>queued</small></li>
            <li><span>Review traces</span><small>queued</small></li>
          </ul>
        </div>
      </div>
    </section>

    ${renderUtilityPanel({
      id: 'locator-utility-panel',
      label: 'Locator inspector controls',
      title: 'Locator inspector',
      sections: [
        {
          id: 'locator-actions',
          eyebrow: 'Resolve',
          title: 'Targets',
          body: `
            <div class="status-pill" id="run-status">Ready</div>
            <div class="result-block">
              <div class="action-grid">
                <button id="run-locators" type="button">Resolve all</button>
              </div>
            </div>
          `,
        },
        {
          id: 'locator-diagnostics',
          eyebrow: 'Diagnostics',
          title: 'Resolution',
          body: '<div id="locator-output" class="output-list" aria-live="polite"></div>',
        },
      ],
    })}
  </main>
`

setupUtilityPanel('locator-utility-panel')

const runStatus = byId<HTMLDivElement>('run-status')
const runLocatorsButton = byId<HTMLButtonElement>('run-locators')
const locatorOutput = byId<HTMLDivElement>('locator-output')

runLocatorsButton.addEventListener('click', () => {
  void runWithStatus(runStatus, 'Resolved targets', runLocatorsButton, resolveTargets)
})

async function resolveTargets(): Promise<void> {
  const lookups: readonly LookupCase[] = [
    { name: 'css', locator: css('[data-testid="project-name"]') },
    { name: 'label', locator: label('Project name', { exact: true }) },
    { name: 'role', locator: role('button', { name: 'Create project', exact: true }) },
    { name: 'text', locator: text('Launch checklist', { exact: true }) },
    { name: 'testId', locator: testId('create-project') },
  ]
  const results: LookupResult[] = []

  for (const lookup of lookups) {
    const target = await actorble.resolve(lookup.locator, { strict: true })
    const inspection = await actorble.inspect(target)
    const geometry = await actorble.geometry(target)

    results.push({ name: lookup.name, target, inspection, geometry })
  }

  locatorOutput.innerHTML = results.map(renderLookupResult).join('')
}

function renderLookupResult(result: LookupResult): string {
  const rect = result.geometry.rect
  const point = result.geometry.clickablePoint.ok
    ? `${formatNumber(result.geometry.clickablePoint.point.x)}, ${formatNumber(
        result.geometry.clickablePoint.point.y,
      )}`
    : result.geometry.clickablePoint.reason

  return `
    <article class="lookup-row">
      <div>
        <strong>${escapeHtml(result.name)}</strong>
        <span>${escapeHtml(result.inspection.debug.description ?? result.target.id)}</span>
      </div>
      <dl>
        <div><dt>validity</dt><dd>${escapeHtml(result.inspection.validity)}</dd></div>
        <div><dt>rect</dt><dd>${formatNumber(rect.width)} x ${formatNumber(rect.height)}</dd></div>
        <div><dt>point</dt><dd>${escapeHtml(point)}</dd></div>
      </dl>
    </article>
  `
}
