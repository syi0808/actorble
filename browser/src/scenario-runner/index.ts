import { notImplemented } from '../shared/index.js'
import type { RunOptions, Scenario } from '../shared/index.js'

export type ScenarioRunStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

export type ScenarioRunSnapshot = Readonly<{
  scenario: Scenario | null
  status: ScenarioRunStatus
  currentStepIndex: number | null
}>

export interface ScenarioRunner {
  run(scenario: Scenario, options?: RunOptions): Promise<void>
  pause(): void
  resume(): void
  stop(): void
  getSnapshot(): ScenarioRunSnapshot
}

export class BrowserScenarioRunner implements ScenarioRunner {
  run(): Promise<void> {
    return notImplemented('Scenario Runner run')
  }

  pause(): void {
    return notImplemented('Scenario Runner pause')
  }

  resume(): void {
    return notImplemented('Scenario Runner resume')
  }

  stop(): void {
    return notImplemented('Scenario Runner stop')
  }

  getSnapshot(): ScenarioRunSnapshot {
    return notImplemented('Scenario Runner getSnapshot')
  }
}

export function createScenarioRunner(): ScenarioRunner {
  return new BrowserScenarioRunner()
}
