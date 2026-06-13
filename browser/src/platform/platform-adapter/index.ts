export * from './dom-adapter/index.js'
export * from './event-dispatcher/index.js'
export * from './state-applier/index.js'
export * from './style-adapter/index.js'

import type { DomAdapter } from './dom-adapter/index.js'
import type { EventDispatcher } from './event-dispatcher/index.js'
import type { StateApplier } from './state-applier/index.js'
import type { StyleAdapter } from './style-adapter/index.js'
import type { PlatformAdapterPort } from '../../shared/index.js'

export interface BrowserPlatformAdapter extends PlatformAdapterPort {
  readonly dom: DomAdapter
  readonly events: EventDispatcher
  readonly state: StateApplier
  readonly style: StyleAdapter
}

export class BrowserPlatformAdapterShell implements BrowserPlatformAdapter {
  constructor(
    readonly dom: DomAdapter,
    readonly events: EventDispatcher,
    readonly state: StateApplier,
    readonly style: StyleAdapter,
  ) {}
}
