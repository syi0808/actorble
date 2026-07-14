import {
  Actorble,
  attached,
  css,
  detached,
  disabled,
  enabled,
  focused,
  hidden,
  visible,
} from '../../src/index.js'
import type { ScenarioStep, WaitCondition } from '../../src/index.js'

const actorble = new Actorble()
const target = css('#save')
const conditions: readonly WaitCondition[] = [
  visible(target),
  hidden(target),
  attached(target),
  detached(target),
  enabled(target),
  disabled(target),
  focused(target),
]
const steps: readonly ScenarioStep[] = conditions.map((condition) => ({
  action: 'waitFor',
  input: condition,
  options: { timeout: 250 },
}))

for (const condition of conditions) {
  void actorble.waitFor(condition, { timeout: 250 })
}

void steps
