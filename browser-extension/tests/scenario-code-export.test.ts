import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import { exportScenarioToCode } from '../src/scenario/export-code.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
  type ScenarioStep,
} from '../src/scenario/types.js'

function scenario(
  steps: readonly ScenarioStep[],
  extra: Partial<Omit<ScenarioDocument, 'schemaVersion' | 'steps'>> = {},
): ScenarioDocument {
  return {
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    ...extra,
    steps,
  }
}

function exportCode(document: ScenarioDocument) {
  const result = exportScenarioToCode(document)

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }

  return result.value
}

describe('exportScenarioToCode', () => {
  it('exports the browser login example as deterministic browser TypeScript', () => {
    const exported = exportCode(browserLoginFlow as ScenarioDocument)

    expect(exported.filename).toBe('browser-login-flow.actorble.ts')
    expect(exported.source).toBe(`import { Actorble, label, role, type RunOptions, type Scenario } from '@actorble/browser'

export const scenario: Scenario = {
  id: 'browser-login-flow',
  name: 'Browser login flow',
  steps: [
    {
      id: 'email',
      action: 'fill',
      target: label('Email'),
      input: 'user@example.com',
    },
    {
      id: 'password',
      action: 'fill',
      target: label('Password'),
      input: 'correct horse battery staple',
    },
    {
      id: 'submit',
      action: 'click',
      target: role('button', { name: 'Sign in' }),
    },
    {
      id: 'wait-dashboard',
      action: 'waitFor',
      input: {
        kind: 'text',
        value: 'Dashboard',
      },
      options: {
        timeout: 8000,
      },
    },
  ],
}

export const runOptions: RunOptions = {
  timeout: 5000,
  pacing: {
    betweenSteps: 120,
  },
}

export async function run(actorble = new Actorble()): Promise<void> {
  await actorble.run(scenario, runOptions)
}
`)
  })

  it('covers browser locators and supported action families', () => {
    const target = { strategy: 'css', selector: '#target' } as const
    const otherTarget = { strategy: 'text', text: 'Drop here' } as const
    const exported = exportCode(
      scenario([
        {
          id: 'click',
          action: 'click',
          target,
          options: { button: 'primary', force: true },
        },
        { id: 'move', action: 'moveTo', target },
        { id: 'current', action: 'clickCurrent', options: { button: 'secondary' } },
        { id: 'double', action: 'doubleClick', target },
        { id: 'focus', action: 'focus', target, options: { focusVisible: true } },
        { id: 'type', action: 'type', input: 'hello' },
        { id: 'type-into', action: 'typeInto', target, input: 'name' },
        { id: 'fill', action: 'fill', target, input: 'filled' },
        { id: 'press', action: 'press', input: 'Enter' },
        { id: 'scroll-target', action: 'reveal', target },
        {
          id: 'scroll-position',
          action: 'scrollTo',
          input: { x: 0, y: 200 },
        },
        { id: 'scroll-by', action: 'scrollBy', input: { x: 0, y: -50 } },
        { id: 'drag', action: 'drag', from: target, to: otherTarget },
        { id: 'wait-visible', action: 'waitFor', input: { kind: 'visible', target } },
        { id: 'wait-hidden', action: 'waitFor', input: { kind: 'hidden', target } },
        {
          id: 'wait-text',
          action: 'waitFor',
          input: { kind: 'text', value: { value: 'Done', match: 'exact' } },
        },
        { id: 'delay', action: 'delay', duration: 50, reason: 'settle' },
        {
          id: 'role',
          action: 'click',
          target: {
            strategy: 'role',
            role: 'button',
            name: { value: 'Submit', match: 'exact' },
            includeHidden: true,
          },
        },
        {
          id: 'label',
          action: 'click',
          target: {
            strategy: 'label',
            label: { value: 'email address', match: 'contains', caseSensitive: false },
          },
        },
        { id: 'test-id', action: 'click', target: { strategy: 'testId', value: 'save' } },
        {
          id: 'point',
          action: 'click',
          target: {
            strategy: 'point',
            point: { x: 10, y: 20, coordinateSpace: 'viewport' },
          },
        },
      ]),
    )

    expect(exported.source).toContain(
      "import { Actorble, css, label, point, role, testId, text, type Scenario } from '@actorble/browser'",
    )
    expect(exported.source).toContain("target: css('#target')")
    expect(exported.source).toContain("to: text('Drop here')")
    expect(exported.source).toContain("target: role('button', { name: 'Submit', exact: true, includeHidden: true })")
    expect(exported.source).toContain("target: label(/email address/i)")
    expect(exported.source).toContain("target: testId('save')")
    expect(exported.source).toContain("target: point(10, 20, { coordinateSpace: 'viewport' })")
    expect(exported.source).toContain("action: 'clickCurrent'")
    expect(exported.source).toContain("action: 'drag'")
    expect(exported.source).toContain('value: /^Done$/')
  })

  it('returns actionable issues for unsupported document features', () => {
    const platformResult = exportScenarioToCode(
      scenario([{ action: 'delay', duration: 1 }], {
        platform: { browser: { capability: 'future' } },
      }),
    )
    const unsupportedOptionResult = exportScenarioToCode(
      scenario([
        {
          action: 'focus',
          target: { strategy: 'css', selector: '#name' },
          options: { button: 'primary' },
        },
      ]),
    )
    const schemaResult = exportScenarioToCode({
      schemaVersion: 'actorble.scenario.v1',
      steps: [{ action: 'delay', duration: 1 }],
    } as unknown as ScenarioDocument)
    const regexResult = exportScenarioToCode(
      scenario([
        {
          action: 'click',
          target: { strategy: 'text', text: { value: '[', match: 'regex' } },
        },
      ]),
    )

    expect(platformResult).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported_platform_extension', path: ['platform'] }],
    })
    expect(unsupportedOptionResult).toMatchObject({
      ok: false,
      issues: [{ code: 'compiler_error', path: ['steps', 0, 'options', 'button'] }],
    })
    expect(schemaResult).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported_schema_version', path: ['schemaVersion'] }],
    })
    expect(regexResult).toMatchObject({
      ok: false,
      issues: [{ code: 'compiler_error', path: ['steps', 0, 'target', 'text', 'value'] }],
    })
  })

  it('does not mutate documents and formats the same input deterministically', () => {
    const document = browserLoginFlow as ScenarioDocument
    const before = JSON.stringify(document)

    const first = exportCode(document)
    const second = exportCode(document)

    expect(second.source).toBe(first.source)
    expect(JSON.stringify(document)).toBe(before)
  })
})
