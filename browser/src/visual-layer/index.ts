import { actorbleError } from '../shared/index.js'
import type {
  Point,
  Rect,
  TargetHandle,
  VisualTextVisibility,
} from '../shared/index.js'

export type VisualLayerOptions = Readonly<{
  enabled?: boolean
  root?: Document | ShadowRoot
}>

export type HighlightRequest = Readonly<{
  target: TargetHandle
  rect?: Rect
}>

export type FocusVisualRequest = Readonly<{
  target: TargetHandle | null
  active: boolean
}>

export type TypingVisualRequest = Readonly<{
  target: TargetHandle
  active: boolean
}>

export type KeystrokeVisualRequest = Readonly<{
  target?: TargetHandle
  text: string
  textVisibility?: VisualTextVisibility
}>

export interface VisualLayer {
  showCursor(point: Point): void
  highlightTarget(request: HighlightRequest): void
  showClick(point: Point): void
  showFocus(request: FocusVisualRequest): void
  showTyping(request: TypingVisualRequest): void
  showKeystroke(request: KeystrokeVisualRequest): void
  clearFeedback(): void
  hide(): void
  destroy(): void
}

export class BrowserVisualLayer implements VisualLayer {
  #rootElement: HTMLElement | null = null
  readonly #parts = new Map<string, HTMLElement>()

  constructor(readonly options: VisualLayerOptions = {}) {}

  showCursor(point: Point): void {
    if (!this.#enabled) {
      return
    }

    const cursor = this.#ensurePart('cursor', 'data-actorble-visual-cursor')
    Object.assign(cursor.style, {
      border: '1px solid CanvasText',
      borderRadius: '999px',
      height: '10px',
      left: `${point.x}px`,
      top: `${point.y}px`,
      transform: 'translate(-50%, -50%)',
      width: '10px',
    })
  }

  highlightTarget(request: HighlightRequest): void {
    if (!this.#enabled) {
      return
    }

    const rect = request.rect ?? rectFromElement(request.target.element)
    const highlight = this.#ensurePart('highlight', 'data-actorble-visual-highlight')
    Object.assign(highlight.style, {
      border: '2px solid Highlight',
      borderRadius: '4px',
      boxSizing: 'border-box',
      height: `${rect.height}px`,
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
    })
  }

  showClick(point: Point): void {
    if (!this.#enabled) {
      return
    }

    const click = this.#ensurePart('click', 'data-actorble-visual-click')
    Object.assign(click.style, {
      border: '2px solid Highlight',
      borderRadius: '999px',
      height: '18px',
      left: `${point.x}px`,
      top: `${point.y}px`,
      transform: 'translate(-50%, -50%)',
      width: '18px',
    })
  }

  showFocus(_request: FocusVisualRequest): void {}

  showTyping(_request: TypingVisualRequest): void {}

  showKeystroke(_request: KeystrokeVisualRequest): void {}

  clearFeedback(): void {}

  hide(): void {
    if (this.#rootElement) {
      this.#rootElement.hidden = true
    }
  }

  destroy(): void {
    this.#rootElement?.remove()
    this.#rootElement = null
    this.#parts.clear()
  }

  get #enabled(): boolean {
    return this.options.enabled !== false
  }

  #ensureRoot(): HTMLElement {
    if (this.#rootElement?.isConnected) {
      this.#rootElement.hidden = false
      return this.#rootElement
    }

    const root = this.options.root ?? getGlobalDocument()
    const ownerDocument = getOwnerDocument(root)
    const overlayRoot = ownerDocument.createElement('div')

    overlayRoot.setAttribute('data-actorble-overlay-root', '')
    overlayRoot.setAttribute('data-actorble-internal', '')
    Object.assign(overlayRoot.style, {
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      position: 'fixed',
      zIndex: '2147483647',
    })

    getOverlayContainer(root).append(overlayRoot)
    this.#rootElement = overlayRoot

    return overlayRoot
  }

  #ensurePart(key: string, attribute: string): HTMLElement {
    const root = this.#ensureRoot()
    const existing = this.#parts.get(key)

    if (existing?.isConnected) {
      root.hidden = false
      return existing
    }

    const part = root.ownerDocument.createElement('div')
    part.setAttribute(attribute, '')
    part.setAttribute('data-actorble-internal', '')
    Object.assign(part.style, {
      pointerEvents: 'none',
      position: 'absolute',
    })
    root.append(part)
    this.#parts.set(key, part)

    return part
  }
}

export class NoopVisualLayer implements VisualLayer {
  showCursor(_point: Point): void {}

  highlightTarget(_request: HighlightRequest): void {}

  showClick(_point: Point): void {}

  showFocus(_request: FocusVisualRequest): void {}

  showTyping(_request: TypingVisualRequest): void {}

  showKeystroke(_request: KeystrokeVisualRequest): void {}

  clearFeedback(): void {}

  hide(): void {}

  destroy(): void {}
}

export function createVisualLayer(options: VisualLayerOptions = {}): VisualLayer {
  return new BrowserVisualLayer(options)
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

function getOverlayContainer(root: Document | ShadowRoot): ParentNode & Node {
  if (!isDocument(root)) {
    return root
  }

  return root.body ?? root.documentElement
}

function rectFromElement(element: Element): Rect {
  const rect = element.getBoundingClientRect()

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}
