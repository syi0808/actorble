import { readFile } from 'node:fs/promises'
import { describe, expect, it, beforeEach } from 'vitest'
import { BrowserSelectionAdapter } from '../src/platform/platform-adapter/index.js'

describe('BrowserSelectionAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.getSelection()?.removeAllRanges()
  })

  it('applies, reads, and clears ordinary document text selection', () => {
    document.body.innerHTML = '<p id="copy">Readable document text</p>'
    const textNode = document.querySelector('#copy').firstChild
    const adapter = new BrowserSelectionAdapter(document)

    const applied = adapter.applySelection({
      anchor: { target: textNode, offset: 9 },
      focus: { target: textNode, offset: 17 },
    })

    expect(applied).toMatchObject({
      surface: 'document-text',
      strategy: 'selection-api',
      selectedText: 'document',
      anchorOffset: 9,
      focusOffset: 17,
      collapsed: false,
    })
    expect(adapter.readSelection()).toMatchObject({
      surface: 'document-text',
      strategy: 'selection-api',
      selectedText: 'document',
      anchorNode: textNode,
      focusNode: textNode,
    })

    expect(adapter.clearSelection()).toMatchObject({
      surface: 'document-text',
      strategy: 'selection-api',
      selectedText: '',
      collapsed: true,
    })
    expect(document.getSelection()?.rangeCount).toBe(0)
  })

  it('applies, reads, and clears input text selection with native range APIs', () => {
    document.body.innerHTML = '<input id="name" value="Mina Park" />'
    const input = document.querySelector('#name')
    const adapter = new BrowserSelectionAdapter(document)

    const applied = adapter.applySelection({
      anchor: { target: input, offset: 0 },
      focus: { target: input, offset: 4 },
    })

    expect(applied).toMatchObject({
      surface: 'input',
      strategy: 'input-range-api',
      selectedText: 'Mina',
      anchorOffset: 0,
      focusOffset: 4,
      collapsed: false,
    })
    expect(adapter.readSelection(input)).toMatchObject({
      selectedText: 'Mina',
      anchorNode: input,
      focusNode: input,
    })

    expect(adapter.clearSelection(input)).toMatchObject({
      surface: 'input',
      selectedText: '',
      anchorOffset: 4,
      focusOffset: 4,
      collapsed: true,
    })
    expect(input.value).toBe('Mina Park')
    expect(input.selectionStart).toBe(4)
    expect(input.selectionEnd).toBe(4)
  })

  it('applies, reads, and clears textarea selection with native range APIs', () => {
    document.body.innerHTML = '<textarea id="message">Line one\nLine two</textarea>'
    const textarea = document.querySelector('#message')
    const adapter = new BrowserSelectionAdapter(document)

    const applied = adapter.applySelection({
      anchor: { target: textarea, offset: 5 },
      focus: { target: textarea, offset: 13 },
    })

    expect(applied).toMatchObject({
      surface: 'textarea',
      strategy: 'input-range-api',
      selectedText: 'one\nLine',
      anchorOffset: 5,
      focusOffset: 13,
      collapsed: false,
    })
    expect(adapter.readSelection(textarea)).toMatchObject({
      selectedText: 'one\nLine',
      anchorNode: textarea,
      focusNode: textarea,
    })

    expect(adapter.clearSelection(textarea)).toMatchObject({
      surface: 'textarea',
      selectedText: '',
      anchorOffset: 13,
      focusOffset: 13,
      collapsed: true,
    })
  })

  it('applies and reads simple contenteditable text-node selection', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">Draft editor text</div>'
    const textNode = document.querySelector('#editor').firstChild
    const adapter = new BrowserSelectionAdapter(document)

    expect(
      adapter.applySelection({
        anchor: { target: textNode, offset: 6 },
        focus: { target: textNode, offset: 12 },
      }),
    ).toMatchObject({
      surface: 'contenteditable',
      strategy: 'selection-api',
      selectedText: 'editor',
      collapsed: false,
    })
    expect(adapter.readSelection()).toMatchObject({
      surface: 'contenteditable',
      selectedText: 'editor',
    })
  })

  it('represents collapsed selections with equal anchor and focus offsets', () => {
    document.body.innerHTML = '<p id="copy">Collapsed document text</p>'
    const textNode = document.querySelector('#copy').firstChild
    const adapter = new BrowserSelectionAdapter(document)

    expect(
      adapter.applySelection({
        anchor: { target: textNode, offset: 9 },
        focus: { target: textNode, offset: 9 },
      }),
    ).toMatchObject({
      selectedText: '',
      anchorOffset: 9,
      focusOffset: 9,
      collapsed: true,
    })
  })

  it('rejects unsupported input types with actionable text selection errors', () => {
    document.body.innerHTML = '<input id="quantity" type="number" value="42" />'
    const input = document.querySelector('#quantity')
    const adapter = new BrowserSelectionAdapter(document)

    expect(() =>
      adapter.applySelection({
        anchor: { target: input, offset: 0 },
        focus: { target: input, offset: 1 },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'TEXT_SELECTION_UNSUPPORTED',
        details: expect.objectContaining({
          surface: 'input',
          reason: 'unsupported-input-type',
        }),
      }),
    )
  })

  it('rejects text control selections whose endpoints target different controls', () => {
    document.body.innerHTML = `
      <input id="first" value="First" />
      <input id="second" value="Second" />
    `
    const first = document.querySelector('#first')
    const second = document.querySelector('#second')
    const adapter = new BrowserSelectionAdapter(document)

    expect(() =>
      adapter.applySelection({
        anchor: { target: first, offset: 0 },
        focus: { target: second, offset: 1 },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'TEXT_SELECTION_UNSUPPORTED',
        details: expect.objectContaining({
          reason: 'text-control-endpoint-mismatch',
        }),
      }),
    )
  })

  it('rejects shadow-root selections until shadow selection policy exists', () => {
    const host = document.createElement('section')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = '<p>Shadow text</p>'
    document.body.append(host)

    const textNode = shadowRoot.querySelector('p').firstChild
    const adapter = new BrowserSelectionAdapter(document)
    const expectedError = expect.objectContaining({
      code: 'TEXT_SELECTION_UNSUPPORTED',
      details: expect.objectContaining({
        reason: 'shadow-root-policy-required',
      }),
    })

    expect(() =>
      adapter.applySelection({
        anchor: { target: textNode, offset: 0 },
        focus: { target: textNode, offset: 6 },
      }),
    ).toThrowError(expectedError)
    expect(() => adapter.readSelection(textNode)).toThrowError(expectedError)
    expect(() => adapter.clearSelection(textNode)).toThrowError(expectedError)
  })

  it('stays inside platform adapter boundaries', async () => {
    const source = await readFile(
      'src/platform/platform-adapter/selection-adapter/index.ts',
      'utf8',
    )

    expect(source).not.toMatch(/action-orchestrator|gesture-engine|recorder|interaction-state-store/)
  })
})
