import { failure, notImplementedIssue, type ExtensionResult } from '../shared/result.js'
import type { RequiredTabCorrelation } from '../messaging/index.js'

export type RecorderSensitiveInputPolicy = 'mask' | 'omit' | 'plain'

export type RawRecordedClickEvent = Readonly<{
  kind: 'click'
  target: unknown
  timestamp: number
}>

export type RawRecordedTextEvent = Readonly<{
  kind: 'text'
  target: unknown
  value: string
  sensitive: boolean
  timestamp: number
}>

export type RawRecordedEvent = RawRecordedClickEvent | RawRecordedTextEvent

export type RecorderSession = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    startedAt: number
    sensitiveInputPolicy: RecorderSensitiveInputPolicy
  }>

export interface RecorderEventCapturePort {
  start(session: RecorderSession): Promise<void>
  stop(sessionId: string): Promise<readonly RawRecordedEvent[]>
}

export function createRecorderEventCapturePort(): ExtensionResult<RecorderEventCapturePort> {
  return failure(notImplementedIssue('recorder.eventCapture'))
}
