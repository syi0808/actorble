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
      timing: 'ease-in-out',
      duration: 250,
    })
    expect(BROWSER_OPTION_DEFAULTS.inertiaMotion).toEqual({
      initialVelocity: 1200,
      deceleration: 4800,
    })
    expect(BROWSER_OPTION_DEFAULTS.springMotion).toEqual({
      stiffness: 170,
      damping: 26,
      mass: 1,
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

  it('materializes default inertia motion parameters at the option boundary', () => {
    expect(
      resolveActionOptions('moveTo', {
        options: {
          motion: { kind: 'inertia' },
        },
      }),
    ).toEqual({
      motion: {
        kind: 'inertia',
        initialVelocity: BROWSER_OPTION_DEFAULTS.inertiaMotion.initialVelocity,
        deceleration: BROWSER_OPTION_DEFAULTS.inertiaMotion.deceleration,
      },
    })
    expect(
      resolveActionOptions('click', {
        options: {
          motion: { kind: 'inertia', initialVelocity: 900 },
        },
      }),
    ).toEqual({
      motion: {
        kind: 'inertia',
        initialVelocity: 900,
        deceleration: BROWSER_OPTION_DEFAULTS.inertiaMotion.deceleration,
      },
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
  })

  it('materializes default spring motion parameters at the option boundary', () => {
    expect(
      resolveActionOptions('moveTo', {
        options: {
          motion: { kind: 'spring' },
        },
      }),
    ).toEqual({
      motion: {
        kind: 'spring',
        stiffness: BROWSER_OPTION_DEFAULTS.springMotion.stiffness,
        damping: BROWSER_OPTION_DEFAULTS.springMotion.damping,
        mass: BROWSER_OPTION_DEFAULTS.springMotion.mass,
      },
    })
    expect(
      resolveActionOptions('click', {
        options: {
          motion: { kind: 'spring', damping: 10 },
        },
      }),
    ).toEqual({
      motion: {
        kind: 'spring',
        stiffness: BROWSER_OPTION_DEFAULTS.springMotion.stiffness,
        damping: 10,
        mass: BROWSER_OPTION_DEFAULTS.springMotion.mass,
      },
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
  })

  it('normalizes run-level motion and action defaults', () => {
    const signal = new AbortController().signal

    expect(
      resolveRunOptions({
        timeout: 250,
        signal,
        motion: false,
        actionDefaults: {
          click: { timeout: 50, pressDwell: 0 },
        },
      }),
    ).toEqual({
      timeout: 250,
      signal,
      motion: false,
      actionDefaults: {
        click: { timeout: 50, pressDwell: 0 },
      },
    })
  })

  it('merges defaults, actorble defaults, run policy, run action defaults, and call options in order', () => {
    const signal = new AbortController().signal
    const actorble = resolveActorbleOptions({
      actionDefaults: {
        click: { duration: 300, pressDwell: 90 },
        typeInto: { delay: 25 },
        selectText: { timeout: 100 },
      },
    })
    const run = resolveRunOptions({
      motion: false,
      actionDefaults: {
        click: { pressDwell: 70 },
        typeInto: { delay: 10 },
        selectText: { timeout: 50 },
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
    expect(resolveActionOptions('selectText', { actorble, run })).toEqual({
      timeout: 50,
    })
    expect(
      resolveActionOptions('selectText', {
        actorble,
        run,
        options: { timeout: 5, signal },
      }),
    ).toEqual({
      timeout: 5,
      signal,
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
