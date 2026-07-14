import { describe, expect, it } from 'vitest'
import { createRevealPlanner } from '../src/targeting/reveal-planner/index.js'

const zeroInsets = Object.freeze({ top: '0px', right: '0px', bottom: '0px', left: '0px' })

function surface(overrides = {}) {
  return {
    id: 'surface-1',
    kind: 'element',
    scrollTarget: {},
    viewportRect: { x: 0, y: 0, width: 100, height: 100 },
    metrics: {
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 500,
      scrollHeight: 500,
      clientWidth: 100,
      clientHeight: 100,
      clientLeft: 0,
      clientTop: 0,
    },
    overflowAxes: ['x', 'y'],
    scrollPadding: zeroInsets,
    parentId: null,
    ...overrides,
  }
}

function target(overrides = {}) {
  return {
    rect: { x: 150, y: 160, width: 20, height: 20 },
    visibleRect: null,
    coordinateSpace: 'viewport',
    scrollMargin: zeroInsets,
    ...overrides,
  }
}

function plan(input = {}) {
  return createRevealPlanner().plan({
    target: target(),
    surfaces: [surface()],
    options: {
      visibility: 'any',
      block: 'nearest',
      inline: 'nearest',
      container: 'all',
    },
    ...input,
  })
}

describe('RevealPlanner', () => {
  it.each([
    ['start', { x: 150, y: 160 }],
    ['center', { x: 110, y: 120 }],
    ['end', { x: 70, y: 80 }],
    ['nearest', { x: 70, y: 80 }],
  ])('plans %s alignment independently on both axes', (alignment, intendedTo) => {
    expect(
      plan({
        options: {
          visibility: 'any',
          block: alignment,
          inline: alignment,
          container: 'all',
        },
      }),
    ).toEqual([
      {
        surfaceId: 'surface-1',
        from: { x: 0, y: 0 },
        intendedTo,
        axes: ['x', 'y'],
      },
    ])
  })

  it.each([
    ['any', { x: 150, y: 160, width: 1, height: 1 }],
    ['full', { x: 150, y: 160, width: 20, height: 20 }],
    [{ ratio: 0.25 }, { x: 150, y: 160, width: 10, height: 10 }],
  ])('returns no steps when %j visibility is already met', (visibility, visibleRect) => {
    expect(
      plan({
        target: target({ visibleRect }),
        options: { visibility, block: 'start', inline: 'start', container: 'all' },
      }),
    ).toEqual([])
  })

  it('plans alignment when fractional visibility is immediately below its threshold', () => {
    expect(
      plan({
        target: target({ visibleRect: { x: 150, y: 160, width: 9.9, height: 10 } }),
        options: {
          visibility: { ratio: 0.25 },
          block: 'start',
          inline: 'start',
          container: 'all',
        },
      }),
    ).toHaveLength(1)
  })

  it('combines padding, safe area, margin, and positive placement offset deterministically', () => {
    expect(
      plan({
        target: target({
          rect: { x: 250, y: 200, width: 40, height: 30 },
          scrollMargin: { top: '8px', right: '6px', bottom: '2px', left: '4px' },
        }),
        surfaces: [
          surface({
            viewportRect: { x: 10, y: 20, width: 200, height: 160 },
            metrics: {
              scrollLeft: 20,
              scrollTop: 30,
              scrollWidth: 800,
              scrollHeight: 700,
              clientWidth: 200,
              clientHeight: 160,
              clientLeft: 2,
              clientTop: 3,
            },
            scrollPadding: { top: '5px', right: '20px', bottom: '15px', left: '10px' },
          }),
        ],
        options: {
          visibility: 'any',
          block: 'start',
          inline: 'start',
          container: 'all',
          safeArea: { top: 11, right: 7, bottom: 13, left: 3 },
          offset: { x: 12, y: 9 },
        },
      }),
    ).toEqual([
      {
        surfaceId: 'surface-1',
        from: { x: 20, y: 30 },
        intendedTo: { x: 231, y: 177 },
        axes: ['x', 'y'],
      },
    ])
  })

  it('clamps intended positions to both range boundaries', () => {
    expect(
      plan({
        target: target({ rect: { x: -200, y: 500, width: 20, height: 20 } }),
        surfaces: [
          surface({
            metrics: {
              scrollLeft: 50,
              scrollTop: 0,
              scrollWidth: 300,
              scrollHeight: 450,
              clientWidth: 100,
              clientHeight: 100,
              clientLeft: 0,
              clientTop: 0,
            },
          }),
        ],
        options: {
          visibility: 'any',
          block: 'start',
          inline: 'start',
          container: 'all',
        },
      }),
    ).toEqual([
      {
        surfaceId: 'surface-1',
        from: { x: 50, y: 0 },
        intendedTo: { x: 0, y: 350 },
        axes: ['x', 'y'],
      },
    ])
  })

  it('omits unavailable axes and skips a surface when no active axis changes', () => {
    expect(
      plan({
        surfaces: [surface({ overflowAxes: ['x'] })],
        target: target({ rect: { x: 10, y: 500, width: 20, height: 20 } }),
        options: {
          visibility: 'any',
          block: 'start',
          inline: 'nearest',
          container: 'all',
        },
      }),
    ).toEqual([])
  })

  it('uses maximum-overlap nearest placement for oversized targets without encoding failure', () => {
    expect(
      plan({
        target: target({ rect: { x: 150, y: -20, width: 150, height: 150 } }),
        options: {
          visibility: 'full',
          block: 'nearest',
          inline: 'nearest',
          container: 'all',
        },
      }),
    ).toEqual([
      {
        surfaceId: 'surface-1',
        from: { x: 0, y: 0 },
        intendedTo: { x: 150, y: 0 },
        axes: ['x'],
      },
    ])
  })

  it('uses the same nearest interval rule when target and effective viewport are equal-sized', () => {
    expect(
      plan({
        target: target({ rect: { x: 120, y: 120, width: 100, height: 100 } }),
        options: {
          visibility: 'full',
          block: 'nearest',
          inline: 'nearest',
          container: 'all',
        },
      }),
    ).toMatchObject([{ intendedTo: { x: 120, y: 120 }, axes: ['x', 'y'] }])
  })

  it('applies nearest to the first canonical surface and all to the full inner-to-outer chain', () => {
    const inner = surface({ id: 'inner', parentId: 'outer' })
    const outer = surface({
      id: 'outer',
      viewportRect: { x: 20, y: 20, width: 80, height: 80 },
      parentId: null,
    })

    expect(
      plan({
        surfaces: [inner, outer],
        options: { visibility: 'any', block: 'start', inline: 'start', container: 'nearest' },
      }).map((step) => step.surfaceId),
    ).toEqual(['inner'])
    expect(
      plan({
        surfaces: [inner, outer],
        options: { visibility: 'any', block: 'start', inline: 'start', container: 'all' },
      }).map((step) => step.surfaceId),
    ).toEqual(['inner', 'outer'])
  })

  it('is translation invariant and returns deeply immutable output without mutating input', () => {
    const input = {
      target: target(),
      surfaces: [surface()],
      options: { visibility: 'any', block: 'start', inline: 'start', container: 'all' },
    }
    const before = structuredClone(input)
    const first = createRevealPlanner().plan(input)
    const translated = createRevealPlanner().plan({
      ...input,
      target: target({ rect: { x: 190, y: 190, width: 20, height: 20 } }),
      surfaces: [surface({ viewportRect: { x: 40, y: 30, width: 100, height: 100 } })],
    })

    expect(input).toEqual(before)
    expect(translated[0].intendedTo).toEqual(first[0].intendedTo)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first[0])).toBe(true)
    expect(Object.isFrozen(first[0].from)).toBe(true)
    expect(Object.isFrozen(first[0].intendedTo)).toBe(true)
    expect(Object.isFrozen(first[0].axes)).toBe(true)
  })
})
