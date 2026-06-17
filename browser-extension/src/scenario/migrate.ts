import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'
import type { ScenarioDocument } from './types.js'

export type ScenarioMigrationResult = ExtensionResult<ScenarioDocument>

export function migrateScenarioDocument(document: ScenarioDocument): ScenarioMigrationResult {
  return failure(
    notImplementedIssue('scenario.migrate', {
      schemaVersion: document.schemaVersion,
    }),
  )
}
