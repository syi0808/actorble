import type { ScenarioLocator, ScenarioPointLocator } from '../scenario/types.js'
import { failure, ok, type ExtensionResult } from '../shared/result.js'
import type { RecorderTargetSnapshot } from './event-capture.js'

export type LocatorCandidate = Readonly<{
  locator: ScenarioLocator
  score: number
  reason: string
  strict?: boolean
}>

export type LocatorSynthesisInput = Readonly<{
  target: unknown
  event?: unknown
}>

const TEXT_LIMIT = 80

export function synthesizeLocatorCandidates(
  input: LocatorSynthesisInput,
): ExtensionResult<readonly LocatorCandidate[]> {
  if (!isRecorderTargetSnapshot(input.target)) {
    return failure({
      code: 'recorder_error',
      message: 'Recorded target snapshot is invalid.',
      details: {
        hasEvent: input.event !== undefined,
      },
    })
  }

  const target = input.target
  const candidates: LocatorCandidate[] = []
  const accessibleName = compactText(
    target.ariaLabel ?? target.labelText ?? target.text,
  )
  const role = compactText(target.role)
  const labelText = compactText(target.labelText)
  const visibleText = compactText(target.text)
  const testId = compactText(target.testId)
  const cssSelector = cssSelectorForTarget(target)
  const pointLocator = pointLocatorForTarget(target)

  if (role !== undefined) {
    candidates.push({
      locator: {
        strategy: 'role',
        role,
        ...(accessibleName === undefined
          ? {}
          : {
              name: {
                value: accessibleName,
                match: 'exact',
              },
            }),
      },
      score: 100,
      reason: 'role',
      strict: true,
    })
  }

  if (labelText !== undefined) {
    candidates.push({
      locator: {
        strategy: 'label',
        label: {
          value: labelText,
          match: 'exact',
        },
      },
      score: 90,
      reason: 'label',
      strict: true,
    })
  }

  if (testId !== undefined) {
    candidates.push({
      locator: {
        strategy: 'testId',
        value: testId,
      },
      score: 80,
      reason: 'testId',
      strict: true,
    })
  }

  if (visibleText !== undefined) {
    candidates.push({
      locator: {
        strategy: 'text',
        text: {
          value: visibleText,
          match: 'exact',
        },
      },
      score: 70,
      reason: 'text',
      strict: true,
    })
  }

  if (cssSelector !== undefined) {
    candidates.push({
      locator: {
        strategy: 'css',
        selector: cssSelector,
      },
      score: 60,
      reason: 'css',
      strict: true,
    })
  }

  if (pointLocator !== undefined) {
    candidates.push({
      locator: pointLocator,
      score: 50,
      reason: 'point',
      strict: false,
    })
  }

  if (candidates.length === 0) {
    return failure({
      code: 'recorder_error',
      message: 'No locator candidates could be built for the recorded target.',
      details: {
        hasEvent: input.event !== undefined,
      },
    })
  }

  return ok(candidates)
}

function cssSelectorForTarget(target: RecorderTargetSnapshot): string | undefined {
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

function pointLocatorForTarget(
  target: RecorderTargetSnapshot,
): ScenarioPointLocator | undefined {
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

function isRecorderTargetSnapshot(value: unknown): value is RecorderTargetSnapshot {
  if (!isRecord(value) || typeof value.tagName !== 'string' || !isRect(value.rect)) {
    return false
  }

  if (
    !isOptionalString(value.frameUrl) ||
    !isOptionalString(value.id) ||
    !isOptionalString(value.role) ||
    !isOptionalString(value.ariaLabel) ||
    !isOptionalString(value.labelText) ||
    !isOptionalString(value.testId) ||
    !isOptionalString(value.inputType) ||
    !isOptionalString(value.name) ||
    !isOptionalString(value.placeholder) ||
    !isOptionalString(value.href) ||
    !isOptionalString(value.text)
  ) {
    return false
  }

  return value.classes === undefined ||
    (Array.isArray(value.classes) &&
      value.classes.every((className) => typeof className === 'string'))
}

function isRect(value: unknown): value is RecorderTargetSnapshot['rect'] {
  return isRecord(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
