import { describe, expect, it, vi } from 'vitest'
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js'

const movedSignal = {
  type: 'pointer:moved',
  point: { x: 12, y: 24 },
  previousPoint: null,
}

describe('BrowserPointerSignalBus', () => {
  it('emits signals to listeners in subscription order', () => {
    const bus = new BrowserPointerSignalBus()
    const calls = []

    bus.subscribe((signal) => calls.push(['first', signal.type]))
    bus.subscribe((signal) => calls.push(['second', signal.type]))

    bus.emit(movedSignal)

    expect(calls).toEqual([
      ['first', 'pointer:moved'],
      ['second', 'pointer:moved'],
    ])
  })

  it('stops sending events to disposed listeners', () => {
    const bus = new BrowserPointerSignalBus()
    const listener = vi.fn()
    const subscription = bus.subscribe(listener)

    subscription.dispose()
    bus.emit(movedSignal)

    expect(listener).not.toHaveBeenCalled()
  })

  it('uses a listener snapshot for the current emit', () => {
    const bus = new BrowserPointerSignalBus()
    const calls = []
    let secondSubscription

    bus.subscribe(() => {
      calls.push('first')
      secondSubscription.dispose()
      bus.subscribe(() => calls.push('third'))
    })
    secondSubscription = bus.subscribe(() => calls.push('second'))

    bus.emit(movedSignal)
    bus.emit(movedSignal)

    expect(calls).toEqual(['first', 'second', 'first', 'third'])
  })
})
