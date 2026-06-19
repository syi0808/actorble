import {
  failure,
  ok,
  type ExtensionIssue,
  type ExtensionIssuePath,
  type ExtensionResult,
} from '../shared/result.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from './types.js'

export type ScenarioValidationResult = ExtensionResult<ScenarioDocument>

type UnknownRecord = Readonly<Record<string, unknown>>

const rootKeys = new Set([
  'schemaVersion',
  'id',
  'name',
  'description',
  'createdAt',
  'updatedAt',
  'defaults',
  'metadata',
  'platform',
  'steps',
])

const locatorKeysByStrategy = {
  css: new Set(['strategy', 'selector', 'matchIndex']),
  role: new Set(['strategy', 'role', 'name', 'includeHidden', 'matchIndex']),
  text: new Set(['strategy', 'text', 'matchIndex']),
  label: new Set(['strategy', 'label', 'matchIndex']),
  testId: new Set(['strategy', 'value', 'attribute', 'matchIndex']),
  point: new Set(['strategy', 'point']),
} as const

const targetGroupKeys = new Set([
  'kind',
  'description',
  'strict',
  'locators',
  'platform',
])

const optionKeys = new Set([
  'timeout',
  'duration',
  'motion',
  'button',
  'clickCount',
  'force',
  'pressDwell',
  'focusVisible',
  'delay',
  'focusStrategy',
  'focusClick',
  'afterFocusDelay',
  'clear',
  'behavior',
])

export function validateScenarioDocument(input: unknown): ScenarioValidationResult {
  const schemaVersion = readProperty(input, 'schemaVersion')

  if (
    typeof schemaVersion === 'string' &&
    schemaVersion !== DRAFT_SCENARIO_SCHEMA_VERSION
  ) {
    return failure({
      code: 'unsupported_schema_version',
      message: `Unsupported scenario schema version "${schemaVersion}".`,
      path: ['schemaVersion'],
      details: {
        schemaVersion,
        supportedSchemaVersions: [DRAFT_SCENARIO_SCHEMA_VERSION],
      },
    })
  }

  const issues: ExtensionIssue[] = []

  if (!isRecord(input)) {
    issues.push(issue('Scenario document must be an object.', []))
    return failure(issues)
  }

  rejectUnexpectedProperties(input, rootKeys, [], issues)
  requireConst(input, 'schemaVersion', DRAFT_SCENARIO_SCHEMA_VERSION, ['schemaVersion'], issues)
  validateOptionalId(input.id, ['id'], issues)
  validateOptionalNonEmptyString(input.name, ['name'], issues)
  validateOptionalString(input.description, ['description'], issues)
  validateOptionalString(input.createdAt, ['createdAt'], issues)
  validateOptionalString(input.updatedAt, ['updatedAt'], issues)
  validateDefaults(input.defaults, ['defaults'], issues)
  validateOptionalRecord(input.metadata, ['metadata'], issues)
  validatePlatformExtensions(input.platform, ['platform'], issues)
  validateSteps(input.steps, ['steps'], issues)

  return issues.length === 0 ? ok(input as ScenarioDocument) : failure(issues)
}

function validateSteps(
  steps: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (!Array.isArray(steps)) {
    issues.push(issue('Missing required property "steps".', path))
    return
  }

  if (steps.length === 0) {
    issues.push(issue('Scenario steps must include at least one step.', path))
  }

  steps.forEach((step, index) => validateStep(step, [...path, index], issues))
}

function validateStep(
  step: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (!isRecord(step)) {
    issues.push(issue('Scenario step must be an object.', path))
    return
  }

  validateOptionalId(step.id, [...path, 'id'], issues)
  validateOptionalString(step.note, [...path, 'note'], issues)
  validatePlatformExtensions(step.platform, [...path, 'platform'], issues)

  switch (step.action) {
    case 'click':
    case 'moveTo':
    case 'doubleClick':
    case 'focus':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'target', 'options', 'platform']),
        path,
        issues,
      )
      validateTarget(step.target, [...path, 'target'], issues)
      validateOptions(step.options, [...path, 'options'], issues)
      return
    case 'clickCurrent':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'options', 'platform']),
        path,
        issues,
      )
      validateOptions(step.options, [...path, 'options'], issues)
      return
    case 'type':
    case 'press':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'input', 'options', 'platform']),
        path,
        issues,
      )
      validateNonEmptyString(step.input, [...path, 'input'], issues)
      validateOptions(step.options, [...path, 'options'], issues)
      return
    case 'typeInto':
    case 'fill':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'target', 'input', 'options', 'platform']),
        path,
        issues,
      )
      validateTarget(step.target, [...path, 'target'], issues)
      validateNonEmptyString(step.input, [...path, 'input'], issues)
      validateOptions(step.options, [...path, 'options'], issues)
      return
    case 'scrollTo':
      validateScrollToStep(step, path, issues)
      return
    case 'drag':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'from', 'to', 'options', 'platform']),
        path,
        issues,
      )
      validateTarget(step.from, [...path, 'from'], issues)
      validateTarget(step.to, [...path, 'to'], issues)
      validateOptions(step.options, [...path, 'options'], issues)
      return
    case 'waitFor':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'input', 'options', 'platform']),
        path,
        issues,
      )
      validateWaitCondition(step.input, [...path, 'input'], issues)
      validateOptions(step.options, [...path, 'options'], issues)
      return
    case 'delay':
      rejectUnexpectedProperties(
        step,
        new Set(['id', 'note', 'action', 'duration', 'reason', 'platform']),
        path,
        issues,
      )
      validatePositiveNumber(step.duration, [...path, 'duration'], issues)
      validateOptionalString(step.reason, [...path, 'reason'], issues)
      return
    default:
      issues.push(issue('Scenario step action is not supported.', [...path, 'action']))
  }
}

function validateScrollToStep(
  step: UnknownRecord,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  const hasTarget = hasOwn(step, 'target')
  const hasInput = hasOwn(step, 'input')

  rejectUnexpectedProperties(
    step,
    new Set(['id', 'note', 'action', 'target', 'input', 'options', 'platform']),
    path,
    issues,
  )

  if (hasTarget === hasInput) {
    issues.push(issue('scrollTo step must include either "target" or "input".', path))
    return
  }

  if (hasTarget) {
    validateTarget(step.target, [...path, 'target'], issues)
  } else {
    validatePoint(step.input, [...path, 'input'], issues)
  }

  validateOptions(step.options, [...path, 'options'], issues)
}

function validateTarget(
  target: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (!isRecord(target)) {
    issues.push(issue('Target must be an object.', path))
    return
  }

  if (Array.isArray(target.locators)) {
    rejectUnexpectedProperties(target, targetGroupKeys, path, issues)
    if (target.kind !== undefined && target.kind !== 'target') {
      issues.push(issue('Target group kind must be "target".', [...path, 'kind']))
    }
    validateOptionalString(target.description, [...path, 'description'], issues)
    validateOptionalBoolean(target.strict, [...path, 'strict'], issues)
    validatePlatformExtensions(target.platform, [...path, 'platform'], issues)
    if (target.locators.length === 0) {
      issues.push(issue('Target group must include at least one locator.', [...path, 'locators']))
    }
    target.locators.forEach((locator, index) => {
      validateLocator(locator, [...path, 'locators', index], issues)
    })
    return
  }

  validateLocator(target, path, issues)
}

function validateLocator(
  locator: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (!isRecord(locator)) {
    issues.push(issue('Locator must be an object.', path))
    return
  }

  switch (locator.strategy) {
    case 'css':
      rejectUnexpectedProperties(locator, locatorKeysByStrategy.css, path, issues)
      validateNonEmptyString(locator.selector, [...path, 'selector'], issues)
      validateOptionalInteger(locator.matchIndex, [...path, 'matchIndex'], issues, 0)
      return
    case 'role':
      rejectUnexpectedProperties(locator, locatorKeysByStrategy.role, path, issues)
      validateNonEmptyString(locator.role, [...path, 'role'], issues)
      validateTextMatcher(locator.name, [...path, 'name'], issues, true)
      validateOptionalBoolean(locator.includeHidden, [...path, 'includeHidden'], issues)
      validateOptionalInteger(locator.matchIndex, [...path, 'matchIndex'], issues, 0)
      return
    case 'text':
      rejectUnexpectedProperties(locator, locatorKeysByStrategy.text, path, issues)
      validateTextMatcher(locator.text, [...path, 'text'], issues)
      validateOptionalInteger(locator.matchIndex, [...path, 'matchIndex'], issues, 0)
      return
    case 'label':
      rejectUnexpectedProperties(locator, locatorKeysByStrategy.label, path, issues)
      validateTextMatcher(locator.label, [...path, 'label'], issues)
      validateOptionalInteger(locator.matchIndex, [...path, 'matchIndex'], issues, 0)
      return
    case 'testId':
      rejectUnexpectedProperties(locator, locatorKeysByStrategy.testId, path, issues)
      validateNonEmptyString(locator.value, [...path, 'value'], issues)
      validateOptionalNonEmptyString(locator.attribute, [...path, 'attribute'], issues)
      validateOptionalInteger(locator.matchIndex, [...path, 'matchIndex'], issues, 0)
      return
    case 'point':
      rejectUnexpectedProperties(locator, locatorKeysByStrategy.point, path, issues)
      validatePoint(locator.point, [...path, 'point'], issues)
      return
    default:
      issues.push(issue('Locator strategy is not supported.', [...path, 'strategy']))
  }
}

function validateTextMatcher(
  matcher: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
  optional = false,
): void {
  if (matcher === undefined && optional) {
    return
  }

  if (typeof matcher === 'string') {
    validateNonEmptyString(matcher, path, issues)
    return
  }

  if (!isRecord(matcher)) {
    issues.push(issue('Text matcher must be a string or object.', path))
    return
  }

  rejectUnexpectedProperties(matcher, new Set(['value', 'match', 'caseSensitive']), path, issues)
  validateNonEmptyString(matcher.value, [...path, 'value'], issues)
  validateOptionalEnum(matcher.match, ['exact', 'contains', 'regex'], [...path, 'match'], issues)
  validateOptionalBoolean(matcher.caseSensitive, [...path, 'caseSensitive'], issues)
}

function validatePoint(
  point: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (!isRecord(point)) {
    issues.push(issue('Point must be an object.', path))
    return
  }

  rejectUnexpectedProperties(point, new Set(['x', 'y', 'coordinateSpace']), path, issues)
  validateNumber(point.x, [...path, 'x'], issues)
  validateNumber(point.y, [...path, 'y'], issues)
  validateOptionalEnum(
    point.coordinateSpace,
    ['viewport', 'document', 'screen', 'surface', 'element'],
    [...path, 'coordinateSpace'],
    issues,
  )
}

function validateWaitCondition(
  condition: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (!isRecord(condition)) {
    issues.push(issue('Wait condition must be an object.', path))
    return
  }

  switch (condition.kind) {
    case 'visible':
    case 'hidden':
      rejectUnexpectedProperties(condition, new Set(['kind', 'target']), path, issues)
      validateTarget(condition.target, [...path, 'target'], issues)
      return
    case 'text':
      rejectUnexpectedProperties(condition, new Set(['kind', 'value']), path, issues)
      validateTextMatcher(condition.value, [...path, 'value'], issues)
      return
    default:
      issues.push(issue('Wait condition kind is not supported.', [...path, 'kind']))
  }
}

function validateDefaults(
  defaults: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (defaults === undefined) {
    return
  }

  if (!isRecord(defaults)) {
    issues.push(issue('Defaults must be an object.', path))
    return
  }

  rejectUnexpectedProperties(defaults, new Set(['timeout', 'pacing']), path, issues)
  validateOptionalPositiveNumber(defaults.timeout, [...path, 'timeout'], issues)

  if (defaults.pacing !== undefined) {
    if (!isRecord(defaults.pacing)) {
      issues.push(issue('Pacing defaults must be an object.', [...path, 'pacing']))
      return
    }

    rejectUnexpectedProperties(defaults.pacing, new Set(['betweenSteps']), [...path, 'pacing'], issues)
    validateOptionalPositiveNumber(defaults.pacing.betweenSteps, [...path, 'pacing', 'betweenSteps'], issues)
  }
}

function validateOptions(
  options: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (options === undefined) {
    return
  }

  if (!isRecord(options)) {
    issues.push(issue('Action options must be an object.', path))
    return
  }

  rejectUnexpectedProperties(options, optionKeys, path, issues)
  for (const key of ['timeout', 'duration', 'pressDwell', 'delay', 'afterFocusDelay'] as const) {
    validateOptionalPositiveNumber(options[key], [...path, key], issues)
  }
  validateOptionalInteger(options.clickCount, [...path, 'clickCount'], issues, 1)
  for (const key of ['force', 'focusVisible', 'clear'] as const) {
    validateOptionalBoolean(options[key], [...path, key], issues)
  }
  validateOptionalEnum(
    options.button,
    ['primary', 'secondary', 'auxiliary', 'back', 'forward'],
    [...path, 'button'],
    issues,
  )
  validateOptionalEnum(
    options.focusStrategy,
    ['programmatic', 'click', 'none'],
    [...path, 'focusStrategy'],
    issues,
  )
  validateOptionalEnum(options.behavior, ['instant', 'smooth'], [...path, 'behavior'], issues)
}

function validatePlatformExtensions(
  platform: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (platform === undefined) {
    return
  }

  if (!isRecord(platform)) {
    issues.push(issue('Platform extensions must be an object.', path))
    return
  }

  for (const [key, value] of Object.entries(platform)) {
    if (!isRecord(value)) {
      issues.push(issue('Platform extension values must be objects.', [...path, key]))
    }
  }
}

function validateOptionalRecord(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value !== undefined && !isRecord(value)) {
    issues.push(issue('Value must be an object.', path))
  }
}

function validateOptionalString(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push(issue('Value must be a string.', path))
  }
}

function validateOptionalNonEmptyString(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value !== undefined) {
    validateNonEmptyString(value, path, issues)
  }
}

function validateOptionalBoolean(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value !== undefined && typeof value !== 'boolean') {
    issues.push(issue('Value must be a boolean.', path))
  }
}

function validateOptionalEnum(
  value: unknown,
  values: readonly string[],
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value !== undefined && (typeof value !== 'string' || !values.includes(value))) {
    issues.push(issue(`Value must be one of: ${values.join(', ')}.`, path))
  }
}

function validateOptionalId(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value === undefined) {
    return
  }

  validateNonEmptyString(value, path, issues)
  if (typeof value === 'string' && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    issues.push(issue('Id contains unsupported characters.', path))
  }
}

function validateNonEmptyString(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(issue('Value must be a non-empty string.', path))
  }
}

function validateOptionalPositiveNumber(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (value !== undefined) {
    validatePositiveNumber(value, path, issues)
  }
}

function validatePositiveNumber(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    issues.push(issue('Value must be a number greater than 0.', path))
  }
}

function validateNumber(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(issue('Value must be a finite number.', path))
  }
}

function validateOptionalInteger(
  value: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
  minimum: number,
): void {
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isInteger(value) || value < minimum)
  ) {
    issues.push(issue(`Value must be an integer greater than or equal to ${minimum}.`, path))
  }
}

function requireConst(
  record: UnknownRecord,
  key: string,
  expected: unknown,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  if (record[key] !== expected) {
    issues.push(issue(`Missing required property "${key}".`, path))
  }
}

function rejectUnexpectedProperties(
  record: UnknownRecord,
  allowedKeys: ReadonlySet<string>,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push(issue(`Unexpected property "${key}".`, [...path, key]))
    }
  }
}

function readProperty(input: unknown, property: string): unknown {
  if (!isRecord(input)) {
    return undefined
  }

  return input[property]
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(message: string, path: ExtensionIssuePath): ExtensionIssue {
  return {
    code: 'invalid_document',
    message,
    path,
  }
}
