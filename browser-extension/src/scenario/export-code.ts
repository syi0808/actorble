import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'
import type { ScenarioDocument } from './types.js'

export type ScenarioCodeExport = Readonly<{
  filename: string
  source: string
}>

export type ScenarioCodeExportResult = ExtensionResult<ScenarioCodeExport>

export function exportScenarioToCode(document: ScenarioDocument): ScenarioCodeExportResult {
  return failure(
    notImplementedIssue('scenario.exportCode', {
      schemaVersion: document.schemaVersion,
      scenarioId: document.id,
    }),
  )
}
