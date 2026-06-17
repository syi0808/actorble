import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from './types.js'

export type ScenarioValidationResult = ExtensionResult<ScenarioDocument>

export function validateScenarioDocument(input: unknown): ScenarioValidationResult {
  return failure(
    notImplementedIssue('scenario.validate', {
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      inputType: typeof input,
    }),
  )
}
