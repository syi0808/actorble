import type {
  ActorbleFeedback,
  ActorbleOptions,
  BrowserActionDefaults,
  ClickCurrentOptions,
  ClickOptions,
  DragOptions,
  FillOptions,
  FocusOptions,
  MoveOptions,
  PointerMotionProfile,
  PointerSequenceOptions,
  PressOptions,
  RunOptions,
  ScrollOptions,
  SelectTextOptions,
  TypeOptions,
  VisualTextVisibility,
  WaitOptions,
} from '../shared/index.js'

export type { BrowserActionDefaults } from '../shared/index.js'

const DEFAULT_POINTER_MOTION = {
  kind: 'ease',
  timing: 'ease-in-out',
  duration: 250,
} as const satisfies PointerMotionProfile

const DEFAULT_INERTIA_MOTION = {
  initialVelocity: 1200,
  deceleration: 4800,
} as const

const DEFAULT_SPRING_MOTION = {
  stiffness: 170,
  damping: 26,
  mass: 1,
} as const

const DEFAULT_FEEDBACK = {
  enabled: true,
  cursor: true,
  targetHighlight: false,
  clickFeedback: false,
  focusOverlay: false,
  typingIndicator: false,
  keystrokeOverlay: false,
} as const satisfies ResolvedBrowserFeedbackOptions

export const BROWSER_OPTION_DEFAULTS = {
  pointerMotion: DEFAULT_POINTER_MOTION,
  inertiaMotion: DEFAULT_INERTIA_MOTION,
  springMotion: DEFAULT_SPRING_MOTION,
  typingDelay: 60,
  clickPressDwell: 80,
  feedback: DEFAULT_FEEDBACK,
} as const

export type BrowserFeedbackOptions = Readonly<{
  cursor?: boolean
  targetHighlight?: boolean
  clickFeedback?: boolean
  focusOverlay?: boolean
  typingIndicator?: boolean
  keystrokeOverlay?: boolean
  textVisibility?: VisualTextVisibility
}>

export type ResolvedBrowserFeedbackOptions = Readonly<{
  enabled: boolean
  cursor: boolean
  targetHighlight: boolean
  clickFeedback: boolean
  focusOverlay: boolean
  typingIndicator: boolean
  keystrokeOverlay: boolean
  textVisibility?: VisualTextVisibility
}>

export type BrowserFeedbackInput =
  | ActorbleFeedback
  | BrowserFeedbackOptions
  | ResolvedBrowserFeedbackOptions

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
  | 'selectText'
  | 'pointerSequence'
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
  selectText: SelectTextOptions
  pointerSequence: PointerSequenceOptions
  waitFor: WaitOptions
}>

export type BrowserActionOptions<TAction extends BrowserActionName> =
  BrowserActionOptionMap[TAction]

export type BrowserActorbleOptions = ActorbleOptions &
  Readonly<{
    motion?: boolean
    actionDefaults?: BrowserActionDefaults
  }>

export type ResolvedActorbleOptions = Readonly<{
  root?: ActorbleOptions['root']
  debug: boolean
  pointer?: ActorbleOptions['pointer']
  feedback: ResolvedBrowserFeedbackOptions
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
  if (isResolvedActorbleOptions(options)) {
    return {
      root: options.root,
      debug: options.debug ?? false,
      pointer: options.pointer,
      feedback: options.feedback,
      motion: options.motion ?? true,
      actionDefaults: options.actionDefaults ?? {},
    }
  }

  return {
    root: options.root,
    debug: options.debug ?? false,
    pointer: options.pointer,
    feedback: resolveBrowserFeedbackOptions(options.feedback),
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

  if (actorble.motion === false && shouldDisableMotion(action, resolved)) {
    resolved = mergeActionLayer(action, resolved, { duration: 0 })
  }

  if (run.motion === false && shouldDisableMotion(action, resolved)) {
    resolved = mergeActionLayer(action, resolved, { duration: 0 })
  }

  resolved = mergeActionLayer(action, resolved, actionDefaultsFor(action, run.actionDefaults))
  resolved = mergeActionLayer(action, resolved, input.options)
  resolved = normalizeResolvedActionOptions(action, resolved)

  return resolved as BrowserActionOptions<TAction>
}

export function resolveBrowserFeedbackOptions(
  feedback: BrowserFeedbackInput | undefined = undefined,
): ResolvedBrowserFeedbackOptions {
  if (feedback === undefined) {
    return { ...DEFAULT_FEEDBACK }
  }

  if (feedback === 'off') {
    return { ...feedbackOffDefaults }
  }

  if (feedback === 'cursor') {
    return { ...feedbackOffDefaults, enabled: true, cursor: true }
  }

  if (feedback === 'debug') {
    return { ...debugFeedbackDefaults }
  }

  if (isResolvedBrowserFeedbackOptions(feedback)) {
    return { ...feedback }
  }

  if (isPublicFeedbackObject(feedback)) {
    return resolvePublicFeedbackObject(feedback)
  }

  return resolveInternalFeedbackObject(feedback)
}

function isResolvedActorbleOptions(
  options: BrowserActorbleOptions | ResolvedActorbleOptions,
): options is ResolvedActorbleOptions {
  return isResolvedBrowserFeedbackOptions(options.feedback)
}

function isResolvedBrowserFeedbackOptions(
  feedback: BrowserFeedbackInput | undefined,
): feedback is ResolvedBrowserFeedbackOptions {
  return (
    typeof feedback === 'object' &&
    feedback !== null &&
    'enabled' in feedback &&
    'targetHighlight' in feedback
  )
}

function isPublicFeedbackObject(
  feedback: BrowserFeedbackInput,
): feedback is Exclude<ActorbleFeedback, string> {
  return (
    typeof feedback === 'object' &&
    feedback !== null &&
    ('target' in feedback ||
      'click' in feedback ||
      'focus' in feedback ||
      'typing' in feedback ||
      'keystroke' in feedback ||
      'text' in feedback)
  )
}

function resolvePublicFeedbackObject(
  feedback: Exclude<ActorbleFeedback, string>,
): ResolvedBrowserFeedbackOptions {
  return resolveFeedbackChannels({
    cursor: feedback.cursor ?? false,
    targetHighlight: feedback.target ?? false,
    clickFeedback: feedback.click ?? false,
    focusOverlay: feedback.focus ?? false,
    typingIndicator: feedback.typing ?? false,
    keystrokeOverlay: feedback.keystroke ?? false,
    textVisibility: feedback.text,
  })
}

function resolveInternalFeedbackObject(
  feedback: BrowserFeedbackOptions,
): ResolvedBrowserFeedbackOptions {
  return resolveFeedbackChannels({
    cursor: feedback.cursor ?? quietFeedbackDefaults.cursor,
    targetHighlight: feedback.targetHighlight ?? quietFeedbackDefaults.targetHighlight,
    clickFeedback: feedback.clickFeedback ?? quietFeedbackDefaults.clickFeedback,
    focusOverlay: feedback.focusOverlay ?? quietFeedbackDefaults.focusOverlay,
    typingIndicator: feedback.typingIndicator ?? quietFeedbackDefaults.typingIndicator,
    keystrokeOverlay: feedback.keystrokeOverlay ?? quietFeedbackDefaults.keystrokeOverlay,
    textVisibility: feedback.textVisibility,
  })
}

function resolveFeedbackChannels(
  feedback: BrowserFeedbackOptions,
): ResolvedBrowserFeedbackOptions {
  const resolved = {
    cursor: feedback.cursor ?? false,
    targetHighlight: feedback.targetHighlight ?? false,
    clickFeedback: feedback.clickFeedback ?? false,
    focusOverlay: feedback.focusOverlay ?? false,
    typingIndicator: feedback.typingIndicator ?? false,
    keystrokeOverlay: feedback.keystrokeOverlay ?? false,
    textVisibility: feedback.textVisibility,
  }
  const enabled =
    resolved.cursor ||
    resolved.targetHighlight ||
    resolved.clickFeedback ||
    resolved.focusOverlay ||
    resolved.typingIndicator ||
    resolved.keystrokeOverlay

  return {
    enabled,
    ...resolved,
  }
}

const feedbackOffDefaults = {
  enabled: false,
  cursor: false,
  targetHighlight: false,
  clickFeedback: false,
  focusOverlay: false,
  typingIndicator: false,
  keystrokeOverlay: false,
} as const satisfies ResolvedBrowserFeedbackOptions

const quietFeedbackDefaults = {
  cursor: true,
  targetHighlight: false,
  clickFeedback: false,
  focusOverlay: false,
  typingIndicator: false,
  keystrokeOverlay: false,
} as const satisfies BrowserFeedbackOptions

const debugFeedbackDefaults = {
  enabled: true,
  cursor: true,
  targetHighlight: true,
  clickFeedback: true,
  focusOverlay: true,
  typingIndicator: true,
  keystrokeOverlay: true,
} as const satisfies ResolvedBrowserFeedbackOptions

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
    case 'selectText':
      return defaults.selectText
    case 'pointerSequence':
      return defaults.pointerSequence
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

function normalizeResolvedActionOptions(
  action: BrowserActionName,
  options: Record<string, unknown>,
): Record<string, unknown> {
  if (!isPointerAction(action)) {
    return options
  }

  const motion = options.motion

  if (isInertiaMotionProfile(motion)) {
    return {
      ...options,
      motion: {
        kind: 'inertia',
        initialVelocity:
          motion.initialVelocity ?? BROWSER_OPTION_DEFAULTS.inertiaMotion.initialVelocity,
        deceleration: motion.deceleration ?? BROWSER_OPTION_DEFAULTS.inertiaMotion.deceleration,
      },
    }
  }

  if (isSpringMotionProfile(motion)) {
    return {
      ...options,
      motion: {
        kind: 'spring',
        stiffness: motion.stiffness ?? BROWSER_OPTION_DEFAULTS.springMotion.stiffness,
        damping: motion.damping ?? BROWSER_OPTION_DEFAULTS.springMotion.damping,
        mass: motion.mass ?? BROWSER_OPTION_DEFAULTS.springMotion.mass,
      },
    }
  }

  return options
}

function isInertiaMotionProfile(
  motion: unknown,
): motion is Extract<PointerMotionProfile, { kind: 'inertia' }> {
  return (
    typeof motion === 'object' &&
    motion !== null &&
    (motion as { kind?: unknown }).kind === 'inertia'
  )
}

function isSpringMotionProfile(
  motion: unknown,
): motion is Extract<PointerMotionProfile, { kind: 'spring' }> {
  return (
    typeof motion === 'object' &&
    motion !== null &&
    (motion as { kind?: unknown }).kind === 'spring'
  )
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
    action === 'drag' ||
    action === 'selectText' ||
    action === 'pointerSequence'
  )
}

function shouldDisableMotion(
  action: BrowserActionName,
  resolved: Readonly<Record<string, unknown>>,
): boolean {
  if (!isPointerAction(action)) {
    return false
  }

  return action !== 'selectText' || hasMovementOption(resolved)
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
