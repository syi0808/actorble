import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scaffoldFiles = [
  'package.json',
  'tsconfig.json',
  'wxt.config.ts',
  'vitest.config.ts',
  'src/entrypoints/popup/index.html',
  'src/entrypoints/popup/main.ts',
  'src/entrypoints/sidepanel/index.html',
  'src/entrypoints/sidepanel/main.ts',
  'src/entrypoints/background/index.ts',
  'src/entrypoints/content/index.ts',
  'src/shared/result.ts',
  'src/scenario/types.ts',
  'src/scenario/validate.ts',
  'src/scenario/migrate.ts',
  'src/scenario/compile-to-browser-runtime.ts',
  'src/scenario/export-code.ts',
  'src/recorder/event-capture.ts',
  'src/recorder/event-to-step.ts',
  'src/recorder/locator-synthesis.ts',
  'src/inspector/target-picker.ts',
  'src/inspector/locator-preview.ts',
  'src/storage/index.ts',
  'src/storage/README.md',
  'src/messaging/index.ts',
  'src/messaging/README.md',
  'src/trace/index.ts',
  'src/trace/README.md',
]

describe('browser extension scaffold', () => {
  it('tracks WXT entrypoints and Actorble extension boundaries', async () => {
    await Promise.all(
      scaffoldFiles.map(async (file) => {
        await access(join(file))
      }),
    )
  })

  it('delegates source manifest generation to WXT config', async () => {
    await expect(access('manifest.json')).rejects.toHaveProperty('code', 'ENOENT')

    const config = await readFile('wxt.config.ts', 'utf8')

    expect(config).toContain("srcDir: 'src'")
    expect(config).toContain('manifestVersion: 3')
    expect(config).toContain("permissions: ['storage']")
    expect(config).toContain("host_permissions: ['http://*/*', 'https://*/*']")
  })

  it('injects the content script into all supported websites', async () => {
    const contentScript = await readFile('src/entrypoints/content/index.ts', 'utf8')

    expect(contentScript).toContain("matches: ['http://*/*', 'https://*/*']")
  })

  it('uses one sidepanel scenario lifecycle shell', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')
    const scenarioShell = sectionMarkup(sidepanelHtml, 'scenario-shell')

    expect(topLevelSectionIds(sidepanelHtml)).toEqual([
      'scenario-shell',
      'builder-workbench',
      'debug-drawer',
    ])
    expect(sidepanelHtml).toContain('id="scenario-shell-title"')
    expect(scenarioShell).toContain('id="recorded-draft-review"')
    expect(scenarioShell).toContain('id="record-button"')
    expect(scenarioShell).toContain('id="run-button"')
    expect(scenarioShell).toContain('id="scenario-name"')
    expectNoLegacyPeerSurfaceIds(sidepanelHtml)
  })

  it('uses one sidepanel builder workbench for timeline and selected-step editing', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')
    const workbench = sectionMarkup(sidepanelHtml, 'builder-workbench')

    expect(sidepanelHtml).toContain('id="builder-workbench-title"')
    expect(workbench).toContain('id="step-list"')
    expect(workbench).toContain('id="step-action"')
    expect(workbench).toContain('id="dry-run-button"')
    expectNoLegacyPeerSurfaceIds(sidepanelHtml)
  })

  it('inlines target assignment in the selected-step workbench', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')
    const scenarioShell = sectionMarkup(sidepanelHtml, 'scenario-shell')
    const workbench = sectionMarkup(sidepanelHtml, 'builder-workbench')
    const debugDrawer = sectionMarkup(sidepanelHtml, 'debug-drawer')

    expect(workbench).toContain('id="target-assignment-title"')
    expect(workbench).toContain('id="target-picker-start-button"')
    expect(workbench).toContain('id="locator-preview-list"')
    expect(scenarioShell).not.toContain('id="target-assignment-title"')
    expect(debugDrawer).not.toContain('id="target-assignment-title"')
    expectNoLegacyPeerSurfaceIds(sidepanelHtml)
  })

  it('keeps validation, locator diagnostics, run trace, and failures in a collapsed debug drawer', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')
    const scenarioShell = sectionMarkup(sidepanelHtml, 'scenario-shell')
    const workbench = sectionMarkup(sidepanelHtml, 'builder-workbench')
    const debugDrawer = sectionMarkup(sidepanelHtml, 'debug-drawer')

    expect(debugDrawer).toContain('id="debug-drawer-title"')
    expect(debugDrawer).toContain('id="debug-drawer-toggle"')
    expect(debugDrawer).toContain('id="debug-drawer-panel"')
    expect(debugDrawer).toContain('id="debug-validation-issues"')
    expect(debugDrawer).toContain('id="debug-locator-issues"')
    expect(debugDrawer).toContain('id="debug-run-summary"')
    expect(debugDrawer).toContain('id="debug-failure-detail"')
    expect(debugDrawer).toContain('id="debug-drawer-panel" class="debug-drawer-panel" hidden')
    expect(scenarioShell).not.toContain('id="debug-validation-issues"')
    expect(workbench).not.toContain('id="debug-run-summary"')
    expectNoLegacyPeerSurfaceIds(sidepanelHtml)
  })
})

function topLevelSectionIds(html: string): string[] {
  return [...html.matchAll(/^      <section id="([^"]+)"/gm)].map((match) => match[1])
}

function sectionMarkup(html: string, id: string): string {
  const start = html.indexOf(`<section id="${id}"`)
  if (start < 0) {
    throw new Error(`Missing section ${id}.`)
  }

  const next = html.indexOf('\n      <section id="', start + 1)
  return next < 0 ? html.slice(start) : html.slice(start, next)
}

function expectNoLegacyPeerSurfaceIds(html: string): void {
  expect(html).not.toContain('id="document-title"')
  expect(html).not.toContain('id="recording-title"')
  expect(html).not.toContain('id="steps-title"')
  expect(html).not.toContain('id="step-editor-title"')
  expect(html).not.toContain('id="target-picker-title"')
  expect(html).not.toContain('id="locator-preview-title"')
  expect(html).not.toContain('id="validation-title"')
  expect(html).not.toContain('id="run-title"')
}
