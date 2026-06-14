import { BrowserActionOrchestrator } from '../../runtime/action-orchestrator/index.js'
import { BrowserCapabilityFidelityReporter } from '../../capability/capability-fidelity/index.js'
import { BrowserDiagnosticsTrace } from '../../diagnostics/diagnostics-trace/index.js'
import { BrowserGeometryEngine } from '../../targeting/geometry-engine/index.js'
import { createLayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/index.js'
import { BrowserScenarioRunner } from '../../runtime/scenario-runner/index.js'
import { BrowserTargetResolver } from '../../targeting/target-resolver/index.js'
import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import { BrowserVisualLayer } from '../../visual/visual-layer/index.js'
import { actorbleError } from '../../shared/index.js'
import type { ActionOrchestrator } from '../../runtime/action-orchestrator/index.js'
import type {
  CapabilityFidelityReporter,
  CapabilityReport,
  FidelityReport,
  VisualOverlayFidelity,
} from '../../capability/capability-fidelity/index.js'
import type { Trace, TraceCollector } from '../../diagnostics/diagnostics-trace/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../../targeting/geometry-engine/index.js'
import type { LayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import type { DomPort } from '../../shared/index.js'
import type { ScenarioRunner } from '../../runtime/scenario-runner/index.js'
import type { TargetResolver } from '../../targeting/target-resolver/index.js'
import type { VisualLayer } from '../../visual/visual-layer/index.js'
import type {
  ActorbleListener,
  ActorbleOptions,
  ClickCurrentOptions,
  ClickOptions,
  DebugEventName,
  DragOptions,
  FillOptions,
  FocusOptions,
  Locator,
  MoveOptions,
  PressOptions,
  ResolveOptions,
  RunOptions,
  Scenario,
  ScrollOptions,
  ScrollPosition,
  TargetHandle,
  TargetInspection,
  TargetLike,
  TypeOptions,
  VisualFeedbackOptions,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js'

export type ActorbleFacadeOptions = Omit<ActorbleOptions, 'visual'> &
  Readonly<{
    capabilities?: CapabilityFidelityReporter
    dom?: DomPort
    geometry?: GeometryEngine
    orchestrator?: ActionOrchestrator
    resolver?: TargetResolver
    runner?: ScenarioRunner
    trace?: TraceCollector
    visual?: boolean | VisualFeedbackOptions | VisualLayer
  }>

export class Actorble {
  readonly #capabilities: CapabilityFidelityReporter
  readonly #geometry: GeometryEngine
  readonly #orchestrator: ActionOrchestrator
  readonly #resolver: TargetResolver
  readonly #runner: ScenarioRunner
  readonly #trace: TraceCollector
  readonly #layoutInvalidation: LayoutInvalidationTracker
  readonly #visual?: VisualLayer

  constructor(readonly options: ActorbleFacadeOptions = {}) {
    const trace = options.trace ?? new BrowserDiagnosticsTrace()
    const root = rootForDomAdapter(options.root)
    const dom = options.dom ?? new BrowserDomAdapter(root)
    const timeline = new BrowserTimelineEngine()
    const layoutInvalidation = createLayoutInvalidationTracker({ dom, timeline })
    const resolver =
      options.resolver ?? new BrowserTargetResolver({ dom, trace, clock: timeline })
    const geometry = options.geometry ?? new BrowserGeometryEngine({ dom, clock: timeline })
    const visual = visualForOptions(options.visual, dom.getRoot(), options.mode)
    const visualFeedback = visualFeedbackForOptions(options.visual, options.mode)
    const orchestrator =
      options.orchestrator ??
      new BrowserActionOrchestrator({
        dom,
        geometry,
        resolver,
        timeline,
        trace,
        layoutInvalidation,
        visual,
        visualFeedback,
        pointer: options.pointer,
      })

    this.#trace = trace
    this.#layoutInvalidation = layoutInvalidation
    this.#capabilities =
      options.capabilities ??
      new BrowserCapabilityFidelityReporter({
        visualOverlay: visualOverlayFidelityForOptions(options.visual, options.mode),
      })
    this.#geometry = geometry
    this.#orchestrator = orchestrator
    this.#resolver = resolver
    this.#runner =
      options.runner ??
      new BrowserScenarioRunner({ orchestrator, timeline, trace, layoutInvalidation })
    this.#visual = visual
  }

  resolve(locator: Locator, options?: ResolveOptions): Promise<TargetHandle> {
    return this.#resolver.resolve(locator, options)
  }

  resolveAll(locator: Locator, options?: ResolveOptions): Promise<readonly TargetHandle[]> {
    return this.#resolver.resolveAll(locator, options)
  }

  exists(locator: Locator, options?: ResolveOptions): Promise<boolean> {
    return this.#resolver.exists(locator, options)
  }

  inspect(target: TargetLike): Promise<TargetInspection> {
    return this.#resolver.inspect(target)
  }

  geometry(target: TargetLike): Promise<GeometrySnapshot> {
    return this.#geometry.snapshot(target)
  }

  moveTo(target: TargetLike, options?: MoveOptions): Promise<void> {
    return this.#orchestrator.moveTo(target, options)
  }

  click(target: TargetLike, options?: ClickOptions): Promise<void> {
    return this.#orchestrator.click(target, options)
  }

  clickCurrent(options?: ClickCurrentOptions): Promise<void> {
    return this.#orchestrator.clickCurrent(options)
  }

  doubleClick(target: TargetLike, options?: ClickOptions): Promise<void> {
    return this.#orchestrator.doubleClick(target, options)
  }

  focus(target: TargetLike, options?: FocusOptions): Promise<void> {
    return this.#orchestrator.focus(target, options)
  }

  type(text: string, options?: TypeOptions): Promise<void> {
    return this.#orchestrator.type(text, options)
  }

  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void> {
    return this.#orchestrator.typeInto(target, text, options)
  }

  fill(target: TargetLike, text: string, options?: FillOptions): Promise<void> {
    return this.#orchestrator.fill(target, text, options)
  }

  press(keys: string, options?: PressOptions): Promise<void> {
    return this.#orchestrator.press(keys, options)
  }

  scrollTo(
    targetOrPosition: TargetLike | ScrollPosition,
    options?: ScrollOptions,
  ): Promise<void> {
    return this.#orchestrator.scrollTo(targetOrPosition, options)
  }

  drag(from: TargetLike, to: TargetLike, options?: DragOptions): Promise<void> {
    return this.#orchestrator.drag(from, to, options)
  }

  async waitFor(condition: WaitCondition, options?: WaitOptions): Promise<void> {
    await this.#orchestrator.waitFor(condition, options)
  }

  run(scenario: Scenario, options?: RunOptions): Promise<void> {
    return this.#runner.run(scenario, options)
  }

  pause(): void {
    this.#runner.pause()
  }

  resume(): void {
    this.#runner.resume()
  }

  stop(): void {
    this.#runner.stop()
  }

  destroy(): void {
    this.#runner.stop()
    this.#layoutInvalidation.dispose()

    try {
      this.#visual?.clearFeedback()
      this.#visual?.destroy()
    } catch (error) {
      this.#trace.warn('Visual layer destroy failed.', {
        error: describeUnknownError(error),
      })
    }
  }

  getCapabilities(): CapabilityReport {
    return this.#capabilities.getCapabilities()
  }

  getFidelity(): FidelityReport {
    return this.#capabilities.getFidelity()
  }

  getTrace(): Trace {
    return this.#trace.getTrace()
  }

  on(_event: DebugEventName, _listener: ActorbleListener): void {
    throw unsupportedDebugEventSubscription('on')
  }

  off(_event: DebugEventName, _listener: ActorbleListener): void {
    throw unsupportedDebugEventSubscription('off')
  }
}

export function createActorble(options: ActorbleFacadeOptions = {}): Actorble {
  return new Actorble(options)
}

function rootForDomAdapter(
  root: ActorbleOptions['root'],
): Document | ShadowRoot | undefined {
  if (root === undefined) {
    return undefined
  }

  if (isElementRoot(root)) {
    return root.ownerDocument
  }

  return root
}

function isElementRoot(root: Document | ShadowRoot | Element): root is Element {
  return root.nodeType === 1
}

function visualForOptions(
  visual: ActorbleFacadeOptions['visual'],
  root: Document | ShadowRoot,
  mode: ActorbleFacadeOptions['mode'],
): VisualLayer | undefined {
  if (isVisualLayer(visual)) {
    return visual
  }

  if (mode === 'headless') {
    return undefined
  }

  if (visual === true) {
    return new BrowserVisualLayer({ root })
  }

  if (typeof visual === 'object' && visual !== null && visual.enabled !== false) {
    return new BrowserVisualLayer({
      enabled: visual.enabled,
      root,
      cursorScale: visual.cursorScale,
      textVisibility: visual.textVisibility,
    })
  }

  return undefined
}

function visualOverlayFidelityForOptions(
  visual: ActorbleFacadeOptions['visual'],
  mode: ActorbleFacadeOptions['mode'],
): VisualOverlayFidelity {
  if (isVisualLayer(visual)) {
    return {
      implementation: 'custom-layer',
      runtime: 'enabled',
      interactivity: 'caller-owned',
      hitTesting: 'caller-owned',
    }
  }

  const enabled =
    mode !== 'headless' &&
    (visual === true ||
      (typeof visual === 'object' && visual !== null && visual.enabled !== false))

  if (enabled) {
    return {
      implementation: 'browser-overlay',
      runtime: 'enabled',
      interactivity: 'non-interactive',
      hitTesting: 'ignored',
    }
  }

  return {
    implementation: 'browser-overlay',
    runtime: 'disabled',
    interactivity: 'none',
    hitTesting: 'not-applicable',
  }
}

function visualFeedbackForOptions(
  visual: ActorbleFacadeOptions['visual'],
  mode: ActorbleFacadeOptions['mode'],
): VisualFeedbackOptions | undefined {
  if (isVisualLayer(visual)) {
    return undefined
  }

  if (mode === 'headless') {
    return { enabled: false, preset: 'quiet' }
  }

  if (visual === true) {
    return { enabled: true, preset: 'quiet' }
  }

  if (typeof visual === 'object' && visual !== null) {
    return { enabled: true, preset: 'quiet', ...visual }
  }

  return { enabled: false, preset: 'quiet' }
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function unsupportedDebugEventSubscription(action: 'on' | 'off'): Error {
  return actorbleError(
    'PLATFORM_UNSUPPORTED',
    'Debug event subscriptions are not implemented yet.',
    {
      details: {
        boundary: 'actorble-facade',
        action,
        capability: 'debug-event-subscription',
        limit:
          'Debug event subscriptions are not implemented yet; use getTrace() for diagnostics snapshots.',
      },
    },
  )
}

function isVisualLayer(visual: ActorbleFacadeOptions['visual']): visual is VisualLayer {
  return (
    typeof visual === 'object' &&
    visual !== null &&
    'showCursor' in visual &&
    'highlightTarget' in visual &&
    'showClick' in visual
  )
}
