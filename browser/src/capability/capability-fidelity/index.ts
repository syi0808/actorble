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

export type VisualOverlayImplementation =
  | 'browser-overlay'
  | 'custom-layer'
  | 'none'

export type VisualOverlayRuntime = 'disabled' | 'enabled'

export type VisualOverlayInteractivity =
  | 'non-interactive'
  | 'caller-owned'
  | 'none'

export type VisualOverlayHitTesting =
  | 'ignored'
  | 'caller-owned'
  | 'not-applicable'

export type VisualOverlayFidelity = Readonly<{
  implementation: VisualOverlayImplementation
  runtime: VisualOverlayRuntime
  interactivity: VisualOverlayInteractivity
  hitTesting: VisualOverlayHitTesting
}>

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

export type CapabilityFidelityReporterOptions = Readonly<{
  visualOverlay?: VisualOverlayFidelity
}>

export class BrowserCapabilityFidelityReporter implements CapabilityFidelityReporter {
  readonly #visualOverlay: VisualOverlayFidelity

  constructor(options: CapabilityFidelityReporterOptions = {}) {
    this.#visualOverlay = options.visualOverlay ?? browserVisualOverlayDisabled
  }

  getCapabilities(): CapabilityReport {
    return { ...browserCapabilityReport }
  }

  getFidelity(): FidelityReport {
    return {
      ...browserFidelityReport,
      visualOverlay: { ...this.#visualOverlay },
      limits: [...browserFidelityReport.limits],
    }
  }
}

export function createCapabilityFidelityReporter(
  options: CapabilityFidelityReporterOptions = {},
): CapabilityFidelityReporter {
  return new BrowserCapabilityFidelityReporter(options)
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

const browserVisualOverlayDisabled: VisualOverlayFidelity = {
  implementation: 'browser-overlay',
  runtime: 'disabled',
  interactivity: 'none',
  hitTesting: 'not-applicable',
}

const browserFidelityReport: FidelityReport = {
  pointerInput: 'synthetic-dom-events',
  keyboardInput: 'synthetic-dom-events',
  textInput: 'synthetic-dom-events',
  pseudoState: 'mirror',
  visualOverlay: browserVisualOverlayDisabled,
  trustedEvents: false,
  limits: [
    'Events are synthetic DOM events and are not browser-trusted user input.',
    'Visual feedback is optional and does not make synthetic events browser-trusted.',
    'Cross-origin frames and closed shadow roots cannot be inspected from in-page JavaScript.',
    'Drag and drop is not implemented in the initial browser vertical slice.',
    'Unsupported public action APIs currently report PLATFORM_UNSUPPORTED: clickCurrent, doubleClick, type, fill, press, scrollTo, and drag.',
    'Debug event subscription APIs on/off are not implemented yet; use getTrace() for diagnostics snapshots.',
  ],
}
