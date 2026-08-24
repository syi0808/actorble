import type {
  CapabilityReport as BrowserRuntimeCapabilityReport,
  Locator as BrowserRuntimeLocator,
  RunOptions as BrowserRunOptions,
  Scenario as BrowserRuntimeScenario,
  ScenarioStep as BrowserRuntimeScenarioStep,
  ScrollPosition as BrowserRuntimeScrollPosition,
  TextSelectionTarget as BrowserRuntimeTextSelectionTarget,
  WaitCondition as BrowserRuntimeWaitCondition,
} from '@actorble/browser';
import { createCapabilityFidelityReporter } from '@actorble/browser';
import {
  failure,
  ok,
  type ExtensionIssue,
  type ExtensionIssuePath,
  type ExtensionResult,
} from '../shared/result.js';
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
  type ScenarioLocator,
  type ScenarioPlatformExtensions,
  type ScenarioScrollVector,
  type ScenarioStep,
  type ScenarioTarget,
  type ScenarioTargetGroup,
  type ScenarioTextMatcher,
  type ScenarioTextSelectionTarget,
  type ScenarioWaitCondition,
} from './types.js';

export type BrowserRuntimeRunOptions = Omit<BrowserRunOptions, 'signal'>;

export type BrowserRuntimeCompilation = Readonly<{
  scenario: BrowserRuntimeScenario;
  runOptions?: BrowserRuntimeRunOptions;
}>;

export type BrowserRuntimeCompileResult = ExtensionResult<BrowserRuntimeCompilation>;

export type BrowserRuntimeLocatorCompileResult = ExtensionResult<BrowserRuntimeLocator>;

export type BrowserRuntimeCompileContext = Readonly<{
  capabilities?: Partial<BrowserRuntimeCapabilityReport>;
}>;

type ResolvedBrowserRuntimeCompileContext = Readonly<{
  capabilities: BrowserRuntimeCapabilityReport;
}>;

const ACTORBLE_BROWSER_PLATFORM_KEY = 'actorble.browser';
const DEFAULT_BROWSER_RUNTIME_CAPABILITIES = createCapabilityFidelityReporter().getCapabilities();
const supportedTextSelectionCapabilities = [
  'selection-api',
  'pointer-gesture',
  'editor-adapter',
  'native',
] as const;

export function compileScenarioLocatorToBrowserRuntime(
  locator: ScenarioLocator,
  path: ExtensionIssuePath = [],
): BrowserRuntimeLocatorCompileResult {
  const issues: ExtensionIssue[] = [];
  const compiled = compileLocator(locator, path, issues);

  return compiled === null || issues.length > 0 ? failure(issues) : ok(compiled);
}

export function compileToBrowserRuntime(
  document: ScenarioDocument,
  context: BrowserRuntimeCompileContext = {},
): BrowserRuntimeCompileResult {
  const schemaVersion = readProperty(document, 'schemaVersion');

  if (schemaVersion !== DRAFT_SCENARIO_SCHEMA_VERSION) {
    return failure({
      code: 'unsupported_schema_version',
      message: `Unsupported scenario schema version "${String(schemaVersion)}".`,
      path: ['schemaVersion'],
      details: {
        schemaVersion,
        supportedSchemaVersions: [DRAFT_SCENARIO_SCHEMA_VERSION],
      },
    });
  }

  const issues: ExtensionIssue[] = [];
  rejectPlatformExtensions(document.platform, ['platform'], issues);
  const resolvedContext = resolveCompileContext(context);

  const steps = document.steps
    .map((step, index) => compileStep(step, index, issues, resolvedContext))
    .filter((step): step is BrowserRuntimeScenarioStep => step !== null);

  if (issues.length > 0) {
    return failure(issues);
  }

  const scenario: BrowserRuntimeScenario = {
    ...(document.id === undefined ? {} : { id: document.id }),
    ...(document.name === undefined ? {} : { name: document.name }),
    steps,
  };
  const runOptions = compileRunOptions(document);

  return ok({
    scenario,
    ...(runOptions === undefined ? {} : { runOptions }),
  });
}

const clickOptionKeys = [
  'timeout',
  'duration',
  'motion',
  'button',
  'clickCount',
  'force',
  'pressDwell',
] as const;
const moveOptionKeys = ['timeout', 'duration', 'motion'] as const;
const clickCurrentOptionKeys = [
  'timeout',
  'duration',
  'motion',
  'button',
  'clickCount',
  'pressDwell',
] as const;
const focusOptionKeys = ['timeout', 'focusVisible'] as const;
const typeOptionKeys = [
  'timeout',
  'delay',
  'focusStrategy',
  'focusClick',
  'afterFocusDelay',
] as const;
const fillOptionKeys = ['timeout', 'clear'] as const;
const pressOptionKeys = ['timeout', 'delay'] as const;
const revealOptionKeys = [
  'timeout',
  'visibility',
  'block',
  'inline',
  'container',
  'safeArea',
  'offset',
  'motion',
  'settle',
] as const;
const scrollOptionKeys = ['timeout', 'motion', 'settle'] as const;
const dragOptionKeys = ['timeout', 'duration', 'motion', 'force'] as const;
const selectTextOptionKeys = ['timeout', 'duration', 'motion'] as const;
const waitOptionKeys = ['timeout'] as const;

type BrowserRuntimeStepOptions = Readonly<Record<string, unknown>>;
type BrowserRuntimeTextMatcher = Readonly<{
  value: string | RegExp;
  exact?: boolean;
}>;

function compileRunOptions(document: ScenarioDocument): BrowserRuntimeRunOptions | undefined {
  const timeout = document.defaults?.timeout;
  const betweenSteps = document.defaults?.pacing?.betweenSteps;

  if (timeout === undefined && betweenSteps === undefined) {
    return undefined;
  }

  return {
    ...(timeout === undefined ? {} : { timeout }),
    ...(betweenSteps === undefined
      ? {}
      : {
          pacing: {
            betweenSteps,
          },
        }),
  };
}

function compileStep(
  step: ScenarioStep,
  index: number,
  issues: ExtensionIssue[],
  context: ResolvedBrowserRuntimeCompileContext,
): BrowserRuntimeScenarioStep | null {
  const path: ExtensionIssuePath = ['steps', index];

  rejectPlatformExtensions(step.platform, [...path, 'platform'], issues);

  switch (step.action) {
    case 'click': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        clickOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            ...optionsProperty(options),
          });
    }
    case 'moveTo': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        moveOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            ...optionsProperty(options),
          });
    }
    case 'clickCurrent': {
      const options = compileOptions(
        step.options,
        clickCurrentOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return asRuntimeStep({
        ...stepIdentity(step),
        action: step.action,
        ...optionsProperty(options),
      });
    }
    case 'doubleClick': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        clickOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            ...optionsProperty(options),
          });
    }
    case 'focus': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        focusOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            ...optionsProperty(options),
          });
    }
    case 'type': {
      const options = compileOptions(
        step.options,
        typeOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return asRuntimeStep({
        ...stepIdentity(step),
        action: step.action,
        input: step.input,
        ...optionsProperty(options),
      });
    }
    case 'typeInto': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        typeOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            input: step.input,
            ...optionsProperty(options),
          });
    }
    case 'fill': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        fillOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            input: step.input,
            ...optionsProperty(options),
          });
    }
    case 'press': {
      const options = compileOptions(
        step.options,
        pressOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return asRuntimeStep({
        ...stepIdentity(step),
        action: step.action,
        input: step.input,
        ...optionsProperty(options),
      });
    }
    case 'reveal': {
      const target = compileTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        revealOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            ...optionsProperty(options),
          });
    }
    case 'scrollTo':
    case 'scrollBy': {
      const options = compileOptions(
        step.options,
        scrollOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return asRuntimeStep({
        ...stepIdentity(step),
        action: step.action,
        input: compileScrollVector(step.input),
        ...optionsProperty(options),
      });
    }
    case 'drag': {
      const from = compileTarget(step.from, [...path, 'from'], issues);
      const to = compileTarget(step.to, [...path, 'to'], issues);
      const options = compileOptions(
        step.options,
        dragOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return from === null || to === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            from,
            to,
            ...optionsProperty(options),
          });
    }
    case 'selectText': {
      validateSelectTextCapability([...path], issues, context);
      const target = compileTextSelectionTarget(step.target, [...path, 'target'], issues);
      const options = compileOptions(
        step.options,
        selectTextOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return target === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            target,
            ...optionsProperty(options),
          });
    }
    case 'waitFor': {
      const input = compileWaitCondition(step.input, [...path, 'input'], issues);
      const options = compileOptions(
        step.options,
        waitOptionKeys,
        [...path, 'options'],
        step.action,
        issues,
      );

      return input === null
        ? null
        : asRuntimeStep({
            ...stepIdentity(step),
            action: step.action,
            input,
            ...optionsProperty(options),
          });
    }
    case 'delay':
      return asRuntimeStep({
        ...stepIdentity(step),
        action: step.action,
        duration: step.duration,
        ...(step.reason === undefined ? {} : { reason: step.reason }),
      });
  }

  issues.push(
    compilerIssue(
      `Scenario step action "${String(readProperty(step, 'action'))}" is not supported.`,
      path,
      {
        action: readProperty(step, 'action'),
      },
    ),
  );

  return null;
}

function compileTextSelectionTarget(
  target: ScenarioTextSelectionTarget,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): BrowserRuntimeTextSelectionTarget | null {
  if (isTextSelectionRangeTarget(target)) {
    const anchorTarget = compileTarget(target.anchor.target, [...path, 'anchor', 'target'], issues);
    const focusTarget = compileTarget(target.focus.target, [...path, 'focus', 'target'], issues);

    return anchorTarget === null || focusTarget === null
      ? null
      : {
          anchor: {
            target: anchorTarget,
            offset: target.anchor.offset,
          },
          focus: {
            target: focusTarget,
            offset: target.focus.offset,
          },
        };
  }

  return compileTarget(target, path, issues);
}

function compileTarget(
  target: ScenarioTarget,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): BrowserRuntimeLocator | null {
  if (isTargetGroup(target)) {
    rejectUnsupportedTargetPlatformExtensions(target.platform, [...path, 'platform'], issues);

    // Runtime scenarios currently accept one TargetLike, so target groups use
    // their primary locator until fallback and strict semantics are representable.
    const firstLocator = target.locators[0];

    if (firstLocator === undefined) {
      issues.push(
        compilerIssue('Target group must include at least one locator.', [...path, 'locators'], {
          targetKind: 'target',
        }),
      );
      return null;
    }

    return compileLocator(firstLocator, [...path, 'locators', 0], issues);
  }

  return compileLocator(target, path, issues);
}

function compileLocator(
  locator: ScenarioLocator,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): BrowserRuntimeLocator | null {
  switch (locator.strategy) {
    case 'css':
      return {
        kind: 'css',
        selector: locator.selector,
        ...matchIndexProperty(locator.matchIndex),
      };
    case 'role': {
      const name =
        locator.name === undefined
          ? undefined
          : compileLocatorTextMatcher(locator.name, [...path, 'name'], issues);

      if (name === null) {
        return null;
      }

      return {
        kind: 'role',
        role: locator.role,
        ...(name === undefined ? {} : { name: name.value }),
        ...(name?.exact === undefined ? {} : { exact: name.exact }),
        ...(locator.includeHidden === undefined ? {} : { includeHidden: locator.includeHidden }),
        ...matchIndexProperty(locator.matchIndex),
      };
    }
    case 'text': {
      const value = compileLocatorTextMatcher(locator.text, [...path, 'text'], issues);

      return value === null
        ? null
        : {
            kind: 'text',
            value: value.value,
            ...(value.exact === undefined ? {} : { exact: value.exact }),
            ...matchIndexProperty(locator.matchIndex),
          };
    }
    case 'label': {
      const value = compileLocatorTextMatcher(locator.label, [...path, 'label'], issues);

      return value === null
        ? null
        : {
            kind: 'label',
            value: value.value,
            ...(value.exact === undefined ? {} : { exact: value.exact }),
            ...matchIndexProperty(locator.matchIndex),
          };
    }
    case 'testId':
      return {
        kind: 'testId',
        value: locator.value,
        ...(locator.attribute === undefined ? {} : { attribute: locator.attribute }),
        ...matchIndexProperty(locator.matchIndex),
      };
    case 'point':
      return {
        kind: 'point',
        point: {
          x: locator.point.x,
          y: locator.point.y,
        },
        ...(locator.point.coordinateSpace === undefined
          ? {}
          : { coordinateSpace: locator.point.coordinateSpace }),
      };
  }
}

function compileWaitCondition(
  condition: ScenarioWaitCondition,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): BrowserRuntimeWaitCondition | null {
  switch (condition.kind) {
    case 'visible':
    case 'hidden': {
      const target = compileTarget(condition.target, [...path, 'target'], issues);

      return target === null
        ? null
        : {
            kind: condition.kind,
            target,
          };
    }
    case 'text': {
      const value = compileWaitTextMatcher(condition.value, [...path, 'value'], issues);

      return value === null
        ? null
        : {
            kind: 'text',
            value,
          };
    }
  }
}

function compileScrollVector(point: ScenarioScrollVector): BrowserRuntimeScrollPosition {
  return {
    x: point.x,
    y: point.y,
  };
}

function compileOptions(
  options: Readonly<Record<string, unknown>> | undefined,
  allowedKeys: readonly string[],
  path: ExtensionIssuePath,
  action: string,
  issues: ExtensionIssue[],
): BrowserRuntimeStepOptions | undefined {
  if (options === undefined) {
    return undefined;
  }

  const allowed = new Set<string>(allowedKeys);
  const compiled: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }

    if (!allowed.has(key)) {
      issues.push(
        compilerIssue(
          `Scenario step "${action}" does not support option "${key}".`,
          [...path, key],
          {
            action,
            option: key,
            supportedOptions: allowedKeys,
          },
        ),
      );
      continue;
    }

    compiled[key] = value;
  }

  return Object.keys(compiled).length === 0 ? undefined : compiled;
}

function compileLocatorTextMatcher(
  matcher: ScenarioTextMatcher,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): BrowserRuntimeTextMatcher | null {
  if (typeof matcher === 'string') {
    return { value: matcher };
  }

  const match = matcher.match ?? 'contains';
  const caseSensitive = matcher.caseSensitive !== false;

  if (match === 'regex') {
    const value = compileRegExp(
      matcher.value,
      matcher.caseSensitive === false ? 'i' : '',
      [...path, 'value'],
      issues,
    );
    return value === null ? null : { value };
  }

  if (caseSensitive) {
    return {
      value: matcher.value,
      ...(match === 'exact' ? { exact: true } : {}),
    };
  }

  const source =
    match === 'exact' ? `^${escapeRegExp(matcher.value)}$` : escapeRegExp(matcher.value);
  const value = compileRegExp(source, 'i', [...path, 'value'], issues);

  return value === null ? null : { value };
}

function compileWaitTextMatcher(
  matcher: ScenarioTextMatcher,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): string | RegExp | null {
  if (typeof matcher === 'string') {
    return matcher;
  }

  const match = matcher.match ?? 'contains';

  if (match === 'regex') {
    return compileRegExp(
      matcher.value,
      matcher.caseSensitive === false ? 'i' : '',
      [...path, 'value'],
      issues,
    );
  }

  if (match === 'contains' && matcher.caseSensitive !== false) {
    return matcher.value;
  }

  const source =
    match === 'exact' ? `^${escapeRegExp(matcher.value)}$` : escapeRegExp(matcher.value);
  return compileRegExp(
    source,
    matcher.caseSensitive === false ? 'i' : '',
    [...path, 'value'],
    issues,
  );
}

function compileRegExp(
  source: string,
  flags: string,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    issues.push(
      compilerIssue(`Invalid regular expression "${source}".`, path, {
        pattern: source,
        flags,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

function rejectPlatformExtensions(
  platform: ScenarioPlatformExtensions | undefined,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  rejectUnsupportedPlatformExtensions(platform, path, issues, []);
}

function rejectUnsupportedTargetPlatformExtensions(
  platform: ScenarioPlatformExtensions | undefined,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
): void {
  rejectUnsupportedPlatformExtensions(platform, path, issues, [ACTORBLE_BROWSER_PLATFORM_KEY]);
}

function rejectUnsupportedPlatformExtensions(
  platform: ScenarioPlatformExtensions | undefined,
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
  supportedPlatformExtensions: readonly string[],
): void {
  const extensionKeys = platform === undefined ? [] : Object.keys(platform);
  const unsupportedExtensionKeys = extensionKeys.filter(
    (key) => !supportedPlatformExtensions.includes(key),
  );

  if (unsupportedExtensionKeys.length === 0) {
    return;
  }

  issues.push({
    code: 'unsupported_platform_extension',
    message: `Unsupported scenario platform extension${unsupportedExtensionKeys.length === 1 ? '' : 's'}: ${unsupportedExtensionKeys.join(', ')}.`,
    path,
    details: {
      platformExtensions: unsupportedExtensionKeys,
      supportedPlatformExtensions,
    },
  });
}

function matchIndexProperty(matchIndex: number | undefined): Readonly<{ matchIndex?: number }> {
  return matchIndex === undefined ? {} : { matchIndex };
}

function stepIdentity(step: ScenarioStep): Readonly<{ id?: string }> {
  return step.id === undefined ? {} : { id: step.id };
}

function optionsProperty(
  options: BrowserRuntimeStepOptions | undefined,
): Readonly<{ options?: BrowserRuntimeStepOptions }> {
  return options === undefined ? {} : { options };
}

function resolveCompileContext(
  context: BrowserRuntimeCompileContext,
): ResolvedBrowserRuntimeCompileContext {
  return {
    capabilities: {
      ...DEFAULT_BROWSER_RUNTIME_CAPABILITIES,
      ...context.capabilities,
    },
  };
}

function validateSelectTextCapability(
  path: ExtensionIssuePath,
  issues: ExtensionIssue[],
  context: ResolvedBrowserRuntimeCompileContext,
): void {
  if (context.capabilities.textSelection !== 'none') {
    return;
  }

  issues.push(
    compilerIssue('Runtime text selection capability is not supported.', path, {
      action: 'selectText',
      capability: 'textSelection',
      actual: context.capabilities.textSelection,
      supported: supportedTextSelectionCapabilities,
    }),
  );
}

function isTextSelectionRangeTarget(
  target: ScenarioTextSelectionTarget,
): target is Extract<ScenarioTextSelectionTarget, Readonly<{ anchor: unknown; focus: unknown }>> {
  return 'anchor' in target && 'focus' in target;
}

function asRuntimeStep(step: BrowserRuntimeScenarioStep): BrowserRuntimeScenarioStep {
  return step;
}

function compilerIssue(
  message: string,
  path: ExtensionIssuePath,
  details: Readonly<Record<string, unknown>> = {},
): ExtensionIssue {
  return {
    code: 'compiler_error',
    message,
    path,
    details,
  };
}

function readProperty(input: unknown, property: string): unknown {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }

  return (input as Readonly<Record<string, unknown>>)[property];
}

function isTargetGroup(target: ScenarioTarget): target is ScenarioTargetGroup {
  return 'locators' in target;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
