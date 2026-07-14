import { Actorble, css } from '../../src/index.js'
import type {
  RevealOptions,
  RevealResult,
  ScenarioStep,
  ScrollDelta,
  ScrollOptions,
  ScrollPosition,
  ScrollResult,
} from '../../src/index.js'

const actorble = new Actorble()
const target = css('#card')
const position: ScrollPosition = { x: 10, y: 20 }
const delta: ScrollDelta = { x: -5, y: 30 }
const revealOptions: RevealOptions = {
  visibility: { ratio: 0.75 },
  block: 'center',
  inline: 'nearest',
  container: 'all',
  safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
  offset: { x: 0, y: -12 },
  motion: { kind: 'timed', duration: 200, timing: 'ease-in-out' },
  settle: { kind: 'scroll-stable', quietMs: 80, stableFrames: 2, threshold: 0.5 },
}
const scrollOptions: ScrollOptions = { motion: { kind: 'native-smooth' }, settle: 'next-frame' }
const scrollByOptions: ScrollOptions = { motion: { kind: 'instant' }, settle: 'none' }

const revealResult: Promise<RevealResult> = actorble.reveal(target, revealOptions)
const scrollResult: Promise<ScrollResult> = actorble.scrollTo(position, scrollOptions)
const scrollByResult: Promise<ScrollResult> = actorble.scrollBy(delta, scrollByOptions)

const steps: readonly ScenarioStep[] = [
  { action: 'reveal', target, options: revealOptions },
  { action: 'scrollTo', input: position, options: scrollOptions },
  { action: 'scrollBy', input: delta, options: scrollByOptions },
]

// @ts-expect-error target-based scrollTo was removed; use reveal(target).
actorble.scrollTo(target)

// @ts-expect-error scroll vectors no longer carry coordinate spaces.
const coordinatePosition: ScrollPosition = { x: 0, y: 10, coordinateSpace: 'document' }

// @ts-expect-error ratio visibility uses a discriminated object.
const numericVisibility: RevealOptions = { visibility: 0.5 }

// @ts-expect-error scroll motion uses a discriminated object.
const stringMotion: ScrollOptions = { motion: 'instant' }

// @ts-expect-error target-based scrollTo scenario steps were removed.
const legacyTargetScroll: ScenarioStep = { action: 'scrollTo', target }

void [
  revealResult,
  scrollResult,
  scrollByResult,
  steps,
  coordinatePosition,
  numericVisibility,
  stringMotion,
  legacyTargetScroll,
]
