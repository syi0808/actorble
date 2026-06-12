import { BrowserDomAdapter } from '../platform-adapter/dom-adapter/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type {
  Disposable,
  DomPort,
  LayoutInvalidationReason,
  TimestampMs,
} from '../shared/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'

export type { LayoutInvalidationReason } from '../shared/index.js'

export type LayoutInvalidationEvent = Readonly<{
  reason: LayoutInvalidationReason
  reasons: readonly LayoutInvalidationReason[]
  at: TimestampMs
  coalesced: number
}>

export type LayoutInvalidationListener = (event: LayoutInvalidationEvent) => void

export type LayoutInvalidationObservationPort = Pick<
  DomPort,
  'observeLayoutInvalidations'
>

export type LayoutInvalidationTimeline = Pick<TimelineEngine, 'nextFrame' | 'now'>

export type LayoutInvalidationTrackerOptions = Readonly<{
  dom?: LayoutInvalidationObservationPort
  timeline?: LayoutInvalidationTimeline
}>

export interface LayoutInvalidationTracker extends Disposable {
  start(): void
  stop(): void
  isRunning(): boolean
  markDirty(reason: LayoutInvalidationReason): void
  subscribe(listener: LayoutInvalidationListener): Disposable
}

export class BrowserLayoutInvalidationTracker implements LayoutInvalidationTracker {
  readonly #dom: LayoutInvalidationObservationPort
  readonly #timeline: LayoutInvalidationTimeline
  readonly #listeners = new Set<LayoutInvalidationListener>()
  #running = false
  #observation: Disposable | null = null
  #frameController: AbortController | null = null
  #framePending = false
  #frameToken = 0
  #pendingCount = 0
  #pendingFirstReason: LayoutInvalidationReason | null = null
  readonly #pendingReasons: LayoutInvalidationReason[] = []

  constructor(options: LayoutInvalidationTrackerOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
  }

  start(): void {
    if (this.#running) {
      return
    }

    this.#running = true
    this.#clearPending()
    this.#observation = this.#dom.observeLayoutInvalidations((reason) => {
      this.markDirty(reason)
    })
  }

  stop(): void {
    this.#running = false
    this.#observation?.dispose()
    this.#observation = null
    this.#cancelPendingFrame()
    this.#clearPending()
  }

  isRunning(): boolean {
    return this.#running
  }

  markDirty(reason: LayoutInvalidationReason): void {
    if (!this.#running) {
      return
    }

    this.#pendingCount += 1
    this.#pendingFirstReason ??= reason

    if (!this.#pendingReasons.includes(reason)) {
      this.#pendingReasons.push(reason)
    }

    if (this.#framePending) {
      return
    }

    this.#scheduleFrameFlush()
  }

  subscribe(listener: LayoutInvalidationListener): Disposable {
    this.#listeners.add(listener)

    return {
      dispose: () => {
        this.#listeners.delete(listener)
      },
    }
  }

  dispose(): void {
    this.stop()
    this.#listeners.clear()
  }

  #scheduleFrameFlush(): void {
    this.#framePending = true
    const controller = new AbortController()
    const token = this.#frameToken + 1

    this.#frameToken = token
    this.#frameController = controller
    this.#timeline.nextFrame({ signal: controller.signal }).then(
      (timestamp) => {
        if (this.#frameToken !== token) {
          return
        }

        this.#framePending = false
        this.#frameController = null
        this.#flush(timestamp)
      },
      () => {
        if (this.#frameToken !== token) {
          return
        }

        this.#framePending = false
        this.#frameController = null
        this.#clearPending()
      },
    )
  }

  #flush(timestamp: TimestampMs): void {
    const firstReason = this.#pendingFirstReason

    if (!this.#running || firstReason === null || this.#pendingCount === 0) {
      this.#clearPending()
      return
    }

    const event: LayoutInvalidationEvent = {
      reason: firstReason,
      reasons: [...this.#pendingReasons],
      at: timestamp,
      coalesced: this.#pendingCount,
    }

    this.#clearPending()

    for (const listener of [...this.#listeners]) {
      listener(event)
    }
  }

  #cancelPendingFrame(): void {
    this.#frameToken += 1
    this.#frameController?.abort('layout invalidation stopped')
    this.#frameController = null
    this.#framePending = false
  }

  #clearPending(): void {
    this.#pendingCount = 0
    this.#pendingFirstReason = null
    this.#pendingReasons.length = 0
  }
}

export class NoopLayoutInvalidationTracker implements LayoutInvalidationTracker {
  #running = false

  start(): void {
    this.#running = true
  }

  stop(): void {
    this.#running = false
  }

  isRunning(): boolean {
    return this.#running
  }

  markDirty(_reason: LayoutInvalidationReason): void {}

  subscribe(_listener: LayoutInvalidationListener): Disposable {
    return { dispose() {} }
  }

  dispose(): void {
    this.stop()
  }
}

export function createLayoutInvalidationTracker(
  options: LayoutInvalidationTrackerOptions = {},
): LayoutInvalidationTracker {
  return new BrowserLayoutInvalidationTracker(options)
}
