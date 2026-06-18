import {
  createExtensionMessage,
  isExtensionMessageOfKind,
  type ActorbleExtensionMessage,
  type ContentReadyMessage,
} from '../../messaging/index.js'
import { failure, ok, type ExtensionResult } from '../../shared/result.js'

export type ContentReadinessMetadata = ContentReadyMessage['payload']

export type ContentReadinessHost = Readonly<{
  handleMessage(message: unknown): ExtensionResult<ContentReadinessMetadata>
  emitReady(): Promise<ExtensionResult<ContentReadinessMetadata>>
}>

export type ContentReadinessHostOptions = Readonly<{
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
  getFrameId?(target: unknown): number
  frameTarget?: unknown
  url?: string
}>

const defaultCapabilities = {
  runtime: true,
  recorder: true,
  inspector: true,
  locatorPreview: true,
  frameCorrelation: true,
} as const

export function createContentReadinessHost(
  options: ContentReadinessHostOptions,
): ContentReadinessHost {
  function metadataFor(request: ContentReadinessMetadata = {}): ContentReadinessMetadata {
    const frameId = readFrameId(options)
    return {
      ...(request.tabId === undefined ? {} : { tabId: request.tabId }),
      ...(frameId === undefined ? optionalFrameId(request.frameId) : { frameId }),
      ...(options.url === undefined ? {} : { url: options.url }),
      ...(frameId === undefined ? {} : { topFrame: frameId === 0 }),
      capabilities: {
        ...defaultCapabilities,
        frameCorrelation: frameId !== undefined,
      },
    }
  }

  function handleMessage(message: unknown): ExtensionResult<ContentReadinessMetadata> {
    if (!isExtensionMessageOfKind(message, 'content:ready')) {
      return failure({
        code: 'unsupported_message',
        message: 'Content readiness received an unsupported message.',
      })
    }

    return ok(metadataFor(message.payload))
  }

  async function emitReady(): Promise<ExtensionResult<ContentReadinessMetadata>> {
    const payload = metadataFor()
    try {
      await options.sendMessage(createExtensionMessage({
        kind: 'content:ready',
        payload,
      }))
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Content readiness could not be emitted: ${describeUnknownError(error)}`,
      })
    }

    return ok(payload)
  }

  return {
    handleMessage,
    emitReady,
  }
}

function readFrameId(options: ContentReadinessHostOptions): number | undefined {
  if (options.getFrameId === undefined) {
    return undefined
  }

  try {
    const frameId = options.getFrameId(options.frameTarget ?? globalThis)
    return Number.isFinite(frameId) && frameId >= 0 ? frameId : undefined
  } catch {
    return undefined
  }
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId }
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
