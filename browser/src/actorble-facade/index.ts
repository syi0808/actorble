import { BrowserActionOrchestrator } from '../action-orchestrator/index.js'
import { BrowserCapabilityFidelityReporter } from '../capability-fidelity/index.js'
import { BrowserDiagnosticsTrace } from '../diagnostics-trace/index.js'
import { BrowserGeometryEngine } from '../geometry-engine/index.js'
import { BrowserDomAdapter } from '../platform-adapter/index.js'
import { BrowserScenarioRunner } from '../scenario-runner/index.js'
import { BrowserTargetResolver } from '../target-resolver/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import { notImplemented } from '../shared/index.js'
import type { ActionOrchestrator } from '../action-orchestrator/index.js'
import type {
  CapabilityFidelityReporter,
  CapabilityReport,
  FidelityReport,
} from '../capability-fidelity/index.js'
import type { Trace, TraceCollector } from '../diagnostics-trace/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../geometry-engine/index.js'
import type { DomPort } from '../shared/index.js'
import type { ScenarioRunner } from '../scenario-runner/index.js'
import type { TargetResolver } from '../target-resolver/index.js'
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
  WaitCondition,
  WaitOptions,
} from '../shared/index.js'

export type ActorbleFacadeOptions = ActorbleOptions &
  Readonly<{
    capabilities?: CapabilityFidelityReporter
    dom?: DomPort
    geometry?: GeometryEngine
    orchestrator?: ActionOrchestrator
    resolver?: TargetResolver
    runner?: ScenarioRunner
    trace?: TraceCollector
  }>

export class Actorble {
  readonly #capabilities: CapabilityFidelityReporter
  readonly #geometry: GeometryEngine
  readonly #orchestrator: ActionOrchestrator
  readonly #resolver: TargetResolver
  readonly #runner: ScenarioRunner
  readonly #trace: TraceCollector

  constructor(readonly options: ActorbleFacadeOptions = {}) {
    const trace = options.trace ?? new BrowserDiagnosticsTrace()
    const root = rootForDomAdapter(options.root)
    const dom = options.dom ?? new BrowserDomAdapter(root)
    const timeline = new BrowserTimelineEngine()
    const resolver =
      options.resolver ?? new BrowserTargetResolver({ dom, trace, clock: timeline })
    const geometry = options.geometry ?? new BrowserGeometryEngine({ dom, clock: timeline })
    const orchestrator =
      options.orchestrator ??
      new BrowserActionOrchestrator({
        dom,
        geometry,
        resolver,
        timeline,
        trace,
      })

    this.#trace = trace
    this.#capabilities = options.capabilities ?? new BrowserCapabilityFidelityReporter()
    this.#geometry = geometry
    this.#orchestrator = orchestrator
    this.#resolver = resolver
    this.#runner = options.runner ?? new BrowserScenarioRunner({ orchestrator, timeline, trace })
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

  clickCurrent(_options?: ClickCurrentOptions): Promise<void> {
    return notImplemented('Actorble Facade clickCurrent')
  }

  doubleClick(_target: TargetLike, _options?: ClickOptions): Promise<void> {
    return notImplemented('Actorble Facade doubleClick')
  }

  focus(_target: TargetLike, _options?: FocusOptions): Promise<void> {
    return notImplemented('Actorble Facade focus')
  }

  type(_text: string, _options?: TypeOptions): Promise<void> {
    return notImplemented('Actorble Facade type')
  }

  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void> {
    return this.#orchestrator.typeInto(target, text, options)
  }

  fill(_target: TargetLike, _text: string, _options?: FillOptions): Promise<void> {
    return notImplemented('Actorble Facade fill')
  }

  press(_keys: string, _options?: PressOptions): Promise<void> {
    return notImplemented('Actorble Facade press')
  }

  scrollTo(
    _targetOrPosition: TargetLike | ScrollPosition,
    _options?: ScrollOptions,
  ): Promise<void> {
    return notImplemented('Actorble Facade scrollTo')
  }

  drag(_from: TargetLike, _to: TargetLike, _options?: DragOptions): Promise<void> {
    return notImplemented('Actorble Facade drag')
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
    return notImplemented('Actorble Facade destroy')
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
    return notImplemented('Actorble Facade on')
  }

  off(_event: DebugEventName, _listener: ActorbleListener): void {
    return notImplemented('Actorble Facade off')
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
