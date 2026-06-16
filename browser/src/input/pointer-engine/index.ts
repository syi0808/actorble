import type {
  CoordinateSpace,
  MoveOptions,
  Point,
  PointerButtonName,
  PointerEasingName,
} from '../../shared/index.js'
import { BrowserPointerSignalBus } from '../pointer-signals/index.js'
import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import type { PointerSignalBus } from '../pointer-signals/index.js'
import type { TimelineEngine } from '../../runtime/timeline-engine/index.js'

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

type NormalizedMotionProfile = Readonly<{
  kind: 'linear' | 'ease' | 'inertia' | 'spring'
  duration: number
  easing?: PointerEasingName
}>

type InternalPointerState = {
  id: string
  position: Point
  previousPosition: Point | null
  motion: {
    status: PointerMotionStatus
    from?: Point
    to?: Point
    path?: Point[]
  }
  buttons: {
    pressed: PointerButtonName[]
    primary: PointerButtonName | null
  }
  surface: {
    id: string | null
    coordinateSpace: CoordinateSpace
  }
}

export class BrowserPointerEngine implements PointerEngine {
  readonly #signals: PointerSignalBus
  readonly #timeline: TimelineEngine
  #state: InternalPointerState
  #motionRunId = 0

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
    const motion = normalizeMotionProfile(options)
    const motionRunId = ++this.#motionRunId

    this.#state = {
      ...this.#state,
      motion: {
        status: motion.duration > 0 ? 'moving' : 'idle',
        from,
        to: target,
        path: [],
      },
    }

    if (motion.duration === 0 || samePoint(from, target)) {
      this.#applyMovement(target)
      this.#finishMovement(from, target)
      return this.getState()
    }

    const startedAt = this.#timeline.now()

    try {
      while (true) {
        await this.#timeline.nextFrame(options)

        if (!this.#isActiveMotion(motionRunId)) {
          return this.getState()
        }

        const progress = Math.min(1, (this.#timeline.now() - startedAt) / motion.duration)
        const nextPoint =
          progress >= 1
            ? target
            : interpolatePoint(from, target, sampleMotionProgress(motion, progress))

        this.#applyMovement(nextPoint)

        if (progress >= 1) {
          this.#finishMovement(from, target)
          return this.getState()
        }
      }
    } catch (error) {
      if (this.#isActiveMotion(motionRunId)) {
        this.#cancelMotion()
      }

      throw error
    }
  }

  #isActiveMotion(motionRunId: number): boolean {
    return this.#motionRunId === motionRunId && this.#state.motion.status !== 'cancelled'
  }

  #cancelMotion(): void {
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
    this.#motionRunId += 1
    this.#cancelMotion()

    return this.getState()
  }

  #applyMovement(point: Point): void {
    const previousPoint = clonePoint(this.#state.position)
    const nextPoint = clonePoint(point)
    const path = this.#state.motion.path ?? []

    path.push(nextPoint)

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

function cloneState(state: InternalPointerState): PointerState {
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

function normalizeMotionProfile(options: MoveOptions): NormalizedMotionProfile {
  const motion = options.motion
  const duration = normalizeDuration(motion?.duration ?? options.duration ?? 0)

  if (!motion) {
    return { kind: 'linear', duration }
  }

  switch (motion.kind) {
    case 'linear':
      return { kind: 'linear', duration }
    case 'ease':
      return { kind: 'ease', duration, easing: motion.easing ?? 'ease-in-out' }
    case 'inertia':
      return { kind: 'inertia', duration }
    case 'spring':
      return { kind: 'spring', duration }
  }
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

function sampleMotionProgress(motion: NormalizedMotionProfile, progress: number): number {
  const clampedProgress = clampProgress(progress)

  switch (motion.kind) {
    case 'linear':
      return clampedProgress
    case 'ease':
      return sampleEasingProgress(motion.easing ?? 'ease-in-out', clampedProgress)
    case 'inertia':
      return sampleInertiaProgress(clampedProgress)
    case 'spring':
      return sampleSpringProgress(clampedProgress)
  }
}

function sampleEasingProgress(easing: PointerEasingName, progress: number): number {
  switch (easing) {
    case 'ease-in':
      return progress * progress
    case 'ease-out':
      return 1 - (1 - progress) * (1 - progress)
    case 'ease-in-out':
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2
  }
}

function sampleInertiaProgress(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

function sampleSpringProgress(progress: number): number {
  if (progress >= 1) {
    return 1
  }

  return 1 - Math.exp(-4 * progress) * Math.cos(progress * Math.PI * 4)
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) {
    return 0
  }

  if (progress >= 1) {
    return 1
  }

  return progress
}
