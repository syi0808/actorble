import type { ScenarioLocator } from '../scenario/types.js'
import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'

export type LocatorCandidate = Readonly<{
  locator: ScenarioLocator
  score: number
  reason: string
  strict?: boolean
}>

export type LocatorSynthesisInput = Readonly<{
  target: unknown
  event?: unknown
}>

export function synthesizeLocatorCandidates(
  input: LocatorSynthesisInput,
): ExtensionResult<readonly LocatorCandidate[]> {
  return failure(
    notImplementedIssue('recorder.locatorSynthesis', {
      hasEvent: input.event !== undefined,
    }),
  )
}
