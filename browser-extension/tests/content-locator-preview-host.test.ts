import { describe, expect, it, vi } from 'vitest'
import {
  createContentLocatorPreviewHost,
  type ContentLocatorPreviewActorble,
} from '../src/entrypoints/content/locator-preview-host.js'
import {
  createLocatorCandidates,
  type LocatorCandidate,
} from '../src/inspector/locator-preview.js'
import {
  createExtensionMessage,
  type InspectorTargetMetadata,
} from '../src/messaging/index.js'

describe('content locator preview host', () => {
  it('counts matches through Actorble resolveAll and reports strictness per candidate', async () => {
    const actorble = createActorblePreviewFacade({
      role: 1,
      label: 2,
      testId: 0,
    })
    const host = createContentLocatorPreviewHost({
      createActorble: () => actorble,
    })
    const candidates = createLocatorCandidates(target).slice(0, 3)

    const result = await host.handleMessage(previewMessage(candidates))

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'scenario-1',
        candidates: [
          {
            strategy: 'role',
            matchCount: 1,
            strict: true,
            status: 'unique',
          },
          {
            strategy: 'label',
            matchCount: 2,
            strict: false,
            status: 'ambiguous',
          },
          {
            strategy: 'testId',
            matchCount: 0,
            strict: false,
            status: 'zero-match',
          },
        ],
      },
    })
    expect(actorble.resolveAll).toHaveBeenCalledTimes(3)
    expect(actorble.resolveAll).toHaveBeenNthCalledWith(1, {
      kind: 'role',
      role: 'button',
      name: 'Sign in',
      exact: true,
    }, { strict: false })
    expect(actorble.destroy).toHaveBeenCalledOnce()
  })

  it('keeps per-candidate preview errors visible without failing the whole preview', async () => {
    const actorble = createActorblePreviewFacade({
      role: new Error('Invalid selector'),
    })
    const host = createContentLocatorPreviewHost({
      createActorble: () => actorble,
    })

    const result = await host.handleMessage(previewMessage(createLocatorCandidates(target).slice(0, 1)))

    expect(result).toMatchObject({
      ok: true,
      value: {
        candidates: [
          {
            strategy: 'role',
            matchCount: 0,
            strict: false,
            status: 'error',
            message: 'Invalid selector',
          },
        ],
      },
    })
    expect(actorble.destroy).toHaveBeenCalledOnce()
  })
})

const target = {
  tagName: 'button',
  id: 'submit',
  role: 'button',
  ariaLabel: 'Sign in',
  labelText: 'Sign in',
  testId: 'submit-button',
  text: 'Sign in',
  rect: {
    x: 10,
    y: 20,
    width: 100,
    height: 40,
  },
} satisfies InspectorTargetMetadata

function previewMessage(candidates: readonly LocatorCandidate[]) {
  return createExtensionMessage({
    kind: 'locator:preview',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      candidates,
    },
  })
}

function createActorblePreviewFacade(
  countsByKind: Readonly<Record<string, number | Error>>,
): ContentLocatorPreviewActorble {
  const resolveAll = vi.fn(async (locator: Readonly<{ kind: string }>) => {
    const countOrError = countsByKind[locator.kind] ?? 0
    if (countOrError instanceof Error) {
      throw countOrError
    }

    return Array.from({ length: countOrError }, (_, index) => ({ id: `${locator.kind}-${index}` }))
  })

  return {
    resolveAll: resolveAll as unknown as ContentLocatorPreviewActorble['resolveAll'],
    destroy: vi.fn(),
  }
}
