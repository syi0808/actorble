import { actorbleError } from '../../shared/index.js'
import type { Disposable, StyleInjection, StylePort } from '../../shared/index.js'
export type { StyleInjection } from '../../shared/index.js'

export interface StyleAdapter extends StylePort {}

export class BrowserStyleAdapter implements StyleAdapter {
  private readonly stylesById = new Map<string, HTMLStyleElement>()

  constructor(readonly root: Document | ShadowRoot = getGlobalDocument()) {}

  injectStyle(injection: StyleInjection): Disposable {
    this.removeStyle(injection.id)

    const style = getOwnerDocument(this.root).createElement('style')
    style.setAttribute('data-actorble-style-id', injection.id)
    style.textContent = injection.cssText
    getStyleContainer(this.root).append(style)
    this.stylesById.set(injection.id, style)

    return {
      dispose: () => {
        if (this.stylesById.get(injection.id) === style) {
          this.removeStyle(injection.id)
          return
        }

        style.remove()
      },
    }
  }

  removeStyle(id: string): void {
    const trackedStyle = this.stylesById.get(id)

    if (trackedStyle) {
      trackedStyle.remove()
      this.stylesById.delete(id)
      return
    }

    const selector = `style[data-actorble-style-id="${escapeAttributeValue(id)}"]`
    getStyleContainer(this.root).querySelectorAll(selector).forEach((style) => style.remove())
  }
}

export function createStyleAdapter(root?: Document | ShadowRoot): StyleAdapter {
  return new BrowserStyleAdapter(root)
}

function getGlobalDocument(): Document {
  if (globalThis.document) {
    return globalThis.document
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'No global document is available.')
}

function isDocument(root: Document | ShadowRoot): root is Document {
  return root.nodeType === 9
}

function getOwnerDocument(root: Document | ShadowRoot): Document {
  return isDocument(root) ? root : root.ownerDocument
}

function getStyleContainer(root: Document | ShadowRoot): ParentNode & Node {
  if (!isDocument(root)) {
    return root
  }

  return root.head ?? root.documentElement
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
