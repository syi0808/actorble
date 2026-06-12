import type { CoordinateSpace, MoveOptions, Point, PointerButtonName } from '../shared/index.js'
import { BrowserPointerSignalBus } from '../pointer-signals/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type { PointerSignalBus } from '../pointer-signals/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'

export type PointerMotionStatus = 'idle' | 'moving' | 'settling' | 'cancelled'

export type PointerPath = readonly Point[]

export type PointerState = Readonly<{
  id: string
  position: Point
  previousPosition: Point | null
  motion: Readonly<{
    status: PointerMotionStatus
    from?: Point
    to?: Point
    path?: PointerPath
  }>
  buttons: Readonly<{
    pressed: readonly PointerButtonName[]
    primary: PointerButtonName | null
  }>
  surface: Readonly<{
    id: string | null
    coordinateSpace: CoordinateSpace
  }>
}>

export interface PointerEngine {
  getState(): PointerState
  moveTo(point: Point, options?: MoveOptions): Promise<PointerState>
  down(button?: PointerButtonName): Promise<PointerState>
  up(button?: PointerButtonName): Promise<PointerState>
  cancel(): Promise<PointerState>
}

export type PointerEngineOptions = Readonly<{
  signals?: PointerSignalBus
  timeline?: TimelineEngine
  id?: string
  initialPosition?: Point
  surface?: Readonly<{
    id: string | null
    coordinateSpace: CoordinateSpace
  }>
}>

export class BrowserPointerEngine implements PointerEngine {
  readonly #signals: PointerSignalBus
  readonly #timeline: TimelineEngine
  #state: PointerState

  constructor(options: PointerEngineOptions = {}) {
    const position = clonePoint(options.initialPosition ?? { x: 0, y: 0 })
    this.#signals = options.signals ?? new BrowserPointerSignalBus()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#state = {
      id: options.id ?? 'pointer-1',
      position,
      previousPosition: null,
      motion: { status: 'idle' },
      buttons: { pressed: [], primary: null },
      surface: {
        id: options.surface?.id ?? null,
        coordinateSpace: options.surface?.coordinateSpace ?? 'viewport',
      },
    }
  }

  getState(): PointerState {
    return cloneState(this.#state)
  }

  async moveTo(point: Point, options: MoveOptions = {}): Promise<PointerState> {
    const target = clonePoint(point)
    const from = clonePoint(this.#state.position)
    const duration = normalizeDuration(options.duration ?? options.motion?.duration ?? 0)

    this.#state = {
      ...this.#state,
      motion: {
        status: duration > 0 ? 'moving' : 'idle',
        from,
        to: target,
        path: [],
      },
    }

    if (duration === 0 || samePoint(from, target)) {
      this.#applyMovement(target)
      this.#finishMovement(from, target)
      return this.getState()
    }

    const startedAt = this.#timeline.now()

    while (true) {
      await this.#timeline.nextFrame(options)
      const progress = Math.min(1, (this.#timeline.now() - startedAt) / duration)
      const nextPoint = progress >= 1 ? target : interpolatePoint(from, target, progress)

      this.#applyMovement(nextPoint)

      if (progress >= 1) {
        this.#finishMovement(from, target)
        return this.getState()
      }
    }
  }

  async down(button: PointerButtonName = 'primary'): Promise<PointerState> {
    const pressed = [...this.#state.buttons.pressed]

    if (!pressed.includes(button)) {
      pressed.push(button)
    }

    this.#state = {
      ...this.#state,
      buttons: {
        pressed,
        primary: this.#state.buttons.primary ?? button,
      },
    }
    this.#signals.emit({
      type: 'pointer:down',
      point: clonePoint(this.#state.position),
      button,
    })

    return this.getState()
  }

  async up(button: PointerButtonName = 'primary'): Promise<PointerState> {
    const pressed = this.#state.buttons.pressed.filter((pressedButton) => pressedButton !== button)

    this.#state = {
      ...this.#state,
      buttons: {
        pressed,
        primary:
          this.#state.buttons.primary === button
            ? (pressed[0] ?? null)
            : this.#state.buttons.primary,
      },
    }
    this.#signals.emit({
      type: 'pointer:up',
      point: clonePoint(this.#state.position),
      button,
    })

    return this.getState()
  }

  async cancel(): Promise<PointerState> {
    this.#state = {
      ...this.#state,
      motion: {
        ...this.#state.motion,
        status: 'cancelled',
      },
      buttons: {
        pressed: [],
        primary: null,
      },
    }
    this.#signals.emit({ type: 'pointer:cancelled' })

    return this.getState()
  }

  #applyMovement(point: Point): void {
    const previousPoint = clonePoint(this.#state.position)
    const nextPoint = clonePoint(point)
    const path = [...(this.#state.motion.path ?? []), nextPoint]

    this.#state = {
      ...this.#state,
      position: nextPoint,
      previousPosition: previousPoint,
      motion: {
        ...this.#state.motion,
        path,
      },
    }
    this.#signals.emit({
      type: 'pointer:moved',
      point: clonePoint(nextPoint),
      previousPoint,
    })
  }

  #finishMovement(from: Point, target: Point): void {
    this.#state = {
      ...this.#state,
      motion: {
        ...this.#state.motion,
        status: 'idle',
        from: clonePoint(from),
        to: clonePoint(target),
      },
    }
  }
}

export function createPointerEngine(options: PointerEngineOptions = {}): PointerEngine {
  return new BrowserPointerEngine(options)
}

function cloneState(state: PointerState): PointerState {
  return {
    id: state.id,
    position: clonePoint(state.position),
    previousPosition: state.previousPosition ? clonePoint(state.previousPosition) : null,
    motion: {
      status: state.motion.status,
      ...(state.motion.from === undefined ? {} : { from: clonePoint(state.motion.from) }),
      ...(state.motion.to === undefined ? {} : { to: clonePoint(state.motion.to) }),
      ...(state.motion.path === undefined
        ? {}
        : { path: state.motion.path.map((point) => clonePoint(point)) }),
    },
    buttons: {
      pressed: [...state.buttons.pressed],
      primary: state.buttons.primary,
    },
    surface: { ...state.surface },
  }
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y }
}

function normalizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return duration
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y
}

function interpolatePoint(from: Point, to: Point, progress: number): Point {
  return {
    x: interpolate(from.x, to.x, progress),
    y: interpolate(from.y, to.y, progress),
  }
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}
