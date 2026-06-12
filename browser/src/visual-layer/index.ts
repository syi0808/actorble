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
    const spec = CURSOR_VISUAL_SPECS[request.kind]
    const baseTransform = spec.style.transform ?? 'none'
    cursor.setAttribute('data-actorble-cursor-kind', request.kind)
    cursor.setAttribute('data-actorble-cursor-hotspot-x', String(spec.hotspot.x))
    cursor.setAttribute('data-actorble-cursor-hotspot-y', String(spec.hotspot.y))

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

    cursor.removeAttribute('style')
    cursor.textContent = ''
    Object.assign(cursor.style, {
      boxSizing: 'border-box',
      contain: 'layout paint style',
      display: 'block',
      height: `${spec.height}px`,
      left: `${request.point.x - spec.hotspot.x}px`,
      pointerEvents: 'none',
      position: 'absolute',
      top: `${request.point.y - spec.hotspot.y}px`,
      transformOrigin: `${spec.hotspot.x}px ${spec.hotspot.y}px`,
      width: `${spec.width}px`,
      ...spec.style,
      transform: cursorTransform(baseTransform, request.pressed),
      transition: 'transform 80ms ease-out',
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
    this.#removePart('cursor')

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
  kind: SupportedCursorVisualKind
  pressed: boolean
}>

function normalizeCursorVisualRequest(input: CursorVisualInput): NormalizedCursorVisualRequest {
  if ('point' in input) {
    const cssCursor = normalizeCursorText(input.cursor)

    return {
      point: input.point,
      cssCursor,
      kind: normalizeCursorVisualKind(input.kind, cssCursor),
      pressed: input.pressed ?? false,
    }
  }

  return {
    point: input,
    kind: 'default',
    pressed: false,
  }
}

type SupportedCursorVisualKind = Exclude<CursorVisualKind, 'custom'>

type CursorVisualSpec = Readonly<{
  width: number
  height: number
  hotspot: Point
  style: Readonly<Record<string, string>>
}>

const CURSOR_VISUAL_SPECS: Readonly<Record<SupportedCursorVisualKind, CursorVisualSpec>> = {
  default: {
    width: 14,
    height: 20,
    hotspot: { x: 0, y: 0 },
    style: {
      background: 'CanvasText',
      border: '1px solid Canvas',
      borderRadius: '1px',
      clipPath:
        'polygon(0 0, 0 18px, 5px 13px, 8px 20px, 11px 18px, 8px 12px, 14px 12px)',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
    },
  },
  pointer: {
    width: 13,
    height: 18,
    hotspot: { x: 5, y: 1 },
    style: {
      background: 'CanvasText',
      border: '1px solid Canvas',
      borderRadius: '6px 6px 8px 8px',
      clipPath:
        'polygon(5px 0, 10px 0, 10px 6px, 13px 6px, 13px 14px, 10px 18px, 3px 18px, 0 13px, 0 8px, 5px 8px)',
      transform: 'rotate(-18deg)',
    },
  },
  text: {
    width: 8,
    height: 22,
    hotspot: { x: 4, y: 11 },
    style: {
      background:
        'linear-gradient(CanvasText, CanvasText) center / 2px 100% no-repeat',
      border: '0px',
      borderBottom: '2px solid CanvasText',
      borderRadius: '0px',
      borderTop: '2px solid CanvasText',
    },
  },
  'not-allowed': {
    width: 18,
    height: 18,
    hotspot: { x: 9, y: 9 },
    style: {
      background:
        'linear-gradient(45deg, transparent 44%, CanvasText 44%, CanvasText 56%, transparent 56%)',
      border: '2px solid CanvasText',
      borderRadius: '999px',
    },
  },
  wait: {
    width: 18,
    height: 18,
    hotspot: { x: 9, y: 9 },
    style: {
      background: 'transparent',
      border: '2px solid CanvasText',
      borderRadius: '999px',
      borderRightColor: 'transparent',
    },
  },
  progress: {
    width: 18,
    height: 18,
    hotspot: { x: 9, y: 9 },
    style: {
      background: 'transparent',
      border: '2px solid CanvasText',
      borderBottomColor: 'transparent',
      borderRadius: '999px',
      boxShadow: '0 0 0 2px Canvas',
    },
  },
  grab: {
    width: 16,
    height: 16,
    hotspot: { x: 8, y: 2 },
    style: {
      background: 'CanvasText',
      border: '1px solid Canvas',
      borderRadius: '7px 7px 5px 5px',
      clipPath:
        'polygon(2px 4px, 5px 1px, 7px 3px, 9px 1px, 12px 4px, 15px 7px, 13px 16px, 4px 16px, 0 9px)',
      transform: 'rotate(-8deg)',
    },
  },
  grabbing: {
    width: 16,
    height: 16,
    hotspot: { x: 8, y: 2 },
    style: {
      background: 'CanvasText',
      border: '1px solid Canvas',
      borderRadius: '8px 8px 6px 6px',
      clipPath:
        'polygon(1px 5px, 4px 2px, 7px 4px, 10px 2px, 15px 7px, 13px 16px, 4px 16px, 0 10px)',
      transform: 'rotate(-8deg) scale(0.92)',
    },
  },
  move: {
    width: 16,
    height: 16,
    hotspot: { x: 8, y: 8 },
    style: {
      background:
        'linear-gradient(CanvasText, CanvasText) center / 2px 100% no-repeat, linear-gradient(CanvasText, CanvasText) center / 100% 2px no-repeat',
      border: '0px',
      transform: 'rotate(45deg)',
    },
  },
  crosshair: {
    width: 22,
    height: 22,
    hotspot: { x: 11, y: 11 },
    style: {
      background:
        'linear-gradient(CanvasText, CanvasText) center / 1px 100% no-repeat, linear-gradient(CanvasText, CanvasText) center / 100% 1px no-repeat',
      border: '0px',
    },
  },
}

function normalizeCursorVisualKind(
  kind: CursorVisualKind | undefined,
  cssCursor: string | undefined,
): SupportedCursorVisualKind {
  if (kind && kind !== 'custom') {
    return kind
  }

  return cursorVisualKindFor(cssCursor)
}

function normalizeCursorText(cursor: string | undefined): string | undefined {
  const normalized = cursor?.trim()

  return normalized ? normalized : undefined
}

function cursorTransform(baseTransform: string, pressed: boolean): string {
  const normalized = baseTransform.trim() || 'none'
  const pressedScale = 'scale(0.88)'

  if (!pressed) {
    return normalized
  }

  if (normalized === 'none') {
    return pressedScale
  }

  return `${normalized} ${pressedScale}`
}

function cursorVisualKindFor(cursor: string | undefined): SupportedCursorVisualKind {
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

  return 'default'
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
