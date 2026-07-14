import { BrowserActionOrchestrator } from '../../runtime/action-orchestrator/index.js'
import { BrowserCapabilityFidelityReporter } from '../../capability/capability-fidelity/index.js'
import { BrowserDiagnosticsTrace } from '../../diagnostics/diagnostics-trace/index.js'
import { BrowserGeometryEngine } from '../../targeting/geometry-engine/index.js'
import { createFrameGeometrySurfaceCache } from '../../targeting/frame-geometry-surface-cache/index.js'
import { createLayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/index.js'
import { BrowserScenarioRunner } from '../../runtime/scenario-runner/index.js'
import { BrowserSurfaceEngine } from '../../targeting/surface-engine/index.js'
import { BrowserTargetResolver } from '../../targeting/target-resolver/index.js'
import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import { BrowserVisualLayer } from '../../visual/visual-layer/index.js'
import { resolveActionOptions, resolveActorbleOptions } from '../../options/index.js'
import type { ActionOrchestrator } from '../../runtime/action-orchestrator/index.js'
import type {
  CapabilityFidelityReporter,
  CapabilityReport,
  FidelityReport,
  VisualOverlayFidelity,
} from '../../capability/capability-fidelity/index.js'
import type { Trace, TraceCollector, TraceEvent } from '../../diagnostics/diagnostics-trace/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../../targeting/geometry-engine/index.js'
import type { LayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import type { DomPort } from '../../shared/index.js'
import type { ScenarioRunner } from '../../runtime/scenario-runner/index.js'
import type { TargetResolver } from '../../targeting/target-resolver/index.js'
import type { VisualLayer } from '../../visual/visual-layer/index.js'
import type {
  ResolvedActorbleOptions,
  ResolvedBrowserFeedbackOptions,
} from '../../options/index.js'
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
  PointerSequence,
  PointerSequenceOptions,
  PressOptions,
  ResolveOptions,
  RunOptions,
  Scenario,
  RevealOptions,
  RevealResult,
  ScrollDelta,
  ScrollOptions,
  ScrollPosition,
  ScrollResult,
  SelectTextOptions,
  TargetHandle,
  TargetInspection,
  TargetLike,
  TextSelectionTarget,
  TypeOptions,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js'

export type ActorbleFacadeOptions = ActorbleOptions &
  Readonly<{
    capabilities?: CapabilityFidelityReporter
    dom?: DomPort
    geometry?: GeometryEngine
    orchestrator?: ActionOrchestrator
    resolver?: TargetResolver
    runner?: ScenarioRunner
    trace?: TraceCollector
    visualLayer?: VisualLayer
  }>

export class Actorble {
  readonly #options: ResolvedActorbleOptions
  readonly #capabilities: CapabilityFidelityReporter
  readonly #geometry: GeometryEngine
  readonly #orchestrator: ActionOrchestrator
  readonly #resolver: TargetResolver
  readonly #runner: ScenarioRunner
  readonly #trace: TraceCollector
  readonly #layoutInvalidation: LayoutInvalidationTracker
  readonly #visual?: VisualLayer
  readonly #traceListeners = new Map<DebugEventName, Set<ActorbleListener<TraceEvent>>>()
  #destroyed = false

  constructor(readonly options: ActorbleFacadeOptions = {}) {
    const resolvedOptions = resolveActorbleOptions(options)
    const trace = options.trace ?? new BrowserDiagnosticsTrace()
    const root = rootForDomAdapter(resolvedOptions.root)
    const dom = options.dom ?? new BrowserDomAdapter(root)
    const timeline = new BrowserTimelineEngine()
    const layoutInvalidation = createLayoutInvalidationTracker({ dom, timeline })
    const geometrySurfaceCache = createFrameGeometrySurfaceCache({
      layoutInvalidation,
      timeline,
    })
    let geometry = options.geometry
    const surface = new BrowserSurfaceEngine({
      dom,
      cache: geometrySurfaceCache,
      geometry: () => {
        if (geometry === undefined) {
          throw new Error('Actorble geometry composition is not initialized.')
        }

        return geometry
      },
    })
    const resolver =
      options.resolver ?? new BrowserTargetResolver({ dom, trace, clock: timeline })
    geometry ??=
      new BrowserGeometryEngine({
        dom,
        surface,
        cache: geometrySurfaceCache,
        clock: timeline,
      })
    const visual = visualForOptions(options.visualLayer, dom.getRoot(), resolvedOptions.feedback)
    const orchestrator =
      options.orchestrator ??
      new BrowserActionOrchestrator({
        dom,
        geometry,
        surface,
        resolver,
        timeline,
        trace,
        layoutInvalidation,
        visual,
        visualFeedback: resolvedOptions.feedback,
        pointer: resolvedOptions.pointer,
      })

    this.#trace = trace
    this.#options = resolvedOptions
    this.#layoutInvalidation = layoutInvalidation
    this.#capabilities =
      options.capabilities ??
      new BrowserCapabilityFidelityReporter({
        visualOverlay: visualOverlayFidelityForOptions(
          options.visualLayer,
          resolvedOptions.feedback,
        ),
      })
    this.#geometry = geometry
    this.#orchestrator = orchestrator
    this.#resolver = resolver
    this.#runner =
      options.runner ??
      new BrowserScenarioRunner({
        actorble: resolvedOptions,
        orchestrator,
        timeline,
        trace,
        layoutInvalidation,
      })
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
    return this.#orchestrator.moveTo(
      target,
      resolveActionOptions('moveTo', { actorble: this.#options, options }),
    )
  }

  click(target: TargetLike, options?: ClickOptions): Promise<void> {
    return this.#orchestrator.click(
      target,
      resolveActionOptions('click', { actorble: this.#options, options }),
    )
  }

  clickCurrent(options?: ClickCurrentOptions): Promise<void> {
    return this.#orchestrator.clickCurrent(
      resolveActionOptions('clickCurrent', { actorble: this.#options, options }),
    )
  }

  doubleClick(target: TargetLike, options?: ClickOptions): Promise<void> {
    return this.#orchestrator.doubleClick(
      target,
      resolveActionOptions('doubleClick', { actorble: this.#options, options }),
    )
  }

  focus(target: TargetLike, options?: FocusOptions): Promise<void> {
    return this.#orchestrator.focus(
      target,
      resolveActionOptions('focus', { actorble: this.#options, options }),
    )
  }

  type(text: string, options?: TypeOptions): Promise<void> {
    return this.#orchestrator.type(
      text,
      resolveActionOptions('type', { actorble: this.#options, options }),
    )
  }

  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void> {
    return this.#orchestrator.typeInto(
      target,
      text,
      resolveActionOptions('typeInto', { actorble: this.#options, options }),
    )
  }

  fill(target: TargetLike, text: string, options?: FillOptions): Promise<void> {
    return this.#orchestrator.fill(
      target,
      text,
      resolveActionOptions('fill', { actorble: this.#options, options }),
    )
  }

  press(keys: string, options?: PressOptions): Promise<void> {
    return this.#orchestrator.press(
      keys,
      resolveActionOptions('press', { actorble: this.#options, options }),
    )
  }

  reveal(target: TargetLike, options?: RevealOptions): Promise<RevealResult> {
    return this.#orchestrator.reveal(
      target,
      resolveActionOptions('reveal', { actorble: this.#options, options }),
    )
  }

  scrollTo(position: ScrollPosition, options?: ScrollOptions): Promise<ScrollResult> {
    return this.#orchestrator.scrollTo(
      position,
      resolveActionOptions('scrollTo', { actorble: this.#options, options }),
    )
  }

  scrollBy(delta: ScrollDelta, options?: ScrollOptions): Promise<ScrollResult> {
    return this.#orchestrator.scrollBy(
      delta,
      resolveActionOptions('scrollBy', { actorble: this.#options, options }),
    )
  }

  drag(from: TargetLike, to: TargetLike, options?: DragOptions): Promise<void> {
    return this.#orchestrator.drag(
      from,
      to,
      resolveActionOptions('drag', { actorble: this.#options, options }),
    )
  }

  selectText(targetOrRange: TextSelectionTarget, options?: SelectTextOptions): Promise<void> {
    return this.#orchestrator.selectText(
      targetOrRange,
      resolveActionOptions('selectText', { actorble: this.#options, options }),
    )
  }

  pointerSequence(sequence: PointerSequence, options?: PointerSequenceOptions): Promise<void> {
    return this.#orchestrator.pointerSequence(
      sequence,
      resolveActionOptions('pointerSequence', { actorble: this.#options, options }),
    )
  }

  async waitFor(condition: WaitCondition, options?: WaitOptions): Promise<void> {
    await this.#orchestrator.waitFor(
      condition,
      resolveActionOptions('waitFor', { actorble: this.#options, options }),
    )
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
    if (this.#destroyed) {
      return
    }

    this.#destroyed = true
    this.#detachTraceListeners()
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

  on(event: DebugEventName, listener: ActorbleListener<TraceEvent>): void {
    if (this.#destroyed) {
      return
    }

    this.#trace.on(event, listener)
    const listeners = this.#traceListeners.get(event) ?? new Set<ActorbleListener<TraceEvent>>()

    listeners.add(listener)
    this.#traceListeners.set(event, listeners)
  }

  off(event: DebugEventName, listener: ActorbleListener<TraceEvent>): void {
    if (this.#destroyed) {
      return
    }

    this.#trace.off(event, listener)
    const listeners = this.#traceListeners.get(event)

    if (listeners === undefined) {
      return
    }

    listeners.delete(listener)

    if (listeners.size === 0) {
      this.#traceListeners.delete(event)
    }
  }

  #detachTraceListeners(): void {
    for (const [event, listeners] of this.#traceListeners) {
      for (const listener of listeners) {
        this.#trace.off(event, listener)
      }
    }

    this.#traceListeners.clear()
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
  visualLayer: ActorbleFacadeOptions['visualLayer'],
  root: Document | ShadowRoot,
  feedback: ResolvedBrowserFeedbackOptions,
): VisualLayer | undefined {
  if (visualLayer !== undefined) {
    return visualLayer
  }

  if (!feedback.enabled) {
    return undefined
  }

  return new BrowserVisualLayer({
    root,
    textVisibility: feedback.textVisibility,
  })
}

function visualOverlayFidelityForOptions(
  visualLayer: ActorbleFacadeOptions['visualLayer'],
  feedback: ResolvedBrowserFeedbackOptions,
): VisualOverlayFidelity {
  if (visualLayer !== undefined && feedback.enabled) {
    return {
      implementation: 'custom-layer',
      runtime: 'enabled',
      interactivity: 'caller-owned',
      hitTesting: 'caller-owned',
    }
  }

  if (feedback.enabled) {
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

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
