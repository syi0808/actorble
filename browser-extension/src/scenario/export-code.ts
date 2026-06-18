import type {
  Locator as BrowserRuntimeLocator,
  Scenario as BrowserRuntimeScenario,
  ScenarioStep as BrowserRuntimeScenarioStep,
  WaitCondition as BrowserRuntimeWaitCondition,
} from '@actorble/browser'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../shared/result.js'
import {
  compileToBrowserRuntime,
  type BrowserRuntimeRunOptions,
} from './compile-to-browser-runtime.js'
import type { ScenarioDocument } from './types.js'

export type ScenarioCodeExport = Readonly<{
  filename: string
  source: string
}>

export type ScenarioCodeExportResult = ExtensionResult<ScenarioCodeExport>

export function exportScenarioToCode(document: ScenarioDocument): ScenarioCodeExportResult {
  const compilation = compileToBrowserRuntime(document)
  if (!compilation.ok) {
    return failure(compilation.issues)
  }

  try {
    const state = createExportState()
    const scenarioSource = serializeScenario(compilation.value.scenario, state)
    const runOptionsSource =
      compilation.value.runOptions === undefined
        ? undefined
        : serializeRunOptions(compilation.value.runOptions)
    const source = [
      importLine(state, runOptionsSource !== undefined),
      '',
      `export const scenario: Scenario = ${scenarioSource}`,
      '',
      ...(runOptionsSource === undefined
        ? []
        : [`export const runOptions: RunOptions = ${runOptionsSource}`, '']),
      'export async function run(actorble = new Actorble()): Promise<void> {',
      `  await actorble.run(scenario${runOptionsSource === undefined ? '' : ', runOptions'})`,
      '}',
      '',
    ].join('\n')

    return ok({
      filename: `${filenameBase(document.id ?? document.name ?? 'scenario')}.actorble.ts`,
      source,
    })
  } catch (error) {
    if (error instanceof CodeExportError) {
      return failure(error.issue)
    }

    return failure(
      exportIssue('Scenario code export failed.', [], {
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

const locatorFactoryOrder = ['css', 'label', 'point', 'role', 'testId', 'text'] as const

type LocatorFactoryName = (typeof locatorFactoryOrder)[number]
type ExportState = Readonly<{
  usedLocatorFactories: Set<LocatorFactoryName>
}>
type CodeEntry = readonly [key: string, source: string]

class CodeExportError extends Error {
  constructor(readonly issue: ExtensionIssue) {
    super(issue.message)
  }
}

function createExportState(): ExportState {
  return {
    usedLocatorFactories: new Set<LocatorFactoryName>(),
  }
}

function importLine(state: ExportState, includeRunOptions: boolean): string {
  const imports = [
    'Actorble',
    ...locatorFactoryOrder.filter((factory) => state.usedLocatorFactories.has(factory)),
    ...(includeRunOptions ? ['type RunOptions'] : []),
    'type Scenario',
  ]

  return `import { ${imports.join(', ')} } from '@actorble/browser'`
}

function serializeScenario(scenario: BrowserRuntimeScenario, state: ExportState): string {
  const entries: CodeEntry[] = [
    ...optionalEntry('id', scenario.id),
    ...optionalEntry('name', scenario.name),
    [
      'steps',
      renderArray(
        scenario.steps.map((step, index) => serializeStep(step, index, state, 2)),
        1,
      ),
    ],
  ]

  return renderObject(entries, 0)
}

function serializeRunOptions(options: BrowserRuntimeRunOptions): string {
  return serializePlainObject(options, [], 0)
}

function serializeStep(
  step: BrowserRuntimeScenarioStep,
  index: number,
  state: ExportState,
  level: number,
): string {
  const path = ['steps', index] as const
  const entries: CodeEntry[] = [
    ...optionalEntry('id', step.id),
    ['action', stringLiteral(step.action)],
  ]

  switch (step.action) {
    case 'click':
    case 'moveTo':
    case 'doubleClick':
    case 'focus':
      entries.push(['target', serializeLocator(step.target as BrowserRuntimeLocator, state, [...path, 'target'])])
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'clickCurrent':
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'type':
    case 'press':
      entries.push(['input', stringLiteral(step.input)])
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'typeInto':
    case 'fill':
      entries.push(['target', serializeLocator(step.target as BrowserRuntimeLocator, state, [...path, 'target'])])
      entries.push(['input', stringLiteral(step.input)])
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'scrollTo':
      if ('target' in step) {
        entries.push(['target', serializeLocator(step.target as BrowserRuntimeLocator, state, [...path, 'target'])])
      } else {
        entries.push(['input', serializePlainObject(step.input, [...path, 'input'], level + 1)])
      }
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'drag':
      entries.push(['from', serializeLocator(step.from as BrowserRuntimeLocator, state, [...path, 'from'])])
      entries.push(['to', serializeLocator(step.to as BrowserRuntimeLocator, state, [...path, 'to'])])
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'waitFor':
      entries.push(['input', serializeWaitCondition(step.input, state, [...path, 'input'], level + 1)])
      appendOptions(entries, step.options, [...path, 'options'], level)
      break
    case 'delay':
      entries.push(['duration', serializePrimitive(step.duration, [...path, 'duration'])])
      entries.push(...optionalEntry('reason', step.reason))
      break
    default:
      throwCodeExportError(
        `Runtime scenario step action "${String(readProperty(step, 'action'))}" cannot be exported.`,
        path,
        { action: readProperty(step, 'action') },
      )
  }

  return renderObject(entries, level)
}

function appendOptions(
  entries: CodeEntry[],
  options: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
  level: number,
): void {
  if (options === undefined) {
    return
  }

  entries.push(['options', serializePlainObject(options, path, level + 1)])
}

function serializeWaitCondition(
  condition: BrowserRuntimeWaitCondition,
  state: ExportState,
  path: readonly (string | number)[],
  level: number,
): string {
  switch (condition.kind) {
    case 'visible':
    case 'hidden':
      return renderObject(
        [
          ['kind', stringLiteral(condition.kind)],
          ['target', serializeLocator(condition.target as BrowserRuntimeLocator, state, [...path, 'target'])],
        ],
        level,
      )
    case 'text':
      return renderObject(
        [
          ['kind', stringLiteral('text')],
          ['value', serializeValue(condition.value, [...path, 'value'], level + 1)],
        ],
        level,
      )
    case 'custom':
      throwCodeExportError('Custom wait conditions cannot be exported to static TypeScript.', path, {
        conditionKind: condition.kind,
      })
  }
}

function serializeLocator(
  locator: BrowserRuntimeLocator,
  state: ExportState,
  path: readonly (string | number)[],
): string {
  switch (locator.kind) {
    case 'css':
      state.usedLocatorFactories.add('css')
      return `css(${stringLiteral(locator.selector)})`
    case 'role': {
      state.usedLocatorFactories.add('role')
      const options = inlineOptions([
        ...optionalInlineEntry('name', locator.name),
        ...optionalInlineEntry('exact', locator.exact),
        ...optionalInlineEntry('includeHidden', locator.includeHidden),
      ])

      return options === undefined
        ? `role(${stringLiteral(locator.role)})`
        : `role(${stringLiteral(locator.role)}, ${options})`
    }
    case 'text': {
      state.usedLocatorFactories.add('text')
      const options = inlineOptions(optionalInlineEntry('exact', locator.exact))

      return options === undefined
        ? `text(${serializeInlineValue(locator.value, [...path, 'value'])})`
        : `text(${serializeInlineValue(locator.value, [...path, 'value'])}, ${options})`
    }
    case 'label': {
      state.usedLocatorFactories.add('label')
      const options = inlineOptions(optionalInlineEntry('exact', locator.exact))

      return options === undefined
        ? `label(${serializeInlineValue(locator.value, [...path, 'value'])})`
        : `label(${serializeInlineValue(locator.value, [...path, 'value'])}, ${options})`
    }
    case 'testId': {
      state.usedLocatorFactories.add('testId')
      const options = inlineOptions(optionalInlineEntry('attribute', locator.attribute))

      return options === undefined
        ? `testId(${stringLiteral(locator.value)})`
        : `testId(${stringLiteral(locator.value)}, ${options})`
    }
    case 'point': {
      state.usedLocatorFactories.add('point')
      const options = inlineOptions(optionalInlineEntry('coordinateSpace', locator.coordinateSpace))

      return options === undefined
        ? `point(${serializePrimitive(locator.point.x, [...path, 'point', 'x'])}, ${serializePrimitive(locator.point.y, [...path, 'point', 'y'])})`
        : `point(${serializePrimitive(locator.point.x, [...path, 'point', 'x'])}, ${serializePrimitive(locator.point.y, [...path, 'point', 'y'])}, ${options})`
    }
    case 'element':
      throwCodeExportError('Element locators cannot be exported to static TypeScript.', path, {
        locatorKind: locator.kind,
      })
  }
}

function serializeValue(
  value: unknown,
  path: readonly (string | number)[],
  level: number,
): string {
  if (value instanceof RegExp) {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return renderArray(
      value.map((item, index) => serializeValue(item, [...path, index], level + 1)),
      level,
    )
  }

  if (isRecord(value)) {
    return serializePlainObject(value, path, level)
  }

  return serializePrimitive(value, path)
}

function serializePlainObject(
  value: object,
  path: readonly (string | number)[],
  level: number,
): string {
  const entries = Object.entries(value as Readonly<Record<string, unknown>>)
    .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
    .map(([key, entryValue]) => [
      key,
      serializeValue(entryValue, [...path, key], level + 1),
    ] as const)

  return renderObject(entries, level)
}

function serializePrimitive(value: unknown, path: readonly (string | number)[]): string {
  switch (typeof value) {
    case 'string':
      return stringLiteral(value)
    case 'number':
      if (Number.isFinite(value)) {
        return String(value)
      }
      break
    case 'boolean':
      return value ? 'true' : 'false'
  }

  throwCodeExportError('Scenario value cannot be exported to TypeScript.', path, {
    valueType: typeof value,
  })
}

function serializeInlineValue(value: unknown, path: readonly (string | number)[]): string {
  if (value instanceof RegExp) {
    return value.toString()
  }

  return serializePrimitive(value, path)
}

function inlineOptions(entries: readonly CodeEntry[]): string | undefined {
  if (entries.length === 0) {
    return undefined
  }

  return `{ ${entries.map(([key, source]) => `${propertyKey(key)}: ${source}`).join(', ')} }`
}

function optionalEntry(key: string, value: string | undefined): CodeEntry[] {
  return value === undefined ? [] : [[key, stringLiteral(value)]]
}

function optionalInlineEntry(key: string, value: unknown): CodeEntry[] {
  return value === undefined ? [] : [[key, serializeInlineValue(value, [key])]]
}

function renderObject(entries: readonly CodeEntry[], level: number): string {
  if (entries.length === 0) {
    return '{}'
  }

  return [
    '{',
    ...entries.map(([key, source]) => `${indent(level + 1)}${propertyKey(key)}: ${source},`),
    `${indent(level)}}`,
  ].join('\n')
}

function renderArray(items: readonly string[], level: number): string {
  if (items.length === 0) {
    return '[]'
  }

  return ['[', ...items.map((item) => `${indent(level + 1)}${item},`), `${indent(level)}]`].join(
    '\n',
  )
}

function stringLiteral(value: string): string {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')}'`
}

function propertyKey(key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return key
  }

  return stringLiteral(key)
}

function filenameBase(value: string): string {
  const baseName = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return baseName.length === 0 ? 'scenario' : baseName
}

function indent(level: number): string {
  return '  '.repeat(level)
}

function throwCodeExportError(
  message: string,
  path: readonly (string | number)[],
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new CodeExportError(exportIssue(message, path, details))
}

function exportIssue(
  message: string,
  path: readonly (string | number)[],
  details: Readonly<Record<string, unknown>> = {},
): ExtensionIssue {
  return {
    code: 'export_error',
    message,
    path,
    details,
  }
}

function readProperty(input: unknown, property: string): unknown {
  if (!isRecord(input)) {
    return undefined
  }

  return input[property]
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
