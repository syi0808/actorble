import { failure } from '../shared/result.js'

export type AsyncExtensionMessageResponder<TSender = unknown> = (
  message: unknown,
  sender: TSender,
) => unknown | Promise<unknown>

export type ExtensionMessageSendResponse = (response?: unknown) => void

export function createAsyncExtensionMessageListener<TSender = unknown>(
  responder: AsyncExtensionMessageResponder<TSender>,
): (
  message: unknown,
  sender: TSender,
  sendResponse: ExtensionMessageSendResponse,
) => true {
  return (message, sender, sendResponse) => {
    Promise.resolve()
      .then(() => responder(message, sender))
      .then((response) => {
        sendResponse(response)
      })
      .catch((error) => {
        sendResponse(failure({
          code: 'runtime_error',
          message: `Extension message handler failed: ${describeUnknownError(error)}`,
        }))
      })

    return true
  }
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
