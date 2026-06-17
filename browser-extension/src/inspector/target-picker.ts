import type { RequiredTabCorrelation } from '../messaging/index.js'
import type { LocatorCandidate } from '../recorder/locator-synthesis.js'
import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'

export type TargetPickerSession = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    startedAt: number
  }>

export type PickedTarget = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    target: unknown
    candidates: readonly LocatorCandidate[]
  }>

export function startTargetPicker(
  session: TargetPickerSession,
): ExtensionResult<TargetPickerSession> {
  return failure(
    notImplementedIssue('inspector.targetPicker', {
      sessionId: session.sessionId,
    }),
  )
}
