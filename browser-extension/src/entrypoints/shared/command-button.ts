import {
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Focus,
  HandGrab,
  Keyboard,
  PanelRight,
  Pause,
  Play,
  Plus,
  Save,
  Scroll,
  Square,
  Target,
  TextCursorInput,
  Timer,
  Trash2,
  Type,
  MousePointerClick,
  Move,
  createElement,
  type IconNode,
} from 'lucide'

export type CommandIconName =
  | 'arrow-down'
  | 'arrow-up'
  | 'check'
  | 'copy'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'file-up'
  | 'focus'
  | 'grab'
  | 'keyboard'
  | 'panel-right'
  | 'pause'
  | 'play'
  | 'plus'
  | 'record'
  | 'save'
  | 'scroll'
  | 'square'
  | 'target'
  | 'text-cursor'
  | 'timer'
  | 'trash'
  | 'type'
  | 'mouse-pointer-click'
  | 'move'

export type CommandButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger'

export type CommandButtonChrome = Readonly<{
  icon?: CommandIconName
  iconOnly?: boolean
  label?: string
  tooltip?: string
  variant?: CommandButtonVariant
}>

export type CommandButtonView = Readonly<{
  label: string
  disabled: boolean
  pending: boolean
}>

const iconNodes = {
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  check: Check,
  copy: Copy,
  download: Download,
  eye: Eye,
  'eye-off': EyeOff,
  'file-up': FileUp,
  focus: Focus,
  grab: HandGrab,
  keyboard: Keyboard,
  'panel-right': PanelRight,
  pause: Pause,
  play: Play,
  plus: Plus,
  record: Circle,
  save: Save,
  scroll: Scroll,
  square: Square,
  target: Target,
  'text-cursor': TextCursorInput,
  timer: Timer,
  trash: Trash2,
  type: Type,
  'mouse-pointer-click': MousePointerClick,
  move: Move,
} satisfies Readonly<Record<CommandIconName, IconNode>>

export function applyCommandButtonView(
  button: HTMLButtonElement,
  view: CommandButtonView,
  chrome: CommandButtonChrome = {},
): void {
  renderCommandButtonContent(button, {
    label: chrome.label ?? view.label,
    icon: chrome.icon,
    iconOnly: chrome.iconOnly ?? false,
    tooltip: chrome.tooltip,
    variant: chrome.variant,
  })
  button.disabled = view.disabled
  button.dataset.pending = view.pending ? 'true' : 'false'
}

export function renderCommandButtonContent(
  button: HTMLButtonElement,
  chrome: Required<Pick<CommandButtonChrome, 'iconOnly'>> &
    Omit<CommandButtonChrome, 'iconOnly'>,
): void {
  const label = chrome.label ?? button.textContent?.trim() ?? ''
  const tooltip = chrome.tooltip ?? label

  button.replaceChildren()
  if (chrome.icon !== undefined) {
    button.append(createCommandIcon(chrome.icon))
  }

  const labelElement = document.createElement('span')
  labelElement.className = chrome.iconOnly ? 'sr-only' : 'button-label'
  labelElement.textContent = label
  button.append(labelElement)

  button.dataset.iconOnly = chrome.iconOnly ? 'true' : 'false'
  if (chrome.variant !== undefined) {
    button.dataset.variant = chrome.variant
  }
  button.setAttribute('aria-label', tooltip)
  button.title = tooltip
}

export function createCommandIcon(icon: CommandIconName): SVGSVGElement {
  const svg = createElement(iconNodes[icon], {
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-width': '2',
    viewBox: '0 0 24 24',
  }) as SVGSVGElement
  svg.classList.add('ui-icon')
  return svg
}
