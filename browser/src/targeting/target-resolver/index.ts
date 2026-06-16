import { ActorbleError, actorbleError, element as elementLocator } from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import type { SpanRecorder } from '../../diagnostics/diagnostics-trace/index.js'
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
} from '../../shared/index.js'

export type TargetCandidate = Readonly<{
  element: Element
  score: number
  reasons: readonly string[]
  order: number
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
  #browserLimitsWarned = false

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
      const pass = createResolutionPass()
      const candidates = this.#resolveCandidates(locator, pass)
      const ambiguity = resolutionAmbiguity(candidates, options.strict === true)
      this.#recordResolutionDiagnostics(locator, candidates, ambiguity, pass)

      if (candidates.length === 0) {
        throw this.#emptyResolveError(locator)
      }

      if (ambiguity === 'strict-multiple-candidates') {
        throw actorbleError(
          'TARGET_AMBIGUOUS',
          `Locator ${describeLocator(locator)} resolved ${candidates.length} targets in strict mode.`,
          {
            details: {
              locator: summarizeLocator(locator),
              count: candidates.length,
              ambiguity,
            },
          },
        )
      }

      const handle = this.#createHandle(candidates[0].element, locator, pass)
      span?.end({ targetId: handle.id, count: candidates.length })
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
      const pass = createResolutionPass()
      const candidates = this.#resolveCandidates(locator, pass)
      this.#recordResolutionDiagnostics(locator, candidates, resolutionAmbiguity(candidates, false), pass)
      const handles = candidates.map((candidate) => this.#createHandle(candidate.element, locator, pass))
      span?.end({ count: handles.length })
      return handles
    } catch (error) {
      const normalized = normalizeError(error, `Unable to resolve all ${describeLocator(locator)}.`)
      span?.error(normalized)
      throw normalized
    }
  }

  async exists(locator: Locator, _options: ResolveOptions = {}): Promise<boolean> {
    const pass = createResolutionPass()
    const candidates = this.#resolveCandidates(locator, pass)
    return candidates.length > 0
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

      if (validity === 'stale' && target.locator !== undefined) {
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

  #resolveCandidates(locator: Locator, pass: ResolutionPass): readonly TargetCandidate[] {
    switch (locator.kind) {
      case 'css':
        return this.#rankElements(
          this.#dom
            .querySelectorAll(locator.selector, locator.root ?? this.#dom.getRoot())
            .filter((candidate) => this.#isElementInScope(candidate)),
          100,
          ['css'],
        )
      case 'element':
        return this.#isElementInScope(locator.element)
          ? this.#rankElements([locator.element], 100, ['element'])
          : []
      case 'role':
        return this.#rankRoleLocator(locator, pass)
      case 'text':
        return this.#rankTextLocator(locator, pass)
      case 'label':
        return this.#rankLabelLocator(locator, pass)
      case 'testId':
        return this.#rankTestIdLocator(locator)
      case 'point':
        return this.#rankPointLocator(locator)
    }
  }

  #rankRoleLocator(
    locator: Extract<Locator, { kind: 'role' }>,
    pass: ResolutionPass,
  ): readonly TargetCandidate[] {
    const candidates: TargetCandidate[] = []

    this.#allElements().forEach((element, order) => {
      if (locator.includeHidden !== true && this.#isHidden(element, pass)) {
        return
      }

      const debug = this.#describeElement(element, pass)
      if (debug.role !== locator.role) {
        return
      }

      let nameMatch: TextMatch | undefined
      if (locator.name !== undefined) {
        const match = matchText(debug.name ?? '', locator.name, locator.exact === true)

        if (match === null) {
          return
        }

        nameMatch = match
      }

      const nameScore = nameMatch === undefined ? 0 : roleNameScore(nameMatch.kind)
      candidates.push({
        element,
        score: 80 + nameScore,
        reasons: ['role', ...(nameMatch === undefined ? [] : [`name:${nameMatch.kind}`])],
        order,
      })
    })

    return sortCandidates(candidates)
  }

  #rankTextLocator(
    locator: Extract<Locator, { kind: 'text' }>,
    pass: ResolutionPass,
  ): readonly TargetCandidate[] {
    const candidates = this.#allElements().flatMap((element, order): readonly TargetCandidate[] => {
      if (this.#isHidden(element, pass)) {
        return []
      }

      const match = matchText(this.#dom.getTextContent(element), locator.value, locator.exact === true)

      if (match === null) {
        return []
      }

      return [
        {
          element,
          score: textScore(match.kind),
          reasons: [`text:${match.kind}`],
          order,
        },
      ]
    })

    return sortCandidates(this.#withoutAncestorMatches(candidates))
  }

  #rankLabelLocator(
    locator: Extract<Locator, { kind: 'label' }>,
    pass: ResolutionPass,
  ): readonly TargetCandidate[] {
    const candidates: TargetCandidate[] = []
    const labels = this.#dom
      .querySelectorAll('label', this.#dom.getRoot())
      .filter((labelElement) => this.#isElementInScope(labelElement) && !this.#isHidden(labelElement, pass))

    labels.forEach((labelElement, order) => {
      const match = matchText(this.#dom.getTextContent(labelElement), locator.value, locator.exact === true)

      if (match === null) {
        return
      }

      for (const control of this.#associatedLabelControls(labelElement)) {
        if (this.#isElementInScope(control) && !this.#isHidden(control, pass)) {
          candidates.push({
            element: control,
            score: labelScore(match.kind),
            reasons: ['label', `label:${match.kind}`],
            order,
          })
        }
      }
    })

    this.#allLabelableControls().forEach((element, order) => {
      if (this.#isHidden(element, pass)) {
        return
      }

      const match = matchText(this.#describeElement(element, pass).name ?? '', locator.value, locator.exact === true)

      if (match === null) {
        return
      }

      candidates.push({
        element,
        score: accessibleLabelScore(match.kind),
        reasons: ['accessible-name', `label:${match.kind}`],
        order: labels.length + order,
      })
    })

    return sortCandidates(dedupeCandidates(candidates))
  }

  #rankTestIdLocator(locator: Extract<Locator, { kind: 'testId' }>): readonly TargetCandidate[] {
    const attribute = locator.attribute ?? 'data-testid'
    const selector = `[${attribute}="${escapeCssString(locator.value)}"]`

    return this.#rankElements(
      this.#dom
        .querySelectorAll(selector, this.#dom.getRoot())
        .filter((candidate) => this.#isElementInScope(candidate)),
      100,
      ['testId', `attribute:${attribute}`],
    )
  }

  #rankPointLocator(locator: Extract<Locator, { kind: 'point' }>): readonly TargetCandidate[] {
    if (locator.coordinateSpace !== undefined && locator.coordinateSpace !== 'viewport') {
      throw actorbleError(
        'PLATFORM_UNSUPPORTED',
        `Point locator coordinate space "${locator.coordinateSpace}" must be mapped before target resolution.`,
        {
          details: { locator: summarizeLocator(locator) },
        },
      )
    }

    const element = this.#dom.elementFromPoint(locator.point, { ignoreActorbleInternal: true })

    if (element === null || !this.#isElementInScope(element)) {
      return []
    }

    return this.#rankElements([element], 100, ['point'])
  }

  #rankElements(
    elements: readonly Element[],
    score: number,
    reasons: readonly string[],
  ): readonly TargetCandidate[] {
    return sortCandidates(
      elements.map((element, order) => ({
        element,
        score,
        reasons,
        order,
      })),
    )
  }

  #allElements(): readonly Element[] {
    return this.#dom
      .querySelectorAll('*', this.#dom.getRoot())
      .filter((candidate) => this.#isElementInScope(candidate))
  }

  #allLabelableControls(): readonly Element[] {
    return this.#dom
      .querySelectorAll(labelableSelector, this.#dom.getRoot())
      .filter((candidate) => this.#isElementInScope(candidate))
  }

  #associatedLabelControls(labelElement: Element): readonly Element[] {
    const forId = this.#dom.getAttribute(labelElement, 'for')

    if (forId) {
      return this.#dom.querySelectorAll(`[id="${escapeCssString(forId)}"]`, this.#dom.getRoot()).slice(0, 1)
    }

    return this.#dom.querySelectorAll(labelableSelector, labelElement).slice(0, 1)
  }

  #withoutAncestorMatches(candidates: readonly TargetCandidate[]): readonly TargetCandidate[] {
    return candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) => other.element !== candidate.element && this.#dom.contains(candidate.element, other.element),
        ),
    )
  }

  #isHidden(element: Element, pass: ResolutionPass): boolean {
    const cached = pass.hiddenByElement.get(element)
    if (cached !== undefined) {
      return cached
    }

    const inspected: Element[] = []
    let current: Element | null = element

    while (current) {
      const cachedCurrent = pass.hiddenByElement.get(current)
      if (cachedCurrent !== undefined) {
        cacheHidden(inspected, cachedCurrent, pass)
        return cachedCurrent
      }

      inspected.push(current)
      const debug = this.#describeElement(current, pass)
      const attributes = debug.attributes ?? {}

      if ('hidden' in attributes || attributes['aria-hidden'] === 'true') {
        cacheHidden(inspected, true, pass)
        return true
      }

      const style = this.#getComputedStyle(current, pass)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
        cacheHidden(inspected, true, pass)
        return true
      }

      current = this.#dom.getParentElement(current)
    }

    cacheHidden(inspected, false, pass)
    return false
  }

  #describeElement(element: Element, pass: ResolutionPass): TargetDebugInfo {
    const cached = pass.debugByElement.get(element)
    if (cached !== undefined) {
      return cached
    }

    const debug = this.#dom.describeElement(element)
    pass.debugByElement.set(element, debug)
    return debug
  }

  #getComputedStyle(element: Element, pass: ResolutionPass): CSSStyleDeclaration {
    const cached = pass.styleByElement.get(element)
    if (cached !== undefined) {
      return cached
    }

    const style = this.#dom.getComputedStyle(element)
    pass.styleByElement.set(element, style)
    return style
  }

  #recordResolutionDiagnostics(
    locator: Locator,
    candidates: readonly TargetCandidate[],
    ambiguity: ResolutionAmbiguity,
    pass: ResolutionPass,
  ): void {
    this.#trace?.attachSnapshot('target.resolve.candidates', {
      locator: summarizeLocator(locator),
      rankingPolicy,
      ambiguity,
      candidates: this.#snapshotCandidates(candidates, pass),
    })

    this.#warnBrowserFidelityLimits()
  }

  #warnBrowserFidelityLimits(): void {
    if (this.#trace === undefined || this.#browserLimitsWarned) {
      return
    }

    this.#browserLimitsWarned = true
    this.#trace.warn('Browser resolver cannot inspect cross-origin frames or closed shadow roots.', {
      unsupported: ['cross-origin-frame', 'closed-shadow-root'],
    })
    this.#trace.warn(
      'Browser actions dispatch synthetic events; native drag/drop fidelity is unavailable.',
      {
        trustedEvents: false,
        dragAndDrop: 'pointer-gesture',
        nativeDnD: false,
        unsupported: [
          'html5-dnd',
          'native-dnd',
          'editor-selection-drag',
          'custom-dnd-adapter',
        ],
      },
    )
  }

  #createHandle(element: Element, locator: Locator | undefined, pass: ResolutionPass): TargetHandle {
    return {
      id: `${this.#idPrefix}-${this.#nextTargetId++}`,
      element,
      ...(locator === undefined ? {} : { locator }),
      resolvedAt: this.#clock.now(),
      root: this.#dom.getRoot(),
      validity: 'live',
      debug: this.#describeElement(element, pass),
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
      return target.locator !== undefined && target.locator.kind !== 'element' ? 'stale' : 'detached'
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

  #snapshotCandidates(
    candidates: readonly TargetCandidate[],
    pass: ResolutionPass,
  ): readonly TargetCandidateSnapshot[] {
    return candidates.map((candidate, index) => ({
      index,
      score: candidate.score,
      reasons: candidate.reasons,
      debug: this.#describeElement(candidate.element, pass),
    }))
  }
}

export function createTargetResolver(options: TargetResolverOptions = {}): TargetResolver {
  return new BrowserTargetResolver(options)
}

type ResolutionAmbiguity = 'no-candidates' | 'single-best' | 'strict-multiple-candidates'

type TextMatch = Readonly<{
  kind: 'exact' | 'regex' | 'partial'
}>

type TargetCandidateSnapshot = Readonly<{
  index: number
  score: number
  reasons: readonly string[]
  debug: TargetDebugInfo
}>

type ResolutionPass = Readonly<{
  debugByElement: WeakMap<Element, TargetDebugInfo>
  styleByElement: WeakMap<Element, CSSStyleDeclaration>
  hiddenByElement: WeakMap<Element, boolean>
}>

const rankingPolicy = 'score-desc-dom-order'
const labelableSelector = 'button,input,meter,output,progress,select,textarea'

function createResolutionPass(): ResolutionPass {
  return {
    debugByElement: new WeakMap(),
    styleByElement: new WeakMap(),
    hiddenByElement: new WeakMap(),
  }
}

function cacheHidden(
  elements: readonly Element[],
  value: boolean,
  pass: ResolutionPass,
): void {
  for (const element of elements) {
    pass.hiddenByElement.set(element, value)
  }
}

function resolutionAmbiguity(
  candidates: readonly TargetCandidate[],
  strict: boolean,
): ResolutionAmbiguity {
  if (candidates.length === 0) {
    return 'no-candidates'
  }

  return strict && candidates.length > 1 ? 'strict-multiple-candidates' : 'single-best'
}

function sortCandidates(candidates: readonly TargetCandidate[]): readonly TargetCandidate[] {
  return [...candidates].sort((left, right) => right.score - left.score || left.order - right.order)
}

function dedupeCandidates(candidates: readonly TargetCandidate[]): readonly TargetCandidate[] {
  const bestByElement = new Map<Element, TargetCandidate>()

  for (const candidate of candidates) {
    const current = bestByElement.get(candidate.element)

    if (
      current === undefined ||
      candidate.score > current.score ||
      (candidate.score === current.score && candidate.order < current.order)
    ) {
      bestByElement.set(candidate.element, candidate)
    }
  }

  return Array.from(bestByElement.values())
}

function matchText(
  actualValue: string,
  expectedValue: string | RegExp,
  exact: boolean,
): TextMatch | null {
  const actual = normalizeWhitespace(actualValue)

  if (expectedValue instanceof RegExp) {
    expectedValue.lastIndex = 0
    return expectedValue.test(actual) ? { kind: 'regex' } : null
  }

  const expected = normalizeWhitespace(expectedValue)

  if (actual === expected) {
    return { kind: 'exact' }
  }

  if (!exact && actual.includes(expected)) {
    return { kind: 'partial' }
  }

  return null
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function roleNameScore(kind: TextMatch['kind']): number {
  switch (kind) {
    case 'exact':
      return 20
    case 'regex':
      return 18
    case 'partial':
      return 10
  }
}

function textScore(kind: TextMatch['kind']): number {
  switch (kind) {
    case 'exact':
      return 100
    case 'regex':
      return 95
    case 'partial':
      return 80
  }
}

function labelScore(kind: TextMatch['kind']): number {
  switch (kind) {
    case 'exact':
      return 100
    case 'regex':
      return 95
    case 'partial':
      return 90
  }
}

function accessibleLabelScore(kind: TextMatch['kind']): number {
  return labelScore(kind) - 10
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')
}

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
    case 'role':
      return `role(${JSON.stringify(locator.role)})`
    case 'text':
      return `text(${formatTextMatcher(locator.value)})`
    case 'label':
      return `label(${formatTextMatcher(locator.value)})`
    case 'testId':
      return `testId(${JSON.stringify(locator.value)})`
    case 'point':
      return `point(${locator.point.x}, ${locator.point.y})`
  }
}

function formatTextMatcher(value: string | RegExp): string {
  return value instanceof RegExp ? value.toString() : JSON.stringify(value)
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
