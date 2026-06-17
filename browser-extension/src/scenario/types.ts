export const DRAFT_SCENARIO_SCHEMA_VERSION = 'actorble.scenario.draft' as const

export type ScenarioSchemaVersion = typeof DRAFT_SCENARIO_SCHEMA_VERSION

export type ScenarioId = string

export type ScenarioMetadata = Readonly<Record<string, unknown>>

export type ScenarioPlatformExtensions = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>

export type ScenarioDurationMs = number

export type ScenarioTextMatcher =
  | string
  | Readonly<{
      value: string
      match?: 'exact' | 'contains' | 'regex'
      caseSensitive?: boolean
    }>

export type ScenarioCoordinateSpace =
  | 'viewport'
  | 'document'
  | 'screen'
  | 'surface'
  | 'element'

export type ScenarioPoint = Readonly<{
  x: number
  y: number
  coordinateSpace?: ScenarioCoordinateSpace
}>

export type ScenarioRoleLocator = Readonly<{
  strategy: 'role'
  role: string
  name?: ScenarioTextMatcher
  includeHidden?: boolean
}>

export type ScenarioTextLocator = Readonly<{
  strategy: 'text'
  text: ScenarioTextMatcher
}>

export type ScenarioLabelLocator = Readonly<{
  strategy: 'label'
  label: ScenarioTextMatcher
}>

export type ScenarioTestIdLocator = Readonly<{
  strategy: 'testId'
  value: string
  attribute?: string
}>

export type ScenarioCssLocator = Readonly<{
  strategy: 'css'
  selector: string
}>

export type ScenarioPointLocator = Readonly<{
  strategy: 'point'
  point: ScenarioPoint
}>

export type ScenarioLocator =
  | ScenarioRoleLocator
  | ScenarioTextLocator
  | ScenarioLabelLocator
  | ScenarioTestIdLocator
  | ScenarioCssLocator
  | ScenarioPointLocator

export type ScenarioTarget = ScenarioLocator | ScenarioTargetGroup

export type ScenarioTargetGroup = Readonly<{
  kind?: 'target'
  description?: string
  strict?: boolean
  locators: readonly ScenarioLocator[]
  platform?: ScenarioPlatformExtensions
}>

export type ScenarioMotion =
  | Readonly<{ kind: 'linear'; duration?: ScenarioDurationMs }>
  | Readonly<{
      kind: 'ease'
      easing?: 'ease-in' | 'ease-out' | 'ease-in-out'
      duration?: ScenarioDurationMs
    }>
  | Readonly<{ kind: 'inertia' | 'spring'; duration?: ScenarioDurationMs }>

export type ScenarioPointerButtonName =
  | 'primary'
  | 'secondary'
  | 'auxiliary'
  | 'back'
  | 'forward'

export type ScenarioActionOptions = Readonly<{
  timeout?: ScenarioDurationMs
  duration?: ScenarioDurationMs
  motion?: ScenarioMotion
  button?: ScenarioPointerButtonName
  clickCount?: number
  force?: boolean
  pressDwell?: ScenarioDurationMs
  focusVisible?: boolean
  delay?: ScenarioDurationMs
  focusStrategy?: 'programmatic' | 'click' | 'none'
  focusClick?: Readonly<{
    duration?: ScenarioDurationMs
    motion?: ScenarioMotion
    button?: ScenarioPointerButtonName
    pressDwell?: ScenarioDurationMs
  }>
  afterFocusDelay?: ScenarioDurationMs
  clear?: boolean
  behavior?: 'instant' | 'smooth'
}>

export type ScenarioWaitCondition =
  | Readonly<{ kind: 'visible' | 'hidden'; target: ScenarioTarget }>
  | Readonly<{ kind: 'text'; value: ScenarioTextMatcher }>

export type ScenarioStepCommon = Readonly<{
  id?: ScenarioId
  note?: string
  platform?: ScenarioPlatformExtensions
}>

export type ScenarioTargetActionStep = ScenarioStepCommon &
  Readonly<{
    action: 'click' | 'moveTo' | 'doubleClick' | 'focus'
    target: ScenarioTarget
    options?: ScenarioActionOptions
  }>

export type ScenarioClickCurrentStep = ScenarioStepCommon &
  Readonly<{
    action: 'clickCurrent'
    options?: ScenarioActionOptions
  }>

export type ScenarioTypeStep = ScenarioStepCommon &
  Readonly<{
    action: 'type'
    input: string
    options?: ScenarioActionOptions
  }>

export type ScenarioTargetTextStep = ScenarioStepCommon &
  Readonly<{
    action: 'typeInto' | 'fill'
    target: ScenarioTarget
    input: string
    options?: ScenarioActionOptions
  }>

export type ScenarioPressStep = ScenarioStepCommon &
  Readonly<{
    action: 'press'
    input: string
    options?: ScenarioActionOptions
  }>

export type ScenarioScrollToTargetStep = ScenarioStepCommon &
  Readonly<{
    action: 'scrollTo'
    target: ScenarioTarget
    options?: ScenarioActionOptions
  }>

export type ScenarioScrollToPositionStep = ScenarioStepCommon &
  Readonly<{
    action: 'scrollTo'
    input: ScenarioPoint
    options?: ScenarioActionOptions
  }>

export type ScenarioDragStep = ScenarioStepCommon &
  Readonly<{
    action: 'drag'
    from: ScenarioTarget
    to: ScenarioTarget
    options?: ScenarioActionOptions
  }>

export type ScenarioWaitForStep = ScenarioStepCommon &
  Readonly<{
    action: 'waitFor'
    input: ScenarioWaitCondition
    options?: ScenarioActionOptions
  }>

export type ScenarioDelayStep = ScenarioStepCommon &
  Readonly<{
    action: 'delay'
    duration: ScenarioDurationMs
    reason?: string
  }>

export type ScenarioStep =
  | ScenarioTargetActionStep
  | ScenarioClickCurrentStep
  | ScenarioTypeStep
  | ScenarioTargetTextStep
  | ScenarioPressStep
  | ScenarioScrollToTargetStep
  | ScenarioScrollToPositionStep
  | ScenarioDragStep
  | ScenarioWaitForStep
  | ScenarioDelayStep

export type ScenarioDefaults = Readonly<{
  timeout?: ScenarioDurationMs
  pacing?: Readonly<{
    betweenSteps?: ScenarioDurationMs
  }>
}>

export type ScenarioDocument = Readonly<{
  schemaVersion: ScenarioSchemaVersion
  id?: ScenarioId
  name?: string
  description?: string
  createdAt?: string
  updatedAt?: string
  defaults?: ScenarioDefaults
  metadata?: ScenarioMetadata
  platform?: ScenarioPlatformExtensions
  steps: readonly ScenarioStep[]
}>
