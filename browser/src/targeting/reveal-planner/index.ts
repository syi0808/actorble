import type {
  ComputedCssInsets,
  Rect,
  RevealAlignment,
  RevealOptions,
  ScrollPosition,
} from '../../shared/index.js'
import type { ScrollSurfaceSnapshot } from '../scroll-chain-resolver/index.js'

export type RevealPlanningTarget = Readonly<{
  rect: Rect
  visibleRect: Rect | null
  coordinateSpace: 'viewport'
  scrollMargin: ComputedCssInsets
}>

export type RevealPlanningInput = Readonly<{
  target: RevealPlanningTarget
  surfaces: readonly ScrollSurfaceSnapshot[]
  options: RevealOptions
}>

export type RevealPlanStep = Readonly<{
  surfaceId: string
  from: ScrollPosition
  intendedTo: ScrollPosition
  axes: readonly ('x' | 'y')[]
}>

export interface RevealPlanner {
  plan(input: RevealPlanningInput): readonly RevealPlanStep[]
}

type Axis = 'x' | 'y'

type AxisValues = Readonly<{
  viewportStart: number
  viewportEnd: number
  targetStart: number
  targetEnd: number
  current: number
  maximum: number
  offset: number
}>

const emptySafeArea = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 })
const emptyOffset = Object.freeze({ x: 0, y: 0 })

export class PureRevealPlanner implements RevealPlanner {
  plan(input: RevealPlanningInput): readonly RevealPlanStep[] {
    if (visibilityRequirementMet(input.target, input.options.visibility ?? 'any')) {
      return Object.freeze([])
    }

    const surfaces =
      (input.options.container ?? 'all') === 'nearest'
        ? input.surfaces.slice(0, 1)
        : input.surfaces
    const steps: RevealPlanStep[] = []

    for (const surface of surfaces) {
      const from = {
        x: surface.metrics.scrollLeft,
        y: surface.metrics.scrollTop,
      }
      const intendedTo = { ...from }
      const axes: Axis[] = []

      for (const axis of ['x', 'y'] as const) {
        if (!surface.overflowAxes.includes(axis)) {
          continue
        }

        const intended = intendedPosition(
          axisValues(axis, input.target, surface, input.options),
          axis === 'x'
            ? (input.options.inline ?? 'nearest')
            : (input.options.block ?? 'nearest'),
        )

        if (intended !== from[axis]) {
          intendedTo[axis] = intended
          axes.push(axis)
        }
      }

      if (axes.length > 0) {
        steps.push(
          Object.freeze({
            surfaceId: surface.id,
            from: Object.freeze(from),
            intendedTo: Object.freeze(intendedTo),
            axes: Object.freeze(axes),
          }),
        )
      }
    }

    return Object.freeze(steps)
  }
}

export function createRevealPlanner(): RevealPlanner {
  return new PureRevealPlanner()
}

function visibilityRequirementMet(
  target: RevealPlanningTarget,
  visibility: NonNullable<RevealOptions['visibility']>,
): boolean {
  const ratio = visibleRatio(target.rect, target.visibleRect)

  if (visibility === 'any') {
    return ratio > 0
  }
  if (visibility === 'full') {
    return ratio >= 1
  }

  return ratio >= visibility.ratio
}

function visibleRatio(rect: Rect, visibleRect: Rect | null): number {
  if (rect.width <= 0 || rect.height <= 0 || visibleRect === null) {
    return 0
  }

  const visibleArea = Math.max(0, visibleRect.width) * Math.max(0, visibleRect.height)
  return clamp(visibleArea / (rect.width * rect.height), 0, 1)
}

function axisValues(
  axis: Axis,
  target: RevealPlanningTarget,
  surface: ScrollSurfaceSnapshot,
  options: RevealOptions,
): AxisValues {
  const safeArea = options.safeArea ?? emptySafeArea
  const offset = options.offset ?? emptyOffset
  const padding = numericInsets(surface.scrollPadding)
  const margin = numericInsets(target.scrollMargin)
  const horizontal = axis === 'x'
  const viewportOrigin = horizontal ? surface.viewportRect.x : surface.viewportRect.y
  const viewportSize = horizontal ? surface.viewportRect.width : surface.viewportRect.height
  const viewportStartInset = horizontal
    ? padding.left + safeArea.left
    : padding.top + safeArea.top
  const viewportEndInset = horizontal
    ? padding.right + safeArea.right
    : padding.bottom + safeArea.bottom
  const targetOrigin = horizontal ? target.rect.x : target.rect.y
  const targetSize = horizontal ? target.rect.width : target.rect.height
  const targetStartMargin = horizontal ? margin.left : margin.top
  const targetEndMargin = horizontal ? margin.right : margin.bottom
  const current = horizontal ? surface.metrics.scrollLeft : surface.metrics.scrollTop
  const scrollExtent = horizontal ? surface.metrics.scrollWidth : surface.metrics.scrollHeight
  const clientExtent = horizontal ? surface.metrics.clientWidth : surface.metrics.clientHeight

  return {
    viewportStart: viewportOrigin + viewportStartInset,
    viewportEnd: viewportOrigin + viewportSize - viewportEndInset,
    targetStart: targetOrigin - targetStartMargin,
    targetEnd: targetOrigin + targetSize + targetEndMargin,
    current,
    maximum: Math.max(0, scrollExtent - clientExtent),
    offset: horizontal ? offset.x : offset.y,
  }
}

function intendedPosition(values: AxisValues, alignment: RevealAlignment): number {
  const startDelta = values.targetStart - values.viewportStart - values.offset
  const endDelta = values.targetEnd - values.viewportEnd - values.offset
  const centerDelta =
    (values.targetStart + values.targetEnd) / 2 -
    (values.viewportStart + values.viewportEnd) / 2 -
    values.offset

  if (alignment === 'nearest') {
    return nearestPosition(values, [0, startDelta, endDelta])
  }

  const delta = alignment === 'start' ? startDelta : alignment === 'center' ? centerDelta : endDelta
  return clamp(values.current + delta, 0, values.maximum)
}

function nearestPosition(values: AxisValues, deltas: readonly number[]): number {
  const candidates = Array.from(
    new Set(deltas.map((delta) => clamp(values.current + delta, 0, values.maximum))),
  )

  candidates.sort((a, b) => {
    const overlapDifference = overlapAfterScroll(values, b) - overlapAfterScroll(values, a)
    if (overlapDifference !== 0) {
      return overlapDifference
    }

    return Math.abs(a - values.current) - Math.abs(b - values.current)
  })

  return candidates[0] ?? values.current
}

function overlapAfterScroll(values: AxisValues, intended: number): number {
  const delta = intended - values.current
  const start = values.targetStart - delta
  const end = values.targetEnd - delta
  return Math.max(0, Math.min(end, values.viewportEnd) - Math.max(start, values.viewportStart))
}

function numericInsets(insets: ComputedCssInsets): Readonly<{
  top: number
  right: number
  bottom: number
  left: number
}> {
  return {
    top: cssPixels(insets.top),
    right: cssPixels(insets.right),
    bottom: cssPixels(insets.bottom),
    left: cssPixels(insets.left),
  }
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
