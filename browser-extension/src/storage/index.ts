import { browser } from 'wxt/browser';
import { migrateScenarioDocument } from '../scenario/migrate.js';
import type { ScenarioDocument, ScenarioSchemaVersion } from '../scenario/types.js';
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../shared/result.js';

export const SCENARIO_STORAGE_RECORDS_KEY = 'actorble.scenarios.records';

export type ScenarioRunSummary = Readonly<{
  runId: string;
  status: 'completed' | 'failed' | 'stopped';
  completedAt: string;
  error?: string;
}>;

export type ScenarioRecord = Readonly<{
  id: string;
  name: string;
  schemaVersion: ScenarioSchemaVersion;
  document: ScenarioDocument;
  createdAt: string;
  updatedAt: string;
  lastRun?: ScenarioRunSummary;
}>;

export type ScenarioRecordInput = Readonly<{
  id?: string;
  name?: string;
  document: ScenarioDocument;
}>;

export type ScenarioRecordUpdate = Readonly<{
  name?: string;
  document?: ScenarioDocument;
}>;

export type ScenarioImportOptions = Readonly<{
  id?: string;
  name?: string;
}>;

export type ScenarioJsonExport = Readonly<{
  id: string;
  filename: string;
  jsonText: string;
  document: ScenarioDocument;
}>;

export type ScenarioExtensionStorageArea = Readonly<{
  get(
    key?: string | readonly string[] | Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>>;
  set(items: Readonly<Record<string, unknown>>): Promise<void>;
}>;

export interface ScenarioStorageRepository {
  list(): Promise<ExtensionResult<readonly ScenarioRecord[]>>;
  get(id: string): Promise<ExtensionResult<ScenarioRecord | null>>;
  save(input: ScenarioRecordInput): Promise<ExtensionResult<ScenarioRecord>>;
  update(id: string, update: ScenarioRecordUpdate): Promise<ExtensionResult<ScenarioRecord>>;
  rename(id: string, name: string): Promise<ExtensionResult<ScenarioRecord>>;
  delete(id: string): Promise<ExtensionResult<void>>;
  importJson(
    jsonText: string,
    options?: ScenarioImportOptions,
  ): Promise<ExtensionResult<ScenarioRecord>>;
  exportJson(id: string): Promise<ExtensionResult<ScenarioJsonExport>>;
  updateLastRun(id: string, lastRun: ScenarioRunSummary): Promise<ExtensionResult<ScenarioRecord>>;
}

export type ScenarioStorageRepositoryOptions = Readonly<{
  now?: () => string;
  createId?: () => string;
}>;

type ScenarioRecordMap = Record<string, ScenarioRecord>;

let generatedIdSequence = 1;

export function createWxtScenarioStorageRepository(
  options: ScenarioStorageRepositoryOptions = {},
): ScenarioStorageRepository {
  return createScenarioStorageRepository(browser.storage.local, options);
}

export function createScenarioStorageRepository(
  storage: ScenarioExtensionStorageArea,
  options: ScenarioStorageRepositoryOptions = {},
): ScenarioStorageRepository {
  const now = options.now ?? defaultNow;
  const createId = options.createId ?? defaultCreateId;

  async function list(): Promise<ExtensionResult<readonly ScenarioRecord[]>> {
    const records = await readRecords(storage);
    if (!records.ok) {
      return records;
    }

    return ok(
      Object.values(records.value).sort((left, right) => {
        const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);
        return updatedOrder === 0 ? left.id.localeCompare(right.id) : updatedOrder;
      }),
    );
  }

  async function get(id: string): Promise<ExtensionResult<ScenarioRecord | null>> {
    const records = await readRecords(storage);
    if (!records.ok) {
      return records;
    }

    return ok(records.value[id] ?? null);
  }

  async function save(input: ScenarioRecordInput): Promise<ExtensionResult<ScenarioRecord>> {
    const migration = migrateScenarioDocument(input.document);
    if (!migration.ok) {
      return migration;
    }

    const records = await readRecords(storage);
    if (!records.ok) {
      return records;
    }

    const document = migration.value;
    const id = input.id ?? document.id ?? createId();
    const stored = records.value[id];
    const timestamp = now();
    const record: ScenarioRecord =
      stored === undefined
        ? {
            id,
            name: recordName(input.name, document),
            schemaVersion: document.schemaVersion,
            document,
            createdAt: timestamp,
            updatedAt: timestamp,
          }
        : {
            ...stored,
            name: recordName(input.name, document),
            schemaVersion: document.schemaVersion,
            document,
            updatedAt: timestamp,
          };

    return writeRecord(storage, records.value, record);
  }

  async function update(
    id: string,
    updateInput: ScenarioRecordUpdate,
  ): Promise<ExtensionResult<ScenarioRecord>> {
    const records = await readRecords(storage);
    if (!records.ok) {
      return records;
    }

    const stored = records.value[id];
    if (stored === undefined) {
      return failure(missingRecordIssue(id));
    }

    const documentResult =
      updateInput.document === undefined
        ? ok(stored.document)
        : migrateScenarioDocument(updateInput.document);
    if (!documentResult.ok) {
      return documentResult;
    }

    const record: ScenarioRecord = {
      ...stored,
      name: updateInput.name ?? stored.name,
      schemaVersion: documentResult.value.schemaVersion,
      document: documentResult.value,
      updatedAt: now(),
    };

    return writeRecord(storage, records.value, record);
  }

  async function rename(id: string, name: string): Promise<ExtensionResult<ScenarioRecord>> {
    return update(id, { name });
  }

  async function deleteRecord(id: string): Promise<ExtensionResult<void>> {
    const records = await readRecords(storage);
    if (!records.ok) {
      return records;
    }

    const nextRecords = { ...records.value };
    delete nextRecords[id];

    return writeRecords(storage, nextRecords);
  }

  async function importJson(
    jsonText: string,
    importOptions: ScenarioImportOptions = {},
  ): Promise<ExtensionResult<ScenarioRecord>> {
    const parsed = parseScenarioJson(jsonText);
    if (!parsed.ok) {
      return parsed;
    }

    const migration = migrateScenarioDocument(parsed.value);
    if (!migration.ok) {
      return migration;
    }

    return save({
      id: importOptions.id,
      name: importOptions.name,
      document: migration.value,
    });
  }

  async function exportJson(id: string): Promise<ExtensionResult<ScenarioJsonExport>> {
    const record = await getExistingRecord(storage, id);
    if (!record.ok) {
      return record;
    }

    return ok({
      id: record.value.id,
      filename: filenameFor(record.value),
      jsonText: `${JSON.stringify(record.value.document, null, 2)}\n`,
      document: record.value.document,
    });
  }

  async function updateLastRun(
    id: string,
    lastRun: ScenarioRunSummary,
  ): Promise<ExtensionResult<ScenarioRecord>> {
    const records = await readRecords(storage);
    if (!records.ok) {
      return records;
    }

    const stored = records.value[id];
    if (stored === undefined) {
      return failure(missingRecordIssue(id));
    }

    return writeRecord(storage, records.value, {
      ...stored,
      lastRun,
      updatedAt: now(),
    });
  }

  return {
    list,
    get,
    save,
    update,
    rename,
    delete: deleteRecord,
    importJson,
    exportJson,
    updateLastRun,
  };
}

async function getExistingRecord(
  storage: ScenarioExtensionStorageArea,
  id: string,
): Promise<ExtensionResult<ScenarioRecord>> {
  const records = await readRecords(storage);
  if (!records.ok) {
    return records;
  }

  const record = records.value[id];
  return record === undefined ? failure(missingRecordIssue(id)) : ok(record);
}

async function readRecords(
  storage: ScenarioExtensionStorageArea,
): Promise<ExtensionResult<ScenarioRecordMap>> {
  let stored: Record<string, unknown>;

  try {
    stored = await storage.get(SCENARIO_STORAGE_RECORDS_KEY);
  } catch (error) {
    return failure(storageIssue('Scenario records could not be loaded.', error));
  }

  const value = stored[SCENARIO_STORAGE_RECORDS_KEY];
  if (value === undefined) {
    return ok({});
  }

  if (!isRecord(value)) {
    return failure({
      code: 'storage_error',
      message: 'Stored scenario records are not a record map.',
    });
  }

  const records: ScenarioRecordMap = {};
  for (const [id, record] of Object.entries(value)) {
    if (!isScenarioRecord(record)) {
      return failure({
        code: 'storage_error',
        message: `Stored scenario record "${id}" is invalid.`,
        details: { id },
      });
    }

    records[id] = record;
  }

  return ok(records);
}

async function writeRecord(
  storage: ScenarioExtensionStorageArea,
  records: ScenarioRecordMap,
  record: ScenarioRecord,
): Promise<ExtensionResult<ScenarioRecord>> {
  const result = await writeRecords(storage, {
    ...records,
    [record.id]: record,
  });

  return result.ok ? ok(record) : result;
}

async function writeRecords(
  storage: ScenarioExtensionStorageArea,
  records: ScenarioRecordMap,
): Promise<ExtensionResult<void>> {
  try {
    await storage.set({
      [SCENARIO_STORAGE_RECORDS_KEY]: records,
    });
    return ok(undefined);
  } catch (error) {
    return failure(storageIssue('Scenario records could not be saved.', error));
  }
}

function parseScenarioJson(jsonText: string): ExtensionResult<unknown> {
  try {
    return ok(JSON.parse(jsonText));
  } catch (error) {
    return failure({
      code: 'invalid_document',
      message: 'Scenario JSON is not valid JSON.',
      details: {
        reason: errorMessage(error),
      },
    });
  }
}

function recordName(name: string | undefined, document: ScenarioDocument): string {
  return name ?? document.name ?? document.id ?? 'Untitled scenario';
}

function filenameFor(record: ScenarioRecord): string {
  const baseName = record.id
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return `${baseName.length === 0 ? 'scenario' : baseName}.json`;
}

function missingRecordIssue(id: string): ExtensionIssue {
  return {
    code: 'storage_error',
    message: `Scenario record "${id}" was not found.`,
    details: { id },
  };
}

function storageIssue(message: string, error: unknown): ExtensionIssue {
  return {
    code: 'storage_error',
    message,
    details: {
      reason: errorMessage(error),
    },
  };
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ?? `scenario-${Date.now()}-${generatedIdSequence++}`;
}

function isScenarioRecord(value: unknown): value is ScenarioRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.schemaVersion === 'string' &&
    isRecord(value.document) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.lastRun === undefined || isScenarioRunSummary(value.lastRun))
  );
}

function isScenarioRunSummary(value: unknown): value is ScenarioRunSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.runId === 'string' &&
    (value.status === 'completed' || value.status === 'failed' || value.status === 'stopped') &&
    typeof value.completedAt === 'string' &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
