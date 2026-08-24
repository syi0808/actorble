import { describe, expect, it, vi } from 'vitest'
import { BrowserDomAdapter } from '../src/platform/platform-adapter/dom-adapter/index.js'
import {
  ActorbleScroller2ScrollChainResolver,
  ActorbleScrollerPlatform,
} from '../src/targeting/scroller2-platform-adapter/index.js'

function targetHandle(element) {
  return {
    id: 'target-1',
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: {},
  }
}

describe('ActorbleScrollerPlatform', () => {
  it('adapts Actorble DOM metrics and scroll writes to scroller2', () => {
    const dom = new BrowserDomAdapter()
    const platform = new ActorbleScrollerPlatform(dom)
    const scrollTo = vi.spyOn(dom, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(dom, 'getScrollMetrics').mockReturnValue({
      scrollLeft: 4,
      scrollTop: 8,
      scrollWidth: 300,
      scrollHeight: 500,
      clientWidth: 100,
      clientHeight: 200,
      clientLeft: 0,
      clientTop: 0,
    })

    expect(platform.getScrollMetrics(window)).toMatchObject({
      scroll: { x: 4, y: 8 },
      min: { x: 0, y: 0 },
      max: { x: 200, y: 300 },
      axes: { x: true, y: true },
    })
    platform.writeScroll(window, { x: 12, y: 24 })
    expect(scrollTo).toHaveBeenCalledWith(window, { x: 12, y: 24 }, { behavior: 'instant' })
  })

  it('uses scroller2 discovery for nested scroll surfaces', () => {
    const container = document.createElement('section')
    const target = document.createElement('button')
    container.append(target)
    document.body.replaceChildren(container)
    const dom = new BrowserDomAdapter()
    vi.spyOn(dom, 'getComputedScrollStyle').mockImplementation((element) => ({
      overflowX: element === container ? 'hidden' : 'visible',
      overflowY: element === container ? 'auto' : 'visible',
      scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      scrollMargin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    }))
    vi.spyOn(dom, 'getScrollMetrics').mockImplementation((surface) => ({
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 100,
      scrollHeight: surface === container ? 400 : 100,
      clientWidth: 100,
      clientHeight: 100,
      clientLeft: 0,
      clientTop: 0,
    }))

    const resolver = new ActorbleScroller2ScrollChainResolver(dom)

    expect(resolver.resolve(targetHandle(target)).map(({ scrollTarget }) => scrollTarget)).toEqual([
      container,
      window,
    ])
  })
})
