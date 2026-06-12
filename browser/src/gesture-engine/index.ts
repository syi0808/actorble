import { actorbleError } from '../shared/index.js'
import { BrowserPointerEngine } from '../pointer-engine/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type {
  CancellationOptions,
  ClickOptions,
  DragOptions,
  MoveOptions,
  Point,
  TargetHandle,
} from '../shared/index.js'
import type { PointerEngine } from '../pointer-engine/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'

export type DragCapability =
  | 'none'
  | 'pointer-gesture'
  | 'html5-dnd'
  | 'editor-selection'
  | 'custom-adapter'

export type GestureResult = Readonly<{
  completed: boolean
}>

export type GestureEngineOptions = Readonly<{
  pointer?: PointerEngine
  timeline?: TimelineEngine
}>

const DEFAULT_CLICK_PRESS_DWELL = 80

export interface GestureEngine {
  click(target: TargetHandle, point: Point, options?: ClickOptions): Promise<GestureResult>
  doubleClick(target: TargetHandle, point: Point, options?: ClickOptions): Promise<GestureResult>
  hover(point: Point, options?: MoveOptions): Promise<GestureResult>
  drag(from: Point, to: Point, options?: DragOptions): Promise<GestureResult>
  cancel(): Promise<GestureResult>
}

export class BrowserGestureEngine implements GestureEngine {
  readonly #pointer: PointerEngine
  readonly #timeline: TimelineEngine

  constructor(options: GestureEngineOptions = {}) {
    const timeline = options.timeline ?? new BrowserTimelineEngine()

    this.#timeline = timeline
    this.#pointer =
      options.pointer ??
      new BrowserPointerEngine({
        timeline,
      })
  }

  async click(
    _target: TargetHandle,
    point: Point,
    options: ClickOptions = {},
  ): Promise<GestureResult> {
    if (options.clickCount !== undefined && options.clickCount > 1) {
      throw unsupportedGesture('click', {
        extensionPoint: 'multi-click',
        clickCount: options.clickCount,
      })
    }

    const button = options.button ?? 'primary'

    await this.#pointer.moveTo(point, pointerMovementOptions(options))
    await this.#pointer.down(button)
    const pressDwell = normalizePressDwell(options.pressDwell)

    if (pressDwell > 0) {
      await this.#timeline.delay(pressDwell, cancellationOptions(options))
    }

    await this.#pointer.up(button)

    return { completed: true }
  }

  async doubleClick(): Promise<GestureResult> {
    throw unsupportedGesture('doubleClick', {
      extensionPoint: 'multi-click',
      capability: 'pointer-gesture',
    })
  }

  async hover(point: Point, options: MoveOptions = {}): Promise<GestureResult> {
    await this.#pointer.moveTo(point, options)

    return { completed: true }
  }

  async drag(): Promise<GestureResult> {
    throw unsupportedGesture('drag', {
      extensionPoint: 'drag',
      capability: 'pointer-gesture',
    })
  }

  async cancel(): Promise<GestureResult> {
    await this.#pointer.cancel()

    return { completed: false }
  }
}

export function createGestureEngine(options: GestureEngineOptions = {}): GestureEngine {
  return new BrowserGestureEngine(options)
}

function unsupportedGesture(
  gesture: 'click' | 'doubleClick' | 'drag',
  details: Readonly<Record<string, unknown>>,
): Error {
  return actorbleError(
    'PLATFORM_UNSUPPORTED',
    `Gesture Engine ${gesture} requires a capability extension.`,
    {
      details: {
        gesture,
        ...details,
      },
    },
  )
}

function pointerMovementOptions(options: ClickOptions): MoveOptions | undefined {
  const movement: MoveOptions = {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
  }

  return Object.keys(movement).length === 0 ? undefined : movement
}

function cancellationOptions(options: ClickOptions): CancellationOptions {
  return options.signal === undefined ? {} : { signal: options.signal }
}

function normalizePressDwell(pressDwell: number | undefined): number {
  if (pressDwell === undefined) {
    return DEFAULT_CLICK_PRESS_DWELL
  }

  if (!Number.isFinite(pressDwell) || pressDwell <= 0) {
    return 0
  }

  return pressDwell
}
