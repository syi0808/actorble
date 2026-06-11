import { notImplemented } from '../shared/index.js'
import type { CapabilityReport, FidelityReport } from '../capability-fidelity/index.js'
import type { Trace } from '../diagnostics-trace/index.js'
import type { GeometrySnapshot } from '../geometry-engine/index.js'
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

export class Actorble {
  constructor(readonly options: ActorbleOptions = {}) {}

  resolve(_locator: Locator, _options?: ResolveOptions): Promise<TargetHandle> {
    return notImplemented('Actorble Facade resolve')
  }

  resolveAll(_locator: Locator, _options?: ResolveOptions): Promise<readonly TargetHandle[]> {
    return notImplemented('Actorble Facade resolveAll')
  }

  exists(_locator: Locator, _options?: ResolveOptions): Promise<boolean> {
    return notImplemented('Actorble Facade exists')
  }

  inspect(_target: TargetLike): Promise<TargetInspection> {
    return notImplemented('Actorble Facade inspect')
  }

  geometry(_target: TargetLike): Promise<GeometrySnapshot> {
    return notImplemented('Actorble Facade geometry')
  }

  moveTo(_target: TargetLike, _options?: MoveOptions): Promise<void> {
    return notImplemented('Actorble Facade moveTo')
  }

  click(_target: TargetLike, _options?: ClickOptions): Promise<void> {
    return notImplemented('Actorble Facade click')
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

  typeInto(_target: TargetLike, _text: string, _options?: TypeOptions): Promise<void> {
    return notImplemented('Actorble Facade typeInto')
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

  waitFor(_condition: WaitCondition, _options?: WaitOptions): Promise<void> {
    return notImplemented('Actorble Facade waitFor')
  }

  run(_scenario: Scenario, _options?: RunOptions): Promise<void> {
    return notImplemented('Actorble Facade run')
  }

  pause(): void {
    return notImplemented('Actorble Facade pause')
  }

  resume(): void {
    return notImplemented('Actorble Facade resume')
  }

  stop(): void {
    return notImplemented('Actorble Facade stop')
  }

  destroy(): void {
    return notImplemented('Actorble Facade destroy')
  }

  getCapabilities(): CapabilityReport {
    return notImplemented('Actorble Facade getCapabilities')
  }

  getFidelity(): FidelityReport {
    return notImplemented('Actorble Facade getFidelity')
  }

  getTrace(): Trace {
    return notImplemented('Actorble Facade getTrace')
  }

  on(_event: DebugEventName, _listener: ActorbleListener): void {
    return notImplemented('Actorble Facade on')
  }

  off(_event: DebugEventName, _listener: ActorbleListener): void {
    return notImplemented('Actorble Facade off')
  }
}

export function createActorble(options: ActorbleOptions = {}): Actorble {
  return new Actorble(options)
}
