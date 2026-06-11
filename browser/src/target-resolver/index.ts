import { notImplemented } from '../shared/index.js'
import type {
  Locator,
  ResolveOptions,
  TargetHandle,
  TargetInspection,
  TargetLike,
} from '../shared/index.js'

export type TargetCandidate = Readonly<{
  element: Element
  score: number
  debug?: string
}>

export interface TargetResolver {
  resolve(locator: Locator, options?: ResolveOptions): Promise<TargetHandle>
  resolveAll(locator: Locator, options?: ResolveOptions): Promise<readonly TargetHandle[]>
  exists(locator: Locator, options?: ResolveOptions): Promise<boolean>
  inspect(target: TargetLike): Promise<TargetInspection>
  validate(target: TargetHandle): Promise<TargetHandle>
}

export class BrowserTargetResolver implements TargetResolver {
  resolve(): Promise<TargetHandle> {
    return notImplemented('Target Resolver resolve')
  }

  resolveAll(): Promise<readonly TargetHandle[]> {
    return notImplemented('Target Resolver resolveAll')
  }

  exists(): Promise<boolean> {
    return notImplemented('Target Resolver exists')
  }

  inspect(): Promise<TargetInspection> {
    return notImplemented('Target Resolver inspect')
  }

  validate(): Promise<TargetHandle> {
    return notImplemented('Target Resolver validate')
  }
}

export function createTargetResolver(): TargetResolver {
  return new BrowserTargetResolver()
}
