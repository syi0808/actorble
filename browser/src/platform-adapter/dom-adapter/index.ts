import { notImplemented } from '../../shared/index.js'
import type { DomPort, Point, Rect, ScrollOptions, TargetDebugInfo } from '../../shared/index.js'
export type { HitTestOptions } from '../../shared/index.js'

export interface DomAdapter extends DomPort {}

export class BrowserDomAdapter implements DomAdapter {
  constructor(readonly root?: Document | ShadowRoot) {}

  getRoot(): Document | ShadowRoot {
    return notImplemented('DOM Adapter getRoot')
  }

  querySelectorAll(): readonly Element[] {
    return notImplemented('DOM Adapter querySelectorAll')
  }

  getBoundingClientRect(): Rect {
    return notImplemented('DOM Adapter getBoundingClientRect')
  }

  getComputedStyle(): CSSStyleDeclaration {
    return notImplemented('DOM Adapter getComputedStyle')
  }

  elementFromPoint(): Element | null {
    return notImplemented('DOM Adapter elementFromPoint')
  }

  contains(): boolean {
    return notImplemented('DOM Adapter contains')
  }

  isConnected(): boolean {
    return notImplemented('DOM Adapter isConnected')
  }

  getActiveElement(): Element | null {
    return notImplemented('DOM Adapter getActiveElement')
  }

  focus(): void {
    return notImplemented('DOM Adapter focus')
  }

  blur(): void {
    return notImplemented('DOM Adapter blur')
  }

  scrollIntoView(): void {
    return notImplemented('DOM Adapter scrollIntoView')
  }

  scrollTo(): void {
    return notImplemented('DOM Adapter scrollTo')
  }

  describeElement(): TargetDebugInfo {
    return notImplemented('DOM Adapter describeElement')
  }
}

export function createDomAdapter(root?: Document | ShadowRoot): DomAdapter {
  return new BrowserDomAdapter(root)
}
