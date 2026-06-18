import { describe, expect, it } from 'vitest'
import {
  createLocatorCandidates,
  createLocatorPreviewCandidateViews,
  createLocatorPreviewer,
  type LocatorPreviewClient,
} from '../src/inspector/locator-preview.js'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
  type InspectorTargetMetadata,
} from '../src/messaging/index.js'
import { ok } from '../src/shared/result.js'

const pickedTarget = {
  tagName: 'button',
  id: 'submit',
  classes: ['primary', 'wide'],
  role: 'button',
  ariaLabel: 'Sign in',
  labelText: 'Submit form',
  testId: 'submit-button',
  text: 'Sign in',
  frameUrl: 'http://localhost:3000/login',
  rect: {
    x: 10,
    y: 20,
    width: 100,
    height: 40,
  },
} satisfies InspectorTargetMetadata

describe('inspector locator preview', () => {
  it('builds ranked locator candidates from selected target metadata', () => {
    const candidates = createLocatorCandidates(pickedTarget)

    expect(candidates.map((candidate) => candidate.strategy)).toEqual([
      'role',
      'label',
      'testId',
      'text',
      'css',
      'point',
    ])
    expect(candidates[0]).toMatchObject({
      id: 'role-1',
      rank: 1,
      label: 'role: button "Sign in"',
      locator: {
        strategy: 'role',
        role: 'button',
        name: {
          value: 'Sign in',
          match: 'exact',
        },
      },
    })
    expect(candidates[1].locator).toEqual({
      strategy: 'label',
      label: {
        value: 'Submit form',
        match: 'exact',
      },
    })
    expect(candidates[2].locator).toEqual({
      strategy: 'testId',
      value: 'submit-button',
    })
    expect(candidates[4].locator).toEqual({
      strategy: 'css',
      selector: '#submit',
    })
    expect(candidates[5].locator).toEqual({
      strategy: 'point',
      point: {
        x: 60,
        y: 40,
        coordinateSpace: 'viewport',
      },
    })
  })

  it('formats preview results so unique, ambiguous, and zero-match states are visible', () => {
    const [role, label, text] = createLocatorCandidates(pickedTarget)
    const views = createLocatorPreviewCandidateViews([
      {
        ...role,
        matchCount: 1,
        strict: true,
        status: 'unique',
      },
      {
        ...label,
        matchCount: 3,
        strict: false,
        status: 'ambiguous',
      },
      {
        ...text,
        matchCount: 0,
        strict: false,
        status: 'zero-match',
      },
    ])

    expect(views.map((view) => view.matchSummary)).toEqual([
      '1 match · strict',
      '3 matches · ambiguous',
      '0 matches · zero-match',
    ])
    expect(views.map((view) => view.status)).toEqual([
      'unique',
      'ambiguous',
      'zero-match',
    ])
  })

  it('delegates preview checks through the extension messaging boundary', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const previewer = createLocatorPreviewer(createPreviewClient(sent))

    const result = await previewer.previewTarget(pickedTarget, 'scenario-1')

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: 7,
        scenarioId: 'scenario-1',
        candidates: [
          {
            strategy: 'role',
            matchCount: 1,
            strict: true,
            status: 'unique',
          },
        ],
      },
    })
    expect(sent[0]).toMatchObject({
      kind: 'locator:preview',
      payload: {
        tabId: 7,
        scenarioId: 'scenario-1',
      },
    })
    expect(sent[0]).toEqual(
      createExtensionMessage({
        kind: 'locator:preview',
        payload: {
          tabId: 7,
          scenarioId: 'scenario-1',
          candidates: createLocatorCandidates(pickedTarget),
        },
      }),
    )
    expect(previewer.getSnapshot()).toMatchObject({
      status: 'ready',
      candidates: [
        {
          status: 'unique',
        },
      ],
    })
  })
})

function createPreviewClient(sent: ActorbleExtensionMessage[]): LocatorPreviewClient {
  return {
    async getActiveTab() {
      return { id: 7, url: 'http://localhost:3000/login' }
    },
    async sendMessage(message) {
      sent.push(message)
      return ok({
        tabId: 7,
        scenarioId: 'scenario-1',
        candidates: [
          {
            ...createLocatorCandidates(pickedTarget)[0],
            matchCount: 1,
            strict: true,
            status: 'unique',
          },
        ],
      })
    },
  }
}
