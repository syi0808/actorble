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

// CC0 source: https://www.svgrepo.com/svg/369973/cursor-default
const DEFAULT_CURSOR_ARROW_PATH =
  'M 29,18L 52.25,41.1667L 43.0865,42.6585L 50.817,56.6949L ' +
  '43.827,60.4115L 36,46.25L 29,53.25L 29,18 Z'

const CURSOR_VISUAL_SPECS: Readonly<Record<SupportedCursorVisualKind, CursorVisualSpec>> = {
  default: {
    width: 18,
    height: 27,
    hotspot: { x: 2, y: 2 },
    svg: {
      viewBox: '25 14 34 50',
      paths: [
        {
          d: DEFAULT_CURSOR_ARROW_PATH,
          fill: 'CanvasText',
          stroke: 'Canvas',
          strokeLinejoin: 'round',
          strokeWidth: '4',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35))',
      overflow: 'visible',
    },
  },
  pointer: {
    width: 13,
    height: 18,
    hotspot: { x: 5, y: 1 },
    svg: {
      viewBox: '0 0 13 18',
      paths: [
        {
          d:
            'M 5,1 C 4.2,1 3.6,1.6 3.6,2.5 L 3.6,8.2 L 2.8,7.4 ' +
            'C 2.2,6.8 1.3,6.9 0.8,7.5 C 0.3,8.1 0.3,8.9 0.8,9.5 ' +
            'L 5.4,16.4 C 6,17.4 7,18 8.2,18 L 10.1,18 C 11.7,18 13,16.7 13,15.1 ' +
            'L 13,8.1 C 13,7.2 12.3,6.5 11.4,6.5 C 11.1,6.5 10.8,6.6 10.5,6.8 ' +
            'C 10.3,6.1 9.7,5.7 9,5.7 C 8.7,5.7 8.4,5.8 8.2,5.9 ' +
            'C 7.9,5.3 7.4,5 6.8,5 C 6.5,5 6.2,5.1 6,5.2 L 6,2.5 ' +
            'C 6,1.6 5.8,1 5,1 Z',
          fill: 'CanvasText',
          stroke: 'Canvas',
          strokeLinejoin: 'round',
          strokeWidth: '1.4',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  text: {
    width: 8,
    height: 22,
    hotspot: { x: 4, y: 11 },
    svg: {
      viewBox: '0 0 8 22',
      paths: [
        {
          d: 'M 3,0 L 5,0 L 5,22 L 3,22 Z M 0,0 L 8,0 L 8,2 L 0,2 Z M 0,20 L 8,20 L 8,22 L 0,22 Z',
          fill: 'CanvasText',
        },
      ],
    },
    style: {
      border: '0px',
      borderRadius: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  'not-allowed': {
    width: 18,
    height: 18,
    hotspot: { x: 9, y: 9 },
    svg: {
      viewBox: '0 0 18 18',
      paths: [
        {
          d: 'M 9,2 A 7,7 0 1 0 9,16 A 7,7 0 1 0 9,2 Z M 4.2,13.8 L 13.8,4.2',
          fill: 'none',
          stroke: 'CanvasText',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: '2.2',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  wait: {
    width: 18,
    height: 18,
    hotspot: { x: 9, y: 9 },
    svg: {
      viewBox: '0 0 18 18',
      paths: [
        {
          d:
            'M 4,2 L 14,2 M 5,3 C 5,6 7,8 9,9 C 7,10 5,12 5,15 ' +
            'M 13,3 C 13,6 11,8 9,9 C 11,10 13,12 13,15 M 4,16 L 14,16',
          fill: 'none',
          stroke: 'CanvasText',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: '2',
        },
        {
          d: 'M 7,5 L 11,5 L 9,7 Z M 7,14 L 11,14 L 9,11 Z',
          fill: 'CanvasText',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  progress: {
    width: 18,
    height: 18,
    hotspot: { x: 9, y: 9 },
    svg: {
      viewBox: '0 0 18 18',
      paths: [
        {
          d: 'M 14.4,9 A 5.4,5.4 0 1 1 10.6,3.9 M 10.6,3.9 L 13.1,3.5 M 10.6,3.9 L 11.6,6.2',
          fill: 'none',
          stroke: 'CanvasText',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: '2',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  grab: {
    width: 16,
    height: 16,
    hotspot: { x: 8, y: 2 },
    svg: {
      viewBox: '0 0 16 16',
      paths: [
        {
          d:
            'M 2,8 L 2,6.5 C 2,5.8 2.6,5.2 3.3,5.2 C 3.7,5.2 4,5.4 4.3,5.7 ' +
            'L 4.3,3.2 C 4.3,2.5 4.9,1.9 5.6,1.9 C 6.3,1.9 6.9,2.5 6.9,3.2 ' +
            'L 6.9,2.5 C 6.9,1.8 7.5,1.2 8.2,1.2 C 8.9,1.2 9.5,1.8 9.5,2.5 ' +
            'L 9.5,3.1 C 9.7,2.6 10.2,2.3 10.8,2.3 C 11.5,2.3 12.1,2.9 12.1,3.6 ' +
            'L 12.1,5.2 C 12.3,5 12.6,4.9 13,4.9 C 13.7,4.9 14.3,5.5 14.3,6.2 ' +
            'L 14.3,10 C 14.3,13.1 12.2,16 8.6,16 L 6.6,16 C 4.9,16 3.7,15.2 2.9,13.8 ' +
            'L 1,10.2 C 0.7,9.5 1.2,8.6 2,8 Z',
          fill: 'CanvasText',
          stroke: 'Canvas',
          strokeLinejoin: 'round',
          strokeWidth: '1.2',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  grabbing: {
    width: 16,
    height: 16,
    hotspot: { x: 8, y: 2 },
    svg: {
      viewBox: '0 0 16 16',
      paths: [
        {
          d:
            'M 2,6.8 C 2,5.9 2.7,5.2 3.6,5.2 L 4.7,5.2 L 4.7,4 ' +
            'C 4.7,3.2 5.3,2.6 6.1,2.6 C 6.6,2.6 7,2.8 7.2,3.2 ' +
            'C 7.4,2.5 8,2 8.7,2 C 9.4,2 10,2.5 10.2,3.2 ' +
            'C 10.5,2.9 10.9,2.7 11.3,2.7 C 12.1,2.7 12.7,3.3 12.7,4.1 ' +
            'L 12.7,5.6 L 13.1,5.6 C 13.9,5.6 14.6,6.3 14.6,7.1 ' +
            'L 14.6,9.9 C 14.6,13.1 12.2,16 8.6,16 L 6.5,16 ' +
            'C 4.9,16 3.6,15.2 2.8,13.8 L 1.2,10.8 C 0.8,10.1 1.2,9.1 2,8.9 Z',
          fill: 'CanvasText',
          stroke: 'Canvas',
          strokeLinejoin: 'round',
          strokeWidth: '1.2',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  move: {
    width: 16,
    height: 16,
    hotspot: { x: 8, y: 8 },
    svg: {
      viewBox: '0 0 16 16',
      paths: [
        {
          d:
            'M 8,1 L 5.5,3.5 M 8,1 L 10.5,3.5 M 8,1 L 8,15 ' +
            'M 8,15 L 5.5,12.5 M 8,15 L 10.5,12.5 ' +
            'M 1,8 L 3.5,5.5 M 1,8 L 3.5,10.5 M 1,8 L 15,8 ' +
            'M 15,8 L 12.5,5.5 M 15,8 L 12.5,10.5',
          fill: 'none',
          stroke: 'CanvasText',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: '2',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
    },
  },
  crosshair: {
    width: 22,
    height: 22,
    hotspot: { x: 11, y: 11 },
    svg: {
      viewBox: '0 0 22 22',
      paths: [
        {
          d: 'M 11,1 L 11,7 M 11,15 L 11,21 M 1,11 L 7,11 M 15,11 L 21,11 M 11,9.2 A 1.8,1.8 0 1 0 11,12.8 A 1.8,1.8 0 1 0 11,9.2 Z',
          fill: 'none',
          stroke: 'CanvasText',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: '1.6',
        },
      ],
    },
    style: {
      border: '0px',
      color: 'CanvasText',
      overflow: 'visible',
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
