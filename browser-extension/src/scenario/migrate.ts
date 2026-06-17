import type { ExtensionResult } from '../shared/result.js'
import type { ScenarioDocument } from './types.js'
import { validateScenarioDocument } from './validate.js'

export type ScenarioMigrationResult = ExtensionResult<ScenarioDocument>

export function migrateScenarioDocument(input: unknown): ScenarioMigrationResult {
  return validateScenarioDocument(input)
}
