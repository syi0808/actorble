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

  it('uses one sidepanel scenario shell instead of document and recording cards', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')

    expect(sidepanelHtml).toContain('id="scenario-shell-title"')
    expect(sidepanelHtml).not.toContain('id="document-title"')
    expect(sidepanelHtml).not.toContain('id="recording-title"')
  })

  it('uses one sidepanel builder workbench instead of separate steps and editor cards', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')

    expect(sidepanelHtml).toContain('id="builder-workbench-title"')
    expect(sidepanelHtml).not.toContain('id="steps-title"')
    expect(sidepanelHtml).not.toContain('id="step-editor-title"')
  })

  it('inlines target assignment instead of standalone target picker and locator preview cards', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')

    expect(sidepanelHtml).toContain('id="target-assignment-title"')
    expect(sidepanelHtml).toContain('id="target-picker-start-button"')
    expect(sidepanelHtml).toContain('id="locator-preview-list"')
    expect(sidepanelHtml).not.toContain('id="target-picker-title"')
    expect(sidepanelHtml).not.toContain('id="locator-preview-title"')
  })

  it('uses a collapsible debug drawer instead of primary validation and run cards', async () => {
    const sidepanelHtml = await readFile('src/entrypoints/sidepanel/index.html', 'utf8')

    expect(sidepanelHtml).toContain('id="debug-drawer-title"')
    expect(sidepanelHtml).toContain('id="debug-drawer-toggle"')
    expect(sidepanelHtml).toContain('id="debug-drawer-panel"')
    expect(sidepanelHtml).toContain('id="debug-validation-issues"')
    expect(sidepanelHtml).toContain('id="debug-locator-issues"')
    expect(sidepanelHtml).toContain('id="debug-run-summary"')
    expect(sidepanelHtml).toContain('id="debug-failure-detail"')
    expect(sidepanelHtml).not.toContain('id="validation-title"')
    expect(sidepanelHtml).not.toContain('id="run-title"')
  })
})
