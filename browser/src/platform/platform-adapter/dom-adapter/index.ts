import { actorbleError } from '../../../shared/index.js'
import type {
  ActorbleListener,
  ComputedScrollStyleSnapshot,
  Disposable,
  DomPort,
  FocusOptions,
  HitTestOptions,
  LayoutInvalidationReason,
  Point,
  Rect,
  DomScrollOptions,
  ScrollMetrics,
  TargetDebugInfo,
} from '../../../shared/index.js'
export type { HitTestOptions } from '../../../shared/index.js'

export interface DomAdapter extends DomPort {}

export class BrowserDomAdapter implements DomAdapter {
  constructor(readonly root: Document | ShadowRoot = getGlobalDocument()) {}

  getRoot(): Document | ShadowRoot {
    return this.root
  }

  querySelectorAll(selector: string, root: ParentNode = this.getRoot()): readonly Element[] {
    const direct = Array.from(root.querySelectorAll(selector))
    const shadowMatches = collectOpenShadowRoots(root).flatMap((shadowRoot) =>
      Array.from(shadowRoot.querySelectorAll(selector)),
    )

    return [...direct, ...shadowMatches]
  }

  getBoundingClientRect(element: Element): Rect {
    const rect = element.getBoundingClientRect()

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }
  }

  getComputedStyle(element: Element): CSSStyleDeclaration {
    return getOwnerWindow(element).getComputedStyle(element)
  }

  getViewportRect(root: Document | ShadowRoot = this.getRoot()): Rect {
    const ownerWindow = getOwnerWindowForRoot(root)

    return {
      x: 0,
      y: 0,
      width: ownerWindow.innerWidth,
      height: ownerWindow.innerHeight,
    }
  }

  getViewportScrollTarget(root: Document | ShadowRoot = this.getRoot()): Window {
    return getOwnerWindowForRoot(root)
  }

  getViewportScrollElement(root: Document | ShadowRoot = this.getRoot()): Element {
    return getOwnerDocument(root).documentElement
  }

  getParentElement(element: Element): Element | null {
    if (element.parentElement) {
      return element.parentElement
    }

    const root = element.getRootNode()

    return isOpenShadowRootNode(root) ? root.host : null
  }

  getScrollMetrics(target: Element | Window): ScrollMetrics {
    if (isWindow(target)) {
      const documentElement = target.document.documentElement
      const body = target.document.body

      return {
        scrollLeft: target.scrollX,
        scrollTop: target.scrollY,
        scrollWidth: Math.max(documentElement.scrollWidth, body?.scrollWidth ?? 0),
        scrollHeight: Math.max(documentElement.scrollHeight, body?.scrollHeight ?? 0),
        clientWidth: target.innerWidth,
        clientHeight: target.innerHeight,
        clientLeft: 0,
        clientTop: 0,
      }
    }

    return {
      scrollLeft: target.scrollLeft,
      scrollTop: target.scrollTop,
      scrollWidth: target.scrollWidth,
      scrollHeight: target.scrollHeight,
      clientWidth: target.clientWidth,
      clientHeight: target.clientHeight,
      clientLeft: target.clientLeft,
      clientTop: target.clientTop,
    }
  }

  getComputedScrollStyle(element: Element): ComputedScrollStyleSnapshot {
    const style = getOwnerWindow(element).getComputedStyle(element)

    return {
      overflowX: normalizeAxisOverflow(style.overflowX, style.overflow),
      overflowY: normalizeAxisOverflow(style.overflowY, style.overflow),
      scrollPadding: {
        top: style.scrollPaddingTop,
        right: style.scrollPaddingRight,
        bottom: style.scrollPaddingBottom,
        left: style.scrollPaddingLeft,
      },
      scrollMargin: {
        top: style.scrollMarginTop,
        right: style.scrollMarginRight,
        bottom: style.scrollMarginBottom,
        left: style.scrollMarginLeft,
      },
    }
  }

  elementFromPoint(point: Point, options: HitTestOptions = {}): Element | null {
    const root = this.getRoot()

    if (!options.ignoreActorbleInternal) {
      return readElementFromPoint(root, point)
    }

    const disabled: Array<{ element: StyleableElement; pointerEvents: string }> = []

    try {
      for (;;) {
        const candidate = readElementFromPoint(root, point)
        const internal = findInternalElement(candidate)

        if (!internal) {
          return candidate
        }

        if (disabled.some((entry) => entry.element === internal)) {
          return null
        }

        disabled.push({ element: internal, pointerEvents: internal.style.pointerEvents })
        internal.style.pointerEvents = 'none'
      }
    } finally {
      for (const entry of disabled) {
        entry.element.style.pointerEvents = entry.pointerEvents
      }
    }
  }

  getAttribute(element: Element, name: string): string | null {
    return element.getAttribute(name)
  }

  getTextContent(element: Element): string {
    return element.textContent ?? ''
  }

  getElementValue(element: Element): string | null {
    if (element.matches('input,textarea,select')) {
      return (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
    }

    return null
  }

  getRootTextContent(root: Document | ShadowRoot = this.getRoot()): string {
    if (isDocument(root)) {
      return root.body?.textContent ?? root.documentElement?.textContent ?? ''
    }

    return root.textContent ?? ''
  }

  getCurrentUrl(root: Document | ShadowRoot = this.getRoot()): string {
    return getOwnerWindowForRoot(root).location.href
  }

  contains(root: Node, node: Node): boolean {
    if (root.contains(node)) {
      return true
    }

    let current: Node | null = node

    while (current) {
      if (current === root) {
        return true
      }

      current = parentOrShadowHost(current)
    }

    return false
  }

  isConnected(element: Element): boolean {
    return element.isConnected
  }

  getActiveElement(root: Document | ShadowRoot = this.getRoot()): Element | null {
    let activeElement = root.activeElement

    while (activeElement?.shadowRoot?.mode === 'open' && activeElement.shadowRoot.activeElement) {
      activeElement = activeElement.shadowRoot.activeElement
    }

    return activeElement
  }

  focus(element: HTMLElement | SVGElement, options: FocusOptions = {}): void {
    const focusOptions =
      options.focusVisible === undefined
        ? undefined
        : ({ focusVisible: options.focusVisible } as globalThis.FocusOptions)

    element.focus(focusOptions)
  }

  blur(element: HTMLElement | SVGElement): void {
    element.blur()
  }

  scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void {
    element.scrollIntoView(options)
  }

  scrollTo(target: Element | Window, position: Point, options: DomScrollOptions = {}): void {
    if (isWindow(target)) {
      target.scrollTo({ left: position.x, top: position.y, behavior: options.behavior })
      return
    }

    if (typeof target.scrollTo === 'function') {
      target.scrollTo({ left: position.x, top: position.y, behavior: options.behavior })
      return
    }

    target.scrollLeft = position.x
    target.scrollTop = position.y
  }

  describeElement(element: Element): TargetDebugInfo {
    const attributes = Object.fromEntries(
      Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]),
    )
    const selector = selectorFor(element)

    return {
      description: describeSimple(element),
      selector,
      role: explicitOrImplicitRole(element),
      name: accessibleName(element),
      path: pathFor(element),
      attributes,
    }
  }

  observeLayoutInvalidations(
    listener: ActorbleListener<LayoutInvalidationReason>,
  ): Disposable {
    const root = this.getRoot()
    const ownerWindow = getOwnerWindowForRoot(root)
    const cleanupListeners: Array<() => void> = []
    const mutationObservers: MutationObserver[] = []
    const observedRoots = new Set<Document | ShadowRoot>()
    const MutationObserverCtor = (ownerWindow as MutationObserverOwner).MutationObserver

    const listen = (
      target: EventTarget,
      type: string,
      reason: LayoutInvalidationReason,
      options?: AddEventListenerOptions,
    ) => {
      const handler = (event: Event) => {
        if (isInternalLayoutInvalidationTarget(event.target)) {
          return
        }

        listener(reason)
      }

      target.addEventListener(type, handler, options)
      cleanupListeners.push(() => {
        target.removeEventListener(type, handler, options)
      })
    }

    const discoverOpenRoots = (scope: Document | ShadowRoot) => {
      for (const element of scope.querySelectorAll('*')) {
        if (element.shadowRoot !== null) observeRoot(element.shadowRoot)
      }
    }

    const observeRoot = (observationRoot: Document | ShadowRoot) => {
      if (observedRoots.has(observationRoot)) return
      observedRoots.add(observationRoot)

      listen(observationRoot, 'scroll', 'scroll', { capture: true, passive: true })
      for (const eventName of [
        'animationstart',
        'animationiteration',
        'animationend',
        'transitionrun',
        'transitionstart',
        'transitionend',
        'transitioncancel',
      ]) {
        listen(observationRoot, eventName, 'animation-frame', {
          capture: true,
          passive: true,
        })
      }

      if (typeof MutationObserverCtor === 'function') {
        const observer = new MutationObserverCtor((records) => {
          discoverOpenRoots(observationRoot)
          if (!records.every(isInternalMutationRecord)) listener('mutation')
        })
        observer.observe(observationRoot, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        })
        mutationObservers.push(observer)
      }

      discoverOpenRoots(observationRoot)
    }

    listen(ownerWindow, 'resize', 'resize')
    observeRoot(root)

    return {
      dispose() {
        for (const cleanup of cleanupListeners.splice(0)) {
          cleanup()
        }

        for (const observer of mutationObservers.splice(0)) observer.disconnect()
        observedRoots.clear()
      },
    }
  }

  observeScroll(
    target: Element | Window,
    listener: ActorbleListener<ScrollMetrics>,
  ): Disposable {
    return this.#observeScrollSignal(target, 'scroll', listener)
  }

  observeScrollActivity(
    target: Element | Window,
    listener: ActorbleListener<void>,
  ): Disposable {
    const options: AddEventListenerOptions = { passive: true }
    const handler = () => listener()
    target.addEventListener('scroll', handler, options)
    let disposed = false

    return {
      dispose() {
        if (disposed) return
        disposed = true
        target.removeEventListener('scroll', handler, options)
      },
    }
  }

  observeScrollEnd(
    target: Element | Window,
    listener: ActorbleListener<ScrollMetrics>,
  ): Disposable | null {
    const eventTarget = isWindow(target) ? target.document : target

    if (!('onscrollend' in eventTarget)) {
      return null
    }

    return this.#observeScrollSignal(target, 'scrollend', listener, eventTarget)
  }

  observeUrlChanges(
    listener: ActorbleListener<void>,
    root: Document | ShadowRoot = this.getRoot(),
  ): Disposable {
    return subscribeToUrlChanges(getOwnerWindowForRoot(root), listener)
  }

  #observeScrollSignal(
    target: Element | Window,
    eventName: 'scroll' | 'scrollend',
    listener: ActorbleListener<ScrollMetrics>,
    eventTarget: EventTarget = target,
  ): Disposable {
    const options: AddEventListenerOptions = { passive: true }
    const handler = () => listener(this.getScrollMetrics(target))
    let disposed = false

    eventTarget.addEventListener(eventName, handler, options)

    return {
      dispose() {
        if (disposed) {
          return
        }

        disposed = true
        eventTarget.removeEventListener(eventName, handler, options)
      },
    }
  }
}

export function createDomAdapter(root?: Document | ShadowRoot): DomAdapter {
  return new BrowserDomAdapter(root)
}

type ElementFromPointSource = {
  elementFromPoint?: (x: number, y: number) => Element | null
}

type MutationObserverOwner = Window & {
  MutationObserver?: typeof MutationObserver
}

type StyleableElement = Element & {
  style: CSSStyleDeclaration
}

type UrlObservationHub = {
  listeners: Set<ActorbleListener<void>>
  originalPushState: History['pushState']
  originalReplaceState: History['replaceState']
  onNavigation: () => void
}

const urlObservationHubs = new WeakMap<Window, UrlObservationHub>()

function subscribeToUrlChanges(
  ownerWindow: Window,
  listener: ActorbleListener<void>,
): Disposable {
  const hub = urlObservationHubs.get(ownerWindow) ?? createUrlObservationHub(ownerWindow)
  hub.listeners.add(listener)
  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      hub.listeners.delete(listener)

      if (hub.listeners.size === 0) {
        ownerWindow.removeEventListener('popstate', hub.onNavigation)
        ownerWindow.removeEventListener('hashchange', hub.onNavigation)
        ownerWindow.history.pushState = hub.originalPushState
        ownerWindow.history.replaceState = hub.originalReplaceState
        urlObservationHubs.delete(ownerWindow)
      }
    },
  }
}

function createUrlObservationHub(ownerWindow: Window): UrlObservationHub {
  const history = ownerWindow.history
  const listeners = new Set<ActorbleListener<void>>()
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  const onNavigation = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // Observation must not change History API behavior.
      }
    }
  }
  const hub = { listeners, originalPushState, originalReplaceState, onNavigation }

  history.pushState = function pushState(...args) {
    originalPushState.apply(this, args)
    onNavigation()
  }
  history.replaceState = function replaceState(...args) {
    originalReplaceState.apply(this, args)
    onNavigation()
  }
  ownerWindow.addEventListener('popstate', onNavigation)
  ownerWindow.addEventListener('hashchange', onNavigation)
  urlObservationHubs.set(ownerWindow, hub)

  return hub
}

const internalSelectors = [
  '[data-actorble-internal]',
  '[data-actorble-overlay-root]',
  '[data-stuntman-internal]',
  '[data-stuntman-overlay-root]',
].join(',')

function isInternalLayoutInvalidationTarget(target: EventTarget | null): boolean {
  return isElementNode(target) && isInternalElement(target)
}

function isInternalMutationRecord(record: MutationRecord): boolean {
  if (isInternalMutationTarget(record.target)) {
    return true
  }

  if (record.type !== 'childList') {
    return false
  }

  const changedNodes = [...record.addedNodes, ...record.removedNodes]

  return changedNodes.length > 0 && changedNodes.every(isInternalMutationTarget)
}

function isInternalMutationTarget(target: Node): boolean {
  return isElementNode(target) ? isInternalElement(target) : hasInternalParent(target)
}

function isInternalElement(element: Element): boolean {
  return element.closest(internalSelectors) !== null
}

function hasInternalParent(node: Node): boolean {
  const parent = node.parentNode

  return isElementNode(parent) && isInternalElement(parent)
}

function getGlobalDocument(): Document {
  if (globalThis.document) {
    return globalThis.document
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'No global document is available.')
}

function isDocument(root: Document | ShadowRoot): root is Document {
  return root.nodeType === 9
}

function getOwnerDocument(root: Document | ShadowRoot): Document {
  return isDocument(root) ? root : root.ownerDocument
}

function getOwnerWindowForRoot(root: Document | ShadowRoot): Window {
  const ownerWindow = getOwnerDocument(root).defaultView ?? globalThis.window

  if (!ownerWindow) {
    throw actorbleError('PLATFORM_UNSUPPORTED', 'No window is available for the root.')
  }

  return ownerWindow
}

function getOwnerWindow(element: Element): Window {
  return element.ownerDocument.defaultView ?? globalThis.window
}

function readElementFromPoint(root: Document | ShadowRoot, point: Point): Element | null {
  const source =
    typeof (root as ElementFromPointSource).elementFromPoint === 'function'
      ? (root as ElementFromPointSource)
      : (getOwnerDocument(root) as ElementFromPointSource)

  if (typeof source.elementFromPoint !== 'function') {
    return null
  }

  return source.elementFromPoint(point.x, point.y)
}

function collectOpenShadowRoots(root: ParentNode): readonly ShadowRoot[] {
  const descendants = Array.from(root.querySelectorAll('*'))
  const elements = isElementNode(root) ? [root, ...descendants] : descendants
  const shadowRoots: ShadowRoot[] = []

  for (const element of elements) {
    if (element.shadowRoot) {
      shadowRoots.push(element.shadowRoot)
      shadowRoots.push(...collectOpenShadowRoots(element.shadowRoot))
    }
  }

  return shadowRoots
}

function parentOrShadowHost(node: Node): Node | null {
  if (node.parentNode) {
    return node.parentNode
  }

  const root = node.getRootNode()

  return isShadowRootNode(root) ? root.host : null
}

function isElementNode(node: unknown): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as Node).nodeType === 1 &&
    typeof (node as Element).closest === 'function'
  )
}

function isShadowRootNode(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node
}

function isOpenShadowRootNode(node: Node): node is ShadowRoot {
  return isShadowRootNode(node) && node.mode === 'open'
}

function findInternalElement(element: Element | null): StyleableElement | null {
  const internal = element?.closest(internalSelectors)

  if (internal && hasStyle(internal)) {
    return internal
  }

  return null
}

function hasStyle(element: Element): element is StyleableElement {
  return 'style' in element
}

function isWindow(target: Element | Window): target is Window {
  return (target as Window).window === target
}

function normalizeAxisOverflow(axisOverflow: string, shorthandOverflow: string): string {
  if (axisOverflow === 'visible' && allowsScrolling(shorthandOverflow)) {
    return shorthandOverflow
  }

  return axisOverflow || shorthandOverflow
}

function allowsScrolling(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay'
}

function selectorFor(element: Element): string | undefined {
  if (element.id) {
    return `#${escapeCssIdentifier(element.id)}`
  }

  return pathFor(element).join(' > ')
}

function pathFor(element: Element): readonly string[] {
  const path: string[] = []
  let current: Element | null = element

  while (current) {
    path.unshift(describeSimple(current))
    current = current.parentElement
  }

  return path
}

function describeSimple(element: Element): string {
  const tagName = element.tagName.toLowerCase()
  const id = element.id ? `#${escapeCssIdentifier(element.id)}` : ''
  const classes = Array.from(element.classList, escapeCssIdentifier)
    .map((className) => `.${className}`)
    .join('')

  return `${tagName}${id}${classes}`
}

function escapeCssIdentifier(value: string): string {
  const css = globalThis.CSS

  if (css?.escape) {
    return css.escape(value)
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)
}

function explicitOrImplicitRole(element: Element): string | undefined {
  const explicitRole = element.getAttribute('role')

  if (explicitRole) {
    return explicitRole
  }

  const tagName = element.tagName.toLowerCase()

  if (tagName === 'button') {
    return 'button'
  }

  if (tagName === 'a' && element.hasAttribute('href')) {
    return 'link'
  }

  if (tagName === 'textarea') {
    return 'textbox'
  }

  if (tagName === 'select') {
    return 'combobox'
  }

  if (tagName === 'input') {
    return implicitInputRole(element as HTMLInputElement)
  }

  return undefined
}

function implicitInputRole(element: HTMLInputElement): string | undefined {
  switch (element.type) {
    case 'button':
    case 'reset':
    case 'submit':
      return 'button'
    case 'checkbox':
      return 'checkbox'
    case 'radio':
      return 'radio'
    case 'range':
      return 'slider'
    case 'search':
      return 'searchbox'
    case 'email':
    case 'password':
    case 'tel':
    case 'text':
    case 'url':
      return 'textbox'
    default:
      return undefined
  }
}

function accessibleName(element: Element): string | undefined {
  const ariaLabel = element.getAttribute('aria-label')?.trim()

  if (ariaLabel) {
    return ariaLabel
  }

  const labelledBy = element.getAttribute('aria-labelledby')?.trim()
  const labelledByName = labelledBy
    ?.split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value))
    .join(' ')

  if (labelledByName) {
    return labelledByName
  }

  const nativeLabelName = associatedLabelName(element)

  if (nativeLabelName) {
    return nativeLabelName
  }

  const text = element.textContent?.replace(/\s+/g, ' ').trim()
  return text || undefined
}

const labelableSelector = 'button,input,meter,output,progress,select,textarea'

function associatedLabelName(element: Element): string | undefined {
  if (!element.matches(labelableSelector)) {
    return undefined
  }

  const root = element.getRootNode()
  const labels = new Set<Element>()

  if (element.id && isQueryableRoot(root)) {
    for (const label of Array.from(root.querySelectorAll('label'))) {
      if (label.getAttribute('for') === element.id) {
        labels.add(label)
      }
    }
  }

  const nestedLabel = element.closest('label')

  if (nestedLabel) {
    labels.add(nestedLabel)
  }

  const text = Array.from(labels)
    .filter((label) => !isHiddenForAccessibleName(label))
    .map((label) => normalizeAccessibleText(label.textContent ?? ''))
    .filter(Boolean)
    .join(' ')

  return text || undefined
}

function normalizeAccessibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isQueryableRoot(root: Node): root is Document | ShadowRoot {
  return typeof (root as ParentNode).querySelectorAll === 'function'
}

function isHiddenForAccessibleName(element: Element): boolean {
  let current: Element | null = element

  while (current) {
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') {
      return true
    }

    const style = getOwnerWindow(current).getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      return true
    }

    current = current.parentElement
  }

  return false
}
