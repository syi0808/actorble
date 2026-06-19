import { describe, expect, it, vi } from 'vitest'
import {
  createAsyncExtensionMessageListener,
} from '../src/messaging/async-message-listener.js'

describe('async extension message listener', () => {
  it('keeps the Chrome message channel open and responds asynchronously', async () => {
    const sendResponse = vi.fn()
    const listener = createAsyncExtensionMessageListener(async (message, sender) => ({
      ok: true,
      value: {
        message,
        sender,
      },
    }))

    const returned = listener('request', { tab: { id: 7 } }, sendResponse)

    expect(returned).toBe(true)
    expect(sendResponse).not.toHaveBeenCalled()
    await flushPromises()
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      value: {
        message: 'request',
        sender: { tab: { id: 7 } },
      },
    })
  })

  it('responds with a runtime error result when the handler throws', async () => {
    const sendResponse = vi.fn()
    const listener = createAsyncExtensionMessageListener(() => {
      throw new Error('boom')
    })

    const returned = listener('request', {}, sendResponse)

    expect(returned).toBe(true)
    await flushPromises()
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      issues: [
        {
          code: 'runtime_error',
          message: 'Extension message handler failed: boom',
        },
      ],
    })
  })
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
