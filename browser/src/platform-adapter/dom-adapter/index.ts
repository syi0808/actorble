import { notImplemented } from '../../shared/index.js'
import type { Point, Rect, ScrollOptions, TargetDebugInfo } from '../../shared/index.js'

export type HitTestOptions = Readonly<{
  ignoreActorbleInternal?: boolean
}>

export interface DomAdapter {
  getRoot(): Document | ShadowRoot
  querySelectorAll(selector: string, root?: ParentNode): readonly Element[]
  getBoundingClientRect(element: Element): Rect
  getComputedStyle(element: Element): CSSStyleDeclaration
  elementFromPoint(point: Point, options?: HitTestOptions): Element | null
  contains(root: Node, node: Node): boolean
  isConnected(element: Element): boolean
  getActiveElement(root?: Document | ShadowRoot): Element | null
  focus(element: HTMLElement | SVGElement, options?: FocusOptions): void
  blur(element: HTMLElement | SVGElement): void
  scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void
  scrollTo(target: Element | Window, position: Point, options?: ScrollOptions): void
  describeElement(element: Element): TargetDebugInfo
}

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
