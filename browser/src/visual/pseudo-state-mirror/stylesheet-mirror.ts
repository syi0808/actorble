import type { StyleSheetRuleSnapshot } from '../../platform/platform-adapter/style-adapter/index.js'
import { containsPseudoStateSelector, rewritePseudoStateSelector } from './selector-rewriter.js'

export type PseudoStateMirrorBuildWarning = Readonly<{
  phase: 'rewrite'
  message: string
  details?: Readonly<Record<string, unknown>>
}>

export type PseudoStateMirrorBuildResult = Readonly<{
  cssText: string
  mirroredRuleCount: number
  warnings: readonly PseudoStateMirrorBuildWarning[]
}>

export function buildPseudoStateMirrorCss(
  rules: readonly StyleSheetRuleSnapshot[],
): PseudoStateMirrorBuildResult {
  const warnings: PseudoStateMirrorBuildWarning[] = []
  const rendered = renderRules(rules, warnings)

  return {
    cssText: rendered.cssText,
    mirroredRuleCount: rendered.mirroredRuleCount,
    warnings,
  }
}

type RenderResult = Readonly<{
  cssText: string
  mirroredRuleCount: number
}>

function renderRules(
  rules: readonly StyleSheetRuleSnapshot[],
  warnings: PseudoStateMirrorBuildWarning[],
): RenderResult {
  const cssBlocks: string[] = []
  let mirroredRuleCount = 0

  for (const rule of rules) {
    const rendered = renderRule(rule, warnings)

    if (!rendered || rendered.cssText.length === 0) {
      continue
    }

    cssBlocks.push(rendered.cssText)
    mirroredRuleCount += rendered.mirroredRuleCount
  }

  return {
    cssText: cssBlocks.join('\n'),
    mirroredRuleCount,
  }
}

function renderRule(
  rule: StyleSheetRuleSnapshot,
  warnings: PseudoStateMirrorBuildWarning[],
): RenderResult | null {
  if (rule.kind === 'group') {
    const rendered = renderRules(rule.rules, warnings)

    if (rendered.cssText.length === 0) {
      return null
    }

    return {
      cssText: `${rule.prelude} {\n${indentCss(rendered.cssText)}\n}`,
      mirroredRuleCount: rendered.mirroredRuleCount,
    }
  }

  const selectors = rewritePseudoStateSelector(rule.selectorText)

  if (selectors.length === 0) {
    if (containsPseudoStateSelector(rule.selectorText)) {
      warnings.push({
        phase: 'rewrite',
        message: 'Pseudo-state selector is not supported by the mirror rewriter.',
        details: { selectorText: rule.selectorText },
      })
    }

    return null
  }

  const styleText = rule.styleText.trim()

  if (styleText.length === 0) {
    return null
  }

  return {
    cssText: `${selectors.join(', ')} { ${styleText} }`,
    mirroredRuleCount: 1,
  }
}

function indentCss(cssText: string): string {
  return cssText
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}
