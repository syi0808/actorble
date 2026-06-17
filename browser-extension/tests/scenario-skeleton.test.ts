import { describe, expect, it } from 'vitest'
import { compileToBrowserRuntime } from '../src/scenario/compile-to-browser-runtime.js'
import { exportScenarioToCode } from '../src/scenario/export-code.js'
import { migrateScenarioDocument } from '../src/scenario/migrate.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'
import { validateScenarioDocument } from '../src/scenario/validate.js'

const draftScenario = {
  schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
  id: 'skeleton-smoke',
  name: 'Skeleton smoke',
  steps: [
    {
      id: 'delay',
      action: 'delay',
      duration: 1,
    },
  ],
} satisfies ScenarioDocument

describe('scenario skeleton contracts', () => {
  it('keeps the draft schema version as the only skeleton document version', () => {
    expect(DRAFT_SCENARIO_SCHEMA_VERSION).toBe('actorble.scenario.draft')
    expect(draftScenario.schemaVersion).toBe(DRAFT_SCENARIO_SCHEMA_VERSION)
  })

  it('returns typed validation failure until schema validation is implemented', () => {
    const result = validateScenarioDocument(draftScenario)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      issues: [
        {
          code: 'not_implemented',
        },
      ],
    })
  })

  it('keeps migration, compiler, and code export as explicit stubs', () => {
    const migration = migrateScenarioDocument(draftScenario)
    const compilation = compileToBrowserRuntime(draftScenario)
    const codeExport = exportScenarioToCode(draftScenario)

    expect(migration.ok).toBe(false)
    expect(compilation.ok).toBe(false)
    expect(codeExport.ok).toBe(false)

    for (const result of [migration, compilation, codeExport]) {
      expect(result).toMatchObject({
        issues: [
          {
            code: 'not_implemented',
          },
        ],
      })
    }
  })
})
