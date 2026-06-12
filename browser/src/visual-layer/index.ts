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
  textVisibility?: VisualTextVisibility
}>

export type HighlightRequest = Readonly<{
  target: TargetHandle
  rect?: Rect
}>

export type CursorVisualKind =
  | 'default'
  | 'pointer'
  | 'text'
  | 'not-allowed'
  | 'wait'
  | 'progress'
  | 'grab'
  | 'grabbing'
  | 'move'
  | 'crosshair'
  | 'custom'

export type CursorVisualRequest = Readonly<{
  point: Point
  cursor?: string
  kind?: CursorVisualKind
  pressed?: boolean
}>

export type CursorVisualInput = Point | CursorVisualRequest

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
  showCursor(request: CursorVisualInput): void
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

  showCursor(input: CursorVisualInput): void {
    if (!this.#enabled) {
      return
    }

    const request = normalizeCursorVisualRequest(input)
    const cursor = this.#ensurePart('cursor', 'data-actorble-visual-cursor')
    cursor.setAttribute('data-actorble-cursor-kind', request.kind)

    if (request.cssCursor) {
      cursor.setAttribute('data-actorble-css-cursor', request.cssCursor)
    } else {
      cursor.removeAttribute('data-actorble-css-cursor')
    }

    if (request.pressed) {
      cursor.setAttribute('data-actorble-cursor-pressed', '')
    } else {
      cursor.removeAttribute('data-actorble-cursor-pressed')
    }

    Object.assign(cursor.style, {
      border: '1px solid CanvasText',
      borderRadius: '999px',
      height: '10px',
      left: `${request.point.x}px`,
      top: `${request.point.y}px`,
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

  showFocus(request: FocusVisualRequest): void {
    if (!this.#enabled) {
      return
    }

    if (!request.active || !request.target) {
      this.#removePart('focus')
      return
    }

    const rect = rectFromElement(request.target.element)
    const focus = this.#ensurePart('focus', 'data-actorble-visual-focus')
    focus.setAttribute('data-actorble-target-id', request.target.id)
    Object.assign(focus.style, {
      border: '2px solid Highlight',
      borderRadius: '4px',
      boxSizing: 'border-box',
      height: `${rect.height}px`,
      left: `${rect.x}px`,
      outline: '1px solid Canvas',
      outlineOffset: '2px',
      top: `${rect.y}px`,
      width: `${rect.width}px`,
    })
  }

  showTyping(request: TypingVisualRequest): void {
    if (!this.#enabled) {
      return
    }

    if (!request.active) {
      this.#removePart('typing')
      return
    }

    const rect = rectFromElement(request.target.element)
    const typing = this.#ensurePart('typing', 'data-actorble-visual-typing')
    typing.setAttribute('data-actorble-target-id', request.target.id)
    typing.textContent = ''
    Object.assign(typing.style, {
      background: 'Highlight',
      border: '1px solid Canvas',
      borderRadius: '999px',
      height: '6px',
      left: `${rect.x + rect.width + 6}px`,
      opacity: '0.9',
      top: `${rect.y + rect.height / 2 - 3}px`,
      width: '18px',
    })
  }

  showKeystroke(request: KeystrokeVisualRequest): void {
    if (!this.#enabled) {
      return
    }

    const visibility =
      request.textVisibility ?? this.options.textVisibility ?? 'plain'
    const keystroke = this.#ensurePart('keystroke', 'data-actorble-visual-keystroke')
    const rect = request.target ? rectFromElement(request.target.element) : null

    if (request.target) {
      keystroke.setAttribute('data-actorble-target-id', request.target.id)
    } else {
      keystroke.removeAttribute('data-actorble-target-id')
    }

    keystroke.setAttribute('data-actorble-text-visibility', visibility)
    keystroke.textContent = displayTextForKeystroke(request, visibility)
    Object.assign(keystroke.style, {
      background: 'Canvas',
      border: '1px solid Highlight',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.22)',
      color: 'CanvasText',
      font: '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      left: `${rect ? rect.x + rect.width / 2 : 12}px`,
      maxWidth: '220px',
      overflow: 'hidden',
      padding: '2px 6px',
      textOverflow: 'ellipsis',
      top: `${rect ? Math.max(0, rect.y - 28) : 12}px`,
      transform: rect ? 'translateX(-50%)' : 'none',
      whiteSpace: 'nowrap',
    })
  }

  clearFeedback(): void {
    this.#removePart('typing')
    this.#removePart('keystroke')
  }

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

  #removePart(key: string): void {
    const part = this.#parts.get(key)

    if (!part) {
      return
    }

    part.remove()
    this.#parts.delete(key)
  }
}

export class NoopVisualLayer implements VisualLayer {
  showCursor(_request: CursorVisualInput): void {}

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

type NormalizedCursorVisualRequest = Readonly<{
  point: Point
  cssCursor?: string
  kind: CursorVisualKind
  pressed: boolean
}>

function normalizeCursorVisualRequest(input: CursorVisualInput): NormalizedCursorVisualRequest {
  if ('point' in input) {
    const cssCursor = normalizeCursorText(input.cursor)

    return {
      point: input.point,
      cssCursor,
      kind: input.kind ?? cursorVisualKindFor(cssCursor),
      pressed: input.pressed ?? false,
    }
  }

  return {
    point: input,
    kind: 'default',
    pressed: false,
  }
}

function normalizeCursorText(cursor: string | undefined): string | undefined {
  const normalized = cursor?.trim()

  return normalized ? normalized : undefined
}

function cursorVisualKindFor(cursor: string | undefined): CursorVisualKind {
  const normalized = cursor?.toLowerCase()

  if (!normalized || normalized === 'auto' || normalized === 'default') {
    return 'default'
  }

  if (normalized.includes('not-allowed')) {
    return 'not-allowed'
  }

  if (normalized.includes('grabbing')) {
    return 'grabbing'
  }

  if (normalized.includes('pointer')) {
    return 'pointer'
  }

  if (normalized.includes('text')) {
    return 'text'
  }

  if (normalized.includes('progress')) {
    return 'progress'
  }

  if (normalized.includes('wait')) {
    return 'wait'
  }

  if (normalized.includes('grab')) {
    return 'grab'
  }

  if (normalized.includes('move')) {
    return 'move'
  }

  if (normalized.includes('crosshair')) {
    return 'crosshair'
  }

  return 'custom'
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

function displayTextForKeystroke(
  request: KeystrokeVisualRequest,
  visibility: VisualTextVisibility,
): string {
  switch (visibility) {
    case 'hidden':
      return safeLabelForTarget(request.target)
    case 'masked':
      return maskText(request.text)
    case 'plain':
      return request.text
  }
}

function safeLabelForTarget(target: TargetHandle | undefined): string {
  if (!target) {
    return 'target'
  }

  return (
    target.debug.name ??
    target.debug.description ??
    target.debug.selector ??
    target.id
  )
}

function maskText(text: string): string {
  const parts = splitGraphemes(text)

  if (parts.length === 0) {
    return ''
  }

  return '*'.repeat(parts.length)
}

function splitGraphemes(text: string): readonly string[] {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter

  if (typeof Segmenter === 'function') {
    return Array.from(
      new Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
      (part) => part.segment,
    )
  }

  return Array.from(text)
}

type GraphemeSegmenter = Readonly<{
  segment(text: string): Iterable<Readonly<{ segment: string }>>
}>

type IntlWithSegmenter = typeof Intl &
  Readonly<{
    Segmenter?: new (
      locales?: string | readonly string[],
      options?: Readonly<{ granularity?: 'grapheme' }>,
    ) => GraphemeSegmenter
  }>
