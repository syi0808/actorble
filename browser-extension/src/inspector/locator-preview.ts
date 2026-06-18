import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
  type InspectorTargetMetadata,
  type RequiredTabCorrelation,
} from '../messaging/index.js'
import type { ScenarioLocator, ScenarioPointLocator } from '../scenario/types.js'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../shared/result.js'

export type LocatorCandidate = Readonly<{
  id: string
  rank: number
  strategy: ScenarioLocator['strategy']
  label: string
  locator: ScenarioLocator
}>

export type LocatorPreviewCandidateStatus =
  | 'unique'
  | 'ambiguous'
  | 'zero-match'
  | 'error'

export type LocatorPreviewCandidate = LocatorCandidate &
  Readonly<{
    matchCount: number
    strict: boolean
    status: LocatorPreviewCandidateStatus
    message?: string
  }>

export type LocatorPreviewRequest = RequiredTabCorrelation &
  Readonly<{
    scenarioId?: string
    candidates: readonly LocatorCandidate[]
  }>

export type LocatorPreviewResult = RequiredTabCorrelation &
  Readonly<{
    scenarioId?: string
    candidates: readonly LocatorPreviewCandidate[]
  }>

export type LocatorPreviewActiveTab = Readonly<{
  id?: number
  url?: string
}>

export type LocatorPreviewClient = Readonly<{
  getActiveTab(): Promise<LocatorPreviewActiveTab | null>
  getTab?(tabId: number): Promise<LocatorPreviewActiveTab | null>
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

export type LocatorPreviewOptions = Readonly<{
  frameId?: number
  targetTabId?: number
}>

export type LocatorPreviewStatus =
  | 'idle'
  | 'previewing'
  | 'ready'
  | 'failed'

export type LocatorPreviewSnapshot = Readonly<{
  status: LocatorPreviewStatus
  target?: InspectorTargetMetadata
  candidates: readonly LocatorPreviewCandidate[]
  issues: readonly ExtensionIssue[]
  message?: string
}>

export type LocatorPreviewer = Readonly<{
  previewTarget(
    target: InspectorTargetMetadata,
    scenarioId?: string,
  ): Promise<ExtensionResult<LocatorPreviewResult>>
  clear(): void
  getSnapshot(): LocatorPreviewSnapshot
}>

export type LocatorPreviewCandidateView = Readonly<{
  index: number
  id: string
  label: string
  strategy: ScenarioLocator['strategy']
  matchSummary: string
  status: LocatorPreviewCandidateStatus
  selectable: boolean
}>

const DEFAULT_FRAME_ID = 0
const TEXT_LIMIT = 80

export function createLocatorCandidates(
  target: InspectorTargetMetadata,
): readonly LocatorCandidate[] {
  const candidates: Omit<LocatorCandidate, 'id' | 'rank'>[] = []
  const accessibleName = compactText(target.ariaLabel ?? target.labelText ?? target.text)
  const labelText = compactText(target.labelText)
  const visibleText = compactText(target.text)
  const testId = compactText(target.testId)
  const cssSelector = cssSelectorForTarget(target)
  const pointLocator = pointLocatorForTarget(target)

  if (target.role !== undefined && target.role.length > 0) {
    candidates.push({
      strategy: 'role',
      label: accessibleName === undefined
        ? `role: ${target.role}`
        : `role: ${target.role} "${accessibleName}"`,
      locator: {
        strategy: 'role',
        role: target.role,
        ...(accessibleName === undefined
          ? {}
          : { name: { value: accessibleName, match: 'exact' as const } }),
      },
    })
  }

  if (labelText !== undefined) {
    candidates.push({
      strategy: 'label',
      label: `label: "${labelText}"`,
      locator: {
        strategy: 'label',
        label: {
          value: labelText,
          match: 'exact',
        },
      },
    })
  }

  if (testId !== undefined) {
    candidates.push({
      strategy: 'testId',
      label: `testId: ${testId}`,
      locator: {
        strategy: 'testId',
        value: testId,
      },
    })
  }

  if (visibleText !== undefined) {
    candidates.push({
      strategy: 'text',
      label: `text: "${visibleText}"`,
      locator: {
        strategy: 'text',
        text: {
          value: visibleText,
          match: 'exact',
        },
      },
    })
  }

  if (cssSelector !== undefined) {
    candidates.push({
      strategy: 'css',
      label: `css: ${cssSelector}`,
      locator: {
        strategy: 'css',
        selector: cssSelector,
      },
    })
  }

  if (pointLocator !== undefined) {
    candidates.push({
      strategy: 'point',
      label: `point: ${pointLocator.point.x}, ${pointLocator.point.y}`,
      locator: pointLocator,
    })
  }

  return candidates.map((candidate, index) => ({
    ...candidate,
    id: `${candidate.strategy}-${index + 1}`,
    rank: index + 1,
  }))
}

export function createLocatorPreviewCandidateViews(
  candidates: readonly LocatorPreviewCandidate[],
): readonly LocatorPreviewCandidateView[] {
  return candidates.map((candidate, index) => ({
    index,
    id: candidate.id,
    label: candidate.label,
    strategy: candidate.strategy,
    matchSummary: matchSummary(candidate),
    status: candidate.status,
    selectable: candidate.status === 'unique',
  }))
}

export function createLocatorPreviewer(
  client: LocatorPreviewClient,
  options: LocatorPreviewOptions = {},
): LocatorPreviewer {
  const frameId = options.frameId ?? DEFAULT_FRAME_ID
  const targetTabId = options.targetTabId
  let snapshot = idleSnapshot()

  async function previewTarget(
    target: InspectorTargetMetadata,
    scenarioId?: string,
  ): Promise<ExtensionResult<LocatorPreviewResult>> {
    const candidates = createLocatorCandidates(target)

    if (candidates.length === 0) {
      return setFailure({
        code: 'inspector_error',
        message: 'No locator candidates could be built for the selected target.',
      }, target)
    }

    snapshot = {
      status: 'previewing',
      target,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        matchCount: 0,
        strict: false,
        status: 'zero-match',
      })),
      issues: [],
      message: undefined,
    }

    const resolvedTab = await resolvePreviewTargetTab(client, targetTabId)
    if (!resolvedTab.ok) {
      snapshot = {
        ...snapshot,
        status: 'failed',
        issues: resolvedTab.issues,
      }
      return failure(resolvedTab.issues)
    }

    const message = createExtensionMessage({
      kind: 'locator:preview',
      payload: {
        tabId: resolvedTab.value.id,
        frameId,
        ...(scenarioId === undefined ? {} : { scenarioId }),
        candidates,
      },
    })

    let response: unknown
    try {
      response = await client.sendMessage(message)
    } catch (error) {
      return setFailure({
        code: 'content_not_ready',
        message: `Locator preview could not be delivered: ${describeUnknownError(error)}`,
      }, target)
    }

    const responseResult = readLocatorPreviewResponse(response)
    if (responseResult === null) {
      return setFailure({
        code: 'unsupported_message',
        message: 'Locator preview returned an unsupported response.',
      }, target)
    }

    if (!responseResult.ok) {
      snapshot = {
        ...snapshot,
        status: 'failed',
        issues: responseResult.issues,
      }
      return responseResult
    }

    snapshot = {
      status: 'ready',
      target,
      candidates: responseResult.value.candidates,
      issues: [],
      message: 'Locator preview ready',
    }
    return responseResult
  }

  function clear(): void {
    snapshot = idleSnapshot()
  }

  function getSnapshot(): LocatorPreviewSnapshot {
    return snapshot
  }

  function setFailure<TValue>(
    issue: ExtensionIssue,
    target?: InspectorTargetMetadata,
  ): ExtensionResult<TValue> {
    snapshot = {
      status: 'failed',
      ...(target === undefined ? {} : { target }),
      candidates: [],
      issues: [issue],
      message: undefined,
    }
    return failure(issue)
  }

  return {
    previewTarget,
    clear,
    getSnapshot,
  }
}

function idleSnapshot(): LocatorPreviewSnapshot {
  return {
    status: 'idle',
    candidates: [],
    issues: [],
  }
}

async function resolvePreviewTargetTab(
  client: Pick<LocatorPreviewClient, 'getActiveTab' | 'getTab'>,
  targetTabId: number | undefined,
): Promise<ExtensionResult<LocatorPreviewActiveTab & Readonly<{ id: number }>>> {
  if (targetTabId === undefined) {
    return resolveActiveTab(client)
  }

  if (client.getTab === undefined) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} cannot be resolved from this panel.`,
      details: { tabId: targetTabId },
    })
  }

  let tab: LocatorPreviewActiveTab | null
  try {
    tab = await client.getTab(targetTabId)
  } catch (error) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} lookup failed.`,
      details: {
        tabId: targetTabId,
        error: describeUnknownError(error),
      },
    })
  }

  if (tab?.id === undefined) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} was not found.`,
      details: { tabId: targetTabId },
    })
  }

  return ok({ ...tab, id: tab.id })
}

async function resolveActiveTab(
  client: Pick<LocatorPreviewClient, 'getActiveTab'>,
): Promise<ExtensionResult<LocatorPreviewActiveTab & Readonly<{ id: number }>>> {
  let tab: LocatorPreviewActiveTab | null
  try {
    tab = await client.getActiveTab()
  } catch (error) {
    return failure({
      code: 'routing_error',
      message: 'Active tab lookup failed.',
      details: { error: describeUnknownError(error) },
    })
  }

  if (tab?.id === undefined) {
    return failure({
      code: 'routing_error',
      message: 'No active tab is available.',
    })
  }

  return ok({ ...tab, id: tab.id })
}

function readLocatorPreviewResponse(
  response: unknown,
): ExtensionResult<LocatorPreviewResult> | null {
  if (!isRecord(response) || typeof response.ok !== 'boolean') {
    return null
  }

  if (response.ok === false && Array.isArray(response.issues)) {
    return response as ExtensionResult<LocatorPreviewResult>
  }

  if (response.ok === true && isRecord(response.value) && Array.isArray(response.value.candidates)) {
    return response as ExtensionResult<LocatorPreviewResult>
  }

  return null
}

function matchSummary(candidate: LocatorPreviewCandidate): string {
  const matchCount = `${candidate.matchCount} match${candidate.matchCount === 1 ? '' : 'es'}`
  const strictness = candidate.status === 'unique' ? 'strict' : candidate.status
  return `${matchCount} · ${strictness}`
}

function cssSelectorForTarget(target: InspectorTargetMetadata): string | undefined {
  const id = compactText(target.id)
  if (id !== undefined) {
    return `#${escapeCssIdentifier(id)}`
  }

  const classes = (target.classes ?? [])
    .map((className) => compactText(className))
    .filter((className): className is string => className !== undefined)
    .slice(0, 2)

  if (classes.length === 0) {
    return undefined
  }

  const tagName = target.tagName.toLowerCase()
  return `${tagName}${classes.map((className) => `.${escapeCssIdentifier(className)}`).join('')}`
}

function pointLocatorForTarget(target: InspectorTargetMetadata): ScenarioPointLocator | undefined {
  const { rect } = target
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return undefined
  }

  return {
    strategy: 'point',
    point: {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      coordinateSpace: 'viewport',
    },
  }
}

function compactText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length === 0) {
    return undefined
  }

  return compact.length > TEXT_LIMIT ? compact.slice(0, TEXT_LIMIT - 1).trimEnd() : compact
}

function escapeCssIdentifier(value: string): string {
  if (/^-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(value)) {
    return value
  }

  return value.replace(/[^-_a-zA-Z0-9]/g, (character) => `\\${character}`)
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
