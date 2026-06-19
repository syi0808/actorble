import { Actorble, css } from '../../src/index.js'
import type {
  PointerSequence,
  PointerSequenceOptions,
  ScenarioStep,
  SelectTextOptions,
  TextSelectionTarget,
} from '../../src/index.js'

const offsetSelectionTarget: TextSelectionTarget = {
  anchor: { target: css('#copy'), offset: 0 },
  focus: { target: css('#copy'), offset: 8 },
}

const shortcutSelectionTarget: TextSelectionTarget = css('#message')

const pointSelectionTarget: TextSelectionTarget = {
  anchor: { target: css('#copy'), point: { x: 12, y: 24 } },
  focus: { target: css('#copy'), point: { x: 96, y: 24 } },
}

const selectOptions: SelectTextOptions = { timeout: 250 }
const actorble = new Actorble()

const pointerSequence: PointerSequence = [
  { type: 'move', to: { x: 10, y: 12 }, duration: 20 },
  { type: 'down', button: 'primary' },
  { type: 'pause', duration: 30 },
  { type: 'move', to: { x: 80, y: 12 }, duration: 60 },
  { type: 'up', button: 'primary' },
]

const pointerSequenceOptions: PointerSequenceOptions = { timeout: 500 }

// @ts-expect-error public scenario steps do not expose standalone pointerDown actions.
const independentPointerDownAction: ScenarioStep['action'] = 'pointerDown'

// @ts-expect-error public scenario steps do not expose standalone pointerUp actions.
const independentPointerUpAction: ScenarioStep['action'] = 'pointerUp'

void [
  actorble.selectText(offsetSelectionTarget, selectOptions),
  actorble.pointerSequence(pointerSequence, pointerSequenceOptions),
  offsetSelectionTarget,
  shortcutSelectionTarget,
  pointSelectionTarget,
  selectOptions,
  pointerSequence,
  pointerSequenceOptions,
  independentPointerDownAction,
  independentPointerUpAction,
]
