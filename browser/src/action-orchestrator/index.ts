import { notImplemented } from '../shared/index.js'
import type {
  ClickCurrentOptions,
  ClickOptions,
  DragOptions,
  FillOptions,
  FocusOptions,
  MoveOptions,
  PressOptions,
  ScrollOptions,
  ScrollPosition,
  TargetLike,
  TypeOptions,
  WaitCondition,
  WaitOptions,
} from '../shared/index.js'
import type { GeometrySnapshot } from '../geometry-engine/index.js'
import type { WaitResult } from '../wait-observation-engine/index.js'

export type ActionName =
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

export type ActionTransaction = Readonly<{
  name: ActionName
  target?: TargetLike
  startedAt: number
}>

export interface ActionOrchestrator {
  moveTo(target: TargetLike, options?: MoveOptions): Promise<void>
  click(target: TargetLike, options?: ClickOptions): Promise<void>
  clickCurrent(options?: ClickCurrentOptions): Promise<void>
  doubleClick(target: TargetLike, options?: ClickOptions): Promise<void>
  focus(target: TargetLike, options?: FocusOptions): Promise<void>
  type(text: string, options?: TypeOptions): Promise<void>
  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void>
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<void>
  press(keys: string, options?: PressOptions): Promise<void>
  scrollTo(targetOrPosition: TargetLike | ScrollPosition, options?: ScrollOptions): Promise<void>
  drag(from: TargetLike, to: TargetLike, options?: DragOptions): Promise<void>
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>
  geometry(target: TargetLike): Promise<GeometrySnapshot>
}

export class BrowserActionOrchestrator implements ActionOrchestrator {
  moveTo(): Promise<void> {
    return notImplemented('Action Orchestrator moveTo')
  }

  click(): Promise<void> {
    return notImplemented('Action Orchestrator click')
  }

  clickCurrent(): Promise<void> {
    return notImplemented('Action Orchestrator clickCurrent')
  }

  doubleClick(): Promise<void> {
    return notImplemented('Action Orchestrator doubleClick')
  }

  focus(): Promise<void> {
    return notImplemented('Action Orchestrator focus')
  }

  type(): Promise<void> {
    return notImplemented('Action Orchestrator type')
  }

  typeInto(): Promise<void> {
    return notImplemented('Action Orchestrator typeInto')
  }

  fill(): Promise<void> {
    return notImplemented('Action Orchestrator fill')
  }

  press(): Promise<void> {
    return notImplemented('Action Orchestrator press')
  }

  scrollTo(): Promise<void> {
    return notImplemented('Action Orchestrator scrollTo')
  }

  drag(): Promise<void> {
    return notImplemented('Action Orchestrator drag')
  }

  waitFor(): Promise<WaitResult> {
    return notImplemented('Action Orchestrator waitFor')
  }

  geometry(): Promise<GeometrySnapshot> {
    return notImplemented('Action Orchestrator geometry')
  }
}

export function createActionOrchestrator(): ActionOrchestrator {
  return new BrowserActionOrchestrator()
}
