export type PointerInputCapability = 'none' | 'visual' | 'synthetic' | 'native'
export type KeyboardInputCapability = 'none' | 'synthetic' | 'native'
export type TextInputCapability =
  | 'none'
  | 'set-value'
  | 'insert-text'
  | 'composition'
  | 'native'
export type PseudoStateCapability = 'none' | 'mirror' | 'native'
export type DragAndDropCapability =
  | 'none'
  | 'pointer-gesture'
  | 'html5-dnd'
  | 'editor-selection'
  | 'custom-adapter'

export type InputFidelity =
  | 'visual-only'
  | 'synthetic-dom-events'
  | 'native-backed'

export type VisualOverlayFidelity = 'none' | 'non-interactive'

export type CapabilityReport = Readonly<{
  pointerInput: PointerInputCapability
  keyboardInput: KeyboardInputCapability
  textInput: TextInputCapability
  pseudoState: PseudoStateCapability
  trustedEvents: boolean
  crossOriginFrame: boolean
  closedShadowRoot: boolean
  dragAndDrop: DragAndDropCapability
}>

export type FidelityReport = Readonly<{
  pointerInput: InputFidelity
  keyboardInput: InputFidelity
  textInput: InputFidelity
  pseudoState: PseudoStateCapability
  visualOverlay: VisualOverlayFidelity
  trustedEvents: boolean
  limits: readonly string[]
}>

export interface CapabilityFidelityReporter {
  getCapabilities(): CapabilityReport
  getFidelity(): FidelityReport
}

export class BrowserCapabilityFidelityReporter implements CapabilityFidelityReporter {
  getCapabilities(): CapabilityReport {
    return { ...browserCapabilityReport }
  }

  getFidelity(): FidelityReport {
    return {
      ...browserFidelityReport,
      limits: [...browserFidelityReport.limits],
    }
  }
}

export function createCapabilityFidelityReporter(): CapabilityFidelityReporter {
  return new BrowserCapabilityFidelityReporter()
}

const browserCapabilityReport: CapabilityReport = {
  pointerInput: 'synthetic',
  keyboardInput: 'synthetic',
  textInput: 'insert-text',
  pseudoState: 'mirror',
  trustedEvents: false,
  crossOriginFrame: false,
  closedShadowRoot: false,
  dragAndDrop: 'none',
}

const browserFidelityReport: FidelityReport = {
  pointerInput: 'synthetic-dom-events',
  keyboardInput: 'synthetic-dom-events',
  textInput: 'synthetic-dom-events',
  pseudoState: 'mirror',
  visualOverlay: 'non-interactive',
  trustedEvents: false,
  limits: [
    'Events are synthetic DOM events and are not browser-trusted user input.',
    'Cross-origin frames and closed shadow roots cannot be inspected from in-page JavaScript.',
    'Drag and drop is not implemented in the initial browser vertical slice.',
  ],
}
