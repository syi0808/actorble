import { describe, expect, it } from 'vitest';
import { rewritePseudoStateSelector } from '../src/visual/pseudo-state-mirror/selector-rewriter.js';

describe('rewritePseudoStateSelector', () => {
  it('rewrites class, id, and compound pseudo-state selectors to actorble attributes', () => {
    expect(rewritePseudoStateSelector('.button:hover')).toEqual(['.button[data-actorble-hover]']);
    expect(rewritePseudoStateSelector('#save.primary:active > span')).toEqual([
      '#save.primary[data-actorble-active] > span',
    ]);
    expect(rewritePseudoStateSelector('.field:focus-visible:hover')).toEqual([
      '.field[data-actorble-focus-visible][data-actorble-hover]',
    ]);
  });

  it('keeps supported branches from selector lists and skips branches without mirrored pseudo states', () => {
    expect(rewritePseudoStateSelector('.button:hover, .button:disabled, #cancel:active')).toEqual([
      '.button[data-actorble-hover]',
      '#cancel[data-actorble-active]',
    ]);
  });

  it('returns an empty list when the selector has no supported pseudo state', () => {
    expect(rewritePseudoStateSelector('.button:disabled')).toEqual([]);
  });
});
