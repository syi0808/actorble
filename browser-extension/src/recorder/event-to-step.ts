import type { ScenarioDocument } from '../scenario/types.js'
import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'
import type { RawRecordedEvent } from './event-capture.js'

export type RecordedScenarioDraft = Readonly<{
  document: ScenarioDocument
  sourceEvents: readonly RawRecordedEvent[]
}>

export function normalizeRecordedEvents(
  events: readonly RawRecordedEvent[],
): ExtensionResult<RecordedScenarioDraft> {
  return failure(
    notImplementedIssue('recorder.eventToStep', {
      eventCount: events.length,
    }),
  )
}
