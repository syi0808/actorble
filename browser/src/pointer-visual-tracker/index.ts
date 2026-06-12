import { actorbleError } from '../shared/index.js'
import { BrowserGeometryEngine } from '../geometry-engine/index.js'
import type { SpanRecorder } from '../diagnostics-trace/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../geometry-engine/index.js'
import type { LayoutInvalidationTracker } from '../layout-invalidation-tracker/index.js'
import type { Disposable, Point, TargetHandle } from '../shared/index.js'

export type PointerVisualAnchor =
  | Readonly<{ kind: 'clickablePoint' }>
  | Readonly<{ kind: 'relative'; xRatio: number; yRatio: number }>

export type PointerVisualMode =
  | Readonly<{
      kind: 'freePoint'
      point: Point
      pressed: boolean
    }>
  | Readonly<{
      kind: 'targetAnchor'
      target: TargetHandle
      anchor: PointerVisualAnchor
      commandId: number
      pressed: boolean
      lastPoint?: Point
    }>

export type PointerVisualSnapshot = Readonly<{
  mode: PointerVisualMode | null
}>

export type PointerVisualUpdate = Readonly<{
  target: TargetHandle
  anchor: PointerVisualAnchor
  commandId: number
  pressed: boolean
  point: Point
  reason?: string
}>

export type PointerVisualStaleEvent = Readonly<{
  target: TargetHandle
  anchor: PointerVisualAnchor
  commandId: number
  pressed: boolean
  reason?: string
  error: string
}>

export type PointerVisualTrackerOptions = Readonly<{
  geometry?: Pick<GeometryEngine, 'snapshot'>
  layoutInvalidation?: Pick<LayoutInvalidationTracker, 'subscribe'>
  trace?: Pick<SpanRecorder, 'warn'>
  onUpdate?: (update: PointerVisualUpdate) => void
  onStale?: (event: PointerVisualStaleEvent) => void
}>

export interface PointerVisualTracker extends Disposable {
  setMode(mode: PointerVisualMode): void
  refresh(reason?: string): Promise<void>
  clear(): void
  getSnapshot(): PointerVisualSnapshot
}

const POINT_EPSILON = 0.5

export class BrowserPointerVisualTracker implements PointerVisualTracker {
  readonly #geometry: Pick<GeometryEngine, 'snapshot'>
  readonly #trace?: Pick<SpanRecorder, 'warn'>
  readonly #onUpdate?: (update: PointerVisualUpdate) => void
  readonly #onStale?: (event: PointerVisualStaleEvent) => void
  readonly #layoutInvalidationSubscription?: Disposable
  #mode: PointerVisualMode | null = null
  #lastPoint: Point | null = null
  #version = 0

  constructor(options: PointerVisualTrackerOptions = {}) {
    this.#geometry = options.geometry ?? new BrowserGeometryEngine()
    this.#trace = options.trace
    this.#onUpdate = options.onUpdate
    this.#onStale = options.onStale
    this.#layoutInvalidationSubscription = options.layoutInvalidation?.subscribe((event) => {
      void this.refresh(event.reason)
    })
  }

  setMode(mode: PointerVisualMode): void {
    this.#version += 1
    this.#mode = cloneMode(mode)
    this.#lastPoint = pointForMode(mode)
  }

  async refresh(reason?: string): Promise<void> {
    const mode = this.#mode

    if (mode?.kind !== 'targetAnchor') {
      return
    }

    const version = this.#version

    try {
      assertTargetAnchorLive(mode.target)
      const snapshot = await this.#geometry.snapshot(mode.target)

      if (!this.#isCurrentTargetAnchor(version, mode.commandId)) {
        return
      }

      const point = projectAnchorPoint(mode.anchor, snapshot)
      const lastPoint = this.#lastPoint

      if (lastPoint && samePoint(lastPoint, point)) {
        this.#mode = { ...mode, lastPoint: clonePoint(point) }
        this.#lastPoint = clonePoint(point)
        return
      }

      this.#mode = { ...mode, lastPoint: clonePoint(point) }
      this.#lastPoint = clonePoint(point)
      this.#notifyUpdate({
        target: mode.target,
        anchor: mode.anchor,
        commandId: mode.commandId,
        pressed: mode.pressed,
        point,
        ...(reason === undefined ? {} : { reason }),
      })
    } catch (error) {
      if (!this.#isCurrentTargetAnchor(version, mode.commandId)) {
        return
      }

      const staleEvent: PointerVisualStaleEvent = {
        target: mode.target,
        anchor: mode.anchor,
        commandId: mode.commandId,
        pressed: mode.pressed,
        ...(reason === undefined ? {} : { reason }),
        error: describeUnknownError(error),
      }

      this.#warnStale(staleEvent)
      this.clear()
      this.#notifyStale(staleEvent)
    }
  }

  clear(): void {
    this.#version += 1
    this.#mode = null
    this.#lastPoint = null
  }

  getSnapshot(): PointerVisualSnapshot {
    return { mode: this.#mode ? cloneMode(this.#mode) : null }
  }

  dispose(): void {
    this.#layoutInvalidationSubscription?.dispose()
    this.clear()
  }

  #isCurrentTargetAnchor(version: number, commandId: number): boolean {
    return (
      this.#version === version &&
      this.#mode?.kind === 'targetAnchor' &&
      this.#mode.commandId === commandId
    )
  }

  #notifyUpdate(update: PointerVisualUpdate): void {
    try {
      this.#onUpdate?.(update)
    } catch (error) {
      this.#trace?.warn('Pointer visual target-anchor update failed.', {
        targetId: update.target.id,
        commandId: update.commandId,
        error: describeUnknownError(error),
      })
    }
  }

  #notifyStale(event: PointerVisualStaleEvent): void {
    try {
      this.#onStale?.(event)
    } catch (error) {
      this.#trace?.warn('Pointer visual stale cleanup failed.', {
        targetId: event.target.id,
        commandId: event.commandId,
        error: describeUnknownError(error),
      })
    }
  }

  #warnStale(event: PointerVisualStaleEvent): void {
    this.#trace?.warn('Pointer visual target-anchor refresh failed.', {
      targetId: event.target.id,
      commandId: event.commandId,
      ...(event.reason === undefined ? {} : { reason: event.reason }),
      error: event.error,
    })
  }
}

export class NoopPointerVisualTracker implements PointerVisualTracker {
  #mode: PointerVisualMode | null = null

  setMode(mode: PointerVisualMode): void {
    this.#mode = mode
  }

  async refresh(_reason?: string): Promise<void> {}

  clear(): void {
    this.#mode = null
  }

  getSnapshot(): PointerVisualSnapshot {
    return { mode: this.#mode }
  }

  dispose(): void {
    this.clear()
  }
}

export function createPointerVisualTracker(
  options: PointerVisualTrackerOptions = {},
): PointerVisualTracker {
  return new BrowserPointerVisualTracker(options)
}

function projectAnchorPoint(
  anchor: PointerVisualAnchor,
  snapshot: GeometrySnapshot,
): Point {
  switch (anchor.kind) {
    case 'clickablePoint':
      if (snapshot.clickablePoint.ok) {
        return clonePoint(snapshot.clickablePoint.point)
      }

      throw actorbleError(
        'INTERACTABILITY_FAILED',
        'Pointer visual tracker could not project a clickable target anchor.',
        {
          details: {
            targetId: snapshot.target.id,
            reason: snapshot.clickablePoint.reason,
          },
        },
      )
    case 'relative':
      return {
        x: snapshot.rect.x + snapshot.rect.width * anchor.xRatio,
        y: snapshot.rect.y + snapshot.rect.height * anchor.yRatio,
      }
  }
}

function assertTargetAnchorLive(target: TargetHandle): void {
  if (target.validity === 'detached') {
    throw actorbleError('TARGET_DETACHED', 'Pointer visual target is detached.', {
      details: { targetId: target.id },
    })
  }

  if (target.validity === 'stale') {
    throw actorbleError('TARGET_STALE', 'Pointer visual target is stale.', {
      details: { targetId: target.id },
    })
  }
}

function pointForMode(mode: PointerVisualMode): Point | null {
  if (mode.kind === 'freePoint') {
    return clonePoint(mode.point)
  }

  return mode.lastPoint ? clonePoint(mode.lastPoint) : null
}

function cloneMode(mode: PointerVisualMode): PointerVisualMode {
  if (mode.kind === 'freePoint') {
    return {
      kind: 'freePoint',
      point: clonePoint(mode.point),
      pressed: mode.pressed,
    }
  }

  return {
    kind: 'targetAnchor',
    target: mode.target,
    anchor: cloneAnchor(mode.anchor),
    commandId: mode.commandId,
    pressed: mode.pressed,
    ...(mode.lastPoint === undefined ? {} : { lastPoint: clonePoint(mode.lastPoint) }),
  }
}

function cloneAnchor(anchor: PointerVisualAnchor): PointerVisualAnchor {
  return anchor.kind === 'clickablePoint'
    ? { kind: 'clickablePoint' }
    : { kind: 'relative', xRatio: anchor.xRatio, yRatio: anchor.yRatio }
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y }
}

function samePoint(left: Point, right: Point): boolean {
  return (
    Math.abs(left.x - right.x) <= POINT_EPSILON &&
    Math.abs(left.y - right.y) <= POINT_EPSILON
  )
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
