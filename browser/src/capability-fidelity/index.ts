import { notImplemented } from '../shared/index.js'

export type CapabilitySupport = 'supported' | 'partial' | 'unsupported'

export type CapabilityReport = Readonly<{
  pointerInput: CapabilitySupport
  keyboardInput: CapabilitySupport
  textInput: CapabilitySupport
  dragAndDrop: CapabilitySupport
  trustedEvents: CapabilitySupport
  crossOriginFrames: CapabilitySupport
  closedShadowRoots: CapabilitySupport
}>

export type FidelityReport = Readonly<{
  pseudoStateMirroring: CapabilitySupport
  visualOverlay: CapabilitySupport
  pointerPath: CapabilitySupport
  focusVisible: CapabilitySupport
}>

export interface CapabilityFidelityReporter {
  getCapabilities(): CapabilityReport
  getFidelity(): FidelityReport
}

export class BrowserCapabilityFidelityReporter implements CapabilityFidelityReporter {
  getCapabilities(): CapabilityReport {
    return notImplemented('Capability / Fidelity getCapabilities')
  }

  getFidelity(): FidelityReport {
    return notImplemented('Capability / Fidelity getFidelity')
  }
}

export function createCapabilityFidelityReporter(): CapabilityFidelityReporter {
  return new BrowserCapabilityFidelityReporter()
}
