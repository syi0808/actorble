import type { StateApplyPort, StateEffect, StateEffectKind } from '../../shared/index.js'
export type { StateEffect, StateEffectKind } from '../../shared/index.js'

export interface StateApplier extends StateApplyPort {}

export class BrowserStateApplier implements StateApplier {
  private readonly activeByKind = new Map<StateEffectKind, Set<Element>>()

  applyStateEffects(effects: readonly StateEffect[]): void {
    for (const effect of effects) {
      if (effect.active) {
        this.applyActiveEffect(effect)
      } else {
        this.applyInactiveEffect(effect)
      }
    }
  }

  cleanup(): void {
    for (const kind of stateKinds) {
      this.clearKind(kind)
    }
  }

  private applyActiveEffect(effect: StateEffect): void {
    const element = effect.target?.element

    if (!element) {
      return
    }

    element.setAttribute(attributeForKind(effect.kind), '')
    this.elementsFor(effect.kind).add(element)
  }

  private applyInactiveEffect(effect: StateEffect): void {
    if (!effect.target) {
      this.clearKind(effect.kind)
      return
    }

    this.removeElement(effect.kind, effect.target.element)
  }

  private clearKind(kind: StateEffectKind): void {
    const elements = this.activeByKind.get(kind)

    if (!elements) {
      return
    }

    for (const element of elements) {
      element.removeAttribute(attributeForKind(kind))
    }

    elements.clear()
  }

  private removeElement(kind: StateEffectKind, element: Element): void {
    element.removeAttribute(attributeForKind(kind))
    this.activeByKind.get(kind)?.delete(element)
  }

  private elementsFor(kind: StateEffectKind): Set<Element> {
    let elements = this.activeByKind.get(kind)

    if (!elements) {
      elements = new Set()
      this.activeByKind.set(kind, elements)
    }

    return elements
  }
}

export function createStateApplier(): StateApplier {
  return new BrowserStateApplier()
}

const stateAttributeByKind: Record<StateEffectKind, string> = {
  hover: 'data-actorble-hover',
  active: 'data-actorble-active',
  focus: 'data-actorble-focus',
  'focus-visible': 'data-actorble-focus-visible',
  typing: 'data-actorble-typing',
  dragging: 'data-actorble-dragging',
}

const stateKinds = Object.keys(stateAttributeByKind) as StateEffectKind[]

function attributeForKind(kind: StateEffectKind): string {
  return stateAttributeByKind[kind]
}
