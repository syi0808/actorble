import { actorbleError } from '../shared/index.js'
import { BrowserPointerEngine } from '../pointer-engine/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type { ClickOptions, DragOptions, MoveOptions, Point, TargetHandle } from '../shared/index.js'
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

export interface GestureEngine {
  click(target: TargetHandle, point: Point, options?: ClickOptions): Promise<GestureResult>
  doubleClick(target: TargetHandle, point: Point, options?: ClickOptions): Promise<GestureResult>
  hover(point: Point, options?: MoveOptions): Promise<GestureResult>
  drag(from: Point, to: Point, options?: DragOptions): Promise<GestureResult>
  cancel(): Promise<GestureResult>
}

export class BrowserGestureEngine implements GestureEngine {
  readonly #pointer: PointerEngine

  constructor(options: GestureEngineOptions = {}) {
    this.#pointer =
      options.pointer ??
      new BrowserPointerEngine({
        timeline: options.timeline ?? new BrowserTimelineEngine(),
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

    await this.#pointer.moveTo(point)
    await this.#pointer.down(button)
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
