import {
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  Copy,
  Download,
  FileUp,
  PanelRight,
  Pause,
  Play,
  Plus,
  Save,
  Square,
  Target,
  Trash2,
  createElement,
  type IconNode,
} from 'lucide'

export type CommandIconName =
  | 'arrow-down'
  | 'arrow-up'
  | 'check'
  | 'copy'
  | 'download'
  | 'file-up'
  | 'panel-right'
  | 'pause'
  | 'play'
  | 'plus'
  | 'record'
  | 'save'
  | 'square'
  | 'target'
  | 'trash'

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
  'file-up': FileUp,
  'panel-right': PanelRight,
  pause: Pause,
  play: Play,
  plus: Plus,
  record: Circle,
  save: Save,
  square: Square,
  target: Target,
  trash: Trash2,
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
