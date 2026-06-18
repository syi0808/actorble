import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioActionOptions,
  type ScenarioDocument,
  type ScenarioStep,
  type ScenarioTargetGroup,
} from '../scenario/types.js'
import { validateScenarioDocument } from '../scenario/validate.js'
import {
  failure,
  ok,
  type ExtensionIssue,
  type ExtensionResult,
} from '../shared/result.js'
import {
  RECORDER_MASKED_VALUE,
  type RawRecordedClickEvent,
  type RawRecordedEvent,
  type RawRecordedTextEvent,
  type RecorderTargetSnapshot,
} from './event-capture.js'
import { synthesizeLocatorCandidates } from './locator-synthesis.js'

export type RecordedScenarioDraft = Readonly<{
  document: ScenarioDocument
  sourceEvents: readonly RawRecordedEvent[]
}>

export function normalizeRecordedEvents(
  events: readonly RawRecordedEvent[],
): ExtensionResult<RecordedScenarioDraft> {
  const records: NormalizedStepRecord[] = []
  let pendingText: PendingTextEvent | null = null

  function flushPendingText(): ExtensionResult<void> {
    if (pendingText === null) {
      return ok(undefined)
    }

    const result = buildTextStep(
      pendingText.event,
      pendingText.index,
      nextStepId(records),
    )
    if (!result.ok) {
      return result
    }

    records.push({
      step: result.value,
      sourceKind: 'text',
      targetKey: pendingText.targetKey,
    })
    pendingText = null
    return ok(undefined)
  }

  for (const [index, event] of events.entries()) {
    if (event.kind === 'text') {
      const targetKey = targetKeyFor(event.target)
      if (isSamePendingTextTarget(pendingText, targetKey)) {
        pendingText = { event, index, targetKey }
        continue
      }

      const flush = flushPendingText()
      if (!flush.ok) {
        return failure(flush.issues)
      }

      dropFocusClick(records, targetKey)
      pendingText = { event, index, targetKey }
      continue
    }

    const flush = flushPendingText()
    if (!flush.ok) {
      return failure(flush.issues)
    }

    const result = buildClickStep(event, index, nextStepId(records))
    if (!result.ok) {
      return failure(result.issues)
    }

    records.push({
      step: result.value,
      sourceKind: 'click',
      targetKey: targetKeyFor(event.target),
    })
  }

  const flush = flushPendingText()
  if (!flush.ok) {
    return failure(flush.issues)
  }

  const document: ScenarioDocument = {
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    steps: records.map((record) => record.step),
  }
  const validation = validateScenarioDocument(document)
  if (!validation.ok) {
    return failure(validation.issues)
  }

  return ok({
    document: validation.value,
    sourceEvents: events,
  })
}

type NormalizedStepRecord = {
  step: ScenarioStep
  sourceKind: 'click' | 'text'
  targetKey: string
}

type PendingTextEvent = {
  event: RawRecordedTextEvent
  index: number
  targetKey: string
}

function buildClickStep(
  event: RawRecordedClickEvent,
  eventIndex: number,
  id: string,
): ExtensionResult<ScenarioStep> {
  const target = buildTargetGroup(event, eventIndex)
  if (!target.ok) {
    return target
  }

  const options = clickOptions(event.button)

  return ok({
    id,
    action: 'click',
    target: target.value,
    ...(options === undefined ? {} : { options }),
  })
}

function buildTextStep(
  event: RawRecordedTextEvent,
  eventIndex: number,
  id: string,
): ExtensionResult<ScenarioStep> {
  const target = buildTargetGroup(event, eventIndex)
  if (!target.ok) {
    return target
  }

  const action: 'fill' | 'typeInto' = isFillTarget(event.target)
    ? 'fill'
    : 'typeInto'

  return ok({
    id,
    action,
    target: target.value,
    input: event.value,
    ...(event.sensitive ? { note: sensitiveNote(event) } : {}),
  })
}

function buildTargetGroup(
  event: RawRecordedEvent,
  eventIndex: number,
): ExtensionResult<ScenarioTargetGroup> {
  const synthesis = synthesizeLocatorCandidates({
    target: event.target,
    event,
  })

  if (!synthesis.ok) {
    return failure(withEventTargetPath(synthesis.issues, event, eventIndex))
  }

  return ok({
    kind: 'target',
    strict: true,
    description: targetDescription(event.target),
    locators: synthesis.value.map((candidate) => candidate.locator),
  })
}

function clickOptions(button: number): ScenarioActionOptions | undefined {
  const buttonName = pointerButtonName(button)
  if (buttonName === undefined || buttonName === 'primary') {
    return undefined
  }

  return {
    button: buttonName,
  }
}

function pointerButtonName(
  button: number,
): ScenarioActionOptions['button'] | undefined {
  switch (button) {
    case 0:
      return 'primary'
    case 1:
      return 'auxiliary'
    case 2:
      return 'secondary'
    case 3:
      return 'back'
    case 4:
      return 'forward'
    default:
      return undefined
  }
}

function isFillTarget(target: RecorderTargetSnapshot): boolean {
  if (compactText(target.inputType) !== undefined) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function sensitiveNote(event: RawRecordedTextEvent): string {
  const valueHandling = event.value === RECORDER_MASKED_VALUE
    ? 'masked'
    : event.value.length === 0
      ? 'omitted'
      : 'recorded'
  const reason = event.sensitiveReason === undefined
    ? ''
    : ` (${event.sensitiveReason})`

  return `Sensitive input was ${valueHandling} during recording${reason}; confirm the value before saving.`
}

function targetDescription(target: RecorderTargetSnapshot): string {
  const tagName = target.tagName.toLowerCase()
  const handle = compactText(target.id) === undefined
    ? tagName
    : `${tagName}#${target.id}`
  const name = compactText(
    target.ariaLabel ??
      target.labelText ??
      target.placeholder ??
      target.text ??
      target.name,
  )

  return name === undefined ? handle : `${handle} "${name}"`
}

function targetKeyFor(target: RecorderTargetSnapshot): string {
  const testId = compactText(target.testId)
  if (testId !== undefined) {
    return `testId:${testId}`
  }

  const id = compactText(target.id)
  if (id !== undefined) {
    return `id:${id}`
  }

  const name = compactText(target.name)
  if (name !== undefined) {
    return `name:${target.tagName}:${name}`
  }

  const label = compactText(target.labelText)
  if (label !== undefined) {
    return `label:${target.tagName}:${label}`
  }

  const roleName = compactText(target.ariaLabel ?? target.text)
  const role = compactText(target.role)
  if (role !== undefined || roleName !== undefined) {
    return `role:${target.tagName}:${role ?? ''}:${roleName ?? ''}`
  }

  const { rect } = target
  return `rect:${target.tagName}:${rect.x}:${rect.y}:${rect.width}:${rect.height}`
}

function nextStepId(records: readonly NormalizedStepRecord[]): string {
  return `recorded-step-${records.length + 1}`
}

function dropFocusClick(records: NormalizedStepRecord[], targetKey: string): void {
  const last = records.at(-1)
  if (last?.sourceKind === 'click' && last.targetKey === targetKey) {
    records.pop()
  }
}

function isSamePendingTextTarget(
  pendingText: PendingTextEvent | null,
  targetKey: string,
): pendingText is PendingTextEvent {
  return pendingText !== null && pendingText.targetKey === targetKey
}

function withEventTargetPath(
  issues: readonly ExtensionIssue[],
  event: RawRecordedEvent,
  eventIndex: number,
): readonly ExtensionIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path ?? ['events', eventIndex, 'target'],
    details: {
      ...(issue.details ?? {}),
      eventIndex,
      eventKind: event.kind,
    },
  }))
}

function compactText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length === 0 ? undefined : compact
}
