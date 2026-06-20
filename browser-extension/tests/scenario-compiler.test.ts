import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import { compileToBrowserRuntime } from '../src/scenario/compile-to-browser-runtime.js'
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

function compile(document: ScenarioDocument) {
  const result = compileToBrowserRuntime(document)

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }

  return result.value
}

describe('compileToBrowserRuntime', () => {
  it('compiles the browser login example into a browser runtime scenario', () => {
    const compilation = compile(browserLoginFlow as ScenarioDocument)

    expect(compilation.runOptions).toEqual({
      timeout: 5000,
      pacing: {
        betweenSteps: 120,
      },
    })
    expect(compilation.scenario).toEqual({
      id: 'browser-login-flow',
      name: 'Browser login flow',
      steps: [
        {
          id: 'email',
          action: 'fill',
          target: { kind: 'label', value: 'Email' },
          input: 'user@example.com',
        },
        {
          id: 'password',
          action: 'fill',
          target: { kind: 'label', value: 'Password' },
          input: 'correct horse battery staple',
        },
        {
          id: 'submit',
          action: 'click',
          target: { kind: 'role', role: 'button', name: 'Sign in' },
        },
        {
          id: 'wait-dashboard',
          action: 'waitFor',
          input: { kind: 'text', value: 'Dashboard' },
          options: { timeout: 8000 },
        },
      ],
    })
  })

  it('maps each draft locator strategy into browser runtime locators', () => {
    const compilation = compile(
      scenario([
        {
          action: 'click',
          target: { strategy: 'css', selector: '#save' },
        },
        {
          action: 'click',
          target: {
            strategy: 'role',
            role: 'button',
            name: { value: 'Submit', match: 'exact' },
            includeHidden: true,
          },
        },
        {
          action: 'click',
          target: {
            strategy: 'text',
            text: { value: 'created$', match: 'regex', caseSensitive: false },
          },
        },
        {
          action: 'click',
          target: {
            strategy: 'label',
            label: { value: 'email address', match: 'contains', caseSensitive: false },
          },
        },
        {
          action: 'click',
          target: { strategy: 'testId', value: 'save', attribute: 'data-qa' },
        },
        {
          action: 'click',
          target: {
            strategy: 'point',
            point: { x: 10, y: 20, coordinateSpace: 'viewport' },
          },
        },
        {
          action: 'click',
          target: {
            kind: 'target',
            strict: true,
            locators: [
              { strategy: 'role', role: 'button', name: 'Primary' },
              { strategy: 'text', text: 'Fallback' },
            ],
          },
        },
      ]),
    )

    expect(compilation.scenario.steps.map((step) => 'target' in step ? step.target : undefined)).toEqual([
      { kind: 'css', selector: '#save' },
      { kind: 'role', role: 'button', name: 'Submit', exact: true, includeHidden: true },
      { kind: 'text', value: /created$/i },
      { kind: 'label', value: /email address/i },
      { kind: 'testId', value: 'save', attribute: 'data-qa' },
      { kind: 'point', point: { x: 10, y: 20 }, coordinateSpace: 'viewport' },
      { kind: 'role', role: 'button', name: 'Primary' },
    ])
  })

  it('maps every supported draft step family and preserves step ids', () => {
    const target = { strategy: 'css', selector: '#target' } as const
    const otherTarget = { strategy: 'text', text: 'Drop here' } as const
    const motion = { kind: 'ease', easing: 'ease-in', duration: 20 } as const
    const compilation = compile(
      scenario([
        {
          id: 'click',
          action: 'click',
          target,
          options: {
            timeout: 1000,
            duration: 20,
            motion,
            button: 'primary',
            clickCount: 1,
            force: true,
            pressDwell: 5,
          },
        },
        {
          id: 'move',
          action: 'moveTo',
          target,
          options: { timeout: 1000, duration: 20, motion },
        },
        {
          id: 'current',
          action: 'clickCurrent',
          options: {
            timeout: 1000,
            duration: 20,
            motion,
            button: 'secondary',
            clickCount: 2,
            pressDwell: 5,
          },
        },
        {
          id: 'double',
          action: 'doubleClick',
          target,
          options: {
            timeout: 1000,
            duration: 20,
            motion,
            button: 'primary',
            clickCount: 2,
            force: true,
            pressDwell: 5,
          },
        },
        {
          id: 'focus',
          action: 'focus',
          target,
          options: { timeout: 1000, focusVisible: true },
        },
        {
          id: 'type',
          action: 'type',
          input: 'hello',
          options: {
            timeout: 1000,
            delay: 2,
            focusStrategy: 'none',
            focusClick: {
              duration: 10,
              motion: { kind: 'linear', duration: 10 },
              button: 'primary',
              pressDwell: 5,
            },
            afterFocusDelay: 3,
          },
        },
        {
          id: 'type-into',
          action: 'typeInto',
          target,
          input: 'name',
          options: { timeout: 1000, delay: 2, focusStrategy: 'click' },
        },
        {
          id: 'fill',
          action: 'fill',
          target,
          input: 'filled',
          options: { timeout: 1000, clear: true },
        },
        {
          id: 'press',
          action: 'press',
          input: 'Enter',
          options: { timeout: 1000, delay: 2 },
        },
        {
          id: 'scroll-target',
          action: 'scrollTo',
          target,
          options: { timeout: 1000, behavior: 'smooth' },
        },
        {
          id: 'scroll-position',
          action: 'scrollTo',
          input: { x: 0, y: 200, coordinateSpace: 'document' },
          options: { timeout: 1000, behavior: 'instant' },
        },
        {
          id: 'drag',
          action: 'drag',
          from: target,
          to: otherTarget,
          options: { timeout: 1000, duration: 20, motion, force: true },
        },
        {
          id: 'wait-visible',
          action: 'waitFor',
          input: { kind: 'visible', target },
          options: { timeout: 1000 },
        },
        {
          id: 'wait-hidden',
          action: 'waitFor',
          input: { kind: 'hidden', target },
          options: { timeout: 1000 },
        },
        {
          id: 'wait-text',
          action: 'waitFor',
          input: { kind: 'text', value: { value: 'Done', match: 'exact' } },
          options: { timeout: 1000 },
        },
        {
          id: 'delay',
          action: 'delay',
          duration: 50,
          reason: 'settle',
        },
      ]),
    )

    expect(compilation.scenario.steps.map((step) => step.id)).toEqual([
      'click',
      'move',
      'current',
      'double',
      'focus',
      'type',
      'type-into',
      'fill',
      'press',
      'scroll-target',
      'scroll-position',
      'drag',
      'wait-visible',
      'wait-hidden',
      'wait-text',
      'delay',
    ])
    expect(compilation.scenario.steps).toMatchObject([
      {
        action: 'click',
        target: { kind: 'css', selector: '#target' },
        options: { button: 'primary', force: true },
      },
      {
        action: 'moveTo',
        target: { kind: 'css', selector: '#target' },
        options: { duration: 20 },
      },
      {
        action: 'clickCurrent',
        options: { button: 'secondary', clickCount: 2 },
      },
      {
        action: 'doubleClick',
        target: { kind: 'css', selector: '#target' },
        options: { clickCount: 2 },
      },
      {
        action: 'focus',
        target: { kind: 'css', selector: '#target' },
        options: { focusVisible: true },
      },
      {
        action: 'type',
        input: 'hello',
        options: { focusStrategy: 'none', afterFocusDelay: 3 },
      },
      {
        action: 'typeInto',
        target: { kind: 'css', selector: '#target' },
        input: 'name',
        options: { focusStrategy: 'click' },
      },
      {
        action: 'fill',
        target: { kind: 'css', selector: '#target' },
        input: 'filled',
        options: { clear: true },
      },
      {
        action: 'press',
        input: 'Enter',
        options: { delay: 2 },
      },
      {
        action: 'scrollTo',
        target: { kind: 'css', selector: '#target' },
        options: { behavior: 'smooth' },
      },
      {
        action: 'scrollTo',
        input: { x: 0, y: 200, coordinateSpace: 'document' },
        options: { behavior: 'instant' },
      },
      {
        action: 'drag',
        from: { kind: 'css', selector: '#target' },
        to: { kind: 'text', value: 'Drop here' },
        options: { force: true },
      },
      {
        action: 'waitFor',
        input: { kind: 'visible', target: { kind: 'css', selector: '#target' } },
      },
      {
        action: 'waitFor',
        input: { kind: 'hidden', target: { kind: 'css', selector: '#target' } },
      },
      {
        action: 'waitFor',
        input: { kind: 'text', value: /^Done$/ },
      },
      {
        action: 'delay',
        duration: 50,
        reason: 'settle',
      },
    ])
  })

  it('propagates document defaults to browser run options', () => {
    const compilation = compile(
      scenario(
        [
          {
            action: 'delay',
            duration: 1,
          },
        ],
        {
          defaults: {
            timeout: 3000,
            pacing: {
              betweenSteps: 25,
            },
          },
        },
      ),
    )

    expect(compilation.runOptions).toEqual({
      timeout: 3000,
      pacing: {
        betweenSteps: 25,
      },
    })
  })

  it('rejects unsupported schema versions', () => {
    const result = compileToBrowserRuntime({
      schemaVersion: 'actorble.scenario.v1',
      steps: [{ action: 'delay', duration: 1 }],
    } as unknown as ScenarioDocument)

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'unsupported_schema_version',
          path: ['schemaVersion'],
        },
      ],
    })
  })

  it('rejects platform extensions on documents, steps, and target groups', () => {
    const documents = [
      scenario([{ action: 'delay', duration: 1 }], {
        platform: { browser: { capability: 'future' } },
      }),
      scenario([
        {
          action: 'delay',
          duration: 1,
          platform: { browser: { capability: 'future' } },
        },
      ]),
      scenario([
        {
          action: 'click',
          target: {
            kind: 'target',
            locators: [{ strategy: 'css', selector: '#save' }],
            platform: { browser: { capability: 'future' } },
          },
        },
      ]),
    ]

    for (const document of documents) {
      const result = compileToBrowserRuntime(document)

      expect(result.ok).toBe(false)
      expect(result).toMatchObject({
        issues: [
          {
            code: 'unsupported_platform_extension',
          },
        ],
      })
    }
  })

  it('rejects options unsupported by the runtime step type', () => {
    const result = compileToBrowserRuntime(
      scenario([
        {
          action: 'focus',
          target: { strategy: 'css', selector: '#name' },
          options: {
            button: 'primary',
          },
        },
      ]),
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'compiler_error',
          path: ['steps', 0, 'options', 'button'],
        },
      ],
    })
  })

  it('rejects invalid regular expression matchers with a field-level path', () => {
    const result = compileToBrowserRuntime(
      scenario([
        {
          action: 'click',
          target: {
            strategy: 'text',
            text: { value: '[', match: 'regex' },
          },
        },
      ]),
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'compiler_error',
          path: ['steps', 0, 'target', 'text', 'value'],
        },
      ],
    })
  })

  it('compiles selectText draft steps into browser runtime selection steps', () => {
    const compilation = compile(
      scenario([
        {
          id: 'select-all',
          action: 'selectText',
          target: { strategy: 'css', selector: '#copy' },
          options: { timeout: 1000 },
        },
        {
          id: 'select-range',
          action: 'selectText',
          target: {
            anchor: {
              target: { strategy: 'css', selector: '#copy' },
              offset: 2,
            },
            focus: {
              target: { strategy: 'testId', value: 'editor' },
              offset: 8,
            },
          },
        },
      ]),
    )

    expect(compilation.scenario.steps).toEqual([
      {
        id: 'select-all',
        action: 'selectText',
        target: { kind: 'css', selector: '#copy' },
        options: { timeout: 1000 },
      },
      {
        id: 'select-range',
        action: 'selectText',
        target: {
          anchor: {
            target: { kind: 'css', selector: '#copy' },
            offset: 2,
          },
          focus: {
            target: { kind: 'testId', value: 'editor' },
            offset: 8,
          },
        },
      },
    ])
  })

  it('rejects selectText when runtime capabilities do not support text selection', () => {
    const result = compileToBrowserRuntime(
      scenario([
        {
          action: 'selectText',
          target: { strategy: 'css', selector: '#copy' },
        },
      ]),
      {
        capabilities: {
          textSelection: 'none',
        },
      },
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'compiler_error',
          path: ['steps', 0],
          details: {
            action: 'selectText',
            capability: 'textSelection',
            actual: 'none',
            supported: ['selection-api', 'pointer-gesture', 'editor-adapter', 'native'],
          },
        },
      ],
    })
  })

  it('rejects options unsupported by selectText runtime steps', () => {
    const result = compileToBrowserRuntime(
      scenario([
        {
          action: 'selectText',
          target: { strategy: 'css', selector: '#copy' },
          options: {
            timeout: 1000,
            duration: 20,
          },
        },
      ]),
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'compiler_error',
          path: ['steps', 0, 'options', 'duration'],
          details: {
            action: 'selectText',
            option: 'duration',
            supportedOptions: ['timeout'],
          },
        },
      ],
    })
  })
})
