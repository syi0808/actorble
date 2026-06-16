import { actorbleError } from '../../../shared/index.js'
import type { Disposable, StyleInjection, StylePort } from '../../../shared/index.js'
export type { StyleInjection } from '../../../shared/index.js'

export type StyleSheetStyleRuleSnapshot = Readonly<{
  kind: 'style'
  selectorText: string
  styleText: string
}>

export type StyleSheetGroupRuleSnapshot = Readonly<{
  kind: 'group'
  prelude: string
  rules: readonly StyleSheetRuleSnapshot[]
}>

export type StyleSheetRuleSnapshot =
  | StyleSheetStyleRuleSnapshot
  | StyleSheetGroupRuleSnapshot

export type StyleSheetScanWarning = Readonly<{
  phase: 'scan'
  message: string
  details?: Readonly<Record<string, unknown>>
}>

export type StyleSheetScanResult = Readonly<{
  rules: readonly StyleSheetRuleSnapshot[]
  warnings: readonly StyleSheetScanWarning[]
}>

export type StyleSheetVersionSnapshot = Readonly<{
  root: Document | ShadowRoot
  version: string
}>

export interface StyleSheetScanner {
  scanStyleSheets(): StyleSheetScanResult
}

export interface StyleSheetVersionProvider {
  getStyleSheetVersion(): StyleSheetVersionSnapshot
}

export interface StyleAdapter extends StylePort, StyleSheetScanner, StyleSheetVersionProvider {}

export class BrowserStyleAdapter implements StyleAdapter {
  private readonly stylesById = new Map<string, HTMLStyleElement>()
  private readonly styleNodeVersionCache = new WeakMap<Element, StyleNodeVersionCache>()

  constructor(readonly root: Document | ShadowRoot = getGlobalDocument()) {}

  injectStyle(injection: StyleInjection): Disposable {
    this.removeStyle(injection.id)

    const style = getOwnerDocument(this.root).createElement('style')
    style.setAttribute('data-actorble-style-id', injection.id)
    style.textContent = injection.cssText
    getStyleContainer(this.root).append(style)
    this.stylesById.set(injection.id, style)

    return {
      dispose: () => {
        if (this.stylesById.get(injection.id) === style) {
          this.removeStyle(injection.id)
          return
        }

        style.remove()
      },
    }
  }

  removeStyle(id: string): void {
    const trackedStyle = this.stylesById.get(id)

    if (trackedStyle) {
      trackedStyle.remove()
      this.stylesById.delete(id)
      return
    }

    const selector = `style[data-actorble-style-id="${escapeAttributeValue(id)}"]`
    getStyleContainer(this.root).querySelectorAll(selector).forEach((style) => style.remove())
  }

  getStyleSheetVersion(): StyleSheetVersionSnapshot {
    return {
      root: this.root,
      version: buildStyleSheetVersion(this.root, this.styleNodeVersionCache),
    }
  }

  scanStyleSheets(): StyleSheetScanResult {
    const rules: StyleSheetRuleSnapshot[] = []
    const warnings: StyleSheetScanWarning[] = []

    for (const sheet of Array.from(getStyleSheets(this.root))) {
      if (isActorbleRuntimeStyleSheet(sheet)) {
        continue
      }

      let cssRules: CSSRuleList

      try {
        cssRules = sheet.cssRules
      } catch (error) {
        warnings.push({
          phase: 'scan',
          message: 'Stylesheet is not accessible.',
          details: {
            href: sheet.href,
            error: describeUnknownError(error),
          },
        })
        continue
      }

      rules.push(...snapshotRules(cssRules, warnings))
    }

    return { rules, warnings }
  }
}

export function createStyleAdapter(root?: Document | ShadowRoot): StyleAdapter {
  return new BrowserStyleAdapter(root)
}

function getGlobalDocument(): Document {
  if (globalThis.document) {
    return globalThis.document
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'No global document is available.')
}

function isDocument(root: Document | ShadowRoot): root is Document {
  return root.nodeType === 9
}

function getOwnerDocument(root: Document | ShadowRoot): Document {
  return isDocument(root) ? root : root.ownerDocument
}

function getStyleContainer(root: Document | ShadowRoot): ParentNode & Node {
  if (!isDocument(root)) {
    return root
  }

  return root.head ?? root.documentElement
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function getStyleSheets(root: Document | ShadowRoot): StyleSheetList {
  return (
    (root as { styleSheets?: StyleSheetList }).styleSheets ??
    getOwnerDocument(root).styleSheets
  )
}

function isActorbleRuntimeStyleSheet(sheet: CSSStyleSheet): boolean {
  const ownerNode = (sheet as CSSStyleSheet & { ownerNode?: Node | null }).ownerNode

  return (
    isElementNode(ownerNode) &&
    ownerNode.hasAttribute('data-actorble-style-id')
  )
}

function isElementNode(node: Node | null | undefined): node is Element {
  return node?.nodeType === 1 && typeof (node as Element).hasAttribute === 'function'
}

type StyleNodeVersionCache = Readonly<{
  index: number
  media: string
  text: string
  versionPart: string
}>

function buildStyleSheetVersion(
  root: Document | ShadowRoot,
  styleNodeCache: WeakMap<Element, StyleNodeVersionCache>,
): string {
  const parts: string[] = []
  const styleRoot = isDocument(root) ? getStyleContainer(root) : root

  for (const [index, node] of Array.from(
    styleRoot.querySelectorAll('style, link'),
  ).entries()) {
    if (!isAppStylesheetNode(node)) {
      continue
    }

    parts.push(styleNodeVersionPart(index, node, styleNodeCache))
  }

  for (const [index, sheet] of Array.from(getStyleSheets(root)).entries()) {
    if (isActorbleRuntimeStyleSheet(sheet)) {
      continue
    }

    parts.push(styleSheetStatusVersionPart(index, sheet))
  }

  return parts.join('\n')
}

function isAppStylesheetNode(node: Element): boolean {
  if (node.hasAttribute('data-actorble-style-id')) {
    return false
  }

  if (node.localName === 'style') {
    return true
  }

  if (node.localName !== 'link') {
    return false
  }

  return (node.getAttribute('rel') ?? '')
    .toLowerCase()
    .split(/\s+/)
    .includes('stylesheet')
}

function styleNodeVersionPart(
  index: number,
  node: Element,
  styleNodeCache: WeakMap<Element, StyleNodeVersionCache>,
): string {
  if (node.localName === 'style') {
    const media = node.getAttribute('media') ?? ''
    const text = node.textContent ?? ''
    const cached = styleNodeCache.get(node)

    if (
      cached !== undefined &&
      cached.index === index &&
      cached.media === media &&
      cached.text === text
    ) {
      return cached.versionPart
    }

    const versionPart = [
      'style',
      index,
      media,
      textFingerprint(text),
    ].join(':')

    styleNodeCache.set(node, {
      index,
      media,
      text,
      versionPart,
    })

    return versionPart
  }

  return [
    'link',
    index,
    node.getAttribute('href') ?? '',
    node.getAttribute('rel') ?? '',
    node.getAttribute('media') ?? '',
    node.getAttribute('disabled') ?? '',
    (node as HTMLLinkElement).disabled ? 'disabled' : 'enabled',
    (node as HTMLLinkElement).href ?? '',
  ].join(':')
}

function textFingerprint(text: string): string {
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `${text.length}:${(hash >>> 0).toString(36)}`
}

function styleSheetStatusVersionPart(index: number, sheet: CSSStyleSheet): string {
  try {
    return ['sheet', index, 'accessible', sheet.href ?? '', sheet.cssRules.length].join(':')
  } catch (error) {
    return [
      'sheet',
      index,
      'inaccessible',
      sheet.href ?? '',
      describeUnknownError(error),
    ].join(':')
  }
}

function snapshotRules(
  cssRules: CSSRuleList,
  warnings: StyleSheetScanWarning[],
): StyleSheetRuleSnapshot[] {
  const rules: StyleSheetRuleSnapshot[] = []

  for (const rule of Array.from(cssRules)) {
    const snapshot = snapshotRule(rule, warnings)

    if (snapshot) {
      rules.push(snapshot)
    }
  }

  return rules
}

function snapshotRule(
  rule: CSSRule,
  warnings: StyleSheetScanWarning[],
): StyleSheetRuleSnapshot | null {
  if (rule.type === styleRuleType) {
    const styleRule = rule as CSSStyleRule

    return {
      kind: 'style',
      selectorText: styleRule.selectorText,
      styleText: styleRule.style.cssText,
    }
  }

  if (rule.type === mediaRuleType || rule.type === supportsRuleType) {
    const groupRule = rule as CSSGroupingRule
    const rules = snapshotRules(groupRule.cssRules, warnings)

    if (rules.length === 0) {
      return null
    }

    return {
      kind: 'group',
      prelude: rulePrelude(rule),
      rules,
    }
  }

  if (containsPseudoStateSyntax(rule.cssText)) {
    warnings.push({
      phase: 'scan',
      message: 'CSS rule type is not supported by the pseudo-state mirror.',
      details: {
        ruleType: rule.type,
        cssText: rule.cssText,
      },
    })
  }

  return null
}

function rulePrelude(rule: CSSRule): string {
  const blockStart = rule.cssText.indexOf('{')

  if (blockStart === -1) {
    return rule.cssText.trim()
  }

  return rule.cssText.slice(0, blockStart).trim()
}

function containsPseudoStateSyntax(cssText: string): boolean {
  return (
    cssText.includes(':hover') ||
    cssText.includes(':active') ||
    cssText.includes(':focus-visible')
  )
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const styleRuleType = 1
const mediaRuleType = 4
const supportsRuleType = 12
