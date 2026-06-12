export type TimestampMs = number
export type DurationMs = number

export interface Clock {
  now(): TimestampMs
}

export type CoordinateSpace =
  | 'viewport'
  | 'document'
  | 'screen'
  | 'surface'
  | 'element'

export type Point = Readonly<{
  x: number
  y: number
}>

export type Rect = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type Size = Readonly<{
  width: number
  height: number
}>

export type Insets = Readonly<{
  top: number
  right: number
  bottom: number
  left: number
}>

export type TimeoutOptions = Readonly<{
  timeout?: DurationMs
}>

export type CancellationSignalLike = Pick<
  AbortSignal,
  'aborted' | 'reason' | 'addEventListener' | 'removeEventListener'
>

export interface Cancellation {
  readonly signal?: CancellationSignalLike
}

export type CancellationOptions = Readonly<Cancellation>

export type OperationOptions = TimeoutOptions & CancellationOptions

export interface Disposable {
  dispose(): void
}

export type ActorbleListener<TEvent = unknown> = (event: TEvent) => void

export type ActorbleErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_STALE'
  | 'TARGET_DETACHED'
  | 'ACTION_TIMEOUT'
  | 'ACTION_CANCELLED'
  | 'INTERACTABILITY_FAILED'
  | 'PLATFORM_UNSUPPORTED'

export type ActorbleErrorDetails = Readonly<Record<string, unknown>>

export type ActorbleErrorOptions = Readonly<{
  cause?: unknown
  details?: ActorbleErrorDetails
}>

export class ActorbleError extends Error {
  readonly code: ActorbleErrorCode
  readonly details?: ActorbleErrorDetails

  constructor(code: ActorbleErrorCode, message: string, options: ActorbleErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'ActorbleError'
    this.code = code
    this.details = options.details
  }
}

export class ActorbleNotImplementedError extends ActorbleError {
  constructor(boundary: string) {
    super('NOT_IMPLEMENTED', `${boundary} is not implemented yet.`, {
      details: { boundary },
    })
    this.name = 'ActorbleNotImplementedError'
  }
}

export function actorbleError(
  code: ActorbleErrorCode,
  message: string,
  options: ActorbleErrorOptions = {},
): ActorbleError {
  return new ActorbleError(code, message, options)
}

export function timeoutError(
  operation: string,
  timeout: DurationMs,
  options: ActorbleErrorOptions = {},
): ActorbleError {
  return actorbleError('ACTION_TIMEOUT', `${operation} timed out after ${timeout}ms.`, {
    cause: options.cause,
    details: { ...options.details, operation, timeout },
  })
}

export function cancellationError(operation: string, reason?: unknown): ActorbleError {
  return actorbleError('ACTION_CANCELLED', `${operation} was cancelled.`, {
    cause: reason,
    details: { operation, reason },
  })
}

export function notImplemented(boundary: string): never {
  throw new ActorbleNotImplementedError(boundary)
}

export type Result<TValue, TError = ActorbleError> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; error: TError }>

export function ok<TValue>(value: TValue): Result<TValue, never> {
  return { ok: true, value }
}

export function err<TError = ActorbleError>(error: TError): Result<never, TError> {
  return { ok: false, error }
}

export type ActorbleMode = 'interactive' | 'headless'

export type VisualTextVisibility = 'hidden' | 'masked' | 'plain'

export type VisualFeedbackOptions = Readonly<{
  enabled?: boolean
  textVisibility?: VisualTextVisibility
}>

export type ActorbleOptions = Readonly<{
  root?: Document | ShadowRoot | Element
  mode?: ActorbleMode
  debug?: boolean
  visual?: boolean | VisualFeedbackOptions
}>

export type LocatorKind =
  | 'css'
  | 'element'
  | 'role'
  | 'text'
  | 'label'
  | 'testId'
  | 'point'

export interface BaseLocator<TKind extends LocatorKind> {
  readonly kind: TKind
}

export interface CssLocator extends BaseLocator<'css'> {
  readonly selector: string
  readonly root?: ParentNode
}

export interface ElementLocator extends BaseLocator<'element'> {
  readonly element: Element
}

export interface RoleLocator extends BaseLocator<'role'> {
  readonly role: string
  readonly name?: string | RegExp
  readonly exact?: boolean
  readonly includeHidden?: boolean
}

export interface TextLocator extends BaseLocator<'text'> {
  readonly value: string | RegExp
  readonly exact?: boolean
}

export interface LabelLocator extends BaseLocator<'label'> {
  readonly value: string | RegExp
  readonly exact?: boolean
}

export interface TestIdLocator extends BaseLocator<'testId'> {
  readonly value: string
  readonly attribute?: string
}

export interface PointLocator extends BaseLocator<'point'> {
  readonly point: Point
  readonly coordinateSpace?: CoordinateSpace
}

export type Locator =
  | CssLocator
  | ElementLocator
  | RoleLocator
  | TextLocator
  | LabelLocator
  | TestIdLocator
  | PointLocator

export function css(selector: string, options: { root?: ParentNode } = {}): CssLocator {
  return { kind: 'css', selector, root: options.root }
}

export function element(target: Element): ElementLocator {
  return { kind: 'element', element: target }
}

export function role(
  roleName: string,
  options: Omit<RoleLocator, 'kind' | 'role'> = {},
): RoleLocator {
  return { kind: 'role', role: roleName, ...options }
}

export function text(
  value: string | RegExp,
  options: Omit<TextLocator, 'kind' | 'value'> = {},
): TextLocator {
  return { kind: 'text', value, ...options }
}

export function label(
  value: string | RegExp,
  options: Omit<LabelLocator, 'kind' | 'value'> = {},
): LabelLocator {
  return { kind: 'label', value, ...options }
}

export function testId(
  value: string,
  options: Omit<TestIdLocator, 'kind' | 'value'> = {},
): TestIdLocator {
  return { kind: 'testId', value, ...options }
}

export function point(
  xOrPoint: number | Point,
  y?: number,
  options: Omit<PointLocator, 'kind' | 'point'> = {},
): PointLocator {
  if (typeof xOrPoint === 'number') {
    return { kind: 'point', point: { x: xOrPoint, y: y ?? 0 }, ...options }
  }

  return { kind: 'point', point: xOrPoint, ...options }
}

export type TargetValidity = 'live' | 'stale' | 'detached' | 'unknown'

export type TargetDebugInfo = Readonly<{
  description?: string
  selector?: string
  role?: string
  name?: string
  path?: readonly string[]
  attributes?: Readonly<Record<string, string>>
}>

export type TargetHandle = Readonly<{
  id: string
  element: Element
  locator?: Locator
  resolvedAt: TimestampMs
  root: Document | ShadowRoot
  surfaceId?: string
  validity: TargetValidity
  debug: TargetDebugInfo
}>

export type TargetLike = Locator | TargetHandle | Element

export type ResolveOptions = OperationOptions &
  Readonly<{
    strict?: boolean
  }>

export type TargetInspection = Readonly<{
  target: TargetHandle
  debug: TargetDebugInfo
  validity: TargetValidity
}>

export type ScrollPosition = Readonly<{
  x: number
  y: number
  coordinateSpace?: CoordinateSpace
}>

export type ScrollMetrics = Readonly<{
  scrollLeft: number
  scrollTop: number
  scrollWidth: number
  scrollHeight: number
  clientWidth: number
  clientHeight: number
}>

export type PointerEasingName = 'ease-in' | 'ease-out' | 'ease-in-out'

export type PointerMotionProfile =
  | Readonly<{
      kind: 'linear'
      duration?: DurationMs
    }>
  | Readonly<{
      kind: 'ease'
      easing?: PointerEasingName
      duration?: DurationMs
    }>
  | Readonly<{
      kind: 'inertia'
      duration?: DurationMs
    }>
  | Readonly<{
      kind: 'spring'
      duration?: DurationMs
    }>

export type PointerMovementOptions = Readonly<{
  duration?: DurationMs
  motion?: PointerMotionProfile
}>

export type MoveOptions = OperationOptions & PointerMovementOptions

export type ClickOptions = OperationOptions &
  PointerMovementOptions &
  Readonly<{
    button?: PointerButtonName
    clickCount?: number
    force?: boolean
  }>

export type ClickCurrentOptions = Omit<ClickOptions, 'force'>

export type FocusOptions = OperationOptions &
  Readonly<{
    focusVisible?: boolean
  }>

export type TypeOptions = OperationOptions &
  Readonly<{
    delay?: DurationMs
  }>

export type FillOptions = OperationOptions &
  Readonly<{
    clear?: boolean
  }>

export type PressOptions = OperationOptions &
  Readonly<{
    delay?: DurationMs
  }>

export type ScrollOptions = OperationOptions &
  Readonly<{
    behavior?: 'instant' | 'smooth'
  }>

export type DragOptions = OperationOptions &
  Readonly<{
    force?: boolean
  }>

export type WaitOptions = OperationOptions

export type RunOptions = OperationOptions

export type PointerButtonName =
  | 'primary'
  | 'secondary'
  | 'auxiliary'
  | 'back'
  | 'forward'

export type HitTestOptions = Readonly<{
  ignoreActorbleInternal?: boolean
}>

export interface DomReadPort {
  getRoot(): Document | ShadowRoot
  querySelectorAll(selector: string, root?: ParentNode): readonly Element[]
  getBoundingClientRect(element: Element): Rect
  getComputedStyle(element: Element): CSSStyleDeclaration
  getViewportRect(root?: Document | ShadowRoot): Rect
  getViewportScrollTarget(root?: Document | ShadowRoot): Window
  getParentElement(element: Element): Element | null
  getScrollMetrics(target: Element | Window): ScrollMetrics
  elementFromPoint(point: Point, options?: HitTestOptions): Element | null
  getAttribute(element: Element, name: string): string | null
  getTextContent(element: Element): string
  contains(root: Node, node: Node): boolean
  isConnected(element: Element): boolean
  getActiveElement(root?: Document | ShadowRoot): Element | null
  describeElement(element: Element): TargetDebugInfo
}

export interface DomWritePort {
  focus(element: HTMLElement | SVGElement, options?: FocusOptions): void
  blur(element: HTMLElement | SVGElement): void
  scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void
  scrollTo(target: Element | Window, position: Point, options?: ScrollOptions): void
}

export interface DomPort extends DomReadPort, DomWritePort {}

export type PointerEventDescriptor = Readonly<{
  type: 'pointermove' | 'pointerdown' | 'pointerup' | 'pointercancel'
  target: Element
  point: Point
  button?: PointerButtonName
  buttons?: readonly PointerButtonName[]
}>

export type KeyboardEventDescriptor = Readonly<{
  type: 'keydown' | 'keyup'
  target: Element
  key: string
  code?: string
  modifiers?: readonly string[]
}>

export type MouseEventDescriptor = Readonly<{
  type: 'click'
  target: Element
  point: Point
  button?: PointerButtonName
  buttons?: readonly PointerButtonName[]
  detail?: number
}>

export type TextInputEventDescriptor = Readonly<{
  type: 'beforeinput' | 'input' | 'change'
  target: Element
  text?: string
  inputType?: string
}>

export interface EventDispatchPort {
  dispatchPointerEvent(event: PointerEventDescriptor): boolean
  dispatchMouseEvent(event: MouseEventDescriptor): boolean
  dispatchKeyboardEvent(event: KeyboardEventDescriptor): boolean
  dispatchTextInputEvent(event: TextInputEventDescriptor): boolean
}

export type StateEffectKind =
  | 'hover'
  | 'active'
  | 'focus'
  | 'focus-visible'
  | 'typing'
  | 'dragging'

export type StateEffect = Readonly<{
  kind: StateEffectKind
  target: TargetHandle | null
  active: boolean
}>

export interface StateApplyPort {
  applyStateEffects(effects: readonly StateEffect[]): void
  cleanup(): void
}

export type StyleInjection = Readonly<{
  id: string
  cssText: string
}>

export interface StylePort {
  injectStyle(injection: StyleInjection): Disposable
  removeStyle(id: string): void
}

export interface PlatformAdapterPort {
  readonly dom: DomPort
  readonly events: EventDispatchPort
  readonly state: StateApplyPort
  readonly style: StylePort
}

export type WaitCondition =
  | Readonly<{ kind: 'visible'; target: TargetLike }>
  | Readonly<{ kind: 'hidden'; target: TargetLike }>
  | Readonly<{ kind: 'text'; value: string | RegExp }>
  | Readonly<{ kind: 'custom'; predicate: () => boolean | Promise<boolean> }>

type ScenarioStepOptions<TOptions extends OperationOptions> = Omit<TOptions, 'signal'>

export type ScenarioClickStep = Readonly<{
  id?: string
  action: 'click'
  target: TargetLike
  options?: ScenarioStepOptions<ClickOptions>
}>

export type ScenarioTypeIntoStep = Readonly<{
  id?: string
  action: 'typeInto'
  target: TargetLike
  input: string
  options?: ScenarioStepOptions<TypeOptions>
}>

export type ScenarioWaitForStep = Readonly<{
  id?: string
  action: 'waitFor'
  input: WaitCondition
  options?: ScenarioStepOptions<WaitOptions>
}>

export type ScenarioStep = ScenarioClickStep | ScenarioTypeIntoStep | ScenarioWaitForStep

export type Scenario = Readonly<{
  id?: string
  name?: string
  steps: readonly ScenarioStep[]
}>

export type DebugEventName = string
