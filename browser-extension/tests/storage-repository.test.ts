import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import {
  createScenarioStorageRepository,
  type ScenarioExtensionStorageArea,
} from '../src/storage/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'
import type { ExtensionResult } from '../src/shared/result.js'

const draftDocument = {
  schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
  id: 'stored-draft',
  name: 'Stored draft',
  steps: [
    {
      id: 'delay',
      action: 'delay',
      duration: 1,
    },
  ],
} satisfies ScenarioDocument

const browserLoginDocument = browserLoginFlow as ScenarioDocument

describe('scenario storage repository', () => {
  it('creates and loads extension-owned records for portable scenario documents', async () => {
    const repository = createRepository({ now: fixedNow('2026-06-17T00:00:00.000Z') })

    const record = expectOk(await repository.save({ document: browserLoginDocument }))
    const loaded = expectOk(await repository.get('browser-login-flow'))

    expect(record).toMatchObject({
      id: 'browser-login-flow',
      name: 'Browser login flow',
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
    })
    expect(record.document).toEqual(browserLoginDocument)
    expect(record.lastRun).toBeUndefined()
    expect(loaded).toEqual(record)
  })

  it('updates records while preserving createdAt and document portability', async () => {
    const repository = createRepository({
      now: sequenceNow('2026-06-17T00:00:00.000Z', '2026-06-17T00:01:00.000Z'),
    })

    const created = expectOk(
      await repository.save({
        id: 'record-1',
        name: 'Initial record',
        document: draftDocument,
      }),
    )
    const updatedDocument = {
      ...draftDocument,
      id: 'updated-draft',
      name: 'Updated draft',
    } satisfies ScenarioDocument

    const updated = expectOk(
      await repository.update('record-1', {
        name: 'Renamed record',
        document: updatedDocument,
      }),
    )

    expect(updated).toMatchObject({
      id: 'record-1',
      name: 'Renamed record',
      createdAt: created.createdAt,
      updatedAt: '2026-06-17T00:01:00.000Z',
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    })
    expect(updated.document).toEqual(updatedDocument)
    expect(updated).not.toHaveProperty('compilation')
  })

  it('lists records by newest update first', async () => {
    const repository = createRepository({
      now: sequenceNow(
        '2026-06-17T00:00:00.000Z',
        '2026-06-17T00:01:00.000Z',
        '2026-06-17T00:02:00.000Z',
      ),
    })

    await repository.save({ id: 'older', document: scenarioDocument('older') })
    await repository.save({ id: 'newer', document: scenarioDocument('newer') })
    await repository.rename('older', 'Most recent')

    const records = expectOk(await repository.list())

    expect(records.map((record) => record.id)).toEqual(['older', 'newer'])
  })

  it('deletes records', async () => {
    const repository = createRepository()

    await repository.save({ id: 'delete-me', document: draftDocument })
    expectOk(await repository.delete('delete-me'))

    expect(expectOk(await repository.get('delete-me'))).toBeNull()
    expect(expectOk(await repository.list())).toEqual([])
  })

  it('rejects imported JSON before writing invalid documents', async () => {
    const repository = createRepository()

    const importResult = await repository.importJson(
      JSON.stringify({ schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION }),
    )

    expect(importResult).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid_document',
          path: ['steps'],
        },
      ],
    })
    expect(expectOk(await repository.list())).toEqual([])
  })

  it('imports valid JSON and exports only the portable scenario document', async () => {
    const repository = createRepository()

    const imported = expectOk(await repository.importJson(JSON.stringify(browserLoginFlow)))
    const exported = expectOk(await repository.exportJson(imported.id))

    expect(imported.id).toBe('browser-login-flow')
    expect(exported).toMatchObject({
      id: 'browser-login-flow',
      filename: 'browser-login-flow.json',
      document: browserLoginDocument,
    })
    expect(JSON.parse(exported.jsonText)).toEqual(browserLoginDocument)
    expect(exported.jsonText).not.toContain('lastRun')
  })

  it('updates the last run summary without replacing the scenario document', async () => {
    const repository = createRepository({
      now: sequenceNow('2026-06-17T00:00:00.000Z', '2026-06-17T00:03:00.000Z'),
    })

    const created = expectOk(await repository.save({ id: 'run-record', document: draftDocument }))
    const lastRun = {
      runId: 'run-1',
      status: 'completed',
      completedAt: '2026-06-17T00:02:00.000Z',
    } as const

    const updated = expectOk(await repository.updateLastRun('run-record', lastRun))

    expect(updated).toMatchObject({
      id: 'run-record',
      createdAt: created.createdAt,
      updatedAt: '2026-06-17T00:03:00.000Z',
      lastRun,
    })
    expect(updated.document).toEqual(draftDocument)
  })
})

function createRepository(
  options: Readonly<{
    now?: () => string
    createId?: () => string
  }> = {},
) {
  return createScenarioStorageRepository(createMemoryStorage(), {
    now: options.now ?? fixedNow('2026-06-17T00:00:00.000Z'),
    createId: options.createId ?? (() => 'generated-scenario'),
  })
}

function createMemoryStorage(): ScenarioExtensionStorageArea {
  let state: Record<string, unknown> = {}

  return {
    async get(key) {
      if (typeof key === 'string') {
        return { [key]: state[key] }
      }

      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((item) => [item, state[item]]))
      }

      if (key !== undefined && key !== null) {
        return Object.fromEntries(
          Object.entries(key).map(([item, fallback]) => [
            item,
            state[item] ?? fallback,
          ]),
        )
      }

      return { ...state }
    },
    async set(items) {
      state = {
        ...state,
        ...items,
      }
    },
  }
}

function scenarioDocument(id: string): ScenarioDocument {
  return {
    ...draftDocument,
    id,
    name: id,
  }
}

function fixedNow(value: string): () => string {
  return () => value
}

function sequenceNow(first: string, ...rest: string[]): () => string {
  const values = [first, ...rest]
  let index = 0

  return () => values[Math.min(index++, values.length - 1)]
}

function expectOk<TValue>(result: ExtensionResult<TValue>): TValue {
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected result to be ok: ${JSON.stringify(result.issues)}`)
  }

  return result.value
}
