import { actorbleError, element as elementLocator } from '../shared/index.js'
import { BrowserDomAdapter } from '../platform-adapter/dom-adapter/index.js'
import { BrowserInteractionStateStore } from '../interaction-state-store/index.js'
import type {
  DomPort,
  FocusOptions,
  Locator,
  TargetHandle,
  TargetLike,
} from '../shared/index.js'
import type { InteractionStateStore } from '../interaction-state-store/index.js'

export type FocusSnapshot = Readonly<{
  active: TargetHandle | null
  previous: TargetHandle | null
  focusVisible: boolean
}>

export type FocusEngineOptions = Readonly<{
  dom?: DomPort
  store?: InteractionStateStore
  idPrefix?: string
}>

export interface FocusEngine {
  focus(target: TargetLike, options?: FocusOptions): Promise<FocusSnapshot>
  blur(target?: TargetLike): Promise<FocusSnapshot>
  getFocused(): Promise<FocusSnapshot>
  tab(options?: FocusOptions): Promise<FocusSnapshot>
}

export class BrowserFocusEngine implements FocusEngine {
  readonly #dom: DomPort
  readonly #store: InteractionStateStore
  readonly #idPrefix: string
  #nextTargetId = 1
  #active: TargetHandle | null = null
  #previous: TargetHandle | null = null

  constructor(options: FocusEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#store = options.store ?? new BrowserInteractionStateStore()
    this.#idPrefix = options.idPrefix ?? 'focus-target'
  }

  async focus(target: TargetLike, options: FocusOptions = {}): Promise<FocusSnapshot> {
    const requested = this.#toHandle(target)

    this.#dom.focus(requested.element as HTMLElement | SVGElement, options)

    return this.#syncFromPlatform(requested, options.focusVisible === true)
  }

  async blur(target?: TargetLike): Promise<FocusSnapshot> {
    const requested = target === undefined ? this.#active : this.#toHandle(target)

    if (requested) {
      this.#dom.blur(requested.element as HTMLElement | SVGElement)
    }

    return this.#syncFromPlatform(undefined, false)
  }

  async getFocused(): Promise<FocusSnapshot> {
    return this.#syncFromPlatform(undefined, this.#active !== null && this.#store.snapshot().focusVisible)
  }

  async tab(options: FocusOptions = {}): Promise<FocusSnapshot> {
    const candidates = this.#focusableCandidates()

    if (candidates.length === 0) {
      return this.getFocused()
    }

    const activeElement = this.#dom.getActiveElement()
    const activeIndex = activeElement === null ? -1 : candidates.indexOf(activeElement)
    const next = candidates[(activeIndex + 1) % candidates.length]

    return this.focus(next, { ...options, focusVisible: options.focusVisible ?? true })
  }

  #syncFromPlatform(
    preferredTarget: TargetHandle | undefined,
    focusVisible: boolean,
  ): FocusSnapshot {
    const activeElement = this.#dom.getActiveElement()
    const active = this.#handleForActiveElement(activeElement, preferredTarget)
    const changed = !sameTarget(active, this.#active)
    const previous = changed ? this.#active : this.#previous
    const nextFocusVisible = Boolean(active && focusVisible)

    this.#previous = previous
    this.#active = active
    this.#store.setFocused(active, nextFocusVisible)

    return {
      active,
      previous,
      focusVisible: nextFocusVisible,
    }
  }

  #handleForActiveElement(
    activeElement: Element | null,
    preferredTarget: TargetHandle | undefined,
  ): TargetHandle | null {
    if (!activeElement) {
      return null
    }

    if (preferredTarget?.element === activeElement) {
      return preferredTarget
    }

    return {
      id: 'active-element',
      element: activeElement,
      resolvedAt: 0,
      root: this.#dom.getRoot(),
      validity: this.#dom.isConnected(activeElement) ? 'live' : 'detached',
      debug: this.#dom.describeElement(activeElement),
    }
  }

  #toHandle(target: TargetLike): TargetHandle {
    if (isTargetHandle(target)) {
      return target
    }

    if (isLocator(target)) {
      if (target.kind === 'element') {
        return this.#createHandle(target.element, target)
      }

      throw actorbleError(
        'PLATFORM_UNSUPPORTED',
        'Focus Engine requires resolved element targets before orchestration.',
        {
          details: {
            boundary: 'focus-engine',
            targetKind: target.kind,
          },
        },
      )
    }

    return this.#createHandle(target, elementLocator(target))
  }

  #createHandle(element: Element, locator?: Locator): TargetHandle {
    return {
      id: `${this.#idPrefix}-${this.#nextTargetId++}`,
      element,
      ...(locator === undefined ? {} : { locator }),
      resolvedAt: 0,
      root: this.#dom.getRoot(),
      validity: this.#dom.isConnected(element) ? 'live' : 'detached',
      debug: this.#dom.describeElement(element),
    }
  }

  #focusableCandidates(): readonly Element[] {
    return this.#dom
      .querySelectorAll(
        [
          'a[href]',
          'button:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
          '[contenteditable="true"]',
        ].join(','),
      )
      .filter((element) => this.#dom.isConnected(element))
  }
}

export function createFocusEngine(options: FocusEngineOptions = {}): FocusEngine {
  return new BrowserFocusEngine(options)
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

function sameTarget(left: TargetHandle | null, right: TargetHandle | null): boolean {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.element === right.element
}
