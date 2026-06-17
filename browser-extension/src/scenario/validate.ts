import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import draftScenarioSchema from '../../../schemas/scenario/draft/scenario.schema.json'
import {
  failure,
  ok,
  type ExtensionIssue,
  type ExtensionIssuePath,
  type ExtensionResult,
} from '../shared/result.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from './types.js'

export type ScenarioValidationResult = ExtensionResult<ScenarioDocument>

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
})

addFormats(ajv)

const validateDraftScenarioSchema =
  ajv.compile<ScenarioDocument>(draftScenarioSchema)

export function validateScenarioDocument(input: unknown): ScenarioValidationResult {
  const schemaVersion = readProperty(input, 'schemaVersion')

  if (
    typeof schemaVersion === 'string' &&
    schemaVersion !== DRAFT_SCENARIO_SCHEMA_VERSION
  ) {
    return failure({
      code: 'unsupported_schema_version',
      message: `Unsupported scenario schema version "${schemaVersion}".`,
      path: ['schemaVersion'],
      details: {
        schemaVersion,
        supportedSchemaVersions: [DRAFT_SCENARIO_SCHEMA_VERSION],
      },
    })
  }

  if (validateDraftScenarioSchema(input)) {
    return ok(input)
  }

  return failure(mapSchemaErrors(validateDraftScenarioSchema.errors ?? []))
}

function readProperty(input: unknown, property: string): unknown {
  if (typeof input !== 'object' || input === null) {
    return undefined
  }

  return (input as Readonly<Record<string, unknown>>)[property]
}

function mapSchemaErrors(errors: readonly ErrorObject[]): readonly ExtensionIssue[] {
  if (errors.length === 0) {
    return [
      {
        code: 'invalid_document',
        message: 'Scenario document does not match the draft schema.',
      },
    ]
  }

  return errors.map((error) => ({
    code: 'invalid_document',
    message: formatSchemaErrorMessage(error),
    path: pathForSchemaError(error),
    details: {
      keyword: error.keyword,
      schemaPath: error.schemaPath,
      params: error.params,
    },
  }))
}

function pathForSchemaError(error: ErrorObject): ExtensionIssuePath {
  const path = parseJsonPointer(error.instancePath)

  if (error.keyword === 'required') {
    const missingProperty = error.params.missingProperty
    if (typeof missingProperty === 'string') {
      return [...path, missingProperty]
    }
  }

  if (error.keyword === 'additionalProperties') {
    const additionalProperty = error.params.additionalProperty
    if (typeof additionalProperty === 'string') {
      return [...path, additionalProperty]
    }
  }

  return path
}

function parseJsonPointer(pointer: string): ExtensionIssuePath {
  if (pointer === '') {
    return []
  }

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => {
      const value = segment.replaceAll('~1', '/').replaceAll('~0', '~')
      return /^\d+$/.test(value) ? Number(value) : value
    })
}

function formatSchemaErrorMessage(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const missingProperty = error.params.missingProperty
    if (typeof missingProperty === 'string') {
      return `Missing required property "${missingProperty}".`
    }
  }

  if (error.keyword === 'additionalProperties') {
    const additionalProperty = error.params.additionalProperty
    if (typeof additionalProperty === 'string') {
      return `Unexpected property "${additionalProperty}".`
    }
  }

  return error.message ?? 'Scenario document does not match the draft schema.'
}
