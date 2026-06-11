import { BrowserStateApplier } from '../platform-adapter/state-applier/index.js'
import { BrowserStyleAdapter } from '../platform-adapter/style-adapter/index.js'
import type { SpanRecorder } from '../diagnostics-trace/index.js'
import type {
  Disposable,
  StateApplyPort,
  StateEffect,
  StateEffectKind,
  StylePort,
  TargetHandle,
} from '../shared/index.js'

export type PseudoStateName = 'hover' | 'active' | 'focus-visible'

export type PseudoStateMirrorRequest = Readonly<{
  target: TargetHandle
  states: readonly PseudoStateName[]
}>

export type PseudoStateMirrorOptions = Readonly<{
  state?: StateApplyPort
  style?: StylePort
  trace?: SpanRecorder
  mirrorStyleId?: string
  mirrorCssText?: string
}>

export interface PseudoStateMirror extends StateApplyPort {
  apply(request: PseudoStateMirrorRequest): void
  clear(target?: TargetHandle): void
}

export class BrowserPseudoStateMirror implements PseudoStateMirror {
  readonly #state: StateApplyPort
  readonly #style?: StylePort
  readonly #trace?: SpanRecorder
  readonly #mirrorStyleId: string
  readonly #mirrorCssText: string
  readonly #activeTargets = new Map<StateEffectKind, Map<string, TargetHandle>>()
  #styleDisposable?: Disposable
  #styleAttempted = false

  constructor(options: PseudoStateMirrorOptions = {}) {
    this.#state = options.state ?? new BrowserStateApplier()
    this.#style = options.style ?? createDefaultStyleAdapter()
    this.#trace = options.trace
    this.#mirrorStyleId = options.mirrorStyleId ?? defaultMirrorStyleId
    this.#mirrorCssText = options.mirrorCssText ?? defaultMirrorCssText
  }

  apply(request: PseudoStateMirrorRequest): void {
    const effects = request.states.map((state) => ({
      kind: state,
      target: request.target,
      active: true,
    }))

    this.#applyEffects(effects, 'apply')
  }

  clear(target?: TargetHandle): void {
    if (target === undefined) {
      this.cleanup()
      return
    }

    this.#applyEffects(this.#clearEffectsForTarget(target), 'clear')
  }

  applyStateEffects(effects: readonly StateEffect[]): void {
    this.#applyEffects(effects, effects.some((effect) => effect.active) ? 'apply' : 'clear')
  }

  cleanup(): void {
    try {
      this.#state.cleanup()
      this.#activeTargets.clear()
      this.#disposeStyle()
      this.#trace?.appendEvent('pseudo:mirror:clear')
    } catch (error) {
      this.#recordWarning('clear', error)
    }
  }

  #applyEffects(effects: readonly StateEffect[], phase: 'apply' | 'clear'): void {
    if (effects.length === 0) {
      return
    }

    if (effects.some(isPseudoStateEffect)) {
      this.#ensureMirrorStyle()
    }

    try {
      this.#state.applyStateEffects(effects)
      this.#updateTrackedEffects(effects)
      this.#trace?.appendEvent(phase === 'apply' ? 'pseudo:mirror:apply' : 'pseudo:mirror:clear', {
        effects: summarizeEffects(effects),
      })
    } catch (error) {
      this.#recordWarning(phase, error, { effects: summarizeEffects(effects) })
    }
  }

  #ensureMirrorStyle(): void {
    if (this.#styleAttempted || this.#style === undefined) {
      return
    }

    this.#styleAttempted = true

    try {
      this.#styleDisposable = this.#style.injectStyle({
        id: this.#mirrorStyleId,
        cssText: this.#mirrorCssText,
      })
    } catch (error) {
      this.#recordWarning('style', error, { styleId: this.#mirrorStyleId })
    }
  }

  #disposeStyle(): void {
    if (this.#styleDisposable === undefined) {
      return
    }

    this.#styleDisposable.dispose()
    this.#styleDisposable = undefined
    this.#styleAttempted = false
  }

  #clearEffectsForTarget(target: TargetHandle): StateEffect[] {
    const effects: StateEffect[] = []

    for (const [kind, targets] of this.#activeTargets) {
      const activeTarget = targets.get(target.id)

      if (activeTarget) {
        effects.push({ kind, target: activeTarget, active: false })
      }
    }

    return effects
  }

  #updateTrackedEffects(effects: readonly StateEffect[]): void {
    for (const effect of effects) {
      if (!effect.target) {
        if (!effect.active) {
          this.#activeTargets.get(effect.kind)?.clear()
        }
        continue
      }

      const targets = this.#targetsForKind(effect.kind)

      if (effect.active) {
        targets.set(effect.target.id, effect.target)
      } else {
        targets.delete(effect.target.id)
      }
    }
  }

  #targetsForKind(kind: StateEffectKind): Map<string, TargetHandle> {
    let targets = this.#activeTargets.get(kind)

    if (!targets) {
      targets = new Map()
      this.#activeTargets.set(kind, targets)
    }

    return targets
  }

  #recordWarning(
    phase: 'apply' | 'clear' | 'style',
    error: unknown,
    details: Readonly<Record<string, unknown>> = {},
  ): void {
    const warning = {
      phase,
      error: describeUnknownError(error),
      ...details,
    }

    this.#trace?.appendEvent('pseudo:mirror:warning', warning)
    this.#trace?.warn(`Pseudo state mirror ${phase} failed.`, warning)
  }
}

export function createPseudoStateMirror(): PseudoStateMirror {
  return new BrowserPseudoStateMirror()
}

const defaultMirrorStyleId = 'actorble-pseudo-state-mirror'

const defaultMirrorCssText = `
[data-actorble-hover] {}
[data-actorble-active] {}
[data-actorble-focus-visible] {
  outline: 2px solid Highlight;
  outline-offset: 2px;
}
`

function createDefaultStyleAdapter(): StylePort | undefined {
  try {
    return new BrowserStyleAdapter()
  } catch {
    return undefined
  }
}

function isPseudoStateEffect(effect: StateEffect): boolean {
  return (
    effect.kind === 'hover' ||
    effect.kind === 'active' ||
    effect.kind === 'focus-visible'
  )
}

function summarizeEffects(
  effects: readonly StateEffect[],
): readonly Readonly<Record<string, unknown>>[] {
  return effects.map((effect) => ({
    kind: effect.kind,
    targetId: effect.target?.id,
    active: effect.active,
  }))
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
