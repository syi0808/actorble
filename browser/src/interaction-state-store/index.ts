import type { ActorbleListener, Disposable, StateEffect, TargetHandle } from '../shared/index.js'
import type { PointerSignal } from '../pointer-signals/index.js'

export type InteractionStateSnapshot = Readonly<{
  hovered: readonly TargetHandle[]
  active: TargetHandle | null
  focused: TargetHandle | null
  focusVisible: boolean
  typing: TargetHandle | null
  dragging: Readonly<{
    source: TargetHandle | null
    target: TargetHandle | null
  }>
}>

export type InteractionStateDiff = Readonly<{
  previous: InteractionStateSnapshot
  next: InteractionStateSnapshot
  effects: readonly StateEffect[]
}>

export type PointerInteractionStateEvent = PointerSignal &
  Readonly<{
    hitTarget?: TargetHandle | null
    hoverChain?: readonly TargetHandle[]
  }>

export type InteractionStateEvent =
  | PointerInteractionStateEvent
  | Readonly<{
      type: 'focus:changed'
      target: TargetHandle | null
      focusVisible?: boolean
    }>
  | Readonly<{
      type: 'typing:started'
      target: TargetHandle
    }>
  | Readonly<{
      type: 'typing:ended'
    }>
  | Readonly<{
      type: 'dragging:started'
      source: TargetHandle
      target?: TargetHandle | null
    }>
  | Readonly<{
      type: 'dragging:moved'
      target: TargetHandle | null
    }>
  | Readonly<{
      type: 'dragging:ended'
    }>

export interface InteractionStateStore {
  snapshot(): InteractionStateSnapshot
  dispatch(event: InteractionStateEvent): InteractionStateDiff
  applyPointerSignal(signal: PointerSignal): InteractionStateDiff
  setFocused(target: TargetHandle | null, focusVisible?: boolean): InteractionStateDiff
  setTyping(target: TargetHandle | null): InteractionStateDiff
  reset(): InteractionStateDiff
  subscribe(listener: ActorbleListener<InteractionStateDiff>): Disposable
}

export class BrowserInteractionStateStore implements InteractionStateStore {
  #state: InteractionStateSnapshot = createEmptySnapshot()
  readonly #listeners: ActorbleListener<InteractionStateDiff>[] = []

  snapshot(): InteractionStateSnapshot {
    return cloneSnapshot(this.#state)
  }

  dispatch(event: InteractionStateEvent): InteractionStateDiff {
    const previousState = this.#state
    const nextState = reduceState(previousState, event)
    const effects = diffEffects(previousState, nextState)

    this.#state = nextState

    const diff = {
      previous: cloneSnapshot(previousState),
      next: cloneSnapshot(nextState),
      effects,
    }

    if (hasStateChanged(previousState, nextState)) {
      this.#notify(diff)
    }

    return diff
  }

  applyPointerSignal(signal: PointerSignal): InteractionStateDiff {
    return this.dispatch(signal)
  }

  setFocused(target: TargetHandle | null, focusVisible = false): InteractionStateDiff {
    return this.dispatch({ type: 'focus:changed', target, focusVisible })
  }

  setTyping(target: TargetHandle | null): InteractionStateDiff {
    if (target) {
      return this.dispatch({ type: 'typing:started', target })
    }

    return this.dispatch({ type: 'typing:ended' })
  }

  reset(): InteractionStateDiff {
    const previousState = this.#state
    const nextState = createEmptySnapshot()
    const effects = diffEffects(previousState, nextState)

    this.#state = nextState

    const diff = {
      previous: cloneSnapshot(previousState),
      next: cloneSnapshot(nextState),
      effects,
    }

    if (hasStateChanged(previousState, nextState)) {
      this.#notify(diff)
    }

    return diff
  }

  subscribe(listener: ActorbleListener<InteractionStateDiff>): Disposable {
    this.#listeners.push(listener)
    let disposed = false

    return {
      dispose: () => {
        if (disposed) {
          return
        }

        disposed = true
        const index = this.#listeners.indexOf(listener)

        if (index >= 0) {
          this.#listeners.splice(index, 1)
        }
      },
    }
  }

  #notify(diff: InteractionStateDiff): void {
    for (const listener of [...this.#listeners]) {
      listener(diff)
    }
  }
}

export function createInteractionStateStore(): InteractionStateStore {
  return new BrowserInteractionStateStore()
}

function createEmptySnapshot(): InteractionStateSnapshot {
  return {
    hovered: [],
    active: null,
    focused: null,
    focusVisible: false,
    typing: null,
    dragging: {
      source: null,
      target: null,
    },
  }
}

function reduceState(
  previous: InteractionStateSnapshot,
  event: InteractionStateEvent,
): InteractionStateSnapshot {
  const next = cloneSnapshot(previous)

  switch (event.type) {
    case 'pointer:moved':
      if (event.hoverChain !== undefined) {
        return {
          ...next,
          hovered: uniqueTargets(event.hoverChain),
        }
      }

      if ('hitTarget' in event) {
        return {
          ...next,
          hovered: event.hitTarget ? [event.hitTarget] : [],
        }
      }

      return next

    case 'pointer:down':
      return {
        ...next,
        active:
          'hitTarget' in event
            ? (event.hitTarget ?? null)
            : (previous.hovered[0] ?? null),
      }

    case 'pointer:up':
      return {
        ...next,
        active: null,
      }

    case 'pointer:cancelled':
      return {
        ...next,
        active: null,
        dragging: {
          source: null,
          target: null,
        },
      }

    case 'focus:changed':
      return {
        ...next,
        focused: event.target,
        focusVisible: Boolean(event.target && event.focusVisible),
      }

    case 'typing:started':
      return {
        ...next,
        typing: event.target,
      }

    case 'typing:ended':
      return {
        ...next,
        typing: null,
      }

    case 'dragging:started':
      return {
        ...next,
        dragging: {
          source: event.source,
          target: event.target ?? null,
        },
      }

    case 'dragging:moved':
      return {
        ...next,
        dragging: {
          source: previous.dragging.source,
          target: event.target,
        },
      }

    case 'dragging:ended':
      return {
        ...next,
        dragging: {
          source: null,
          target: null,
        },
      }
  }
}

function diffEffects(
  previous: InteractionStateSnapshot,
  next: InteractionStateSnapshot,
): StateEffect[] {
  return [
    ...targetListEffects('hover', previous.hovered, next.hovered),
    ...targetEffects('active', previous.active, next.active),
    ...focusEffects(previous, next),
    ...targetEffects('typing', previous.typing, next.typing),
    ...draggingEffects(previous, next),
  ]
}

function focusEffects(
  previous: InteractionStateSnapshot,
  next: InteractionStateSnapshot,
): StateEffect[] {
  const effects: StateEffect[] = []
  const focusChanged = !sameTarget(previous.focused, next.focused)

  if (focusChanged && previous.focused) {
    effects.push({ kind: 'focus', target: previous.focused, active: false })
  }

  if (
    previous.focusVisible &&
    (!next.focusVisible || focusChanged) &&
    previous.focused
  ) {
    effects.push({ kind: 'focus-visible', target: previous.focused, active: false })
  }

  if (focusChanged && next.focused) {
    effects.push({ kind: 'focus', target: next.focused, active: true })
  }

  if (next.focusVisible && (!previous.focusVisible || focusChanged) && next.focused) {
    effects.push({ kind: 'focus-visible', target: next.focused, active: true })
  }

  return effects
}

function draggingEffects(
  previous: InteractionStateSnapshot,
  next: InteractionStateSnapshot,
): StateEffect[] {
  return targetListEffects(
    'dragging',
    uniqueTargets([previous.dragging.source, previous.dragging.target]),
    uniqueTargets([next.dragging.source, next.dragging.target]),
  )
}

function targetEffects(
  kind: StateEffect['kind'],
  previous: TargetHandle | null,
  next: TargetHandle | null,
): StateEffect[] {
  if (sameTarget(previous, next)) {
    return []
  }

  return [
    ...(previous ? [{ kind, target: previous, active: false }] : []),
    ...(next ? [{ kind, target: next, active: true }] : []),
  ]
}

function targetListEffects(
  kind: StateEffect['kind'],
  previous: readonly TargetHandle[],
  next: readonly TargetHandle[],
): StateEffect[] {
  const effects: StateEffect[] = []

  for (const target of previous) {
    if (!includesTarget(next, target)) {
      effects.push({ kind, target, active: false })
    }
  }

  for (const target of next) {
    if (!includesTarget(previous, target)) {
      effects.push({ kind, target, active: true })
    }
  }

  return effects
}

function hasStateChanged(
  previous: InteractionStateSnapshot,
  next: InteractionStateSnapshot,
): boolean {
  return (
    !sameTargetList(previous.hovered, next.hovered) ||
    !sameTarget(previous.active, next.active) ||
    !sameTarget(previous.focused, next.focused) ||
    previous.focusVisible !== next.focusVisible ||
    !sameTarget(previous.typing, next.typing) ||
    !sameTarget(previous.dragging.source, next.dragging.source) ||
    !sameTarget(previous.dragging.target, next.dragging.target)
  )
}

function cloneSnapshot(snapshot: InteractionStateSnapshot): InteractionStateSnapshot {
  return {
    hovered: [...snapshot.hovered],
    active: snapshot.active,
    focused: snapshot.focused,
    focusVisible: snapshot.focusVisible,
    typing: snapshot.typing,
    dragging: {
      source: snapshot.dragging.source,
      target: snapshot.dragging.target,
    },
  }
}

function uniqueTargets(targets: readonly (TargetHandle | null)[]): TargetHandle[] {
  const unique: TargetHandle[] = []

  for (const target of targets) {
    if (target && !includesTarget(unique, target)) {
      unique.push(target)
    }
  }

  return unique
}

function sameTarget(left: TargetHandle | null, right: TargetHandle | null): boolean {
  if (left === null || right === null) {
    return left === right
  }

  return left.id === right.id
}

function sameTargetList(
  left: readonly TargetHandle[],
  right: readonly TargetHandle[],
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((target, index) => sameTarget(target, right[index] ?? null))
}

function includesTarget(targets: readonly TargetHandle[], target: TargetHandle): boolean {
  return targets.some((candidate) => sameTarget(candidate, target))
}
