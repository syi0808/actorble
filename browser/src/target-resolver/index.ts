import { ActorbleError, actorbleError, element as elementLocator } from '../shared/index.js'
import { BrowserDomAdapter } from '../platform-adapter/dom-adapter/index.js'
import type { SpanRecorder } from '../diagnostics-trace/index.js'
import type {
  Clock,
  DomPort,
  Locator,
  ResolveOptions,
  TargetDebugInfo,
  TargetHandle,
  TargetInspection,
  TargetLike,
  TargetValidity,
} from '../shared/index.js'

export type TargetCandidate = Readonly<{
  element: Element
  score: number
  debug?: string
}>

export interface TargetResolver {
  resolve(locator: Locator, options?: ResolveOptions): Promise<TargetHandle>
  resolveAll(locator: Locator, options?: ResolveOptions): Promise<readonly TargetHandle[]>
  exists(locator: Locator, options?: ResolveOptions): Promise<boolean>
  inspect(target: TargetLike): Promise<TargetInspection>
  validate(target: TargetHandle): Promise<TargetHandle>
}

export type TargetResolverOptions = Readonly<{
  dom?: DomPort
  trace?: SpanRecorder
  clock?: Clock
  idPrefix?: string
}>

const defaultClock: Clock = {
  now() {
    return Date.now()
  },
}

export class BrowserTargetResolver implements TargetResolver {
  readonly #dom: DomPort
  readonly #trace?: SpanRecorder
  readonly #clock: Clock
  readonly #idPrefix: string
  #nextTargetId = 1

  constructor(options: TargetResolverOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#trace = options.trace
    this.#clock = options.clock ?? defaultClock
    this.#idPrefix = options.idPrefix ?? 'target'
  }

  async resolve(locator: Locator, options: ResolveOptions = {}): Promise<TargetHandle> {
    const span = this.#trace?.startSpan('target.resolve', {
      locator: summarizeLocator(locator),
      strict: options.strict === true,
    })

    try {
      const elements = this.#resolveElements(locator)
      this.#trace?.attachSnapshot('target.resolve.candidates', {
        locator: summarizeLocator(locator),
        candidates: this.#snapshotCandidates(elements),
      })

      if (elements.length === 0) {
        throw this.#emptyResolveError(locator)
      }

      if (options.strict === true && elements.length > 1) {
        throw actorbleError(
          'TARGET_AMBIGUOUS',
          `Locator ${describeLocator(locator)} resolved ${elements.length} targets.`,
          {
            details: {
              locator: summarizeLocator(locator),
              count: elements.length,
            },
          },
        )
      }

      const handle = this.#createHandle(elements[0], locator)
      span?.end({ targetId: handle.id, count: elements.length })
      return handle
    } catch (error) {
      const normalized = normalizeError(error, `Unable to resolve ${describeLocator(locator)}.`)
      span?.error(normalized)
      throw normalized
    }
  }

  async resolveAll(
    locator: Locator,
    _options: ResolveOptions = {},
  ): Promise<readonly TargetHandle[]> {
    const span = this.#trace?.startSpan('target.resolveAll', {
      locator: summarizeLocator(locator),
    })

    try {
      const elements = this.#resolveElements(locator)
      const handles = elements.map((candidate) => this.#createHandle(candidate, locator))
      span?.end({ count: handles.length })
      return handles
    } catch (error) {
      const normalized = normalizeError(error, `Unable to resolve all ${describeLocator(locator)}.`)
      span?.error(normalized)
      throw normalized
    }
  }

  async exists(locator: Locator, _options: ResolveOptions = {}): Promise<boolean> {
    const elements = this.#resolveElements(locator)
    return elements.length > 0
  }

  async inspect(target: TargetLike): Promise<TargetInspection> {
    const handle = await this.#toHandle(target)
    const validity = this.#currentValidity(handle)
    const debug = this.#dom.describeElement(handle.element)
    const inspectedTarget: TargetHandle = {
      ...handle,
      validity,
      debug,
    }

    return {
      target: inspectedTarget,
      debug,
      validity,
    }
  }

  async validate(target: TargetHandle): Promise<TargetHandle> {
    const span = this.#trace?.startSpan('target.validate', {
      targetId: target.id,
      locator: target.locator === undefined ? undefined : summarizeLocator(target.locator),
    })

    try {
      const validity = this.#currentValidity(target)

      if (validity === 'live') {
        span?.end({ targetId: target.id, validity })
        return target
      }

      if (validity === 'stale' && target.locator?.kind === 'css') {
        try {
          const recovered = await this.resolve(target.locator)
          span?.end({ targetId: recovered.id, validity: 'live', recovered: true })
          return recovered
        } catch (error) {
          throw actorbleError(
            'TARGET_STALE',
            `Target ${target.id} is stale and could not be re-resolved.`,
            {
              cause: error,
              details: {
                targetId: target.id,
                locator: summarizeLocator(target.locator),
              },
            },
          )
        }
      }

      throw actorbleError(
        validity === 'stale' ? 'TARGET_STALE' : 'TARGET_DETACHED',
        `Target ${target.id} is ${validity}.`,
        {
          details: {
            targetId: target.id,
            locator: target.locator === undefined ? undefined : summarizeLocator(target.locator),
          },
        },
      )
    } catch (error) {
      const normalized = normalizeError(error, `Unable to validate target ${target.id}.`)
      span?.error(normalized)
      throw normalized
    }
  }

  #resolveElements(locator: Locator): readonly Element[] {
    switch (locator.kind) {
      case 'css':
        return this.#dom
          .querySelectorAll(locator.selector, locator.root ?? this.#dom.getRoot())
          .filter((candidate) => this.#isElementInScope(candidate))
      case 'element':
        return this.#isElementInScope(locator.element) ? [locator.element] : []
      default:
        throw actorbleError(
          'PLATFORM_UNSUPPORTED',
          `Locator kind "${locator.kind}" is not supported by the target resolver yet.`,
          {
            details: { locator: summarizeLocator(locator) },
          },
        )
    }
  }

  #createHandle(element: Element, locator?: Locator): TargetHandle {
    return {
      id: `${this.#idPrefix}-${this.#nextTargetId++}`,
      element,
      ...(locator === undefined ? {} : { locator }),
      resolvedAt: this.#clock.now(),
      root: this.#dom.getRoot(),
      validity: 'live',
      debug: this.#dom.describeElement(element),
    }
  }

  #toHandle(target: TargetLike): Promise<TargetHandle> {
    if (isTargetHandle(target)) {
      return Promise.resolve(target)
    }

    if (isLocator(target)) {
      return this.resolve(target)
    }

    return this.resolve(elementLocator(target))
  }

  #currentValidity(target: TargetHandle): TargetValidity {
    if (target.validity === 'detached') {
      return 'detached'
    }

    if (target.validity === 'stale') {
      return 'stale'
    }

    if (!this.#isElementInScope(target.element)) {
      return target.locator?.kind === 'css' ? 'stale' : 'detached'
    }

    return 'live'
  }

  #isElementInScope(element: Element): boolean {
    const root = this.#dom.getRoot()
    return this.#dom.isConnected(element) && this.#dom.contains(root, element)
  }

  #emptyResolveError(locator: Locator): ActorbleError {
    if (locator.kind === 'element') {
      return actorbleError(
        'TARGET_DETACHED',
        'Element target is detached or outside the resolver root.',
        {
          details: { locator: summarizeLocator(locator), count: 0 },
        },
      )
    }

    return actorbleError('TARGET_NOT_FOUND', `No target matched ${describeLocator(locator)}.`, {
      details: { locator: summarizeLocator(locator), count: 0 },
    })
  }

  #snapshotCandidates(elements: readonly Element[]): readonly TargetCandidateSnapshot[] {
    return elements.map((element, index) => ({
      index,
      debug: this.#dom.describeElement(element),
    }))
  }
}

export function createTargetResolver(options: TargetResolverOptions = {}): TargetResolver {
  return new BrowserTargetResolver(options)
}

type TargetCandidateSnapshot = Readonly<{
  index: number
  debug: TargetDebugInfo
}>

function normalizeError(error: unknown, fallbackMessage: string): ActorbleError {
  if (error instanceof ActorbleError) {
    return error
  }

  return actorbleError('PLATFORM_UNSUPPORTED', fallbackMessage, {
    cause: error,
  })
}

function isTargetHandle(target: TargetLike): target is TargetHandle {
  return (
    typeof target === 'object' &&
    target !== null &&
    'id' in target &&
    'element' in target &&
    'resolvedAt' in target &&
    'debug' in target
  )
}

function isLocator(target: TargetLike): target is Locator {
  return typeof target === 'object' && target !== null && 'kind' in target
}

function describeLocator(locator: Locator): string {
  switch (locator.kind) {
    case 'css':
      return `css(${JSON.stringify(locator.selector)})`
    case 'element':
      return 'element()'
    default:
      return `${locator.kind}()`
  }
}

function summarizeLocator(locator: Locator): Readonly<Record<string, unknown>> {
  switch (locator.kind) {
    case 'css':
      return { kind: locator.kind, selector: locator.selector }
    case 'element':
      return { kind: locator.kind }
    case 'role':
      return {
        kind: locator.kind,
        role: locator.role,
        name: locator.name instanceof RegExp ? locator.name.toString() : locator.name,
      }
    case 'text':
    case 'label':
      return {
        kind: locator.kind,
        value: locator.value instanceof RegExp ? locator.value.toString() : locator.value,
      }
    case 'testId':
      return { kind: locator.kind, value: locator.value, attribute: locator.attribute }
    case 'point':
      return {
        kind: locator.kind,
        point: locator.point,
        coordinateSpace: locator.coordinateSpace,
      }
  }
}
