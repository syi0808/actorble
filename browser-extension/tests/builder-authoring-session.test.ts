import { describe, expect, it } from 'vitest'
import {
  addStep,
  assignLocatorToTargetSlot,
  assignLocatorToSelectedTargetSlot,
  createDefaultStepForActionFamily,
  createScenario,
  createScenarioAuthoringSession,
  deleteStep,
  duplicateStep,
  getValidatedScenarioDocument,
  insertStep,
  listTargetSlotsForStep,
  markScenarioSaved,
  reorderStep,
  selectScenario,
  selectTargetSlot,
  setRecordState,
  setRunState,
  updateStepActionFamily,
  updateStepFields,
  type BuilderScenarioSource,
  type BuilderStepActionFamily,
} from '../src/builder/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'
import { validateScenarioDocument } from '../src/scenario/validate.js'

const loginDocument = {
  schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
  id: 'login-document',
  name: 'Login document',
  description: 'Preserve this description.',
  defaults: {
    timeout: 5000,
    pacing: {
      betweenSteps: 120,
    },
  },
  metadata: {
    owner: 'qa',
    tags: ['smoke'],
  },
  platform: {
    browser: {
      viewport: 'desktop',
    },
  },
  steps: [
    {
      id: 'email',
      action: 'fill',
      target: {
        strategy: 'label',
        label: 'Email',
      },
      input: 'user@example.com',
      note: 'Existing note',
    },
    {
      id: 'submit',
      action: 'click',
      target: {
        strategy: 'role',
        role: 'button',
        name: 'Sign in',
      },
    },
  ],
} satisfies ScenarioDocument

const otherDocument = {
  schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
  id: 'other-document',
  name: 'Other document',
  steps: [
    {
      id: 'pause',
      action: 'delay',
      duration: 250,
    },
  ],
} satisfies ScenarioDocument

const sources: readonly BuilderScenarioSource[] = [
  {
    id: 'login-record',
    name: 'Login record',
    document: loginDocument,
  },
  {
    id: 'other-record',
    name: 'Other record',
    document: otherDocument,
  },
]

describe('builder authoring session', () => {
  it('initializes from saved scenario sources without dirtying or mutating them', () => {
    const session = createTestSession()

    expect(session).toMatchObject({
      selectedScenarioId: 'login-record',
      selectedStepId: 'email',
      selectedTargetSlot: undefined,
      dirty: false,
      issues: [],
    })
    expect(session.draftDocument).toEqual(loginDocument)
    expect(session.draftDocument).not.toBe(loginDocument)
    expect(loginDocument.steps).toHaveLength(2)
  })

  it('creates unsaved drafts, writes validation issues, and resets dirty state after save', () => {
    const session = createTestSession()
    const created = unwrap(createScenario(session, {
      id: 'draft-document',
      name: 'Draft document',
      initialStepFamily: 'click',
    }))

    expect(created.selectedScenarioId).toBeUndefined()
    expect(created.draftDocument).toMatchObject({
      id: 'draft-document',
      name: 'Draft document',
      steps: [
        {
          id: 'step-1',
          action: 'click',
          target: {
            kind: 'target',
            strict: true,
            locators: [],
          },
        },
      ],
    })
    expect(created.dirty).toBe(true)
    expect(created.issues).toEqual([
      expect.objectContaining({
        path: ['steps', 0, 'target', 'locators'],
      }),
    ])

    const saved = markScenarioSaved(created, {
      id: 'saved-record',
      name: 'Saved record',
      document: {
        ...created.draftDocument,
        steps: [
          {
            id: 'step-1',
            action: 'delay',
            duration: 100,
          },
        ],
      } as ScenarioDocument,
    })

    expect(saved.selectedScenarioId).toBe('saved-record')
    expect(saved.dirty).toBe(false)
    expect(saved.issues).toEqual([])
    expect(saved.scenarios.map((scenario) => scenario.id)).toEqual([
      'saved-record',
      'login-record',
      'other-record',
    ])
  })

  it('selects saved scenarios and rejects missing scenario selections without changing state', () => {
    const session = createTestSession()
    const selected = unwrap(selectScenario(session, 'other-record'))

    expect(selected).toMatchObject({
      selectedScenarioId: 'other-record',
      selectedStepId: 'pause',
      dirty: false,
      issues: [],
    })

    const missing = selectScenario(selected, 'missing-record')

    expect(missing.ok).toBe(false)
    expect(selected).toMatchObject({
      selectedScenarioId: 'other-record',
      selectedStepId: 'pause',
    })
  })

  it('adds, inserts, duplicates, deletes, reorders, and changes step action families', () => {
    const session = createTestSession()
    const added = unwrap(addStep(session, 'click'))
    const inserted = unwrap(insertStep(added, 1, 'fill'))
    const duplicated = unwrap(duplicateStep(inserted, 'step-2'))
    const reordered = unwrap(reorderStep(duplicated, 'step-3', 0))
    const changed = unwrap(updateStepActionFamily(reordered, 'submit', 'waitForText'))
    const deleted = unwrap(deleteStep(changed, 'email'))

    expect(added.draftDocument?.steps.map((step) => step.id)).toEqual([
      'email',
      'submit',
      'step-1',
    ])
    expect(inserted.draftDocument?.steps.map((step) => step.id)).toEqual([
      'email',
      'step-2',
      'submit',
      'step-1',
    ])
    expect(duplicated.draftDocument?.steps.map((step) => step.id)).toEqual([
      'email',
      'step-2',
      'step-3',
      'submit',
      'step-1',
    ])
    expect(reordered.draftDocument?.steps.map((step) => step.id)).toEqual([
      'step-3',
      'email',
      'step-2',
      'submit',
      'step-1',
    ])
    expect(changed.draftDocument?.steps[3]).toMatchObject({
      id: 'submit',
      action: 'waitFor',
      input: {
        kind: 'text',
        value: '',
      },
    })
    expect(deleted.draftDocument?.steps.map((step) => step.id)).toEqual([
      'step-3',
      'step-2',
      'submit',
      'step-1',
    ])
    expect(deleted.dirty).toBe(true)
    expect(deleted.selectedStepId).toBe('step-2')
    expect(deleted.issues.length).toBeGreaterThan(0)
  })

  it('creates action-specific default steps with portable draft shapes and actionable validation paths', () => {
    const cases: readonly Readonly<{
      family: BuilderStepActionFamily
      expected: Readonly<Record<string, unknown>>
      issuePath?: readonly (string | number)[]
    }>[] = [
      {
        family: 'click',
        expected: { action: 'click', target: emptyTarget() },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'moveTo',
        expected: { action: 'moveTo', target: emptyTarget() },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'doubleClick',
        expected: { action: 'doubleClick', target: emptyTarget() },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'focus',
        expected: { action: 'focus', target: emptyTarget() },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'clickCurrent',
        expected: { action: 'clickCurrent' },
      },
      {
        family: 'type',
        expected: { action: 'type', input: '' },
        issuePath: ['steps', 0, 'input'],
      },
      {
        family: 'typeInto',
        expected: { action: 'typeInto', target: emptyTarget(), input: '' },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'fill',
        expected: { action: 'fill', target: emptyTarget(), input: '' },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'press',
        expected: { action: 'press', input: '' },
        issuePath: ['steps', 0, 'input'],
      },
      {
        family: 'scrollToTarget',
        expected: { action: 'scrollTo', target: emptyTarget() },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'scrollToPosition',
        expected: { action: 'scrollTo', input: { x: 0, y: 0, coordinateSpace: 'document' } },
      },
      {
        family: 'drag',
        expected: { action: 'drag', from: emptyTarget(), to: emptyTarget() },
        issuePath: ['steps', 0, 'from', 'locators'],
      },
      {
        family: 'selectText',
        expected: { action: 'selectText', target: emptyTarget() },
        issuePath: ['steps', 0, 'target', 'locators'],
      },
      {
        family: 'waitForVisible',
        expected: { action: 'waitFor', input: { kind: 'visible', target: emptyTarget() } },
        issuePath: ['steps', 0, 'input', 'target', 'locators'],
      },
      {
        family: 'waitForHidden',
        expected: { action: 'waitFor', input: { kind: 'hidden', target: emptyTarget() } },
        issuePath: ['steps', 0, 'input', 'target', 'locators'],
      },
      {
        family: 'waitForText',
        expected: { action: 'waitFor', input: { kind: 'text', value: '' } },
        issuePath: ['steps', 0, 'input', 'value'],
      },
      {
        family: 'delay',
        expected: { action: 'delay', duration: 1000 },
      },
    ]

    for (const { family, expected, issuePath } of cases) {
      const step = createDefaultStepForActionFamily(family, { id: `id-${family}` })

      expect(step).toMatchObject({
        id: `id-${family}`,
        ...expected,
      })

      const validation = validateScenarioDocument({
        schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
        steps: [step],
      })

      if (issuePath === undefined) {
        expect(validation).toMatchObject({ ok: true })
      } else {
        expect(validation).toMatchObject({
          ok: false,
          issues: expect.arrayContaining([
            expect.objectContaining({ path: issuePath }),
          ]),
        })
      }
    }
  })

  it('updates step fields, writes selected target slots, and validates to a portable scenario document', () => {
    const session = createTestSession()
    const inserted = unwrap(insertStep(session, 1, 'fill'))
    const selectedSlot = unwrap(selectTargetSlot(inserted, {
      kind: 'step-target',
      stepId: 'step-1',
    }))
    const assigned = unwrap(assignLocatorToSelectedTargetSlot(selectedSlot, {
      strategy: 'testId',
      value: 'email-input',
    }))
    const updated = unwrap(updateStepFields(assigned, 'step-1', {
      input: 'edited@example.com',
      note: 'Added by builder',
    }))
    const validDocument = unwrap(getValidatedScenarioDocument(updated))

    expect(updated.issues).toEqual([])
    expect(validDocument.steps[1]).toMatchObject({
      id: 'step-1',
      action: 'fill',
      note: 'Added by builder',
      input: 'edited@example.com',
      target: {
        kind: 'target',
        strict: true,
        locators: [
          {
            strategy: 'testId',
            value: 'email-input',
          },
        ],
      },
    })
    expect(validDocument.metadata).toEqual(loginDocument.metadata)
    expect(validDocument.defaults).toEqual(loginDocument.defaults)
    expect(JSON.stringify(validDocument)).not.toContain('selectedTargetSlot')
    expect(JSON.stringify(validDocument)).not.toContain('currentRun')
  })

  it('discovers writable target slots and writes locators to explicit slots', () => {
    const discoveryCases: readonly Readonly<{
      family: BuilderStepActionFamily
      expectedSlots: readonly string[]
    }>[] = [
      { family: 'click', expectedSlots: ['step-target'] },
      { family: 'selectText', expectedSlots: ['step-target'] },
      { family: 'drag', expectedSlots: ['drag-from', 'drag-to'] },
      { family: 'waitForVisible', expectedSlots: ['waitFor-target'] },
      { family: 'scrollToTarget', expectedSlots: ['scrollTo-target'] },
      { family: 'clickCurrent', expectedSlots: [] },
      { family: 'waitForText', expectedSlots: [] },
      { family: 'scrollToPosition', expectedSlots: [] },
    ]

    for (const { family, expectedSlots } of discoveryCases) {
      expect(
        listTargetSlotsForStep(
          createDefaultStepForActionFamily(family, { id: `id-${family}` }),
          `id-${family}`,
        ).map((slot) => slot.kind),
      ).toEqual(expectedSlots)
    }

    const session = createScenarioAuthoringSession({
      createScenarioId: () => 'slot-document',
      createStepId: () => 'slot-step',
    })
    const created = unwrap(createScenario(session, {
      initialStepFamily: 'click',
    }))
    const withStepTarget = unwrap(assignLocatorToTargetSlot(created, {
      kind: 'step-target',
      stepId: 'slot-step',
    }, testIdLocator('primary-target')))
    const dragStep = unwrap(updateStepActionFamily(withStepTarget, 'slot-step', 'drag'))
    const withDragFrom = unwrap(assignLocatorToTargetSlot(dragStep, {
      kind: 'drag-from',
      stepId: 'slot-step',
    }, testIdLocator('drag-source')))
    const withDragTo = unwrap(assignLocatorToTargetSlot(withDragFrom, {
      kind: 'drag-to',
      stepId: 'slot-step',
    }, testIdLocator('drag-destination')))
    const waitStep = unwrap(updateStepActionFamily(withDragTo, 'slot-step', 'waitForVisible'))
    const withWaitTarget = unwrap(assignLocatorToTargetSlot(waitStep, {
      kind: 'waitFor-target',
      stepId: 'slot-step',
    }, testIdLocator('wait-target')))
    const scrollStep = unwrap(updateStepActionFamily(withWaitTarget, 'slot-step', 'scrollToTarget'))
    const withScrollTarget = unwrap(assignLocatorToTargetSlot(scrollStep, {
      kind: 'scrollTo-target',
      stepId: 'slot-step',
    }, testIdLocator('scroll-target')))
    const selectStep = unwrap(updateStepActionFamily(withScrollTarget, 'slot-step', 'selectText'))
    const withSelectTarget = unwrap(assignLocatorToTargetSlot(selectStep, {
      kind: 'step-target',
      stepId: 'slot-step',
    }, testIdLocator('selection-target')))

    expect(withStepTarget.draftDocument?.steps[0]).toMatchObject({
      target: targetWithLocator('primary-target'),
    })
    expect(withDragTo.draftDocument?.steps[0]).toMatchObject({
      from: targetWithLocator('drag-source'),
      to: targetWithLocator('drag-destination'),
    })
    expect(withWaitTarget.draftDocument?.steps[0]).toMatchObject({
      input: {
        kind: 'visible',
        target: targetWithLocator('wait-target'),
      },
    })
    expect(withScrollTarget.draftDocument?.steps[0]).toMatchObject({
      target: targetWithLocator('scroll-target'),
    })
    expect(withSelectTarget.draftDocument?.steps[0]).toMatchObject({
      action: 'selectText',
      target: targetWithLocator('selection-target'),
    })
  })

  it('supports text selection endpoint target slots without storing UI state', () => {
    const session = createScenarioAuthoringSession({
      createScenarioId: () => 'selection-document',
      createStepId: () => 'selection-step',
    })
    const created = unwrap(createScenario(session, {
      initialStepFamily: 'selectText',
    }))
    const ranged = unwrap(updateStepFields(created, 'selection-step', {
      target: {
        anchor: {
          target: emptyTarget(),
          offset: 2,
        },
        focus: {
          target: emptyTarget(),
          offset: 8,
        },
      },
    }))

    expect(
      listTargetSlotsForStep(ranged.draftDocument?.steps[0] ?? neverStep(), 'selection-step')
        .map((slot) => slot.kind),
    ).toEqual(['selection-anchor', 'selection-focus'])

    const withAnchor = unwrap(assignLocatorToTargetSlot(ranged, {
      kind: 'selection-anchor',
      stepId: 'selection-step',
    }, testIdLocator('selection-anchor')))
    const withFocus = unwrap(assignLocatorToTargetSlot(withAnchor, {
      kind: 'selection-focus',
      stepId: 'selection-step',
    }, testIdLocator('selection-focus')))

    expect(withFocus.draftDocument?.steps[0]).toMatchObject({
      action: 'selectText',
      target: {
        anchor: {
          target: targetWithLocator('selection-anchor'),
          offset: 2,
        },
        focus: {
          target: targetWithLocator('selection-focus'),
          offset: 8,
        },
      },
    })
    expect(withFocus.issues).toEqual([])
    expect(JSON.stringify(withFocus.draftDocument)).not.toContain('selectedTargetSlot')
    expect(JSON.stringify(withFocus.draftDocument)).not.toContain('selection-anchor:selection-step')
  })

  it('keeps run and record state in the authoring session, not the scenario document', () => {
    const session = createTestSession()
    const withRun = setRunState(session, {
      runId: 'run-1',
      status: 'running',
      message: 'Running',
    })
    const withRecord = setRecordState(withRun, {
      sessionId: 'record-1',
      status: 'recording',
      message: 'Recording',
    })

    expect(withRecord.currentRun).toMatchObject({ runId: 'run-1' })
    expect(withRecord.currentRecord).toMatchObject({ sessionId: 'record-1' })
    expect(withRecord.dirty).toBe(false)
    expect(JSON.stringify(withRecord.draftDocument)).not.toContain('run-1')
    expect(JSON.stringify(withRecord.draftDocument)).not.toContain('record-1')
  })

  it('rejects invalid step operations without changing the original state', () => {
    const session = createTestSession()

    const deleted = deleteStep(session, 'missing-step')
    const reordered = reorderStep(session, 'missing-step', 0)
    const selectedSlot = selectTargetSlot(session, {
      kind: 'drag-from',
      stepId: 'email',
    })

    expect(deleted.ok).toBe(false)
    expect(reordered.ok).toBe(false)
    expect(selectedSlot.ok).toBe(false)
    expect(session).toMatchObject({
      selectedScenarioId: 'login-record',
      selectedStepId: 'email',
      dirty: false,
      issues: [],
    })
  })
})

function createTestSession() {
  let nextStep = 1

  return createScenarioAuthoringSession({
    scenarios: sources,
    selectedScenarioId: 'login-record',
    createScenarioId: () => 'generated-scenario',
    createStepId: () => `step-${nextStep++}`,
  })
}

function unwrap<T>(result: Readonly<{ ok: true; value: T } | { ok: false; issues: unknown }>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result: ${JSON.stringify(result.issues)}`)
  }

  return result.value
}

function emptyTarget() {
  return {
    kind: 'target',
    strict: true,
    locators: [],
  }
}

function testIdLocator(value: string) {
  return {
    strategy: 'testId' as const,
    value,
  }
}

function targetWithLocator(value: string) {
  return {
    kind: 'target',
    strict: true,
    locators: [testIdLocator(value)],
  }
}

function neverStep(): never {
  throw new Error('Expected draft step.')
}
