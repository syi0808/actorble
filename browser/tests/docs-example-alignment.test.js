import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const browserRoot = process.cwd()
const repoRoot = join(browserRoot, '..')

const publicAlignmentFiles = [
  'browser/example/README.md',
  'browser/example/shared/task-example.ts',
  'browser/scripts/example-smoke.mjs',
  'docs/src/content/docs/docs/browser/api.md',
  'docs/src/content/docs/docs/browser/examples.md',
  'docs/src/content/docs/docs/browser/getting-started.md',
  'docs/src/pages/index.astro',
]

const legacyPublicPatterns = [
  {
    label: 'public mode option',
    pattern: /\bmode:\s*['"](interactive|headless)['"]/,
  },
  {
    label: 'public visual option',
    pattern: /\bvisual:\s*(true|false|\{)/,
  },
  {
    label: 'removed linear motion kind',
    pattern: /\bkind:\s*['"]linear['"]/,
  },
  {
    label: 'removed ease easing field',
    pattern: /\beasing\s*:/,
  },
  {
    label: 'inertia duration field',
    pattern: /\bkind:\s*['"]inertia['"][^}\n]*duration/,
  },
  {
    label: 'spring duration field',
    pattern: /\bkind:\s*['"]spring['"][^}\n]*duration/,
  },
  {
    label: 'legacy visual-mode control',
    pattern: /visual-mode/,
  },
]

describe('docs and examples option model alignment', () => {
  it('does not publish legacy browser option examples', () => {
    const violations = []

    for (const file of publicAlignmentFiles) {
      const absolute = join(repoRoot, file)
      const source = readFileSync(absolute, 'utf8')

      for (const legacy of legacyPublicPatterns) {
        const match = source.match(legacy.pattern)

        if (match) {
          violations.push(`${relative(browserRoot, absolute)}: ${legacy.label}: ${match[0]}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('exposes feedback presets in examples and smoke checks', () => {
    const taskExample = readFileSync(join(browserRoot, 'example/shared/task-example.ts'), 'utf8')
    const smoke = readFileSync(join(browserRoot, 'scripts/example-smoke.mjs'), 'utf8')

    for (const feedback of ['cursor', 'debug', 'off']) {
      expect(taskExample).toContain(`feedback-mode-${feedback}`)
      expect(taskExample).toContain(`feedback: '${feedback}'`)
      expect(smoke).toContain(`feedback-mode-${feedback}`)
    }
  })

  it('documents the public state wait condition vocabulary', () => {
    const api = readFileSync(join(repoRoot, 'docs/src/content/docs/docs/browser/api.md'), 'utf8')

    for (const helper of [
      "text('Saved', { target: css('#status') })",
      "value(css('#project-name'), 'Actorble')",
      "attribute(css('#panel'), 'aria-busy', null)",
      "url('/projects/actorble')",
    ]) {
      expect(api).toContain(helper)
    }
    expect(api).toContain('they do not retain matcher sources')
  })

  it('documents reveal and stability diagnostics and capability fidelity', () => {
    const api = readFileSync(join(repoRoot, 'docs/src/content/docs/docs/browser/api.md'), 'utf8')
    const advanced = readFileSync(
      join(repoRoot, 'docs/src/content/docs/docs/browser/advanced-api.md'),
      'utf8',
    )

    for (const value of [
      "scrolling: 'nested-dom'",
      "reveal: 'planned'",
      "stability: 'observed'",
    ]) {
      expect(api).toContain(value)
    }
    for (const family of ['reveal:start', 'reveal:complete', 'stability:start', 'stability:complete']) {
      expect(advanced).toContain(family)
    }
    expect(advanced).toContain('never retain raw DOM nodes')
  })
})
