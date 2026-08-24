import { cancellationError, timeoutError } from '../../shared/index.js';
import type { CancellationOptions, Clock, DurationMs, TimestampMs } from '../../shared/index.js';
export type { Clock } from '../../shared/index.js';

export type ResolvedWaitStrategy = 'none' | 'next-frame' | 'interaction-stable';
export type WaitStrategy =
  | ResolvedWaitStrategy
  /** @deprecated Use 'interaction-stable'. */
  | 'settled';

export function normalizeWaitStrategy(strategy: WaitStrategy): ResolvedWaitStrategy {
  return strategy === 'settled' ? 'interaction-stable' : strategy;
}

const FRAME_FALLBACK_MS = 16;

function normalizeDuration(duration: DurationMs): DurationMs {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return duration;
}

function getCancellation(
  options: CancellationOptions | undefined,
  operation: string,
): Error | null {
  const signal = options?.signal;

  if (!signal?.aborted) {
    return null;
  }

  return cancellationError(operation, signal.reason);
}

export interface TimelineEngine extends Clock {
  delay(duration: DurationMs, options?: CancellationOptions): Promise<void>;
  nextFrame(options?: CancellationOptions): Promise<TimestampMs>;
  settle(strategy?: WaitStrategy, options?: CancellationOptions): Promise<void>;
  withTimeout<TValue>(
    operation: Promise<TValue>,
    timeout: DurationMs,
    options?: CancellationOptions,
  ): Promise<TValue>;
}

export class BrowserTimelineEngine implements TimelineEngine {
  now(): TimestampMs {
    return Date.now();
  }

  delay(duration: DurationMs, options: CancellationOptions = {}): Promise<void> {
    const operation = 'timeline.delay';
    const cancellation = getCancellation(options, operation);

    if (cancellation) {
      return Promise.reject(cancellation);
    }

    return new Promise((resolve, reject) => {
      const signal = options.signal;
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }

        signal?.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(cancellationError(operation, signal?.reason));
      };

      timerId = setTimeout(() => {
        cleanup();
        resolve();
      }, normalizeDuration(duration));

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  nextFrame(options: CancellationOptions = {}): Promise<TimestampMs> {
    const operation = 'timeline.nextFrame';
    const cancellation = getCancellation(options, operation);

    if (cancellation) {
      return Promise.reject(cancellation);
    }

    return new Promise((resolve, reject) => {
      const signal = options.signal;
      let frameId: number | null = null;
      let timerId: ReturnType<typeof setTimeout> | null = null;
      let finished = false;

      const cleanup = () => {
        if (frameId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
          globalThis.cancelAnimationFrame(frameId);
          frameId = null;
        }

        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }

        signal?.removeEventListener('abort', onAbort);
      };

      const complete = (timestamp: TimestampMs) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        resolve(timestamp);
      };

      const fail = (error: Error) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        reject(error);
      };

      const onAbort = () => {
        fail(cancellationError(operation, signal?.reason));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      if (typeof globalThis.requestAnimationFrame === 'function') {
        frameId = globalThis.requestAnimationFrame((timestamp) => complete(timestamp));
        return;
      }

      timerId = setTimeout(() => {
        complete(this.now());
      }, FRAME_FALLBACK_MS);
    });
  }

  async settle(
    strategy: WaitStrategy = 'interaction-stable',
    options: CancellationOptions = {},
  ): Promise<void> {
    const operation = 'timeline.settle';
    const cancellation = getCancellation(options, operation);
    const resolvedStrategy = normalizeWaitStrategy(strategy);

    if (cancellation) {
      throw cancellation;
    }

    if (resolvedStrategy === 'none') {
      return;
    }

    if (resolvedStrategy === 'next-frame') {
      await this.nextFrame(options);
      return;
    }

    await Promise.resolve();

    const postMicrotaskCancellation = getCancellation(options, operation);

    if (postMicrotaskCancellation) {
      throw postMicrotaskCancellation;
    }

    await this.nextFrame(options);
  }

  withTimeout<TValue>(
    operation: Promise<TValue>,
    timeout: DurationMs,
    options: CancellationOptions = {},
  ): Promise<TValue> {
    const operationName = 'timeline.withTimeout';
    const cancellation = getCancellation(options, operationName);

    if (cancellation) {
      return Promise.reject(cancellation);
    }

    return new Promise((resolve, reject) => {
      const signal = options.signal;
      let timerId: ReturnType<typeof setTimeout> | null = null;
      let finished = false;

      const cleanup = () => {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }

        signal?.removeEventListener('abort', onAbort);
      };

      const complete = (value: TValue) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        resolve(value);
      };

      const fail = (error: unknown) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        reject(error);
      };

      const onAbort = () => {
        fail(cancellationError(operationName, signal?.reason));
      };

      timerId = setTimeout(() => {
        fail(timeoutError(operationName, normalizeDuration(timeout)));
      }, normalizeDuration(timeout));

      signal?.addEventListener('abort', onAbort, { once: true });
      operation.then(complete, fail);
    });
  }
}

export function createTimelineEngine(): TimelineEngine {
  return new BrowserTimelineEngine();
}
