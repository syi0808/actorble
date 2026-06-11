import { notImplemented } from '../../shared/index.js'
import type { Disposable, StylePort } from '../../shared/index.js'
export type { StyleInjection } from '../../shared/index.js'

export interface StyleAdapter extends StylePort {}

export class BrowserStyleAdapter implements StyleAdapter {
  injectStyle(): Disposable {
    return notImplemented('Style Adapter injectStyle')
  }

  removeStyle(): void {
    return notImplemented('Style Adapter removeStyle')
  }
}

export function createStyleAdapter(): StyleAdapter {
  return new BrowserStyleAdapter()
}
