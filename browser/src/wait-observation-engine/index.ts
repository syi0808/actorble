import { notImplemented } from '../shared/index.js'
import type { WaitCondition, WaitOptions } from '../shared/index.js'
import type { WaitStrategy } from '../timeline-engine/index.js'

export type WaitResult = Readonly<{
  condition: WaitCondition
  satisfied: boolean
  strategy: WaitStrategy
}>

export interface WaitObservationEngine {
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>
  settle(strategy?: WaitStrategy, options?: WaitOptions): Promise<WaitResult | null>
  invalidateGeometry(reason: string): void
}

export class BrowserWaitObservationEngine implements WaitObservationEngine {
  waitFor(): Promise<WaitResult> {
    return notImplemented('Wait / Observation Engine waitFor')
  }

  settle(): Promise<WaitResult | null> {
    return notImplemented('Wait / Observation Engine settle')
  }

  invalidateGeometry(): void {
    return notImplemented('Wait / Observation Engine invalidateGeometry')
  }
}

export function createWaitObservationEngine(): WaitObservationEngine {
  return new BrowserWaitObservationEngine()
}
