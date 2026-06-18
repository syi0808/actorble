import type {
  Actorble,
  ActorbleFacadeOptions,
} from '@actorble/browser'
import { isExtensionMessageOfKind } from '../../messaging/index.js'
import type { ActorbleExtensionMessageByKind } from '../../messaging/index.js'
import {
  compileScenarioLocatorToBrowserRuntime,
} from '../../scenario/compile-to-browser-runtime.js'
import { failure, ok, type ExtensionResult } from '../../shared/result.js'
import type {
  LocatorPreviewCandidate,
  LocatorPreviewResult,
} from '../../inspector/locator-preview.js'

export type ContentLocatorPreviewActorble = Pick<Actorble, 'resolveAll' | 'destroy'>

export type ContentLocatorPreviewHost = Readonly<{
  handleMessage(message: unknown): Promise<ExtensionResult<LocatorPreviewResult>>
}>

export type ContentLocatorPreviewHostOptions = Readonly<{
  createActorble(options: ActorbleFacadeOptions): ContentLocatorPreviewActorble
}>

type LocatorPreviewMessage = ActorbleExtensionMessageByKind<'locator:preview'>

export function createContentLocatorPreviewHost(
  options: ContentLocatorPreviewHostOptions,
): ContentLocatorPreviewHost {
  async function handleMessage(
    message: unknown,
  ): Promise<ExtensionResult<LocatorPreviewResult>> {
    if (!isExtensionMessageOfKind(message, 'locator:preview')) {
      return failure({
        code: 'unsupported_message',
        message: 'Content locator preview received an unsupported message.',
      })
    }

    let actorble: ContentLocatorPreviewActorble
    try {
      const actorbleOptions = {
        feedback: 'off',
        motion: false,
      } as ActorbleFacadeOptions
      actorble = options.createActorble(actorbleOptions)
    } catch (error) {
      return failure({
        code: 'runtime_error',
        message: 'Actorble runtime could not be created for locator preview.',
        details: {
          error: describeUnknownError(error),
        },
      })
    }

    try {
      const candidates = await Promise.all(
        message.payload.candidates.map((candidate, index) => (
          previewCandidate(actorble, message, candidate, index)
        )),
      )

      return ok({
        tabId: message.payload.tabId,
        ...(message.payload.frameId === undefined ? {} : { frameId: message.payload.frameId }),
        ...(message.payload.scenarioId === undefined ? {} : { scenarioId: message.payload.scenarioId }),
        ...(message.payload.targetSlot === undefined ? {} : { targetSlot: message.payload.targetSlot }),
        candidates,
      })
    } finally {
      actorble.destroy()
    }
  }

  return {
    handleMessage,
  }
}

async function previewCandidate(
  actorble: ContentLocatorPreviewActorble,
  _message: LocatorPreviewMessage,
  candidate: LocatorPreviewMessage['payload']['candidates'][number],
  index: number,
): Promise<LocatorPreviewCandidate> {
  const runtimeLocator = compileScenarioLocatorToBrowserRuntime(
    candidate.locator,
    ['candidates', index, 'locator'],
  )

  if (!runtimeLocator.ok) {
    return {
      ...candidate,
      matchCount: 0,
      strict: false,
      status: 'error',
      message: runtimeLocator.issues[0]?.message ?? 'Locator could not be compiled.',
    }
  }

  try {
    const matches = await actorble.resolveAll(runtimeLocator.value, { strict: false })
    const matchCount = matches.length

    return {
      ...candidate,
      matchCount,
      strict: matchCount === 1,
      status: statusForMatchCount(matchCount),
    }
  } catch (error) {
    return {
      ...candidate,
      matchCount: 0,
      strict: false,
      status: 'error',
      message: describeUnknownError(error),
    }
  }
}

function statusForMatchCount(matchCount: number): LocatorPreviewCandidate['status'] {
  if (matchCount === 0) {
    return 'zero-match'
  }

  return matchCount === 1 ? 'unique' : 'ambiguous'
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
