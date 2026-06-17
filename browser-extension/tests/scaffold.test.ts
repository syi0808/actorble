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
  })
})
