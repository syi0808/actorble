import type {
  ActorbleMode,
  ActorbleOptions,
  ClickCurrentOptions,
  ClickOptions,
  DragOptions,
  FillOptions,
  FocusOptions,
  MoveOptions,
  PointerMotionProfile,
  PressOptions,
  ResolvedVisualFeedbackOptions,
  RunOptions,
  ScrollOptions,
  TypeOptions,
  VisualFeedbackOptions,
  WaitOptions,
} from '../shared/index.js'

const DEFAULT_POINTER_MOTION = {
  kind: 'ease',
  easing: 'ease-in-out',
  duration: 250,
} as const satisfies PointerMotionProfile

const DEFAULT_VISUAL_FEEDBACK = {
  enabled: false,
  preset: 'quiet',
} as const satisfies VisualFeedbackOptions

export const BROWSER_OPTION_DEFAULTS = {
  pointerMotion: DEFAULT_POINTER_MOTION,
  typingDelay: 60,
  clickPressDwell: 80,
  visualFeedback: DEFAULT_VISUAL_FEEDBACK,
} as const

export type BrowserActionName =
  | 'moveTo'
  | 'click'
  | 'clickCurrent'
  | 'doubleClick'
  | 'focus'
  | 'type'
  | 'typeInto'
  | 'fill'
  | 'press'
  | 'scrollTo'
  | 'drag'
  | 'waitFor'

export type BrowserActionOptionMap = Readonly<{
  moveTo: MoveOptions
  click: ClickOptions
  clickCurrent: ClickCurrentOptions
  doubleClick: ClickOptions
  focus: FocusOptions
  type: TypeOptions
  typeInto: TypeOptions
  fill: FillOptions
  press: PressOptions
  scrollTo: ScrollOptions
  drag: DragOptions
  waitFor: WaitOptions
}>

export type BrowserActionOptions<TAction extends BrowserActionName> =
  BrowserActionOptionMap[TAction]

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
  scrollTo?: Readonly<Partial<ScrollOptions>>
  drag?: Readonly<Partial<DragOptions>>
  waitFor?: Readonly<Partial<WaitOptions>>
}>

export type BrowserActorbleOptions = ActorbleOptions &
  Readonly<{
    motion?: boolean
    actionDefaults?: BrowserActionDefaults
  }>

export type ResolvedActorbleOptions = Readonly<{
  root?: ActorbleOptions['root']
  mode: ActorbleMode
  debug: boolean
  pointer?: ActorbleOptions['pointer']
  visualFeedback: ResolvedVisualFeedbackOptions
  motion: boolean
  actionDefaults: BrowserActionDefaults
}>

export type BrowserRunOptions = RunOptions &
  Readonly<{
    motion?: boolean
    actionDefaults?: BrowserActionDefaults
  }>

export type ResolvedRunOptions = RunOptions &
  Readonly<{
    motion?: boolean
    actionDefaults: BrowserActionDefaults
  }>

export type BrowserActionResolutionInput<TAction extends BrowserActionName> =
  Readonly<{
    actorble?: BrowserActorbleOptions | ResolvedActorbleOptions
    run?: BrowserRunOptions | ResolvedRunOptions
    options?: Readonly<Partial<BrowserActionOptions<TAction>>>
  }>

export function resolveActorbleOptions(
  options: BrowserActorbleOptions | ResolvedActorbleOptions = {},
): ResolvedActorbleOptions {
  const mode = options.mode ?? 'interactive'

  if ('visualFeedback' in options) {
    return {
      root: options.root,
      mode,
      debug: options.debug,
      pointer: options.pointer,
      visualFeedback: options.visualFeedback,
      motion: options.motion,
      actionDefaults: options.actionDefaults,
    }
  }

  return {
    root: options.root,
    mode,
    debug: options.debug ?? false,
    pointer: options.pointer,
    visualFeedback: resolveBrowserVisualFeedbackOptions(options.visual, mode),
    motion: options.motion ?? true,
    actionDefaults: options.actionDefaults ?? {},
  }
}

export function resolveRunOptions(
  options: BrowserRunOptions | ResolvedRunOptions = {},
): ResolvedRunOptions {
  return {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.pacing === undefined ? {} : { pacing: options.pacing }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    actionDefaults: options.actionDefaults ?? {},
  }
}

export function resolveActionOptions<TAction extends BrowserActionName>(
  action: TAction,
  input: BrowserActionResolutionInput<TAction> = {},
): BrowserActionOptions<TAction> {
  const actorble = resolveActorbleOptions(input.actorble)
  const run = resolveRunOptions(input.run)
  let resolved: Record<string, unknown> = {}

  resolved = mergeActionLayer(action, resolved, centralizedActionDefaults(action))
  resolved = mergeActionLayer(action, resolved, actionDefaultsFor(action, actorble.actionDefaults))

  if (actorble.motion === false && isPointerAction(action)) {
    resolved = mergeActionLayer(action, resolved, { duration: 0 })
  }

  if (run.motion === false && isPointerAction(action)) {
    resolved = mergeActionLayer(action, resolved, { duration: 0 })
  }

  resolved = mergeActionLayer(action, resolved, actionDefaultsFor(action, run.actionDefaults))
  resolved = mergeActionLayer(action, resolved, input.options)

  return resolved as BrowserActionOptions<TAction>
}

export function resolveBrowserVisualFeedbackOptions(
  visual: boolean | VisualFeedbackOptions | undefined,
  mode: ActorbleMode = 'interactive',
  defaults: VisualFeedbackOptions = BROWSER_OPTION_DEFAULTS.visualFeedback,
): ResolvedVisualFeedbackOptions {
  if (mode === 'headless') {
    return resolveVisualFeedbackPolicy({ enabled: false, preset: 'quiet' })
  }

  if (typeof visual === 'boolean') {
    return resolveVisualFeedbackPolicy({ enabled: visual, preset: 'quiet' }, defaults)
  }

  if (typeof visual === 'object' && visual !== null) {
    return resolveVisualFeedbackPolicy({ enabled: true, preset: 'quiet', ...visual }, defaults)
  }

  return resolveVisualFeedbackPolicy(defaults)
}

function resolveVisualFeedbackPolicy(
  visual: boolean | VisualFeedbackOptions | undefined,
  defaults: VisualFeedbackOptions = {},
): ResolvedVisualFeedbackOptions {
  const options = typeof visual === 'object' && visual !== null ? visual : {}
  const enabled =
    typeof visual === 'boolean' ? visual : (options.enabled ?? defaults.enabled ?? false)
  const preset = options.preset ?? defaults.preset ?? 'quiet'
  const presetDefaults =
    preset === 'debug' ? debugVisualFeedbackDefaults : quietVisualFeedbackDefaults

  return {
    enabled,
    cursor: options.cursor ?? defaults.cursor ?? presetDefaults.cursor,
    cursorScale: resolveVisualCursorScale(options, defaults),
    targetHighlight:
      options.targetHighlight ?? defaults.targetHighlight ?? presetDefaults.targetHighlight,
    clickFeedback:
      options.clickFeedback ?? defaults.clickFeedback ?? presetDefaults.clickFeedback,
    focusOverlay:
      options.focusOverlay ?? defaults.focusOverlay ?? presetDefaults.focusOverlay,
    typingIndicator:
      options.typingIndicator ?? defaults.typingIndicator ?? presetDefaults.typingIndicator,
    keystrokeOverlay:
      options.keystrokeOverlay ?? defaults.keystrokeOverlay ?? presetDefaults.keystrokeOverlay,
    textVisibility: options.textVisibility ?? defaults.textVisibility,
  }
}

function resolveVisualCursorScale(
  options: VisualFeedbackOptions,
  defaults: VisualFeedbackOptions,
): number {
  const cursorScale = options.cursorScale === undefined ? defaults.cursorScale : options.cursorScale

  return cursorScale !== undefined && Number.isFinite(cursorScale) && cursorScale > 0
    ? cursorScale
    : 1
}

function centralizedActionDefaults(action: BrowserActionName): Record<string, unknown> {
  switch (action) {
    case 'moveTo':
    case 'drag':
      return { motion: BROWSER_OPTION_DEFAULTS.pointerMotion }
    case 'click':
    case 'clickCurrent':
    case 'doubleClick':
      return {
        motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
        pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
      }
    case 'type':
    case 'typeInto':
      return { delay: BROWSER_OPTION_DEFAULTS.typingDelay }
    default:
      return {}
  }
}

function actionDefaultsFor(
  action: BrowserActionName,
  defaults: BrowserActionDefaults,
): Readonly<Record<string, unknown>> | undefined {
  switch (action) {
    case 'moveTo':
      return defaults.moveTo
    case 'click':
      return defaults.click
    case 'clickCurrent':
      return defaults.clickCurrent
    case 'doubleClick':
      return defaults.doubleClick
    case 'focus':
      return defaults.focus
    case 'type':
      return defaults.type
    case 'typeInto':
      return defaults.typeInto
    case 'fill':
      return defaults.fill
    case 'press':
      return defaults.press
    case 'scrollTo':
      return defaults.scrollTo
    case 'drag':
      return defaults.drag
    case 'waitFor':
      return defaults.waitFor
  }
}

function mergeActionLayer(
  action: BrowserActionName,
  current: Record<string, unknown>,
  layer: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (layer === undefined) {
    return current
  }

  const definedLayer = definedOptions(layer)
  const next = { ...current }

  if (isPointerAction(action) && hasMovementOption(definedLayer)) {
    delete next.duration
    delete next.motion
  }

  return { ...next, ...definedLayer }
}

function definedOptions(options: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      result[key] = value
    }
  }

  return result
}

function hasMovementOption(options: Readonly<Record<string, unknown>>): boolean {
  return 'duration' in options || 'motion' in options
}

function isPointerAction(action: BrowserActionName): boolean {
  return (
    action === 'moveTo' ||
    action === 'click' ||
    action === 'clickCurrent' ||
    action === 'doubleClick' ||
    action === 'drag'
  )
}

const quietVisualFeedbackDefaults = {
  cursor: true,
  targetHighlight: false,
  clickFeedback: false,
  focusOverlay: false,
  typingIndicator: false,
  keystrokeOverlay: false,
} as const

const debugVisualFeedbackDefaults = {
  cursor: true,
  targetHighlight: true,
  clickFeedback: true,
  focusOverlay: true,
  typingIndicator: true,
  keystrokeOverlay: true,
} as const
