import type {
  RunOptions as BrowserRunOptions,
  Scenario as BrowserRuntimeScenario,
} from '@actorble/browser'
import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'
import type { ScenarioDocument } from './types.js'

export type BrowserRuntimeRunOptions = Omit<BrowserRunOptions, 'signal'>

export type BrowserRuntimeCompilation = Readonly<{
  scenario: BrowserRuntimeScenario
  runOptions?: BrowserRuntimeRunOptions
}>

export type BrowserRuntimeCompileResult = ExtensionResult<BrowserRuntimeCompilation>

export function compileToBrowserRuntime(
  document: ScenarioDocument,
): BrowserRuntimeCompileResult {
  return failure(
    notImplementedIssue('scenario.compileToBrowserRuntime', {
      schemaVersion: document.schemaVersion,
      stepCount: document.steps.length,
    }),
  )
}
