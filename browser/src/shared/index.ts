export type TimestampMs = number
export type DurationMs = number

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

export type CancellationOptions = Readonly<{
  signal?: CancellationSignalLike
}>

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

export class ActorbleError extends Error {
  readonly code: ActorbleErrorCode
  readonly details?: ActorbleErrorDetails

  constructor(
    code: ActorbleErrorCode,
    message: string,
    options: { cause?: unknown; details?: ActorbleErrorDetails } = {},
  ) {
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

export function notImplemented(boundary: string): never {
  throw new ActorbleNotImplementedError(boundary)
}

export type Result<TValue, TError = ActorbleError> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; error: TError }>

export type ActorbleMode = 'interactive' | 'headless'

export type ActorbleOptions = Readonly<{
  root?: Document | ShadowRoot | Element
  mode?: ActorbleMode
  debug?: boolean
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

export type MoveOptions = OperationOptions &
  Readonly<{
    duration?: DurationMs
  }>

export type ClickOptions = OperationOptions &
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

export type WaitCondition =
  | Readonly<{ kind: 'visible'; target: TargetLike }>
  | Readonly<{ kind: 'hidden'; target: TargetLike }>
  | Readonly<{ kind: 'text'; value: string | RegExp }>
  | Readonly<{ kind: 'custom'; predicate: () => boolean | Promise<boolean> }>

export type ScenarioStep = Readonly<{
  id?: string
  action: string
  target?: TargetLike
  input?: unknown
  options?: Readonly<Record<string, unknown>>
}>

export type Scenario = Readonly<{
  id?: string
  name?: string
  steps: readonly ScenarioStep[]
}>

export type DebugEventName = string
