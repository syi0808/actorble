import { afterEach, describe, expect, it } from 'vitest'
import {
  applySelectionEndpointRange,
  readSelectionSnapshot,
  textSelectionEndpointPocMatrix,
} from './fixtures/text-selection-endpoint-poc.js'

afterEach(() => {
  document.body.innerHTML = ''
  document.getSelection()?.removeAllRanges()
})

describe('text selection endpoint PoC', () => {
  it('selects ordinary document text with offset endpoints and reads selected text', () => {
    document.body.innerHTML = '<p id="copy">Readable document text</p>'
    const paragraph = document.querySelector('#copy')
    const textNode = paragraph.firstChild

    const selection = applySelectionEndpointRange({
      surface: 'document-text',
      anchor: { target: textNode, offset: 9 },
      focus: { target: textNode, offset: 17 },
    })

    expect(selection).toMatchObject({
      supported: true,
      endpointModel: 'offset-based',
      strategy: 'selection-api',
      selectedText: 'document',
      collapsed: false,
    })
    expect(readSelectionSnapshot(document)).toMatchObject({
      selectedText: 'document',
      anchorOffset: 9,
      focusOffset: 17,
      collapsed: false,
    })
  })

  it('represents collapsed document selections with equal anchor and focus offsets', () => {
    document.body.innerHTML = '<p id="copy">Collapsed document text</p>'
    const textNode = document.querySelector('#copy').firstChild

    const selection = applySelectionEndpointRange({
      surface: 'document-text',
      anchor: { target: textNode, offset: 9 },
      focus: { target: textNode, offset: 9 },
    })

    expect(selection).toMatchObject({
      selectedText: '',
      anchorOffset: 9,
      focusOffset: 9,
      collapsed: true,
    })
  })

  it('selects input text with native range APIs', () => {
    document.body.innerHTML = '<input id="name" value="Mina Park" />'
    const input = document.querySelector('#name')

    const selection = applySelectionEndpointRange({
      surface: 'input',
      anchor: { target: input, offset: 0 },
      focus: { target: input, offset: 4 },
    })

    expect(selection).toMatchObject({
      supported: true,
      endpointModel: 'offset-based',
      strategy: 'input-range-api',
      selectedText: 'Mina',
      anchorOffset: 0,
      focusOffset: 4,
      collapsed: false,
    })
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(4)
  })

  it('selects textarea text with native range APIs', () => {
    document.body.innerHTML = '<textarea id="message">Line one\nLine two</textarea>'
    const textarea = document.querySelector('#message')

    const selection = applySelectionEndpointRange({
      surface: 'textarea',
      anchor: { target: textarea, offset: 5 },
      focus: { target: textarea, offset: 13 },
    })

    expect(selection).toMatchObject({
      supported: true,
      endpointModel: 'offset-based',
      strategy: 'input-range-api',
      selectedText: 'one\nLine',
      anchorOffset: 5,
      focusOffset: 13,
      collapsed: false,
    })
    expect(textarea.selectionStart).toBe(5)
    expect(textarea.selectionEnd).toBe(13)
  })

  it('selects simple contenteditable text with Selection API endpoints', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">Draft editor text</div>'
    const textNode = document.querySelector('#editor').firstChild

    const selection = applySelectionEndpointRange({
      surface: 'contenteditable',
      anchor: { target: textNode, offset: 6 },
      focus: { target: textNode, offset: 12 },
    })

    expect(selection).toMatchObject({
      supported: true,
      endpointModel: 'offset-based',
      strategy: 'selection-api',
      selectedText: 'editor',
      collapsed: false,
    })
  })

  it('keeps unsupported or adapter-required boundaries explicit in the matrix', () => {
    expect(textSelectionEndpointPocMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'iframe-same-origin',
          supported: false,
          endpointModel: 'adapter-required',
          strategy: 'unsupported',
          capability: 'frame-routing-required',
        }),
        expect.objectContaining({
          surface: 'iframe-cross-origin',
          supported: false,
          endpointModel: 'adapter-required',
          strategy: 'unsupported',
          capability: 'cross-origin-frame-unsupported',
        }),
        expect.objectContaining({
          surface: 'closed-shadow-root',
          supported: false,
          endpointModel: 'adapter-required',
          strategy: 'unsupported',
          capability: 'closed-shadow-root-unsupported',
        }),
        expect.objectContaining({
          surface: 'editor-like',
          supported: false,
          endpointModel: 'adapter-required',
          strategy: 'editor-adapter',
          capability: 'editor-adapter-required',
        }),
        expect.objectContaining({
          surface: 'point-based-endpoint',
          supported: false,
          endpointModel: 'point-based',
          strategy: 'pointer-gesture',
          capability: 'geometry-policy-required',
        }),
      ]),
    )
  })

  it('confirms browser selection behavior in Chromium for supported editable surfaces', async () => {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()

    try {
      const page = await browser.newPage()
      await page.setContent(`
        <main>
          <p id="copy">Readable document text</p>
          <input id="name" value="Mina Park" />
          <textarea id="message">Line one
Line two</textarea>
          <div id="editor" contenteditable="true">Draft editor text</div>
        </main>
      `)

      const result = await page.evaluate(() => {
        const selectTextNode = (selector, start, end) => {
          const node = document.querySelector(selector).firstChild
          const range = document.createRange()
          range.setStart(node, start)
          range.setEnd(node, end)
          const selection = document.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
          return {
            selectedText: selection.toString(),
            collapsed: selection.isCollapsed,
          }
        }

        const input = document.querySelector('#name')
        input.setSelectionRange(0, 4)

        const textarea = document.querySelector('#message')
        textarea.setSelectionRange(5, 13)

        return {
          documentText: selectTextNode('#copy', 9, 17),
          input: {
            selectedText: input.value.slice(input.selectionStart, input.selectionEnd),
            selectionStart: input.selectionStart,
            selectionEnd: input.selectionEnd,
          },
          textarea: {
            selectedText: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
          },
          contenteditable: selectTextNode('#editor', 6, 12),
        }
      })

      expect(result).toEqual({
        documentText: { selectedText: 'document', collapsed: false },
        input: { selectedText: 'Mina', selectionStart: 0, selectionEnd: 4 },
        textarea: { selectedText: 'one\nLine', selectionStart: 5, selectionEnd: 13 },
        contenteditable: { selectedText: 'editor', collapsed: false },
      })
    } finally {
      await browser.close()
    }
  })
})
