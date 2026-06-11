import { actorbleError } from '../../shared/index.js'
import type {
  DomPort,
  FocusOptions,
  HitTestOptions,
  Point,
  Rect,
  ScrollOptions,
  ScrollMetrics,
  TargetDebugInfo,
} from '../../shared/index.js'
export type { HitTestOptions } from '../../shared/index.js'

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

  getParentElement(element: Element): Element | null {
    return element.parentElement
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
      }
    }

    return {
      scrollLeft: target.scrollLeft,
      scrollTop: target.scrollTop,
      scrollWidth: target.scrollWidth,
      scrollHeight: target.scrollHeight,
      clientWidth: target.clientWidth,
      clientHeight: target.clientHeight,
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
    return root.activeElement
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

  scrollTo(target: Element | Window, position: Point, options: ScrollOptions = {}): void {
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
}

export function createDomAdapter(root?: Document | ShadowRoot): DomAdapter {
  return new BrowserDomAdapter(root)
}

type ElementFromPointSource = {
  elementFromPoint?: (x: number, y: number) => Element | null
}

type StyleableElement = Element & {
  style: CSSStyleDeclaration
}

const internalSelectors = [
  '[data-actorble-internal]',
  '[data-actorble-overlay-root]',
  '[data-stuntman-internal]',
  '[data-stuntman-overlay-root]',
].join(',')

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

function isElementNode(node: ParentNode): node is Element {
  return node.nodeType === 1
}

function isShadowRootNode(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node
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

  const text = element.textContent?.replace(/\s+/g, ' ').trim()
  return text || undefined
}
