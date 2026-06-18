import { describe, expect, it } from 'vitest'
import {
  RECORDER_MASKED_VALUE,
  type RawRecordedClickEvent,
  type RawRecordedTextEvent,
  type RecorderTargetSnapshot,
} from '../src/recorder/event-capture.js'
import { normalizeRecordedEvents } from '../src/recorder/event-to-step.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioStep,
  type ScenarioTargetGroup,
} from '../src/scenario/types.js'
import { validateScenarioDocument } from '../src/scenario/validate.js'
import type { ExtensionResult } from '../src/shared/result.js'

describe('recorder event-to-step normalization', () => {
  it('normalizes clicks into draft click steps with locator candidates', () => {
    const event = click(buttonTarget)
    const draft = expectOk(normalizeRecordedEvents([event]))

    expect(draft.sourceEvents).toEqual([event])
    expect(draft.document.schemaVersion).toBe(DRAFT_SCENARIO_SCHEMA_VERSION)
    expect(draft.document.steps).toHaveLength(1)
    expect(validateScenarioDocument(draft.document).ok).toBe(true)

    const [step] = draft.document.steps
    expect(step).toMatchObject({
      id: 'recorded-step-1',
      action: 'click',
    })
    const target = targetGroupFor(step)
    expect(target.strict).toBe(true)
    expect(target.locators.map((locator) => locator.strategy)).toEqual([
      'role',
      'text',
      'css',
      'point',
    ])
    expect(target.locators[0]).toEqual({
      strategy: 'role',
      role: 'button',
      name: {
        value: 'Sign in',
        match: 'exact',
      },
    })
  })

  it('compresses text event noise into a single fill step and drops the focus click', () => {
    const events = [
      click(emailTarget, 1000),
      text(emailTarget, 'u', 1010),
      text(emailTarget, 'user@example.com', 1020),
      text(emailTarget, 'user@example.com', 1030, 'change'),
    ]

    const draft = expectOk(normalizeRecordedEvents(events))

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'fill',
        input: 'user@example.com',
      }),
    ])
    expect(validateScenarioDocument(draft.document).ok).toBe(true)

    const target = targetGroupFor(draft.document.steps[0])
    expect(target.locators.map((locator) => locator.strategy)).toEqual([
      'label',
      'css',
      'point',
    ])
  })

  it('uses typeInto for text events without form-control context', () => {
    const draft = expectOk(normalizeRecordedEvents([
      text(editableTarget, 'Saved comment', 1000),
    ]))

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'typeInto',
        input: 'Saved comment',
      }),
    ])
    expect(validateScenarioDocument(draft.document).ok).toBe(true)
  })

  it('keeps masked sensitive text and marks it for user confirmation', () => {
    const draft = expectOk(normalizeRecordedEvents([
      text(passwordTarget, RECORDER_MASKED_VALUE, 1000, 'input', {
        sensitive: true,
        sensitiveReason: 'password_type',
      }),
    ]))

    expect(draft.document.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-step-1',
        action: 'fill',
        input: RECORDER_MASKED_VALUE,
        note: expect.stringContaining('Sensitive input was masked'),
      }),
    ])
    expect(draft.document.steps[0]).toMatchObject({
      note: expect.stringContaining('password_type'),
    })
    expect(validateScenarioDocument(draft.document).ok).toBe(true)
  })

  it('reports a recorder error when a target yields no valid locator candidates', () => {
    const result = normalizeRecordedEvents([
      click({
        tagName: 'div',
        rect: {
          x: Number.NaN,
          y: Number.NaN,
          width: Number.NaN,
          height: Number.NaN,
        },
      }),
    ])

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          path: ['events', 0, 'target'],
        },
      ],
    })
  })

  it('returns draft validation issues when normalized output is invalid', () => {
    const result = normalizeRecordedEvents([
      text(emailTarget, '', 1000),
    ])

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid_document',
          path: ['steps', 0, 'input'],
        },
      ],
    })
  })
})

const buttonTarget = {
  tagName: 'button',
  id: 'submit',
  role: 'button',
  text: 'Sign in',
  rect: {
    x: 10,
    y: 20,
    width: 100,
    height: 40,
  },
} satisfies RecorderTargetSnapshot

const emailTarget = {
  tagName: 'input',
  id: 'email',
  inputType: 'email',
  labelText: 'Email',
  name: 'email',
  rect: {
    x: 10,
    y: 80,
    width: 240,
    height: 32,
  },
} satisfies RecorderTargetSnapshot

const passwordTarget = {
  tagName: 'input',
  id: 'password',
  inputType: 'password',
  labelText: 'Password',
  name: 'password',
  rect: {
    x: 10,
    y: 120,
    width: 240,
    height: 32,
  },
} satisfies RecorderTargetSnapshot

const editableTarget = {
  tagName: 'div',
  role: 'textbox',
  ariaLabel: 'Comment',
  rect: {
    x: 10,
    y: 160,
    width: 320,
    height: 90,
  },
} satisfies RecorderTargetSnapshot

function click(
  target: RecorderTargetSnapshot,
  timestamp = 1000,
): RawRecordedClickEvent {
  return {
    kind: 'click',
    target,
    timestamp,
    clientX: target.rect.x + 1,
    clientY: target.rect.y + 1,
    button: 0,
  }
}

function text(
  target: RecorderTargetSnapshot,
  value: string,
  timestamp: number,
  source: RawRecordedTextEvent['source'] = 'input',
  sensitive: Pick<RawRecordedTextEvent, 'sensitive' | 'sensitiveReason'> = {
    sensitive: false,
  },
): RawRecordedTextEvent {
  return {
    kind: 'text',
    target,
    source,
    value,
    ...sensitive,
    timestamp,
  }
}

function expectOk<T>(result: ExtensionResult<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value
}

function targetGroupFor(step: ScenarioStep): ScenarioTargetGroup {
  if (!('target' in step)) {
    throw new Error('Step does not have a target.')
  }

  const target = step.target
  if (!('locators' in target)) {
    throw new Error('Step target is not a target group.')
  }

  return target
}
