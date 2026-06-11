import { notImplemented } from '../../shared/index.js'
import type { Disposable } from '../../shared/index.js'

export type StyleInjection = Readonly<{
  id: string
  cssText: string
}>

export interface StyleAdapter {
  injectStyle(injection: StyleInjection): Disposable
  removeStyle(id: string): void
}

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
