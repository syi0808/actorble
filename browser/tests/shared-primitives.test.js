import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ActorbleError,
  actorbleError,
  cancellationError,
  err,
  ok,
  resolveVisualFeedbackOptions,
  timeoutError,
} from '../src/shared/index.js'

describe('shared primitives', () => {
  it('creates stable result and ActorbleError helper shapes', () => {
    expect(ok('ready')).toEqual({ ok: true, value: 'ready' })

    const failure = actorbleError('TARGET_NOT_FOUND', 'Unable to resolve target', {
      details: { selector: '#missing' },
    })

    expect(err(failure)).toEqual({ ok: false, error: failure })
    expect(failure).toBeInstanceOf(ActorbleError)
    expect(failure).toMatchObject({
      name: 'ActorbleError',
      code: 'TARGET_NOT_FOUND',
      message: 'Unable to resolve target',
      details: { selector: '#missing' },
    })
  })

  it('creates standard timeout and cancellation errors', () => {
    expect(timeoutError('click', 250)).toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: { operation: 'click', timeout: 250 },
    })

    const reason = new Error('user stopped')
    const error = cancellationError('drag', reason)

    expect(error).toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'drag', reason },
    })
    expect(error.cause).toBe(reason)
  })

  it('normalizes public visual cursor scale options', () => {
    expect(
      resolveVisualFeedbackOptions({ enabled: true, cursorScale: 2 }).cursorScale,
    ).toBe(2)
    expect(
      resolveVisualFeedbackOptions({ enabled: true }, { cursorScale: 1.5 }).cursorScale,
    ).toBe(1.5)

    for (const cursorScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveVisualFeedbackOptions({ enabled: true, cursorScale }).cursorScale,
      ).toBe(1)
    }
  })
})

describe('shared boundary', () => {
  it('exports adapter port contracts without importing platform adapter modules', async () => {
    const source = await readFile(join(process.cwd(), 'src/shared/index.ts'), 'utf8')

    for (const exportedName of [
      'Clock',
      'Cancellation',
      'DomPort',
      'EventDispatchPort',
      'StateApplyPort',
      'StylePort',
      'PlatformAdapterPort',
    ]) {
      expect(source).toContain(`export interface ${exportedName}`)
    }

    expect(source).not.toMatch(/from\s+['"]\.\.\/(?!shared\/)/)
  })
})
