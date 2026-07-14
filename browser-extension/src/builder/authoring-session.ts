import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioActionOptions,
  type ScenarioDefaults,
  type ScenarioDocument,
  type ScenarioId,
  type ScenarioLocator,
  type ScenarioMetadata,
  type ScenarioPlatformExtensions,
  type ScenarioStep,
  type ScenarioTarget,
  type ScenarioTargetGroup,
} from '../scenario/types.js'
import { validateScenarioDocument } from '../scenario/validate.js'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../shared/result.js'

export type BuilderStepActionFamily =
  | 'click'
  | 'moveTo'
  | 'doubleClick'
  | 'focus'
  | 'clickCurrent'
  | 'type'
  | 'typeInto'
  | 'fill'
  | 'press'
  | 'reveal'
  | 'scrollToPosition'
  | 'scrollBy'
  | 'drag'
  | 'selectText'
  | 'waitForVisible'
  | 'waitForHidden'
  | 'waitForText'
  | 'delay'

export type BuilderTargetSlot =
  | Readonly<{ kind: 'step-target'; stepId: string }>
  | Readonly<{ kind: 'drag-from'; stepId: string }>
  | Readonly<{ kind: 'drag-to'; stepId: string }>
  | Readonly<{ kind: 'selection-anchor'; stepId: string }>
  | Readonly<{ kind: 'selection-focus'; stepId: string }>
  | Readonly<{ kind: 'waitFor-target'; stepId: string }>
  | Readonly<{ kind: 'reveal-target'; stepId: string }>

export type BuilderDraftStep = Readonly<{
  id?: ScenarioId
  note?: string
  action: ScenarioStep['action']
  target?: unknown
  from?: unknown
  to?: unknown
  input?: unknown
  duration?: unknown
  reason?: string
  options?: ScenarioActionOptions
  platform?: ScenarioPlatformExtensions
}>

export type BuilderDraftDocument = Readonly<
  Omit<ScenarioDocument, 'steps'> & {
    steps: readonly BuilderDraftStep[]
  }
>

export type BuilderScenarioSource = Readonly<{
  id: string
  name?: string
  document: ScenarioDocument
}>

export type BuilderRunStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped'

export type BuilderRunState = Readonly<{
  runId: string
  status: BuilderRunStatus
  scenarioId?: string
  message?: string
}>

export type BuilderRecordStatus =
  | 'recording'
  | 'stopped'
  | 'failed'

export type BuilderRecordState = Readonly<{
  sessionId: string
  status: BuilderRecordStatus
  scenarioId?: string
  draftId?: string
  message?: string
}>

export type ScenarioAuthoringSessionState = Readonly<{
  scenarios: readonly BuilderScenarioSource[]
  selectedScenarioId?: string
  draftDocument?: BuilderDraftDocument
  dirty: boolean
  selectedStepId?: string
  selectedTargetSlot?: BuilderTargetSlot
  issues: readonly ExtensionIssue[]
  currentRun?: BuilderRunState
  currentRecord?: BuilderRecordState
  createScenarioId?: () => string
  createStepId?: (family: BuilderStepActionFamily) => string
}>

export type ScenarioAuthoringSessionOptions = Readonly<{
  scenarios?: readonly BuilderScenarioSource[]
  selectedScenarioId?: string
  createScenarioId?: () => string
  createStepId?: (family: BuilderStepActionFamily) => string
}>

export type CreateScenarioInput = Readonly<{
  id?: string
  name?: string
  description?: string
  initialStepFamily?: BuilderStepActionFamily
}>

export type DefaultStepOptions = Readonly<{
  id?: string
  note?: string
  platform?: ScenarioPlatformExtensions
}>

export type BuilderDocumentFieldUpdate = Readonly<{
  id?: string | null
  name?: string | null
  description?: string | null
  defaults?: ScenarioDefaults | null
  metadata?: ScenarioMetadata | null
  platform?: ScenarioPlatformExtensions | null
}>

export type BuilderStepFieldUpdate = Readonly<{
  id?: string | null
  note?: string | null
  input?: unknown
  duration?: unknown
  reason?: string | null
  target?: unknown
  from?: unknown
  to?: unknown
  options?: ScenarioActionOptions | null
  platform?: ScenarioPlatformExtensions | null
}>

let nextScenarioSequence = 1
let nextStepSequence = 1

export function createScenarioAuthoringSession(
  options: ScenarioAuthoringSessionOptions = {},
): ScenarioAuthoringSessionState {
  const scenarios = cloneJson(options.scenarios ?? [])
  const selectedScenarioId =
    options.selectedScenarioId !== undefined &&
    scenarios.some((scenario) => scenario.id === options.selectedScenarioId)
      ? options.selectedScenarioId
      : scenarios[0]?.id

  const empty = emptySession(scenarios, options)
  if (selectedScenarioId === undefined) {
    return empty
  }

  const selected = scenarios.find((scenario) => scenario.id === selectedScenarioId)
  return selected === undefined ? empty : stateForSelectedScenario(empty, selected)
}

export function selectScenario(
  state: ScenarioAuthoringSessionState,
  scenarioId: string,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const scenario = state.scenarios.find((source) => source.id === scenarioId)
  if (scenario === undefined) {
    return failure({
      code: 'storage_error',
      message: `Scenario source "${scenarioId}" is not loaded.`,
      details: { scenarioId },
    })
  }

  return ok(stateForSelectedScenario(state, scenario))
}

export function createScenario(
  state: ScenarioAuthoringSessionState,
  input: CreateScenarioInput = {},
): ExtensionResult<ScenarioAuthoringSessionState> {
  const step = createDefaultStepForActionFamily(input.initialStepFamily ?? 'click', {
    id: createStepId(state, input.initialStepFamily ?? 'click'),
  })
  const document = {
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    id: input.id ?? createScenarioId(state),
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.description === undefined ? {} : { description: input.description }),
    steps: [step],
  } satisfies BuilderDraftDocument

  return ok(withDraftDocument(
    {
      ...state,
      selectedScenarioId: undefined,
      selectedTargetSlot: undefined,
      currentRun: undefined,
      currentRecord: undefined,
    },
    document,
    stepIdFor(step, 0),
    true,
  ))
}

export function openDraftDocument(
  state: ScenarioAuthoringSessionState,
  document: BuilderDraftDocument,
  options: Readonly<{ dirty?: boolean }> = {},
): ScenarioAuthoringSessionState {
  const draft = cloneJson(document)
  const selectedStep = draft.steps[0]
  const selectedStepId = selectedStep === undefined ? undefined : stepIdFor(selectedStep, 0)

  return withDraftDocument(
    {
      ...state,
      selectedScenarioId: undefined,
      selectedTargetSlot: undefined,
      currentRun: undefined,
      currentRecord: undefined,
    },
    draft,
    selectedStepId,
    options.dirty ?? true,
  )
}

export function appendDraftSteps(
  state: ScenarioAuthoringSessionState,
  steps: readonly BuilderDraftStep[],
): ExtensionResult<ScenarioAuthoringSessionState> {
  const document = state.draftDocument
  if (document === undefined) {
    return noDraftFailure('Select or create a scenario before appending recorded steps.')
  }

  if (steps.length === 0) {
    return failure({
      code: 'invalid_document',
      message: 'Recorded draft has no steps to append.',
      path: ['steps'],
    })
  }

  const appendedSteps = cloneJson(steps)
  const firstAppendedIndex = document.steps.length
  const firstAppendedStep = appendedSteps[0]

  return ok(withDraftDocument(
    state,
    {
      ...document,
      steps: [...document.steps, ...appendedSteps],
    },
    firstAppendedStep === undefined
      ? state.selectedStepId
      : stepIdFor(firstAppendedStep, firstAppendedIndex),
    true,
  ))
}

export function markScenarioSaved(
  state: ScenarioAuthoringSessionState,
  source: BuilderScenarioSource,
): ScenarioAuthoringSessionState {
  const savedSource = cloneJson(source)
  const exists = state.scenarios.some((scenario) => scenario.id === savedSource.id)
  const scenarios = exists
    ? state.scenarios.map((scenario) => (scenario.id === savedSource.id ? savedSource : scenario))
    : [savedSource, ...state.scenarios]

  return stateForSelectedScenario(
    {
      ...state,
      scenarios,
    },
    savedSource,
  )
}

export function updateDocumentFields(
  state: ScenarioAuthoringSessionState,
  update: BuilderDocumentFieldUpdate,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const document = state.draftDocument
  if (document === undefined) {
    return noDraftFailure('Select or create a scenario before editing document fields.')
  }

  const next = { ...document } as Record<string, unknown>
  applyNullable(next, 'id', update.id)
  applyNullable(next, 'name', update.name)
  applyNullable(next, 'description', update.description)
  applyNullable(next, 'defaults', update.defaults)
  applyNullable(next, 'metadata', update.metadata)
  applyNullable(next, 'platform', update.platform)

  return ok(withDraftDocument(
    state,
    next as BuilderDraftDocument,
    state.selectedStepId,
    true,
  ))
}

export function addStep(
  state: ScenarioAuthoringSessionState,
  family: BuilderStepActionFamily,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const document = state.draftDocument
  if (document === undefined) {
    return noDraftFailure('Select or create a scenario before adding a step.')
  }

  const step = createDefaultStepForActionFamily(family, { id: createStepId(state, family) })
  const documentWithStep = {
    ...document,
    steps: [...document.steps, step],
  } satisfies BuilderDraftDocument

  return ok(withDraftDocument(state, documentWithStep, stepIdFor(step, document.steps.length), true))
}

export function insertStep(
  state: ScenarioAuthoringSessionState,
  index: number,
  family: BuilderStepActionFamily,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const document = state.draftDocument
  if (document === undefined) {
    return noDraftFailure('Select or create a scenario before inserting a step.')
  }

  const step = createDefaultStepForActionFamily(family, { id: createStepId(state, family) })
  const insertionIndex = clampIndex(index, 0, document.steps.length)
  const steps = [
    ...document.steps.slice(0, insertionIndex),
    step,
    ...document.steps.slice(insertionIndex),
  ]

  return ok(withDraftDocument(
    state,
    {
      ...document,
      steps,
    },
    stepIdFor(step, insertionIndex),
    true,
  ))
}

export function duplicateStep(
  state: ScenarioAuthoringSessionState,
  stepId: string,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, stepId)
  if (!located.ok) {
    return located
  }

  const { document, step, index } = located.value
  const duplicated = {
    ...cloneJson(step),
    id: createStepId(state, actionFamilyForStep(step)),
  } satisfies BuilderDraftStep
  const insertIndex = index + 1
  const steps = [
    ...document.steps.slice(0, insertIndex),
    duplicated,
    ...document.steps.slice(insertIndex),
  ]

  return ok(withDraftDocument(
    state,
    {
      ...document,
      steps,
    },
    stepIdFor(duplicated, insertIndex),
    true,
  ))
}

export function deleteStep(
  state: ScenarioAuthoringSessionState,
  stepId: string,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, stepId)
  if (!located.ok) {
    return located
  }

  const { document, index } = located.value
  const steps = document.steps.filter((_, stepIndex) => stepIndex !== index)
  const nextSelectedIndex = clampIndex(index, 0, Math.max(0, steps.length - 1))
  const nextSelectedStep = steps[nextSelectedIndex]
  const nextSelectedStepId = nextSelectedStep === undefined
    ? undefined
    : stepIdFor(nextSelectedStep, nextSelectedIndex)

  return ok(withDraftDocument(
    {
      ...state,
      selectedTargetSlot: slotReferencesStep(state.selectedTargetSlot, stepId)
        ? undefined
        : state.selectedTargetSlot,
    },
    {
      ...document,
      steps,
    },
    nextSelectedStepId,
    true,
  ))
}

export function reorderStep(
  state: ScenarioAuthoringSessionState,
  stepId: string,
  toIndex: number,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, stepId)
  if (!located.ok) {
    return located
  }

  const { document, step, index } = located.value
  const remaining = document.steps.filter((_, stepIndex) => stepIndex !== index)
  const insertionIndex = clampIndex(toIndex, 0, remaining.length)
  const steps = [
    ...remaining.slice(0, insertionIndex),
    step,
    ...remaining.slice(insertionIndex),
  ]

  return ok(withDraftDocument(
    state,
    {
      ...document,
      steps,
    },
    stepIdFor(step, insertionIndex),
    true,
  ))
}

export function updateStepActionFamily(
  state: ScenarioAuthoringSessionState,
  stepId: string,
  family: BuilderStepActionFamily,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, stepId)
  if (!located.ok) {
    return located
  }

  const { document, step, index } = located.value
  const nextStep = createDefaultStepForActionFamily(family, {
    id: step.id,
    note: step.note,
    platform: step.platform,
  })
  const steps = replaceStep(document.steps, index, nextStep)

  return ok(withDraftDocument(
    {
      ...state,
      selectedTargetSlot: slotReferencesStep(state.selectedTargetSlot, stepId) &&
        !slotCanWrite(nextStep, state.selectedTargetSlot)
        ? undefined
        : state.selectedTargetSlot,
    },
    {
      ...document,
      steps,
    },
    stepIdFor(nextStep, index),
    true,
  ))
}

export function updateStepFields(
  state: ScenarioAuthoringSessionState,
  stepId: string,
  update: BuilderStepFieldUpdate,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, stepId)
  if (!located.ok) {
    return located
  }

  const { document, step, index } = located.value
  const nextStep = { ...step } as Record<string, unknown>
  applyNullable(nextStep, 'id', update.id)
  applyNullable(nextStep, 'note', update.note)
  applyDeletable(nextStep, 'input', update.input)
  applyDeletable(nextStep, 'duration', update.duration)
  applyNullable(nextStep, 'reason', update.reason)
  applyDeletable(nextStep, 'target', update.target)
  applyDeletable(nextStep, 'from', update.from)
  applyDeletable(nextStep, 'to', update.to)
  applyNullable(nextStep, 'options', update.options)
  applyNullable(nextStep, 'platform', update.platform)

  const resolvedStep = nextStep as unknown as BuilderDraftStep
  const nextStepId = stepIdFor(resolvedStep, index)

  return ok(withDraftDocument(
    {
      ...state,
      selectedTargetSlot: slotReferencesStep(state.selectedTargetSlot, stepId)
        ? retargetSlot(state.selectedTargetSlot, nextStepId)
        : state.selectedTargetSlot,
    },
    {
      ...document,
      steps: replaceStep(document.steps, index, resolvedStep),
    },
    nextStepId,
    true,
  ))
}

export function selectStep(
  state: ScenarioAuthoringSessionState,
  stepId: string,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, stepId)
  if (!located.ok) {
    return located
  }

  return ok({
    ...state,
    selectedStepId: stepIdFor(located.value.step, located.value.index),
    selectedTargetSlot: undefined,
  })
}

export function selectTargetSlot(
  state: ScenarioAuthoringSessionState,
  slot: BuilderTargetSlot,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, slot.stepId)
  if (!located.ok) {
    return located
  }

  if (!slotCanWrite(located.value.step, slot)) {
    return failure({
      code: 'invalid_document',
      message: `Target slot "${slot.kind}" is not available for the selected step.`,
      path: ['steps', located.value.index],
      details: {
        stepId: slot.stepId,
        slot: slot.kind,
      },
    })
  }

  return ok({
    ...state,
    selectedStepId: stepIdFor(located.value.step, located.value.index),
    selectedTargetSlot: slot,
  })
}

export function clearTargetSlot(
  state: ScenarioAuthoringSessionState,
): ScenarioAuthoringSessionState {
  return {
    ...state,
    selectedTargetSlot: undefined,
  }
}

export function listTargetSlotsForStep(
  step: BuilderDraftStep,
  stepId: string,
): readonly BuilderTargetSlot[] {
  switch (step.action) {
    case 'click':
    case 'moveTo':
    case 'doubleClick':
    case 'focus':
    case 'typeInto':
    case 'fill':
      return [{ kind: 'step-target', stepId }]
    case 'selectText':
      return isTextSelectionEndpointTarget(step.target)
        ? [
            { kind: 'selection-anchor', stepId },
            { kind: 'selection-focus', stepId },
          ]
        : [{ kind: 'step-target', stepId }]
    case 'drag':
      return [
        { kind: 'drag-from', stepId },
        { kind: 'drag-to', stepId },
      ]
    case 'waitFor':
      return isTargetWaitCondition(step.input)
        ? [{ kind: 'waitFor-target', stepId }]
        : []
    case 'reveal':
      return [{ kind: 'reveal-target', stepId }]
    default:
      return []
  }
}

export function assignLocatorToSelectedTargetSlot(
  state: ScenarioAuthoringSessionState,
  locator: ScenarioLocator,
): ExtensionResult<ScenarioAuthoringSessionState> {
  return assignTargetToSelectedTargetSlot(state, targetGroupFromLocator(locator))
}

export function assignLocatorToTargetSlot(
  state: ScenarioAuthoringSessionState,
  slot: BuilderTargetSlot,
  locator: ScenarioLocator,
): ExtensionResult<ScenarioAuthoringSessionState> {
  return assignTargetToTargetSlot(state, slot, targetGroupFromLocator(locator))
}

export function assignTargetToSelectedTargetSlot(
  state: ScenarioAuthoringSessionState,
  target: ScenarioTarget,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const slot = state.selectedTargetSlot
  if (slot === undefined) {
    return failure({
      code: 'invalid_document',
      message: 'Select a target slot before assigning a target.',
    })
  }

  return assignTargetToTargetSlot(state, slot, target)
}

export function assignTargetToTargetSlot(
  state: ScenarioAuthoringSessionState,
  slot: BuilderTargetSlot,
  target: ScenarioTarget,
): ExtensionResult<ScenarioAuthoringSessionState> {
  const located = locateStep(state, slot.stepId)
  if (!located.ok) {
    return located
  }

  const { document, step, index } = located.value
  if (!slotCanWrite(step, slot)) {
    return failure({
      code: 'invalid_document',
      message: `Target slot "${slot.kind}" is not available for the selected step.`,
      path: ['steps', index],
    })
  }

  const nextStep = writeTargetToSlot(step, slot, target)
  const steps = replaceStep(document.steps, index, nextStep)

  return ok(withDraftDocument(
    {
      ...state,
      selectedTargetSlot: retargetSlot(slot, stepIdFor(nextStep, index)),
    },
    {
      ...document,
      steps,
    },
    stepIdFor(nextStep, index),
    true,
  ))
}

export function setRunState(
  state: ScenarioAuthoringSessionState,
  currentRun: BuilderRunState | undefined,
): ScenarioAuthoringSessionState {
  return {
    ...state,
    currentRun,
  }
}

export function setRecordState(
  state: ScenarioAuthoringSessionState,
  currentRecord: BuilderRecordState | undefined,
): ScenarioAuthoringSessionState {
  return {
    ...state,
    currentRecord,
  }
}

export function getValidatedScenarioDocument(
  state: ScenarioAuthoringSessionState,
): ExtensionResult<ScenarioDocument> {
  if (state.draftDocument === undefined) {
    return noDraftFailure('Select or create a scenario before exporting the draft document.')
  }

  return validateScenarioDocument(state.draftDocument)
}

export function createDefaultStepForActionFamily(
  family: BuilderStepActionFamily,
  options: DefaultStepOptions = {},
): BuilderDraftStep {
  const common = commonStepFields(options)

  switch (family) {
    case 'click':
    case 'moveTo':
    case 'doubleClick':
    case 'focus':
      return {
        ...common,
        action: family,
        target: emptyTargetGroup(),
      }
    case 'clickCurrent':
      return {
        ...common,
        action: 'clickCurrent',
      }
    case 'type':
      return {
        ...common,
        action: 'type',
        input: '',
      }
    case 'typeInto':
    case 'fill':
      return {
        ...common,
        action: family,
        target: emptyTargetGroup(),
        input: '',
      }
    case 'press':
      return {
        ...common,
        action: 'press',
        input: '',
      }
    case 'reveal':
      return {
        ...common,
        action: 'reveal',
        target: emptyTargetGroup(),
      }
    case 'scrollToPosition':
      return {
        ...common,
        action: 'scrollTo',
        input: {
          x: 0,
          y: 0,
        },
      }
    case 'scrollBy':
      return {
        ...common,
        action: 'scrollBy',
        input: { x: 0, y: 0 },
      }
    case 'drag':
      return {
        ...common,
        action: 'drag',
        from: emptyTargetGroup(),
        to: emptyTargetGroup(),
      }
    case 'selectText':
      return {
        ...common,
        action: 'selectText',
        target: emptyTargetGroup(),
      }
    case 'waitForVisible':
    case 'waitForHidden':
      return {
        ...common,
        action: 'waitFor',
        input: {
          kind: family === 'waitForVisible' ? 'visible' : 'hidden',
          target: emptyTargetGroup(),
        },
      }
    case 'waitForText':
      return {
        ...common,
        action: 'waitFor',
        input: {
          kind: 'text',
          value: '',
        },
      }
    case 'delay':
      return {
        ...common,
        action: 'delay',
        duration: 1000,
      }
  }
}

function emptySession(
  scenarios: readonly BuilderScenarioSource[],
  options: ScenarioAuthoringSessionOptions,
): ScenarioAuthoringSessionState {
  return {
    scenarios,
    dirty: false,
    issues: [],
    ...(options.createScenarioId === undefined ? {} : { createScenarioId: options.createScenarioId }),
    ...(options.createStepId === undefined ? {} : { createStepId: options.createStepId }),
  }
}

function stateForSelectedScenario(
  state: ScenarioAuthoringSessionState,
  source: BuilderScenarioSource,
): ScenarioAuthoringSessionState {
  const document = cloneJson(source.document) as BuilderDraftDocument
  const selectedStep = document.steps[0]
  const selectedStepId = selectedStep === undefined ? undefined : stepIdFor(selectedStep, 0)

  return withDraftDocument(
    {
      ...state,
      selectedScenarioId: source.id,
      selectedTargetSlot: undefined,
      currentRun: undefined,
      currentRecord: undefined,
    },
    document,
    selectedStepId,
    false,
  )
}

function withDraftDocument(
  state: ScenarioAuthoringSessionState,
  document: BuilderDraftDocument,
  selectedStepId: string | undefined,
  dirty: boolean,
): ScenarioAuthoringSessionState {
  const validation = validateScenarioDocument(document)

  return {
    ...state,
    draftDocument: document,
    dirty,
    selectedStepId,
    selectedTargetSlot: state.selectedTargetSlot,
    issues: validation.ok ? [] : validation.issues,
  }
}

function locateStep(
  state: ScenarioAuthoringSessionState,
  stepId: string,
): ExtensionResult<Readonly<{
  document: BuilderDraftDocument
  step: BuilderDraftStep
  index: number
}>> {
  const document = state.draftDocument
  if (document === undefined) {
    return noDraftFailure('Select or create a scenario before editing steps.')
  }

  const index = document.steps.findIndex((step, stepIndex) => stepIdFor(step, stepIndex) === stepId)
  if (index < 0) {
    return failure({
      code: 'invalid_document',
      message: `Step "${stepId}" is not in the current draft.`,
      path: ['steps'],
      details: { stepId },
    })
  }

  return ok({
    document,
    step: document.steps[index],
    index,
  })
}

function noDraftFailure<TValue>(message: string): ExtensionResult<TValue> {
  return failure({
    code: 'invalid_document',
    message,
  })
}

function createStepId(
  state: ScenarioAuthoringSessionState,
  family: BuilderStepActionFamily,
): string {
  const configured = state.createStepId

  return configured === undefined ? defaultCreateStepId() : configured(family)
}

function createScenarioId(state: ScenarioAuthoringSessionState): string {
  return state.createScenarioId === undefined
    ? defaultCreateScenarioId()
    : state.createScenarioId()
}

function defaultCreateScenarioId(): string {
  return `scenario-${nextScenarioSequence++}`
}

function defaultCreateStepId(): string {
  return `step-${nextStepSequence++}`
}

function stepIdFor(step: BuilderDraftStep, index: number): string {
  return step.id ?? `index:${index}`
}

function commonStepFields(options: DefaultStepOptions): Partial<BuilderDraftStep> {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.note === undefined ? {} : { note: options.note }),
    ...(options.platform === undefined ? {} : { platform: options.platform }),
  }
}

function emptyTargetGroup(): ScenarioTargetGroup {
  return {
    kind: 'target',
    strict: true,
    locators: [],
  }
}

function targetGroupFromLocator(locator: ScenarioLocator): ScenarioTargetGroup {
  return {
    kind: 'target',
    strict: true,
    locators: [locator],
  }
}

function replaceStep(
  steps: readonly BuilderDraftStep[],
  index: number,
  step: BuilderDraftStep,
): readonly BuilderDraftStep[] {
  return steps.map((current, currentIndex) => (currentIndex === index ? step : current))
}

function clampIndex(index: number, min: number, max: number): number {
  return Math.max(min, Math.min(index, max))
}

function applyNullable(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    return
  }

  if (value === null) {
    delete target[key]
    return
  }

  target[key] = value
}

function applyDeletable(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    return
  }

  if (value === null) {
    delete target[key]
    return
  }

  target[key] = value
}

function slotReferencesStep(
  slot: BuilderTargetSlot | undefined,
  stepId: string,
): boolean {
  return slot?.stepId === stepId
}

function retargetSlot(
  slot: BuilderTargetSlot | undefined,
  stepId: string,
): BuilderTargetSlot | undefined {
  return slot === undefined ? undefined : { ...slot, stepId }
}

function slotCanWrite(step: BuilderDraftStep, slot: BuilderTargetSlot | undefined): boolean {
  if (slot === undefined) {
    return true
  }

  switch (slot.kind) {
    case 'step-target':
      return ['click', 'moveTo', 'doubleClick', 'focus', 'typeInto', 'fill'].includes(step.action) ||
        (step.action === 'selectText' && !isTextSelectionEndpointTarget(step.target))
    case 'drag-from':
    case 'drag-to':
      return step.action === 'drag'
    case 'selection-anchor':
    case 'selection-focus':
      return step.action === 'selectText' && isTextSelectionEndpointTarget(step.target)
    case 'waitFor-target':
      return step.action === 'waitFor' && isTargetWaitCondition(step.input)
    case 'reveal-target':
      return step.action === 'reveal'
  }
}

function writeTargetToSlot(
  step: BuilderDraftStep,
  slot: BuilderTargetSlot,
  target: ScenarioTarget,
): BuilderDraftStep {
  switch (slot.kind) {
    case 'step-target':
    case 'reveal-target':
      return {
        ...step,
        target,
      }
    case 'drag-from':
      return {
        ...step,
        from: target,
      }
    case 'drag-to':
      return {
        ...step,
        to: target,
      }
    case 'selection-anchor':
    case 'selection-focus': {
      const selectionTarget = isTextSelectionEndpointTarget(step.target)
        ? step.target
        : {
            anchor: {
              target: emptyTargetGroup(),
              offset: 0,
            },
            focus: {
              target: emptyTargetGroup(),
              offset: 0,
            },
          }
      const endpointKey = slot.kind === 'selection-anchor' ? 'anchor' : 'focus'
      return {
        ...step,
        target: {
          ...selectionTarget,
          [endpointKey]: {
            ...selectionTarget[endpointKey],
            target,
          },
        },
      }
    }
    case 'waitFor-target':
      return {
        ...step,
        input: {
          ...(isRecord(step.input) ? step.input : { kind: 'visible' }),
          target,
        },
      }
  }
}

function isTargetWaitCondition(value: unknown): boolean {
  return isRecord(value) && (value.kind === 'visible' || value.kind === 'hidden')
}

function isTextSelectionEndpointTarget(
  value: unknown,
): value is Readonly<{
  anchor: Readonly<{ target: ScenarioTarget; offset: number }>
  focus: Readonly<{ target: ScenarioTarget; offset: number }>
}> {
  return (
    isRecord(value) &&
    isRecord(value.anchor) &&
    isRecord(value.focus) &&
    hasOwn(value.anchor, 'target') &&
    hasOwn(value.focus, 'target')
  )
}

function actionFamilyForStep(step: BuilderDraftStep): BuilderStepActionFamily {
  switch (step.action) {
    case 'reveal':
      return 'reveal'
    case 'scrollTo':
      return 'scrollToPosition'
    case 'scrollBy':
      return 'scrollBy'
    case 'waitFor':
      if (isRecord(step.input) && step.input.kind === 'hidden') {
        return 'waitForHidden'
      }
      if (isRecord(step.input) && step.input.kind === 'text') {
        return 'waitForText'
      }
      return 'waitForVisible'
    default:
      return step.action
  }
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
