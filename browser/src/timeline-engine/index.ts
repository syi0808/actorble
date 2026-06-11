import { notImplemented } from '../shared/index.js'
import type { CancellationOptions, DurationMs, TimestampMs } from '../shared/index.js'

export type WaitStrategy = 'none' | 'next-frame' | 'settled'

export interface Clock {
  now(): TimestampMs
}

export interface TimelineEngine extends Clock {
  delay(duration: DurationMs, options?: CancellationOptions): Promise<void>
  nextFrame(options?: CancellationOptions): Promise<TimestampMs>
  withTimeout<TValue>(
    operation: Promise<TValue>,
    timeout: DurationMs,
    options?: CancellationOptions,
  ): Promise<TValue>
}

export class BrowserTimelineEngine implements TimelineEngine {
  now(): TimestampMs {
    return notImplemented('Timeline Engine now')
  }

  delay(): Promise<void> {
    return notImplemented('Timeline Engine delay')
  }

  nextFrame(): Promise<TimestampMs> {
    return notImplemented('Timeline Engine nextFrame')
  }

  withTimeout<TValue>(): Promise<TValue> {
    return notImplemented('Timeline Engine withTimeout')
  }
}

export function createTimelineEngine(): TimelineEngine {
  return new BrowserTimelineEngine()
}
