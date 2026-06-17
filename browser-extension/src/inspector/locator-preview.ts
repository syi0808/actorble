import type { RequiredTabCorrelation } from '../messaging/index.js'
import type { ScenarioLocator } from '../scenario/types.js'
import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'

export type LocatorPreviewRequest = RequiredTabCorrelation &
  Readonly<{
    locator: ScenarioLocator
    strict?: boolean
  }>

export type LocatorPreview = Readonly<{
  locator: ScenarioLocator
  matchCount: number
  strict: boolean
  ambiguous: boolean
}>

export function previewLocator(
  request: LocatorPreviewRequest,
): ExtensionResult<LocatorPreview> {
  return failure(
    notImplementedIssue('inspector.locatorPreview', {
      strategy: request.locator.strategy,
      strict: request.strict,
    }),
  )
}
