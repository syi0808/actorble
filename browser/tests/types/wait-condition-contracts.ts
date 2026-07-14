import {
  Actorble,
  attribute,
  attached,
  css,
  detached,
  disabled,
  enabled,
  focused,
  hidden,
  text,
  url,
  value,
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
  text('Saved'),
  text('Saved', { target }),
  value(target, 'ready'),
  attribute(target, 'data-state', 'ready'),
  attribute(target, 'data-state', null),
  url('/projects/1'),
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
