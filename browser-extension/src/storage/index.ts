import type { ScenarioDocument, ScenarioSchemaVersion } from '../scenario/types.js'

export type ScenarioRunSummary = Readonly<{
  runId: string
  status: 'completed' | 'failed' | 'stopped'
  completedAt: string
  error?: string
}>

export type ScenarioRecord = Readonly<{
  id: string
  name: string
  schemaVersion: ScenarioSchemaVersion
  document: ScenarioDocument
  createdAt: string
  updatedAt: string
  lastRun?: ScenarioRunSummary
}>

export type ScenarioRecordInput = Readonly<{
  id?: string
  name: string
  document: ScenarioDocument
}>

export interface ScenarioStorageRepository {
  list(): Promise<readonly ScenarioRecord[]>
  get(id: string): Promise<ScenarioRecord | null>
  save(input: ScenarioRecordInput): Promise<ScenarioRecord>
  rename(id: string, name: string): Promise<ScenarioRecord>
  delete(id: string): Promise<void>
  updateLastRun(id: string, lastRun: ScenarioRunSummary): Promise<ScenarioRecord>
}
