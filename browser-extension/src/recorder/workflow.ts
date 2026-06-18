import type { RequiredTabCorrelation } from '../messaging/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../scenario/types.js'

export type RecordedScenarioDraftHandoff = RequiredTabCorrelation &
  Readonly<{
    draftId: string
    sessionId: string
    document: ScenarioDocument
    sourceEventCount: number
    createdAt: number
    scenarioId?: string
    runId?: string
  }>

export function documentWithRecordedDraftDefaults(
  draft: RecordedScenarioDraftHandoff,
): ScenarioDocument {
  return {
    ...draft.document,
    schemaVersion: draft.document.schemaVersion ?? DRAFT_SCENARIO_SCHEMA_VERSION,
    id: draft.document.id ?? recordedScenarioId(draft.draftId),
    name: draft.document.name ?? `Recorded scenario ${draft.draftId}`,
  }
}

export function recordedScenarioId(draftId: string): string {
  const suffix = draftId
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return `recorded-${suffix.length === 0 ? 'scenario' : suffix}`
}

