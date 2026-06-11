import { BrowserGeometryEngine } from '../geometry-engine/index.js'
import { BrowserDomAdapter } from '../platform-adapter/dom-adapter/index.js'
import type { ClickOptions, DomPort, FocusOptions, TargetDebugInfo, TargetHandle } from '../shared/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../geometry-engine/index.js'

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
  occludedBy?: TargetDebugInfo
  canClick: boolean
  canFocus: boolean
  canType?: boolean
  blockingReasons: readonly InteractabilityReason[]
  forceBypassedReasons: readonly InteractabilityReason[]
  unforceableReasons: readonly InteractabilityReason[]
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

export type InteractabilityEngineOptions = Readonly<{
  dom?: DomPort
  geometry?: GeometryEngine
}>

export class BrowserInteractabilityEngine implements InteractabilityEngine {
  readonly #dom: DomPort
  readonly #geometry: GeometryEngine

  constructor(options: InteractabilityEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#geometry = options.geometry ?? new BrowserGeometryEngine({ dom: this.#dom })
  }

  async inspect(target: TargetHandle, geometry: GeometrySnapshot): Promise<InteractabilityReport> {
    const state = this.#evaluate(target, geometry)
    return this.#toReport(state, 'inspect', clickBlockers(state), false)
  }

  async canClick(
    target: TargetHandle,
    geometry: GeometrySnapshot,
    options: ClickOptions = {},
  ): Promise<InteractabilityReport> {
    const state = this.#evaluate(target, geometry)
    return this.#toReport(state, 'click', clickBlockers(state), options.force === true)
  }

  async canFocus(
    target: TargetHandle,
    _options: FocusOptions = {},
  ): Promise<InteractabilityReport> {
    const geometry = await this.#geometry.snapshot(target)
    const state = this.#evaluate(target, geometry)
    return this.#toReport(state, 'focus', focusBlockers(state), false)
  }

  async canType(target: TargetHandle): Promise<InteractabilityReport> {
    const geometry = await this.#geometry.snapshot(target)
    const state = this.#evaluate(target, geometry)
    return this.#toReport(state, 'type', typeBlockers(state), false)
  }

  #evaluate(target: TargetHandle, geometry: GeometrySnapshot): InteractabilityState {
    const debug = this.#dom.describeElement(target.element)
    const attributes = normalizeAttributes(debug.attributes)
    const tagName = tagNameFor(debug)
    const style = this.#dom.getComputedStyle(target.element)
    const visibilityRatio = visibleRatioFor(geometry)
    const styleVisible = isStyleVisible(style)
    const visible = visibilityRatio > 0 && styleVisible
    const disabled = hasAttribute(attributes, 'disabled')
    const ariaDisabled = attributes['aria-disabled'] === 'true'
    const inert = hasAttribute(attributes, 'inert')
    const readonly = hasAttribute(attributes, 'readonly')
    const enabled = !disabled && !ariaDisabled && !inert
    const focusable = enabled && isFocusable(tagName, attributes)
    const editable = enabled && isEditable(tagName, attributes, readonly)
    const receivesPointerEvents = style.pointerEvents !== 'none'
    const occlusion = occlusionFor(this.#dom, target, geometry)

    return {
      target,
      geometry,
      visible,
      visibilityRatio,
      enabled,
      editable,
      focusable,
      receivesPointerEvents,
      disabled,
      ariaDisabled,
      inert,
      readonly,
      occluded: occlusion.occluded,
      occludedBy: occlusion.occludedBy,
    }
  }

  #toReport(
    state: InteractabilityState,
    action: InteractabilityAction,
    blockingReasons: readonly InteractabilityReason[],
    force: boolean,
  ): InteractabilityReport {
    const unforceableReasons = unforceableReasonsFor(action, blockingReasons)
    const forceBypassedReasons =
      action === 'click' && force
        ? blockingReasons.filter((reason) => clickForceBypassableReasons.has(reason))
        : []
    const canClick =
      action === 'click' && force
        ? unforceableReasons.length === 0
        : clickBlockers(state).length === 0

    return {
      target: state.target,
      visible: state.visible,
      visibilityRatio: state.visibilityRatio,
      enabled: state.enabled,
      editable: state.editable,
      focusable: state.focusable,
      receivesPointerEvents: state.receivesPointerEvents,
      ...(state.occludedBy === undefined ? {} : { occludedBy: state.occludedBy }),
      canClick,
      canFocus: focusBlockers(state).length === 0,
      canType: typeBlockers(state).length === 0,
      blockingReasons,
      forceBypassedReasons,
      unforceableReasons,
    }
  }
}

export function createInteractabilityEngine(
  options: InteractabilityEngineOptions = {},
): InteractabilityEngine {
  return new BrowserInteractabilityEngine(options)
}

type InteractabilityAction = 'inspect' | 'click' | 'focus' | 'type'

type InteractabilityState = Readonly<{
  target: TargetHandle
  geometry: GeometrySnapshot
  visible: boolean
  visibilityRatio: number
  enabled: boolean
  editable: boolean
  focusable: boolean
  receivesPointerEvents: boolean
  disabled: boolean
  ariaDisabled: boolean
  inert: boolean
  readonly: boolean
  occluded: boolean
  occludedBy?: TargetDebugInfo
}>

type AttributeMap = Readonly<Record<string, string>>

const clickForceBypassableReasons = new Set<InteractabilityReason>([
  'pointer-events-none',
  'occluded',
])

const editableInputTypes = new Set([
  '',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
])

function clickBlockers(state: InteractabilityState): readonly InteractabilityReason[] {
  const reasons: InteractabilityReason[] = []

  pushVisibilityReasons(reasons, state)
  pushEnabledReasons(reasons, state)

  if (!state.receivesPointerEvents) {
    reasons.push('pointer-events-none')
  }

  if (state.occluded) {
    reasons.push('occluded')
  }

  pushClickablePointReason(reasons, state.geometry)

  return uniqueReasons(reasons)
}

function focusBlockers(state: InteractabilityState): readonly InteractabilityReason[] {
  const reasons: InteractabilityReason[] = []

  pushVisibilityReasons(reasons, state)
  pushEnabledReasons(reasons, state)

  if (!state.focusable) {
    reasons.push('not-focusable')
  }

  return uniqueReasons(reasons)
}

function typeBlockers(state: InteractabilityState): readonly InteractabilityReason[] {
  const reasons: InteractabilityReason[] = []

  pushVisibilityReasons(reasons, state)
  pushEnabledReasons(reasons, state)

  if (!state.focusable) {
    reasons.push('not-focusable')
  }

  if (state.readonly) {
    reasons.push('readonly')
  } else if (!state.editable) {
    reasons.push('not-editable')
  }

  return uniqueReasons(reasons)
}

function pushVisibilityReasons(
  reasons: InteractabilityReason[],
  state: InteractabilityState,
): void {
  if (!state.visible) {
    reasons.push('not-visible')
  }
}

function pushEnabledReasons(
  reasons: InteractabilityReason[],
  state: InteractabilityState,
): void {
  if (state.disabled) {
    reasons.push('disabled')
  }

  if (state.ariaDisabled) {
    reasons.push('aria-disabled')
  }

  if (state.inert) {
    reasons.push('inert')
  }
}

function pushClickablePointReason(
  reasons: InteractabilityReason[],
  geometry: GeometrySnapshot,
): void {
  if (geometry.clickablePoint.ok) {
    return
  }

  switch (geometry.clickablePoint.reason) {
    case 'disabled':
      reasons.push('disabled')
      break
    case 'fully-occluded':
    case 'no-sample-hit':
      reasons.push('occluded')
      break
    case 'pointer-events-none':
      reasons.push('pointer-events-none')
      break
    case 'not-visible':
    case 'outside-surface':
      reasons.push('not-visible')
      break
  }
}

function unforceableReasonsFor(
  action: InteractabilityAction,
  blockingReasons: readonly InteractabilityReason[],
): readonly InteractabilityReason[] {
  if (action !== 'click') {
    return blockingReasons
  }

  return blockingReasons.filter((reason) => !clickForceBypassableReasons.has(reason))
}

function uniqueReasons(
  reasons: readonly InteractabilityReason[],
): readonly InteractabilityReason[] {
  return Array.from(new Set(reasons))
}

function visibleRatioFor(geometry: GeometrySnapshot): number {
  if (!geometry.visibleRect || geometry.rect.width <= 0 || geometry.rect.height <= 0) {
    return 0
  }

  const visibleArea = geometry.visibleRect.width * geometry.visibleRect.height
  const totalArea = geometry.rect.width * geometry.rect.height

  return totalArea <= 0 ? 0 : Math.min(1, Math.max(0, visibleArea / totalArea))
}

function isStyleVisible(style: CSSStyleDeclaration): boolean {
  const opacity = Number.parseFloat(style.opacity || '1')

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    (Number.isNaN(opacity) || opacity > 0)
  )
}

function occlusionFor(
  dom: DomPort,
  target: TargetHandle,
  geometry: GeometrySnapshot,
): Readonly<{ occluded: boolean; occludedBy?: TargetDebugInfo }> {
  if (!geometry.clickablePoint.ok) {
    return { occluded: false }
  }

  const hitElement = dom.elementFromPoint(geometry.clickablePoint.point, {
    ignoreActorbleInternal: true,
  })

  if (hitElement && (hitElement === target.element || dom.contains(target.element, hitElement))) {
    return { occluded: false }
  }

  return {
    occluded: true,
    ...(hitElement === null ? {} : { occludedBy: dom.describeElement(hitElement) }),
  }
}

function normalizeAttributes(attributes: TargetDebugInfo['attributes']): AttributeMap {
  if (!attributes) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [name.toLowerCase(), value]),
  )
}

function hasAttribute(attributes: AttributeMap, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(attributes, name)
}

function tagNameFor(debug: TargetDebugInfo): string | undefined {
  return debug.description?.match(/^[a-z0-9-]+/i)?.[0]?.toLowerCase()
}

function isFocusable(tagName: string | undefined, attributes: AttributeMap): boolean {
  const tabIndex = tabIndexFor(attributes)

  if (tabIndex !== undefined) {
    return tabIndex >= 0
  }

  if (hasAttribute(attributes, 'contenteditable')) {
    return attributes.contenteditable !== 'false'
  }

  switch (tagName) {
    case 'a':
    case 'area':
      return hasAttribute(attributes, 'href')
    case 'button':
    case 'iframe':
    case 'select':
    case 'textarea':
      return true
    case 'input':
      return (attributes.type ?? '').toLowerCase() !== 'hidden'
    case 'audio':
    case 'video':
      return hasAttribute(attributes, 'controls')
    case 'details':
    case 'embed':
    case 'object':
    case 'summary':
      return true
    default:
      return false
  }
}

function isEditable(
  tagName: string | undefined,
  attributes: AttributeMap,
  readonly: boolean,
): boolean {
  if (readonly) {
    return false
  }

  if (hasAttribute(attributes, 'contenteditable')) {
    return attributes.contenteditable !== 'false'
  }

  if (tagName === 'textarea') {
    return true
  }

  if (tagName !== 'input') {
    return false
  }

  return editableInputTypes.has((attributes.type ?? '').toLowerCase())
}

function tabIndexFor(attributes: AttributeMap): number | undefined {
  if (!hasAttribute(attributes, 'tabindex')) {
    return undefined
  }

  const tabIndex = Number.parseInt(attributes.tabindex, 10)
  return Number.isNaN(tabIndex) ? undefined : tabIndex
}
