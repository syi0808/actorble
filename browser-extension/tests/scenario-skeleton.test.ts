import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import missingStepsFixture from '../../schemas/scenario/draft/fixtures/invalid/missing-steps.json'
import pointerDownStepFixture from '../../schemas/scenario/draft/fixtures/invalid/pointer-down-step.json'
import selectTextPointEndpointFixture from '../../schemas/scenario/draft/fixtures/invalid/select-text-point-endpoint.json'
import legacyTargetScrollFixture from '../../schemas/scenario/draft/fixtures/invalid/legacy-target-scroll.json'
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

  it('accepts valid draft example documents', () => {
    const result = validateScenarioDocument(browserLoginFlow)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.id).toBe('browser-login-flow')
    expect(result.value.steps).toHaveLength(4)
  })

  it('accepts selectText draft fixtures without transient selection state', async () => {
    const fixtures = await Promise.all([
      import('../../schemas/scenario/draft/fixtures/valid/select-text-direct-target.json'),
      import('../../schemas/scenario/draft/fixtures/valid/select-text-offset-range.json'),
    ])

    for (const fixture of fixtures) {
      const result = validateScenarioDocument(fixture.default)

      expect(result.ok).toBe(true)
      if (!result.ok) {
        continue
      }
      expect(result.value.steps[0]).toMatchObject({
        action: 'selectText',
      })
      expect(result.value.steps[0]).not.toHaveProperty('selectedText')
    }
  })

  it('rejects documents with missing required fields', () => {
    const result = validateScenarioDocument(missingStepsFixture)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      issues: [
        {
          code: 'invalid_document',
          path: ['steps'],
        },
      ],
    })
  })

  it('rejects unsupported schema versions without guessing', () => {
    const unsupportedDocument = {
      ...draftScenario,
      schemaVersion: 'actorble.scenario.v1',
    }

    const validation = validateScenarioDocument(unsupportedDocument)
    const migration = migrateScenarioDocument(unsupportedDocument)

    expect(validation.ok).toBe(false)
    expect(migration.ok).toBe(false)
    for (const result of [validation, migration]) {
      expect(result).toMatchObject({
        issues: [
          {
            code: 'unsupported_schema_version',
            path: ['schemaVersion'],
          },
        ],
      })
    }
  })

  it('rejects invalid locator shapes with field-level paths', () => {
    const result = validateScenarioDocument({
      ...draftScenario,
      steps: [
        {
          action: 'click',
          target: {
            strategy: 'css',
          },
        },
      ],
    })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_document',
          path: ['steps', 0, 'target', 'selector'],
        }),
      ]),
    })
  })

  it('rejects invalid step shapes with field-level paths', () => {
    const result = validateScenarioDocument({
      ...draftScenario,
      steps: [
        {
          action: 'delay',
          duration: 0,
        },
      ],
    })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_document',
          path: ['steps', 0, 'duration'],
        }),
      ]),
    })
  })

  it('rejects invalid selectText endpoints with field-level paths', () => {
    const result = validateScenarioDocument(selectTextPointEndpointFixture)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_document',
          path: ['steps', 0, 'target', 'anchor', 'offset'],
        }),
        expect.objectContaining({
          code: 'invalid_document',
          path: ['steps', 0, 'target', 'anchor', 'point'],
        }),
      ]),
    })
  })

  it('rejects raw pointer primitive draft steps', () => {
    const result = validateScenarioDocument(pointerDownStepFixture)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_document',
          path: ['steps', 0, 'action'],
        }),
      ]),
    })
  })

  it('rejects legacy target-based scrollTo documents without migration', () => {
    const validation = validateScenarioDocument(legacyTargetScrollFixture)
    const migration = migrateScenarioDocument(legacyTargetScrollFixture)

    for (const result of [validation, migration]) {
      expect(result.ok).toBe(false)
      expect(result).toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid_document',
            path: ['steps', 0, 'target'],
          }),
        ]),
      })
    }
  })

  it('returns draft documents unchanged during migration', () => {
    const migration = migrateScenarioDocument(draftScenario)

    expect(migration.ok).toBe(true)
    if (!migration.ok) {
      return
    }
    expect(migration.value).toBe(draftScenario)
  })

  it('exports draft documents to browser TypeScript code', () => {
    const codeExport = exportScenarioToCode(draftScenario)

    expect(codeExport.ok).toBe(true)
    if (!codeExport.ok) {
      return
    }
    expect(codeExport.value.filename).toBe('skeleton-smoke.actorble.ts')
    expect(codeExport.value.source).toContain("import { Actorble, type Scenario } from '@actorble/browser'")
    expect(codeExport.value.source).toContain("action: 'delay'")
  })
})
