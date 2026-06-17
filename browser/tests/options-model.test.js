import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BROWSER_OPTION_DEFAULTS,
  resolveActionOptions,
  resolveActorbleOptions,
  resolveBrowserFeedbackOptions,
  resolveRunOptions,
} from '../src/options/index.js'

describe('browser options model', () => {
  it('centralizes default runtime policy', () => {
    expect(BROWSER_OPTION_DEFAULTS.pointerMotion).toEqual({
      kind: 'ease',
      easing: 'ease-in-out',
      duration: 250,
    })
    expect(BROWSER_OPTION_DEFAULTS.typingDelay).toBe(60)
    expect(BROWSER_OPTION_DEFAULTS.clickPressDwell).toBe(80)

    expect(resolveActorbleOptions().feedback).toEqual({
      enabled: true,
      cursor: true,
      targetHighlight: false,
      clickFeedback: false,
      focusOverlay: false,
      typingIndicator: false,
      keystrokeOverlay: false,
      textVisibility: undefined,
    })
  })

  it('normalizes public feedback at the browser option boundary', () => {
    expect(resolveBrowserFeedbackOptions('off')).toMatchObject({
      enabled: false,
      cursor: false,
      targetHighlight: false,
      clickFeedback: false,
      focusOverlay: false,
      typingIndicator: false,
      keystrokeOverlay: false,
    })
    expect(resolveBrowserFeedbackOptions('cursor')).toMatchObject({
      enabled: true,
      cursor: true,
      targetHighlight: false,
      clickFeedback: false,
    })
    expect(resolveActorbleOptions({ feedback: 'debug' }).feedback).toMatchObject({
      enabled: true,
      cursor: true,
      targetHighlight: true,
      clickFeedback: true,
      focusOverlay: true,
      typingIndicator: true,
      keystrokeOverlay: true,
    })
    expect(
      resolveActorbleOptions({
        feedback: { target: true, click: true, text: 'masked' },
      }).feedback,
    ).toMatchObject({
      enabled: true,
      cursor: false,
      targetHighlight: true,
      clickFeedback: true,
      focusOverlay: false,
      typingIndicator: false,
      keystrokeOverlay: false,
      textVisibility: 'masked',
    })
  })

  it('materializes centralized action defaults', () => {
    expect(resolveActionOptions('moveTo')).toEqual({
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
    })
    expect(resolveActionOptions('click')).toEqual({
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
    expect(resolveActionOptions('typeInto')).toEqual({
      delay: BROWSER_OPTION_DEFAULTS.typingDelay,
    })
  })

  it('merges defaults, actorble defaults, run policy, run action defaults, and call options in order', () => {
    const signal = new AbortController().signal
    const actorble = resolveActorbleOptions({
      actionDefaults: {
        click: { duration: 300, pressDwell: 90 },
        typeInto: { delay: 25 },
      },
    })
    const run = resolveRunOptions({
      motion: false,
      actionDefaults: {
        click: { pressDwell: 70 },
        typeInto: { delay: 10 },
      },
    })

    expect(resolveActionOptions('click', { actorble, run })).toEqual({
      duration: 0,
      pressDwell: 70,
    })
    expect(
      resolveActionOptions('click', {
        actorble,
        run,
        options: {
          duration: 45,
          pressDwell: 15,
          signal,
        },
      }),
    ).toEqual({
      duration: 45,
      pressDwell: 15,
      signal,
    })
    expect(resolveActionOptions('typeInto', { actorble, run })).toEqual({
      delay: 10,
    })
    expect(resolveActionOptions('typeInto', { actorble, run, options: { delay: 5 } })).toEqual({
      delay: 5,
    })
  })
})

describe('browser options boundary', () => {
  it('does not import runtime, visual, or platform concrete modules', async () => {
    const source = await readFile(join(process.cwd(), 'src/options/index.ts'), 'utf8')

    expect(source).not.toMatch(/from\s+['"]\.\.\/runtime\//)
    expect(source).not.toMatch(/from\s+['"]\.\.\/visual\//)
    expect(source).not.toMatch(/from\s+['"]\.\.\/platform\//)
  })
})
