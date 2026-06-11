import { notImplemented } from '../shared/index.js'
import type { ClickOptions, FocusOptions, TargetHandle } from '../shared/index.js'
import type { GeometrySnapshot } from '../geometry-engine/index.js'

export type InteractabilityReason =
  | 'not-visible'
  | 'disabled'
  | 'readonly'
  | 'pointer-events-none'
  | 'inert'
  | 'aria-disabled'
  | 'occluded'
  | 'not-focusable'
  | 'not-editable'

export type InteractabilityReport = Readonly<{
  target: TargetHandle
  visible: boolean
  visibilityRatio?: number
  enabled: boolean
  editable?: boolean
  focusable?: boolean
  receivesPointerEvents: boolean
  occludedBy?: TargetHandle
  canClick: boolean
  canFocus: boolean
  canType?: boolean
  blockingReasons: readonly InteractabilityReason[]
}>

export interface InteractabilityEngine {
  inspect(target: TargetHandle, geometry: GeometrySnapshot): Promise<InteractabilityReport>
  canClick(
    target: TargetHandle,
    geometry: GeometrySnapshot,
    options?: ClickOptions,
  ): Promise<InteractabilityReport>
  canFocus(target: TargetHandle, options?: FocusOptions): Promise<InteractabilityReport>
  canType(target: TargetHandle): Promise<InteractabilityReport>
}

export class BrowserInteractabilityEngine implements InteractabilityEngine {
  inspect(): Promise<InteractabilityReport> {
    return notImplemented('Interactability Engine inspect')
  }

  canClick(): Promise<InteractabilityReport> {
    return notImplemented('Interactability Engine canClick')
  }

  canFocus(): Promise<InteractabilityReport> {
    return notImplemented('Interactability Engine canFocus')
  }

  canType(): Promise<InteractabilityReport> {
    return notImplemented('Interactability Engine canType')
  }
}

export function createInteractabilityEngine(): InteractabilityEngine {
  return new BrowserInteractabilityEngine()
}
