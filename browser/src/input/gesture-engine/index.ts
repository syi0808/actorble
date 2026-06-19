import { actorbleError, cancellationError } from '../../shared/index.js'
import { BrowserPointerEngine } from '../pointer-engine/index.js'
import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import type {
  CancellationOptions,
  ClickOptions,
  DragOptions,
  MoveOptions,
  Point,
  PointerButtonName,
  PointerSequence,
  PointerSequenceOptions,
  TargetHandle,
} from '../../shared/index.js'
import type { PointerEngine } from '../pointer-engine/index.js'
import type { PointerEndpointResolver, PointerMoveOptions } from '../pointer-engine/index.js'
import type { TimelineEngine } from '../../runtime/timeline-engine/index.js'

export type DragCapability =
  | 'none'
  | 'pointer-gesture'
  | 'html5-dnd'
  | 'editor-selection'
  | 'custom-adapter'

export type GestureResult = Readonly<{
  completed: boolean
}>

export type GestureClickOptions = ClickOptions &
  Readonly<{
    refreshPointBeforeDown?: (point: Point) => Point | Promise<Point>
    resolveEndpoint?: PointerEndpointResolver
  }>

export type GestureMoveOptions = MoveOptions &
  Readonly<{
    resolveEndpoint?: PointerEndpointResolver
  }>

export type GestureDragOptions = DragOptions &
  Readonly<{
    resolveFromEndpoint?: PointerEndpointResolver
    resolveToEndpoint?: PointerEndpointResolver
  }>

export type GesturePointerSequenceOptions = PointerSequenceOptions

export type GestureEngineOptions = Readonly<{
  pointer?: PointerEngine
  timeline?: TimelineEngine
}>

export interface GestureEngine {
  click(target: TargetHandle, point: Point, options?: GestureClickOptions): Promise<GestureResult>
  doubleClick(
    target: TargetHandle,
    point: Point,
    options?: GestureClickOptions,
  ): Promise<GestureResult>
  hover(point: Point, options?: GestureMoveOptions): Promise<GestureResult>
  drag(from: Point, to: Point, options?: GestureDragOptions): Promise<GestureResult>
  pointerSequence(
    sequence: PointerSequence,
    options?: GesturePointerSequenceOptions,
  ): Promise<GestureResult>
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
    options: GestureClickOptions = {},
  ): Promise<GestureResult> {
    return this.#clickSequence(
      'gesture.click',
      point,
      options,
      normalizeClickCount(options.clickCount),
    )
  }

  async doubleClick(
    _target: TargetHandle,
    point: Point,
    options: GestureClickOptions = {},
  ): Promise<GestureResult> {
    return this.#clickSequence('gesture.doubleClick', point, options, 2)
  }

  async hover(point: Point, options: GestureMoveOptions = {}): Promise<GestureResult> {
    await this.#pointer.moveTo(point, options)

    return { completed: true }
  }

  async drag(from: Point, to: Point, options: GestureDragOptions = {}): Promise<GestureResult> {
    let pressed = false

    await this.#pointer.moveTo(from, dragMovementOptions(options, options.resolveFromEndpoint))
    assertGestureNotCancelled('gesture.drag', options)

    try {
      await this.#pointer.down('primary')
      pressed = true
      await this.#pointer.moveTo(to, dragMovementOptions(options, options.resolveToEndpoint))
      assertGestureNotCancelled('gesture.drag', options)
      await this.#pointer.up('primary')
      pressed = false

      return { completed: true }
    } catch (error) {
      if (pressed) {
        await this.#pointer.cancel()
      }

      throw error
    }
  }

  async pointerSequence(
    sequence: PointerSequence,
    options: GesturePointerSequenceOptions = {},
  ): Promise<GestureResult> {
    const pressed = new Set<PointerButtonName>()

    try {
      for (const step of sequence) {
        assertGestureNotCancelled('gesture.pointerSequence', options)

        switch (step.type) {
          case 'move':
            await this.#pointer.moveTo(step.to, pointerSequenceMovementOptions(step, options))
            break
          case 'down': {
            const button = step.button ?? 'primary'

            await this.#pointer.down(button)
            pressed.add(button)
            break
          }
          case 'up': {
            const button = step.button ?? 'primary'

            await this.#pointer.up(button)
            pressed.delete(button)
            break
          }
          case 'pause':
            await this.#timeline.delay(
              normalizePauseDuration(step.duration),
              cancellationOptions(options),
            )
            break
        }
      }

      if (pressed.size > 0) {
        await this.#pointer.cancel()
        const incompleteButtons = [...pressed]

        pressed.clear()
        throw incompletePointerSequence(incompleteButtons)
      }

      return { completed: true }
    } catch (error) {
      if (pressed.size > 0) {
        await this.#pointer.cancel()
      }

      throw error
    }
  }

  async cancel(): Promise<GestureResult> {
    await this.#pointer.cancel()

    return { completed: false }
  }

  async #clickSequence(
    operation: 'gesture.click' | 'gesture.doubleClick',
    point: Point,
    options: GestureClickOptions,
    clickCount: number,
  ): Promise<GestureResult> {
    const button = options.button ?? 'primary'
    const pressDwell = normalizePressDwell(options.pressDwell)
    let currentPoint = point
    let pressed = false

    try {
      const movement = await this.#pointer.moveTo(currentPoint, pointerMovementOptions(options))

      if (options.resolveEndpoint) {
        currentPoint = movement.position
      }

      for (let clickIndex = 0; clickIndex < clickCount; clickIndex += 1) {
        assertGestureNotCancelled(operation, options)
        const refreshedPoint = await options.refreshPointBeforeDown?.(currentPoint)
        assertGestureNotCancelled(operation, options)

        if (refreshedPoint && !samePoint(currentPoint, refreshedPoint)) {
          await this.#pointer.moveTo(refreshedPoint, freshPointMovementOptions(options))
          currentPoint = refreshedPoint
        }

        assertGestureNotCancelled(operation, options)
        await this.#pointer.down(button)
        pressed = true

        if (pressDwell > 0) {
          await this.#timeline.delay(pressDwell, cancellationOptions(options))
        }

        assertGestureNotCancelled(operation, options)
        await this.#pointer.up(button)
        pressed = false
      }

      return { completed: true }
    } catch (error) {
      if (pressed) {
        await this.#pointer.cancel()
      }

      throw error
    }
  }
}

export function createGestureEngine(options: GestureEngineOptions = {}): GestureEngine {
  return new BrowserGestureEngine(options)
}

function pointerMovementOptions(options: GestureClickOptions): PointerMoveOptions | undefined {
  const movement: PointerMoveOptions = {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    ...(options.resolveEndpoint === undefined ? {} : { resolveEndpoint: options.resolveEndpoint }),
  }

  return Object.keys(movement).length === 0 ? undefined : movement
}

function dragMovementOptions(
  options: GestureDragOptions,
  resolveEndpoint?: PointerEndpointResolver,
): PointerMoveOptions | undefined {
  const movement: PointerMoveOptions = {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    ...(resolveEndpoint === undefined ? {} : { resolveEndpoint }),
  }

  return Object.keys(movement).length === 0 ? undefined : movement
}

function pointerSequenceMovementOptions(
  step: Extract<PointerSequence[number], { type: 'move' }>,
  options: GesturePointerSequenceOptions,
): PointerMoveOptions | undefined {
  const movement: PointerMoveOptions = {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(step.duration === undefined ? {} : { duration: step.duration }),
  }

  return Object.keys(movement).length === 0 ? undefined : movement
}

function freshPointMovementOptions(options: ClickOptions): MoveOptions {
  return {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    duration: 0,
  }
}

function cancellationOptions(options: ClickOptions): CancellationOptions {
  return options.signal === undefined ? {} : { signal: options.signal }
}

function assertGestureNotCancelled(operation: string, options: CancellationOptions): void {
  if (options.signal?.aborted) {
    throw cancellationError(operation, options.signal.reason)
  }
}

function normalizeClickCount(clickCount: number | undefined): number {
  if (clickCount === undefined) {
    return 1
  }

  if (Number.isInteger(clickCount) && clickCount >= 1) {
    return clickCount
  }

  throw actorbleError(
    'PLATFORM_UNSUPPORTED',
    'Gesture Engine clickCount must be a positive integer.',
    {
      details: {
        gesture: 'click',
        clickCount,
        limit: 'Only positive integer click counts are supported.',
      },
    },
  )
}

function normalizePressDwell(pressDwell: number | undefined): number {
  if (pressDwell === undefined || !Number.isFinite(pressDwell) || pressDwell <= 0) {
    return 0
  }

  return pressDwell
}

function normalizePauseDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return duration
}

function incompletePointerSequence(pressedButtons: readonly PointerButtonName[]): never {
  throw actorbleError(
    'POINTER_SEQUENCE_INCOMPLETE',
    'Pointer sequence ended while buttons are still pressed.',
    {
      details: {
        boundary: 'gesture-engine',
        pressedButtons,
      },
    },
  )
}

function samePoint(first: Point, second: Point): boolean {
  return first.x === second.x && first.y === second.y
}
