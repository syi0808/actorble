export type TimestampMs = number
export type DurationMs = number

export type LayoutInvalidationReason =
  | 'scroll'
  | 'resize'
  | 'mutation'
  | 'animation-frame'
  | 'manual'

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
  | 'TEXT_SELECTION_UNSUPPORTED'
  | 'POINTER_SEQUENCE_INCOMPLETE'
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

export type VisualTextVisibility = 'hidden' | 'masked' | 'plain'

export type ActorbleFeedback =
  | 'off'
  | 'cursor'
  | 'debug'
  | Readonly<{
      cursor?: boolean
      target?: boolean
      click?: boolean
      focus?: boolean
      typing?: boolean
      keystroke?: boolean
      text?: VisualTextVisibility
    }>

export type ActorbleOptions = Readonly<{
  root?: Document | ShadowRoot | Element
  debug?: boolean
  pointer?: ActorblePointerOptions
  feedback?: ActorbleFeedback
  motion?: boolean
  actionDefaults?: BrowserActionDefaults
}>

export type ActorblePointerOptions = Readonly<{
  initialPosition?: Point
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
  readonly matchIndex?: number
}

export interface ElementLocator extends BaseLocator<'element'> {
  readonly element: Element
}

export interface RoleLocator extends BaseLocator<'role'> {
  readonly role: string
  readonly name?: string | RegExp
  readonly exact?: boolean
  readonly includeHidden?: boolean
  readonly matchIndex?: number
}

export interface TextLocator extends BaseLocator<'text'> {
  readonly value: string | RegExp
  readonly exact?: boolean
  readonly matchIndex?: number
}

export interface LabelLocator extends BaseLocator<'label'> {
  readonly value: string | RegExp
  readonly exact?: boolean
  readonly matchIndex?: number
}

export interface TestIdLocator extends BaseLocator<'testId'> {
  readonly value: string
  readonly attribute?: string
  readonly matchIndex?: number
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

export function css(
  selector: string,
  options: Omit<CssLocator, 'kind' | 'selector'> = {},
): CssLocator {
  return { kind: 'css', selector, ...options }
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
}>

export type ScrollDelta = Readonly<{
  x: number
  y: number
}>

export type RevealVisibility = 'any' | 'full' | Readonly<{ ratio: number }>
export type RevealAlignment = 'nearest' | 'start' | 'center' | 'end'
export type RevealContainer = 'all' | 'nearest'

export type ScrollMotion =
  | Readonly<{ kind: 'instant' }>
  | Readonly<{ kind: 'native-smooth' }>
  | Readonly<{
      kind: 'timed'
      duration: DurationMs
      timing?: PointerMotionTiming
    }>

export type ScrollSettlePolicy =
  | 'none'
  | 'next-frame'
  | 'scroll-stable'
  | Readonly<{
      kind: 'scroll-stable'
      quietMs?: DurationMs
      stableFrames?: number
      threshold?: number
    }>

export type StabilityPolicy =
  | 'none'
  | 'next-frame'
  | 'interaction-stable'
  | 'visual-stable'
  /** @deprecated Use 'interaction-stable'. */
  | 'settled'

export type VisibilitySnapshot = Readonly<{
  visibilityRatio: number
  fullyVisible: boolean
}>

export type RevealExecutionStep = Readonly<{
  surfaceId: string
  from: ScrollPosition
  intendedTo: ScrollPosition
  to: ScrollPosition
  axes: readonly ('x' | 'y')[]
}>

export type RevealResult = Readonly<{
  target: TargetHandle
  changed: boolean
  before: VisibilitySnapshot
  after: VisibilitySnapshot
  fullyVisible: boolean
  visibilityRatio: number
  steps: readonly RevealExecutionStep[]
}>

export type ScrollResult = Readonly<{
  changed: boolean
  before: ScrollPosition
  after: ScrollPosition
}>

export type ScrollMetrics = Readonly<{
  scrollLeft: number
  scrollTop: number
  scrollWidth: number
  scrollHeight: number
  clientWidth: number
  clientHeight: number
  clientLeft: number
  clientTop: number
}>

export type ComputedCssInsets = Readonly<{
  top: string
  right: string
  bottom: string
  left: string
}>

export interface ComputedScrollStyleSnapshot {
  readonly overflowX: string
  readonly overflowY: string
  readonly scrollPadding: ComputedCssInsets
  readonly scrollMargin: ComputedCssInsets
}

export type PointerMotionTiming = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export type PointerMotionProfile =
  | Readonly<{
      kind: 'ease'
      timing?: PointerMotionTiming
      duration?: DurationMs
    }>
  | Readonly<{
      kind: 'inertia'
      initialVelocity?: number
      deceleration?: number
    }>
  | Readonly<{
      kind: 'spring'
      stiffness?: number
      damping?: number
      mass?: number
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
    pressDwell?: DurationMs
  }>

export type ClickCurrentOptions = Omit<ClickOptions, 'force'>

export type FocusOptions = OperationOptions &
  Readonly<{
    focusVisible?: boolean
  }>

export type TypeFocusStrategy = 'programmatic' | 'click' | 'none'

export type TypeFocusClickOptions = PointerMovementOptions &
  Readonly<{
    button?: PointerButtonName
    pressDwell?: DurationMs
  }>

export type TypeOptions = OperationOptions &
  Readonly<{
    delay?: DurationMs
    focusStrategy?: TypeFocusStrategy
    focusClick?: TypeFocusClickOptions
    afterFocusDelay?: DurationMs
  }>

export type FillOptions = OperationOptions &
  Readonly<{
    clear?: boolean
  }>

export type PressOptions = OperationOptions &
  Readonly<{
    delay?: DurationMs
  }>

export type RevealOptions = OperationOptions &
  Readonly<{
    visibility?: RevealVisibility
    block?: RevealAlignment
    inline?: RevealAlignment
    container?: RevealContainer
    safeArea?: Insets
    offset?: Point
    motion?: ScrollMotion
    settle?: ScrollSettlePolicy
  }>

export type ScrollOptions = OperationOptions &
  Readonly<{
    motion?: ScrollMotion
    settle?: ScrollSettlePolicy
  }>

export type ActionRevealPolicy = false | true | RevealOptions

export type DragOptions = OperationOptions &
  PointerMovementOptions &
  Readonly<{
    force?: boolean
  }>

export type TextSelectionEndpoint = Readonly<{
  target: TargetLike
  offset?: number
  point?: Point
}>

export type TextSelectionTarget =
  | TargetLike
  | Readonly<{
      anchor: TextSelectionEndpoint
      focus: TextSelectionEndpoint
    }>

export type SelectTextOptions = OperationOptions & PointerMovementOptions

export type PointerSequenceMoveStep = Readonly<{
  type: 'move'
  to: Point
  duration?: DurationMs
}>

export type PointerSequenceDownStep = Readonly<{
  type: 'down'
  button?: PointerButtonName
}>

export type PointerSequenceUpStep = Readonly<{
  type: 'up'
  button?: PointerButtonName
}>

export type PointerSequencePauseStep = Readonly<{
  type: 'pause'
  duration: DurationMs
}>

export type PointerSequenceStep =
  | PointerSequenceMoveStep
  | PointerSequenceDownStep
  | PointerSequenceUpStep
  | PointerSequencePauseStep

export type PointerSequence = readonly PointerSequenceStep[]

export type PointerSequenceOptions = OperationOptions

export type WaitOptions = OperationOptions

export type BrowserActionDefaults = Readonly<{
  moveTo?: Readonly<Partial<MoveOptions>>
  click?: Readonly<Partial<ClickOptions>>
  clickCurrent?: Readonly<Partial<ClickCurrentOptions>>
  doubleClick?: Readonly<Partial<ClickOptions>>
  focus?: Readonly<Partial<FocusOptions>>
  type?: Readonly<Partial<TypeOptions>>
  typeInto?: Readonly<Partial<TypeOptions>>
  fill?: Readonly<Partial<FillOptions>>
  press?: Readonly<Partial<PressOptions>>
  reveal?: Readonly<Partial<RevealOptions>>
  scrollTo?: Readonly<Partial<ScrollOptions>>
  scrollBy?: Readonly<Partial<ScrollOptions>>
  drag?: Readonly<Partial<DragOptions>>
  selectText?: Readonly<Partial<SelectTextOptions>>
  pointerSequence?: Readonly<Partial<PointerSequenceOptions>>
  waitFor?: Readonly<Partial<WaitOptions>>
}>

export type ScenarioPacingOptions = Readonly<{
  betweenSteps?: DurationMs
}>

export type RunOptions = OperationOptions &
  Readonly<{
    pacing?: ScenarioPacingOptions
    motion?: boolean
    actionDefaults?: BrowserActionDefaults
  }>

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
  getViewportScrollElement(root?: Document | ShadowRoot): Element
  getParentElement(element: Element): Element | null
  getScrollMetrics(target: Element | Window): ScrollMetrics
  getComputedScrollStyle(element: Element): ComputedScrollStyleSnapshot
  elementFromPoint(point: Point, options?: HitTestOptions): Element | null
  getAttribute(element: Element, name: string): string | null
  getTextContent(element: Element): string
  getRootTextContent(root?: Document | ShadowRoot): string
  contains(root: Node, node: Node): boolean
  isConnected(element: Element): boolean
  getActiveElement(root?: Document | ShadowRoot): Element | null
  describeElement(element: Element): TargetDebugInfo
  observeLayoutInvalidations(
    listener: ActorbleListener<LayoutInvalidationReason>,
  ): Disposable
  observeScroll(
    target: Element | Window,
    listener: ActorbleListener<ScrollMetrics>,
  ): Disposable
  observeScrollEnd(
    target: Element | Window,
    listener: ActorbleListener<ScrollMetrics>,
  ): Disposable | null
}

export interface DomWritePort {
  focus(element: HTMLElement | SVGElement, options?: FocusOptions): void
  blur(element: HTMLElement | SVGElement): void
  scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void
  scrollTo(target: Element | Window, position: Point, options?: DomScrollOptions): void
}

export type DomScrollOptions = Readonly<{
  behavior?: 'instant' | 'smooth'
}>

export interface DomPort extends DomReadPort, DomWritePort {}

export type TextSelectionSurface = 'document-text' | 'input' | 'textarea' | 'contenteditable'

export type TextSelectionStrategy = 'selection-api' | 'input-range-api'

export type PlatformTextSelectionEndpoint = Readonly<{
  target: Node | HTMLInputElement | HTMLTextAreaElement
  offset: number
}>

export type PlatformTextSelectionRange = Readonly<{
  anchor: PlatformTextSelectionEndpoint
  focus: PlatformTextSelectionEndpoint
}>

export type PlatformTextSelectionSnapshot = Readonly<{
  surface: TextSelectionSurface
  strategy: TextSelectionStrategy
  selectedText: string
  anchorNode: Node | HTMLInputElement | HTMLTextAreaElement | null
  focusNode: Node | HTMLInputElement | HTMLTextAreaElement | null
  anchorOffset: number
  focusOffset: number
  collapsed: boolean
}>

export interface SelectionPort {
  readSelection(target?: Node | HTMLInputElement | HTMLTextAreaElement): PlatformTextSelectionSnapshot
  applySelection(range: PlatformTextSelectionRange): PlatformTextSelectionSnapshot
  clearSelection(target?: Node | HTMLInputElement | HTMLTextAreaElement): PlatformTextSelectionSnapshot
  measureEndpoint?(endpoint: PlatformTextSelectionEndpoint): Point | null
}

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
  | 'selection'

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
  readonly selection: SelectionPort
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

export type ScenarioMoveToStep = Readonly<{
  id?: string
  action: 'moveTo'
  target: TargetLike
  options?: ScenarioStepOptions<MoveOptions>
}>

export type ScenarioClickCurrentStep = Readonly<{
  id?: string
  action: 'clickCurrent'
  options?: ScenarioStepOptions<ClickCurrentOptions>
}>

export type ScenarioDoubleClickStep = Readonly<{
  id?: string
  action: 'doubleClick'
  target: TargetLike
  options?: ScenarioStepOptions<ClickOptions>
}>

export type ScenarioFocusStep = Readonly<{
  id?: string
  action: 'focus'
  target: TargetLike
  options?: ScenarioStepOptions<FocusOptions>
}>

export type ScenarioTypeStep = Readonly<{
  id?: string
  action: 'type'
  input: string
  options?: ScenarioStepOptions<TypeOptions>
}>

export type ScenarioTypeIntoStep = Readonly<{
  id?: string
  action: 'typeInto'
  target: TargetLike
  input: string
  options?: ScenarioStepOptions<TypeOptions>
}>

export type ScenarioFillStep = Readonly<{
  id?: string
  action: 'fill'
  target: TargetLike
  input: string
  options?: ScenarioStepOptions<FillOptions>
}>

export type ScenarioPressStep = Readonly<{
  id?: string
  action: 'press'
  input: string
  options?: ScenarioStepOptions<PressOptions>
}>

export type ScenarioRevealStep = Readonly<{
  id?: string
  action: 'reveal'
  target: TargetLike
  options?: ScenarioStepOptions<RevealOptions>
}>

export type ScenarioScrollToPositionStep = Readonly<{
  id?: string
  action: 'scrollTo'
  input: ScrollPosition
  target?: never
  options?: ScenarioStepOptions<ScrollOptions>
}>

export type ScenarioScrollToStep = ScenarioScrollToPositionStep

export type ScenarioScrollByStep = Readonly<{
  id?: string
  action: 'scrollBy'
  input: ScrollDelta
  options?: ScenarioStepOptions<ScrollOptions>
}>

export type ScenarioDragStep = Readonly<{
  id?: string
  action: 'drag'
  from: TargetLike
  to: TargetLike
  options?: ScenarioStepOptions<DragOptions>
}>

export type ScenarioSelectTextStep = Readonly<{
  id?: string
  action: 'selectText'
  target: TextSelectionTarget
  options?: ScenarioStepOptions<SelectTextOptions>
}>

export type ScenarioPointerSequenceStep = Readonly<{
  id?: string
  action: 'pointerSequence'
  sequence: PointerSequence
  options?: ScenarioStepOptions<PointerSequenceOptions>
}>

export type ScenarioWaitForStep = Readonly<{
  id?: string
  action: 'waitFor'
  input: WaitCondition
  options?: ScenarioStepOptions<WaitOptions>
}>

export type ScenarioDelayStep = Readonly<{
  id?: string
  action: 'delay'
  duration: DurationMs
  reason?: string
}>

export type ScenarioStep =
  | ScenarioClickStep
  | ScenarioMoveToStep
  | ScenarioClickCurrentStep
  | ScenarioDoubleClickStep
  | ScenarioFocusStep
  | ScenarioTypeStep
  | ScenarioTypeIntoStep
  | ScenarioFillStep
  | ScenarioPressStep
  | ScenarioRevealStep
  | ScenarioScrollToStep
  | ScenarioScrollByStep
  | ScenarioDragStep
  | ScenarioSelectTextStep
  | ScenarioPointerSequenceStep
  | ScenarioWaitForStep
  | ScenarioDelayStep

export type Scenario = Readonly<{
  id?: string
  name?: string
  steps: readonly ScenarioStep[]
}>

export type DebugEventName = string
