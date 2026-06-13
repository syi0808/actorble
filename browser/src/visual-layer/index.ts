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
  cursorScale?: number
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
    const spec = scaleCursorVisualSpec(
      CURSOR_VISUAL_SPECS[request.kind],
      normalizeCursorScale(this.options.cursorScale),
    )
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

    if (spec.svg) {
      cursor.append(createCursorSvg(cursor.ownerDocument, request.kind, spec.svg))
    }
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
    this.#removePart('highlight')
    this.#removePart('click')
    this.#removePart('focus')
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
  svg?: CursorVisualSvgSpec
  style: Readonly<Record<string, string>>
}>

type CursorVisualSvgSpec = Readonly<{
  viewBox: string
  paths: readonly CursorVisualSvgPathSpec[]
}>

type CursorVisualSvgPathSpec = Readonly<{
  d: string
  fill: string
  fillRule?: string
  stroke?: string
  strokeLinecap?: string
  strokeLinejoin?: string
  strokeWidth?: string
}>

const CURSOR_FILL = 'CanvasText'
const CURSOR_HALO = 'Canvas'
const CURSOR_ROUND_CAP = 'round'
const CURSOR_ROUND_JOIN = 'round'
const CURSOR_FILLED_STROKE_WIDTH = '1.6'
const CURSOR_LINE_HALO_STROKE_WIDTH = '4'
const CURSOR_LINE_STROKE_WIDTH = '2'
const CURSOR_THIN_LINE_HALO_STROKE_WIDTH = '3.4'
const CURSOR_THIN_LINE_STROKE_WIDTH = '1.6'
const CURSOR_PRESSED_SCALE = 'scale(0.9)'

const CURSOR_BASE_STYLE: Readonly<Record<string, string>> = {
  border: '0px',
  color: CURSOR_FILL,
  filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.32))',
  overflow: 'visible',
}

const DEFAULT_CURSOR_ARROW_PATH =
  'M 2,2 L 18.4,17.6 L 12,18.8 L 16.8,27.4 L 12.3,29.4 ' +
  'L 7.2,20.4 L 2,25.8 Z'

const POINTER_CURSOR_HAND_PATH =
  'M 7,2 C 6.1,2 5.4,2.7 5.4,3.6 L 5.4,11.1 L 4.3,10 ' +
  'C 3.6,9.3 2.5,9.4 1.9,10.1 C 1.3,10.8 1.3,11.8 1.9,12.5 ' +
  'L 7.3,21.2 C 8.1,22.5 9.4,23.2 10.9,23.2 L 13,23.2 ' +
  'C 15.4,23.2 17.2,21.3 17.2,18.9 L 17.2,10.4 ' +
  'C 17.2,9.4 16.4,8.6 15.4,8.6 C 15,8.6 14.6,8.8 14.3,9 ' +
  'C 14.1,8.2 13.4,7.6 12.5,7.6 C 12.1,7.6 11.7,7.7 11.4,8 ' +
  'C 11.1,7.2 10.4,6.7 9.6,6.7 C 9.2,6.7 8.8,6.8 8.6,7 ' +
  'L 8.6,3.6 C 8.6,2.7 7.9,2 7,2 Z'

const TEXT_CURSOR_PATH = 'M 5,2 L 5,24 M 2,2 L 8,2 M 2,24 L 8,24'

const NOT_ALLOWED_CURSOR_PATH =
  'M 11,2.5 A 8.5,8.5 0 1 0 11,19.5 A 8.5,8.5 0 1 0 11,2.5 ' +
  'M 5.2,16.8 L 16.8,5.2'

const WAIT_CURSOR_FRAME_PATH =
  'M 6,3 L 16,3 M 7,4.5 C 7,7.4 9,9.4 11,11 ' +
  'C 9,12.6 7,14.6 7,17.5 M 15,4.5 C 15,7.4 13,9.4 11,11 ' +
  'C 13,12.6 15,14.6 15,17.5 M 6,19 L 16,19'

const WAIT_CURSOR_SAND_PATH =
  'M 8.2,6 L 13.8,6 L 11,8.4 Z M 8.2,16 L 13.8,16 L 11,13.6 Z'

const PROGRESS_CURSOR_SPINNER_PATH =
  'M 25.5,8 A 4.5,4.5 0 1 1 22.2,3.7 M 22.2,3.7 L 25,3.3 ' +
  'M 22.2,3.7 L 23.3,6.3'

const GRAB_CURSOR_HAND_PATH =
  'M 3.2,10.2 L 3.2,8 C 3.2,7.1 3.9,6.4 4.8,6.4 ' +
  'C 5.2,6.4 5.6,6.5 5.9,6.8 L 5.9,4.1 C 5.9,3.2 6.6,2.5 7.5,2.5 ' +
  'C 8.4,2.5 9.1,3.2 9.1,4.1 L 9.1,3.2 C 9.1,2.3 9.8,1.6 10.7,1.6 ' +
  'C 11.6,1.6 12.3,2.3 12.3,3.2 L 12.3,4 C 12.6,3.4 13.2,3.1 13.9,3.1 ' +
  'C 14.8,3.1 15.5,3.8 15.5,4.7 L 15.5,6.4 C 15.8,6.1 16.3,5.9 16.8,5.9 ' +
  'C 17.7,5.9 18.4,6.6 18.4,7.5 L 18.4,12.6 ' +
  'C 18.4,17.1 15.2,20.7 10.8,20.7 L 8.4,20.7 ' +
  'C 6.2,20.7 4.5,19.6 3.4,17.7 L 1.4,13.8 ' +
  'C 0.9,12.9 1.5,11.7 2.5,11.7 C 2.8,11.7 3,11.8 3.2,11.9 Z'

const GRABBING_CURSOR_HAND_PATH =
  'M 3,8.4 C 3,7.2 3.9,6.3 5.1,6.3 L 6.2,6.3 L 6.2,5 ' +
  'C 6.2,4 7,3.2 8,3.2 C 8.7,3.2 9.3,3.6 9.6,4.2 ' +
  'C 9.9,3.3 10.7,2.7 11.7,2.7 C 12.7,2.7 13.5,3.4 13.7,4.3 ' +
  'C 14.1,3.9 14.7,3.7 15.3,3.7 C 16.3,3.7 17.1,4.5 17.1,5.5 ' +
  'L 17.1,7.2 L 17.5,7.2 C 18.5,7.2 19.3,8 19.3,9 ' +
  'L 19.3,12.4 C 19.3,17.1 16,20.7 11.1,20.7 L 8.4,20.7 ' +
  'C 6.2,20.7 4.4,19.6 3.3,17.7 L 1.4,14.3 ' +
  'C 0.9,13.4 1.4,12.2 2.5,12 L 3,11.9 Z'

const MOVE_CURSOR_PATH =
  'M 11,2.5 L 11,19.5 M 11,2.5 L 7.8,5.7 M 11,2.5 L 14.2,5.7 ' +
  'M 11,19.5 L 7.8,16.3 M 11,19.5 L 14.2,16.3 ' +
  'M 2.5,11 L 19.5,11 M 2.5,11 L 5.7,7.8 M 2.5,11 L 5.7,14.2 ' +
  'M 19.5,11 L 16.3,7.8 M 19.5,11 L 16.3,14.2'

const CROSSHAIR_CURSOR_PATH =
  'M 12,2 L 12,8 M 12,16 L 12,22 M 2,12 L 8,12 M 16,12 L 22,12 ' +
  'M 12,10.1 A 1.9,1.9 0 1 0 12,13.9 A 1.9,1.9 0 1 0 12,10.1'

function filledCursorPath(
  d: string,
  strokeWidth = CURSOR_FILLED_STROKE_WIDTH,
): CursorVisualSvgPathSpec {
  return {
    d,
    fill: CURSOR_FILL,
    stroke: CURSOR_HALO,
    strokeLinejoin: CURSOR_ROUND_JOIN,
    strokeWidth,
  }
}

function haloStrokePath(
  d: string,
  strokeWidth = CURSOR_LINE_HALO_STROKE_WIDTH,
  strokeLinecap = CURSOR_ROUND_CAP,
): CursorVisualSvgPathSpec {
  return strokeCursorPath(d, CURSOR_HALO, strokeWidth, strokeLinecap)
}

function foregroundStrokePath(
  d: string,
  strokeWidth = CURSOR_LINE_STROKE_WIDTH,
  strokeLinecap = CURSOR_ROUND_CAP,
): CursorVisualSvgPathSpec {
  return strokeCursorPath(d, CURSOR_FILL, strokeWidth, strokeLinecap)
}

function strokeCursorPath(
  d: string,
  stroke: string,
  strokeWidth: string,
  strokeLinecap: string,
): CursorVisualSvgPathSpec {
  return {
    d,
    fill: 'none',
    stroke,
    strokeLinecap,
    strokeLinejoin: CURSOR_ROUND_JOIN,
    strokeWidth,
  }
}

const CURSOR_VISUAL_SPECS: Readonly<Record<SupportedCursorVisualKind, CursorVisualSpec>> = {
  default: {
    width: 20,
    height: 30,
    hotspot: { x: 2, y: 2 },
    svg: {
      viewBox: '0 0 20 30',
      paths: [filledCursorPath(DEFAULT_CURSOR_ARROW_PATH)],
    },
    style: CURSOR_BASE_STYLE,
  },
  pointer: {
    width: 18,
    height: 24,
    hotspot: { x: 7, y: 2 },
    svg: {
      viewBox: '0 0 18 24',
      paths: [filledCursorPath(POINTER_CURSOR_HAND_PATH)],
    },
    style: CURSOR_BASE_STYLE,
  },
  text: {
    width: 10,
    height: 26,
    hotspot: { x: 5, y: 13 },
    svg: {
      viewBox: '0 0 10 26',
      paths: [
        haloStrokePath(TEXT_CURSOR_PATH, CURSOR_LINE_HALO_STROKE_WIDTH, 'square'),
        foregroundStrokePath(TEXT_CURSOR_PATH, CURSOR_THIN_LINE_STROKE_WIDTH, 'square'),
      ],
    },
    style: CURSOR_BASE_STYLE,
  },
  'not-allowed': {
    width: 22,
    height: 22,
    hotspot: { x: 11, y: 11 },
    svg: {
      viewBox: '0 0 22 22',
      paths: [
        haloStrokePath(NOT_ALLOWED_CURSOR_PATH, CURSOR_LINE_HALO_STROKE_WIDTH),
        foregroundStrokePath(NOT_ALLOWED_CURSOR_PATH, CURSOR_LINE_STROKE_WIDTH),
      ],
    },
    style: CURSOR_BASE_STYLE,
  },
  wait: {
    width: 22,
    height: 22,
    hotspot: { x: 11, y: 11 },
    svg: {
      viewBox: '0 0 22 22',
      paths: [
        haloStrokePath(WAIT_CURSOR_FRAME_PATH, CURSOR_LINE_HALO_STROKE_WIDTH),
        foregroundStrokePath(WAIT_CURSOR_FRAME_PATH, CURSOR_LINE_STROKE_WIDTH),
        filledCursorPath(WAIT_CURSOR_SAND_PATH, '1'),
      ],
    },
    style: CURSOR_BASE_STYLE,
  },
  progress: {
    width: 28,
    height: 30,
    hotspot: { x: 2, y: 2 },
    svg: {
      viewBox: '0 0 28 30',
      paths: [
        filledCursorPath(DEFAULT_CURSOR_ARROW_PATH),
        haloStrokePath(PROGRESS_CURSOR_SPINNER_PATH, CURSOR_THIN_LINE_HALO_STROKE_WIDTH),
        foregroundStrokePath(PROGRESS_CURSOR_SPINNER_PATH, CURSOR_THIN_LINE_STROKE_WIDTH),
      ],
    },
    style: CURSOR_BASE_STYLE,
  },
  grab: {
    width: 20,
    height: 22,
    hotspot: { x: 10, y: 3 },
    svg: {
      viewBox: '0 0 20 22',
      paths: [filledCursorPath(GRAB_CURSOR_HAND_PATH)],
    },
    style: CURSOR_BASE_STYLE,
  },
  grabbing: {
    width: 20,
    height: 22,
    hotspot: { x: 10, y: 4 },
    svg: {
      viewBox: '0 0 20 22',
      paths: [filledCursorPath(GRABBING_CURSOR_HAND_PATH)],
    },
    style: CURSOR_BASE_STYLE,
  },
  move: {
    width: 22,
    height: 22,
    hotspot: { x: 11, y: 11 },
    svg: {
      viewBox: '0 0 22 22',
      paths: [
        haloStrokePath(MOVE_CURSOR_PATH, CURSOR_LINE_HALO_STROKE_WIDTH),
        foregroundStrokePath(MOVE_CURSOR_PATH, CURSOR_LINE_STROKE_WIDTH),
      ],
    },
    style: CURSOR_BASE_STYLE,
  },
  crosshair: {
    width: 24,
    height: 24,
    hotspot: { x: 12, y: 12 },
    svg: {
      viewBox: '0 0 24 24',
      paths: [
        haloStrokePath(CROSSHAIR_CURSOR_PATH, CURSOR_THIN_LINE_HALO_STROKE_WIDTH),
        foregroundStrokePath(CROSSHAIR_CURSOR_PATH, CURSOR_THIN_LINE_STROKE_WIDTH),
      ],
    },
    style: CURSOR_BASE_STYLE,
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

function normalizeCursorScale(cursorScale: number | undefined): number {
  return cursorScale !== undefined && Number.isFinite(cursorScale) && cursorScale > 0
    ? cursorScale
    : 1
}

function scaleCursorVisualSpec(
  spec: CursorVisualSpec,
  scale: number,
): CursorVisualSpec {
  if (scale === 1) {
    return spec
  }

  return {
    ...spec,
    width: spec.width * scale,
    height: spec.height * scale,
    hotspot: {
      x: spec.hotspot.x * scale,
      y: spec.hotspot.y * scale,
    },
  }
}

function cursorTransform(baseTransform: string, pressed: boolean): string {
  const normalized = baseTransform.trim() || 'none'

  if (!pressed) {
    return normalized
  }

  if (normalized === 'none') {
    return CURSOR_PRESSED_SCALE
  }

  return `${normalized} ${CURSOR_PRESSED_SCALE}`
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

function createCursorSvg(
  ownerDocument: Document,
  kind: SupportedCursorVisualKind,
  spec: CursorVisualSvgSpec,
): SVGSVGElement {
  const svg = ownerDocument.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-actorble-cursor-svg', kind)
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('height', '100%')
  svg.setAttribute('viewBox', spec.viewBox)
  svg.setAttribute('width', '100%')
  Object.assign(svg.style, {
    display: 'block',
    height: '100%',
    overflow: 'visible',
    width: '100%',
  })

  for (const pathSpec of spec.paths) {
    const path = ownerDocument.createElementNS(SVG_NAMESPACE, 'path')
    path.setAttribute('d', pathSpec.d)
    path.setAttribute('fill', pathSpec.fill)

    if (pathSpec.fillRule) {
      path.setAttribute('fill-rule', pathSpec.fillRule)
    }

    if (pathSpec.stroke) {
      path.setAttribute('stroke', pathSpec.stroke)
    }

    if (pathSpec.strokeLinecap) {
      path.setAttribute('stroke-linecap', pathSpec.strokeLinecap)
    }

    if (pathSpec.strokeWidth) {
      path.setAttribute('stroke-width', pathSpec.strokeWidth)
    }

    if (pathSpec.strokeLinejoin) {
      path.setAttribute('stroke-linejoin', pathSpec.strokeLinejoin)
    }

    svg.append(path)
  }

  return svg
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
