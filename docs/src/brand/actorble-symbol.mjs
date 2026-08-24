export const ACTORBLE_MARK_VIEW_BOX = '0 0 64 64';
export const ACTORBLE_MOTION_VIEW_BOX = '0 0 760 520';
export const ACTORBLE_WORDMARK_VIEW_BOX = '0 0 192 64';

export const ACTORBLE_COLORS = Object.freeze({
  amber: '#F2B84B',
  ink: '#101418',
  inkSoft: '#17222C',
  mint: '#33E6C2',
  tile: '#101418',
  wordmark: '#F7FBFF',
});

const MARK_PRIMARY_PATH = 'M15.1 45.7C20.2 28.5 30.9 15.1 39.7 19.9C46.9 23.8 47.7 36.8 50.9 44.2';

const MARK_SECONDARY_PATH = 'M13.8 30.8C23 38.2 34 41.1 43.3 36.4C47.6 34.2 49.2 28.8 51.6 23.8';

const MOTION_PRIMARY_PATH = 'M174 416C234 216 358 60 460 118C544 166 552 320 590 408';

const MOTION_SECONDARY_PATH = 'M162 258C272 346 402 380 512 322C562 296 584 234 606 176';

const MARK_ELEMENTS = Object.freeze([
  {
    className: 'actorble-mark-rail',
    tagName: 'path',
    attrs: {
      d: MARK_PRIMARY_PATH,
      fill: 'none',
      opacity: '0.78',
      stroke: ACTORBLE_COLORS.inkSoft,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '12.4',
    },
  },
  {
    className: 'actorble-mark-base',
    tagName: 'path',
    attrs: {
      d: MARK_PRIMARY_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.mint,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '7.2',
    },
  },
  {
    className: 'actorble-mark-cross-rail',
    tagName: 'path',
    attrs: {
      d: MARK_SECONDARY_PATH,
      fill: 'none',
      opacity: '0.82',
      stroke: ACTORBLE_COLORS.ink,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '8.2',
    },
  },
  {
    className: 'actorble-mark-cross',
    tagName: 'path',
    attrs: {
      d: MARK_SECONDARY_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.amber,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '4.8',
    },
  },
]);

const MOTION_ELEMENTS = Object.freeze([
  {
    className: 'actorble-motion-rail',
    tagName: 'path',
    attrs: {
      d: MOTION_PRIMARY_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.inkSoft,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '34',
    },
  },
  {
    className: 'actorble-motion-path',
    tagName: 'path',
    attrs: {
      d: MOTION_PRIMARY_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.mint,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '19',
    },
  },
  {
    className: 'actorble-motion-cross-rail',
    tagName: 'path',
    attrs: {
      d: MOTION_SECONDARY_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.ink,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '18',
    },
  },
  {
    className: 'actorble-motion-cross',
    tagName: 'path',
    attrs: {
      d: MOTION_SECONDARY_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.amber,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '9',
    },
  },
]);

export const ACTORBLE_WORDMARK_LETTER_BOUNDS = Object.freeze([
  { letter: 'c', minX: 56, maxX: 74 },
  { letter: 't', minX: 75, maxX: 89 },
  { letter: 'o', minX: 92, maxX: 111 },
  { letter: 'r', minX: 114, maxX: 128 },
  { letter: 'b', minX: 130, maxX: 151 },
  { letter: 'l', minX: 154, maxX: 159 },
  { letter: 'e', minX: 162, maxX: 183 },
]);

const WORDMARK_LETTER_ELEMENTS = Object.freeze([
  createWordmarkLetter(
    ACTORBLE_WORDMARK_LETTER_BOUNDS[0],
    'M73.6 28.4C71.8 25.8 68.8 24.4 65.3 24.4C59.6 24.4 56 28.5 56 34.5C56 40.5 59.8 44.6 65.6 44.6C69.4 44.6 72.2 43 74 39.9L70 37.5C68.9 39.2 67.5 39.9 65.7 39.9C62.7 39.9 60.8 37.8 60.8 34.5C60.8 31.2 62.7 29.1 65.5 29.1C67.3 29.1 68.7 29.8 69.7 31.2L73.6 28.4Z',
  ),
  createWordmarkLetter(
    ACTORBLE_WORDMARK_LETTER_BOUNDS[1],
    'M80.1 20H85.2V25.3H89V30H85.2V37.4C85.2 39.2 86.1 40.1 88.1 39.7L89 44C87.7 44.5 86.4 44.7 85.1 44.7C81.8 44.7 80.1 42.8 80.1 39V30H75V25.3H80.1V20Z',
  ),
  createWordmarkLetter(
    ACTORBLE_WORDMARK_LETTER_BOUNDS[2],
    'M101.5 24.3C107.2 24.3 111 28.5 111 34.5C111 40.5 107.2 44.7 101.5 44.7C95.8 44.7 92 40.5 92 34.5C92 28.5 95.8 24.3 101.5 24.3ZM101.5 29C98.5 29 96.7 31.2 96.7 34.5C96.7 37.8 98.5 40 101.5 40C104.5 40 106.3 37.8 106.3 34.5C106.3 31.2 104.5 29 101.5 29Z',
    { 'fill-rule': 'evenodd' },
  ),
  createWordmarkLetter(
    ACTORBLE_WORDMARK_LETTER_BOUNDS[3],
    'M114 24.8H119V28.2C120.4 25.6 123.3 24.3 127.8 24.8V29.9C122.5 29.1 119.1 31.5 119.1 36.2V44.2H114V24.8Z',
  ),
  createWordmarkLetter(
    ACTORBLE_WORDMARK_LETTER_BOUNDS[4],
    'M130 18.8H135.2V27.1C136.8 25.3 139.1 24.3 141.8 24.3C147.4 24.3 151 28.5 151 34.5C151 40.5 147.4 44.7 141.8 44.7C139 44.7 136.6 43.6 135 41.6V44.2H130V18.8ZM140.5 29C137.4 29 135.2 31.2 135.2 34.5C135.2 37.8 137.4 40 140.5 40C143.6 40 145.8 37.8 145.8 34.5C145.8 31.2 143.6 29 140.5 29Z',
    { 'fill-rule': 'evenodd' },
  ),
  createWordmarkLetter(ACTORBLE_WORDMARK_LETTER_BOUNDS[5], 'M154 18.8H159V44.2H154V18.8Z'),
  createWordmarkLetter(
    ACTORBLE_WORDMARK_LETTER_BOUNDS[6],
    'M182.5 38.1C180.9 42.3 177 44.7 172 44.7C166 44.7 162 40.5 162 34.5C162 28.5 166.2 24.3 171.9 24.3C177.6 24.3 181.6 28.3 181.6 34.1C181.6 34.9 181.5 35.7 181.3 36.4H167.1C167.7 39 169.5 40.3 172.3 40.3C174.8 40.3 176.6 39.4 177.7 37.4L182.5 38.1ZM171.9 28.5C169.4 28.5 167.6 29.9 167.1 32.4H176.7C176.2 29.9 174.5 28.5 171.9 28.5Z',
    { 'fill-rule': 'evenodd' },
  ),
]);

export function renderActorbleSymbolContent(options = {}) {
  const { classNames = false, variant = 'mark' } = options;
  const elements = variant === 'motion' ? MOTION_ELEMENTS : MARK_ELEMENTS;

  return elements.map((element) => renderElement(element, classNames)).join('\n  ');
}

export function renderActorbleWordmarkContent(options = {}) {
  const { classNames = false, letterFill = ACTORBLE_COLORS.wordmark } = options;
  const symbol = renderGroup({
    attrs: {
      transform: 'translate(0 0)',
    },
    children: renderActorbleSymbolContent({ classNames }),
  });
  const letters = renderGroup({
    attrs: {
      fill: letterFill,
    },
    children: WORDMARK_LETTER_ELEMENTS.map((element) => renderElement(element, classNames)).join(
      '\n  ',
    ),
  });

  return `${symbol}\n  ${letters}`;
}

export function renderActorbleLogoSvg() {
  return renderSvg({
    ariaLabel: 'Actorble',
    content: renderActorbleSymbolContent(),
    viewBox: ACTORBLE_MARK_VIEW_BOX,
  });
}

export function renderActorbleWordmarkSvg() {
  return renderSvg({
    ariaLabel: 'Actorble',
    content: renderActorbleWordmarkContent({ classNames: true }),
    viewBox: ACTORBLE_WORDMARK_VIEW_BOX,
  });
}

export function renderActorbleWordmarkLightSvg() {
  return renderSvg({
    ariaLabel: 'Actorble',
    content: renderActorbleWordmarkContent({
      classNames: true,
      letterFill: ACTORBLE_COLORS.ink,
    }),
    viewBox: ACTORBLE_WORDMARK_VIEW_BOX,
  });
}

export function renderActorbleFaviconSvg() {
  const tile = renderElement({
    tagName: 'rect',
    attrs: {
      fill: ACTORBLE_COLORS.tile,
      height: '64',
      rx: '14',
      width: '64',
    },
  });

  return renderSvg({
    ariaLabel: 'Actorble',
    content: `${tile}\n  ${renderActorbleSymbolContent()}`,
    viewBox: ACTORBLE_MARK_VIEW_BOX,
  });
}

function renderSvg({ ariaLabel, content, viewBox }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escapeAttribute(ariaLabel)}">`,
    `  ${content}`,
    '</svg>',
    '',
  ].join('\n');
}

function renderElement(element, classNames = false) {
  const attrs = classNames ? { class: element.className, ...element.attrs } : element.attrs;
  const renderedAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ');

  if (element.children !== undefined) {
    return `<${element.tagName} ${renderedAttrs}>${escapeText(element.children)}</${element.tagName}>`;
  }

  return `<${element.tagName} ${renderedAttrs}/>`;
}

function renderGroup({ attrs, children }) {
  const renderedAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ');

  return `<g ${renderedAttrs}>\n  ${children}\n  </g>`;
}

function createWordmarkLetter(bounds, d, attrs = {}) {
  return {
    className: `actorble-wordmark-letter actorble-wordmark-letter-${bounds.letter}`,
    tagName: 'path',
    attrs: {
      'data-letter': bounds.letter,
      'data-max-x': bounds.maxX,
      'data-min-x': bounds.minX,
      d,
      ...attrs,
    },
  };
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
