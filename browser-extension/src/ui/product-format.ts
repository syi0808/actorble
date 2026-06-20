import type { CommandIconName } from './icons.js'

export function actionIcon(action: string): CommandIconName {
  switch (action) {
    case 'click':
    case 'clickCurrent':
    case 'doubleClick':
      return 'mouse-pointer-click'
    case 'moveTo':
      return 'move'
    case 'focus':
      return 'focus'
    case 'type':
    case 'typeInto':
      return 'type'
    case 'fill':
      return 'text-cursor'
    case 'press':
      return 'keyboard'
    case 'scrollToTarget':
    case 'scrollToPosition':
      return 'scroll'
    case 'drag':
      return 'grab'
    case 'selectText':
      return 'text-cursor'
    case 'waitForVisible':
      return 'eye'
    case 'waitForHidden':
      return 'eye-off'
    case 'waitForText':
      return 'target'
    case 'delay':
      return 'timer'
    default:
      return 'target'
  }
}

export function actionHint(action: string): string {
  switch (action) {
    case 'click':
      return 'Activate an element'
    case 'moveTo':
      return 'Move pointer to target'
    case 'doubleClick':
      return 'Activate twice'
    case 'focus':
      return 'Focus an element'
    case 'clickCurrent':
      return 'Click current pointer'
    case 'type':
      return 'Type text'
    case 'typeInto':
      return 'Focus and type'
    case 'fill':
      return 'Set field value'
    case 'press':
      return 'Press keys'
    case 'scrollToTarget':
      return 'Reveal a target'
    case 'scrollToPosition':
      return 'Scroll coordinates'
    case 'drag':
      return 'Drag between targets'
    case 'selectText':
      return 'Select text range'
    case 'waitForVisible':
      return 'Wait until visible'
    case 'waitForHidden':
      return 'Wait until hidden'
    case 'waitForText':
      return 'Wait for text'
    case 'delay':
      return 'Pause the flow'
    default:
      return 'Add action'
  }
}

export function formatActionLabel(action: string): string {
  return action
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (first) => first.toUpperCase())
}

export function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

export function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
