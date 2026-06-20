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
  type RawRecordedDragEvent,
  type RawRecordedEvent,
  type RawRecordedPointerEvent,
  type RawRecordedSelectionEvent,
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
  let pendingPointer: PendingPointerWindow | null = null
  let pendingDragStart: PendingDragStart | null = null

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

  function flushPendingPointer(): ExtensionResult<void> {
    if (pendingPointer === null) {
      return ok(undefined)
    }

    const pending = pendingPointer
    pendingPointer = null

    const selectionEvent = lastSelectionEvent(pending.selections)
    if (selectionEvent !== undefined) {
      const result = buildSelectTextStep(selectionEvent, pending.index, nextStepId(records))
      if (!result.ok) {
        return result
      }

      if (result.value !== null) {
        records.push({
          step: result.value,
          sourceKind: 'selection',
          targetKey: targetKeyForSelection(selectionEvent),
        })
      }
      return ok(undefined)
    }

    if (!isClickLikePointerWindow(pending)) {
      return ok(undefined)
    }

    const clickEvent = pending.events.at(-1) ?? pending.events[0]
    if (clickEvent === undefined) {
      return ok(undefined)
    }

    const result = buildClickStepFromTarget(
      clickEvent.target,
      clickEvent,
      pending.index,
      nextStepId(records),
      clickEvent.button,
    )
    if (!result.ok) {
      return result
    }

    records.push({
      step: result.value,
      sourceKind: 'click',
      targetKey: targetKeyFor(clickEvent.target),
    })
    return ok(undefined)
  }

  for (const [index, event] of events.entries()) {
    if (event.kind === 'text') {
      const pointerFlush = flushPendingPointer()
      if (!pointerFlush.ok) {
        return failure(pointerFlush.issues)
      }

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

    if (event.kind === 'pointer') {
      if (event.phase === 'down') {
        const pointerFlush = flushPendingPointer()
        if (!pointerFlush.ok) {
          return failure(pointerFlush.issues)
        }
        pendingPointer = { events: [event], selections: [], index }
        continue
      }

      if (pendingPointer !== null) {
        pendingPointer.events.push(event)
      }
      continue
    }

    if (event.kind === 'selection') {
      if (pendingPointer !== null && compactText(event.selectedText) !== undefined) {
        pendingPointer.selections.push(event)
      }
      continue
    }

    if (event.kind === 'drag') {
      const pointerFlush = flushPendingPointer()
      if (!pointerFlush.ok) {
        return failure(pointerFlush.issues)
      }

      if (event.phase === 'start') {
        pendingDragStart = { event, index }
        continue
      }

      if (pendingDragStart === null) {
        continue
      }

      const result = buildDragStep(
        pendingDragStart.event,
        event,
        pendingDragStart.index,
        nextStepId(records),
      )
      pendingDragStart = null
      if (!result.ok) {
        return failure(result.issues)
      }

      records.push({
        step: result.value,
        sourceKind: 'drag',
        targetKey: targetKeyFor(event.target),
      })
      continue
    }

    const pointerFlush = flushPendingPointer()
    if (!pointerFlush.ok) {
      return failure(pointerFlush.issues)
    }

    if (event.kind !== 'click' || dropsPostPointerClick(records, event.target)) {
      continue
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

  const pointerFlush = flushPendingPointer()
  if (!pointerFlush.ok) {
    return failure(pointerFlush.issues)
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
  sourceKind: 'click' | 'text' | 'selection' | 'drag'
  targetKey: string
}

type PendingTextEvent = {
  event: RawRecordedTextEvent
  index: number
  targetKey: string
}

type PendingPointerWindow = {
  events: RawRecordedPointerEvent[]
  selections: RawRecordedSelectionEvent[]
  index: number
}

type PendingDragStart = {
  event: RawRecordedDragEvent
  index: number
}

function buildClickStep(
  event: RawRecordedClickEvent,
  eventIndex: number,
  id: string,
): ExtensionResult<ScenarioStep> {
  return buildClickStepFromTarget(event.target, event, eventIndex, id, event.button)
}

function buildClickStepFromTarget(
  snapshot: RecorderTargetSnapshot,
  event: RawRecordedEvent,
  eventIndex: number,
  id: string,
  button: number,
): ExtensionResult<ScenarioStep> {
  const target = buildTargetGroup(snapshot, event, eventIndex)
  if (!target.ok) {
    return target
  }

  const options = clickOptions(button)

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
  const target = buildTargetGroup(event.target, event, eventIndex)
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

function buildSelectTextStep(
  event: RawRecordedSelectionEvent,
  eventIndex: number,
  id: string,
): ExtensionResult<ScenarioStep | null> {
  const snapshot = selectionTarget(event)
  if (snapshot === undefined) {
    return ok(null)
  }

  const target = buildTargetGroup(snapshot, event, eventIndex)
  if (!target.ok) {
    return target
  }

  return ok({
    id,
    action: 'selectText',
    target: target.value,
  })
}

function buildDragStep(
  start: RawRecordedDragEvent,
  drop: RawRecordedDragEvent,
  eventIndex: number,
  id: string,
): ExtensionResult<ScenarioStep> {
  const from = buildTargetGroup(start.target, start, eventIndex)
  if (!from.ok) {
    return from
  }

  const to = buildTargetGroup(drop.target, drop, eventIndex)
  if (!to.ok) {
    return to
  }

  return ok({
    id,
    action: 'drag',
    from: from.value,
    to: to.value,
  })
}

function buildTargetGroup(
  targetSnapshot: RecorderTargetSnapshot,
  event: RawRecordedEvent,
  eventIndex: number,
): ExtensionResult<ScenarioTargetGroup> {
  const synthesis = synthesizeLocatorCandidates({
    target: targetSnapshot,
    event,
  })

  if (!synthesis.ok) {
    return failure(withEventTargetPath(synthesis.issues, event, eventIndex))
  }

  return ok({
    kind: 'target',
    strict: true,
    description: targetDescription(targetSnapshot),
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

const CLICK_MOVEMENT_THRESHOLD_PX = 5
const CLICK_MOVEMENT_THRESHOLD_SQUARED = CLICK_MOVEMENT_THRESHOLD_PX ** 2

function lastSelectionEvent(
  selections: readonly RawRecordedSelectionEvent[],
): RawRecordedSelectionEvent | undefined {
  return selections.at(-1)
}

function selectionTarget(
  event: RawRecordedSelectionEvent,
): RecorderTargetSnapshot | undefined {
  return event.activeTarget ?? event.focusTarget ?? event.anchorTarget
}

function targetKeyForSelection(event: RawRecordedSelectionEvent): string {
  const target = selectionTarget(event)
  return target === undefined ? `selection:${event.timestamp}` : targetKeyFor(target)
}

function isClickLikePointerWindow(window: PendingPointerWindow): boolean {
  const down = window.events.find((event) => event.phase === 'down')
  const up = window.events.findLast((event) => event.phase === 'up')
  if (down === undefined || up === undefined) {
    return false
  }

  return pointerMovementSquared(down, up) <= CLICK_MOVEMENT_THRESHOLD_SQUARED
}

function pointerMovementSquared(
  from: RawRecordedPointerEvent,
  to: RawRecordedPointerEvent,
): number {
  return (to.clientX - from.clientX) ** 2 + (to.clientY - from.clientY) ** 2
}

function dropsPostPointerClick(
  records: readonly NormalizedStepRecord[],
  target: RecorderTargetSnapshot,
): boolean {
  const last = records.at(-1)
  if (last === undefined || last.targetKey !== targetKeyFor(target)) {
    return false
  }

  return last.sourceKind === 'click' || last.sourceKind === 'selection'
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
