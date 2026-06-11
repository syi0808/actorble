import { notImplemented } from '../shared/index.js'
import type { FillOptions, TargetLike, TypeOptions } from '../shared/index.js'

export type TextInputStrategy = 'type' | 'typeInto' | 'fill'

export type TextInputResult = Readonly<{
  strategy: TextInputStrategy
  text: string
}>

export interface TextInputEngine {
  type(text: string, options?: TypeOptions): Promise<TextInputResult>
  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<TextInputResult>
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<TextInputResult>
}

export class BrowserTextInputEngine implements TextInputEngine {
  type(): Promise<TextInputResult> {
    return notImplemented('Text Input Engine type')
  }

  typeInto(): Promise<TextInputResult> {
    return notImplemented('Text Input Engine typeInto')
  }

  fill(): Promise<TextInputResult> {
    return notImplemented('Text Input Engine fill')
  }
}

export function createTextInputEngine(): TextInputEngine {
  return new BrowserTextInputEngine()
}
