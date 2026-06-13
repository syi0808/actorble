export const ACTORBLE_MARK_VIEW_BOX = '0 0 64 64'
export const ACTORBLE_MOTION_VIEW_BOX = '0 0 760 520'

export const ACTORBLE_COLORS = Object.freeze({
  amber: '#F2B84B',
  amberLight: '#FFE1A0',
  ink: '#101418',
  inkSoft: '#17222C',
  mint: '#33E6C2',
  mintLight: '#BFFCEF',
  tile: '#101418',
})

const MARK_PRIMARY_PATH =
  'M9.6 42.4C14.7 26.5 26.8 15.5 39.1 21.4C47.1 25.3 47.7 36.2 55.2 33.8C58.2 32.8 59.3 29.8 58 26.4'

const MARK_CROSS_PATH =
  'M39.1 21.4C31.5 17.8 23.6 22.1 20.1 31.4C18.4 35.8 17 40.6 15.1 45.7'

const MOTION_PRIMARY_PATH =
  'M68 376C128 188 274 82 420 152C516 198 524 360 612 330C666 312 702 268 688 216'

const MOTION_CROSS_PATH =
  'M420 152C330 110 236 160 194 272C174 326 158 384 136 446'

const MARK_ELEMENTS = Object.freeze([
  {
    className: 'actorble-mark-rail',
    tagName: 'path',
    attrs: {
      d: MARK_PRIMARY_PATH,
      fill: 'none',
      opacity: '0.72',
      stroke: ACTORBLE_COLORS.inkSoft,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '12',
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
      'stroke-width': '7.6',
    },
  },
  {
    className: 'actorble-mark-highlight',
    tagName: 'path',
    attrs: {
      d: 'M13.4 38.2C19.4 24.4 29.6 18.5 38.1 22.6',
      fill: 'none',
      opacity: '0.48',
      stroke: ACTORBLE_COLORS.mintLight,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '1.8',
    },
  },
  {
    className: 'actorble-mark-cross-rail',
    tagName: 'path',
    attrs: {
      d: MARK_CROSS_PATH,
      fill: 'none',
      opacity: '0.82',
      stroke: ACTORBLE_COLORS.ink,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '7.4',
    },
  },
  {
    className: 'actorble-mark-cross',
    tagName: 'path',
    attrs: {
      d: MARK_CROSS_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.amber,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '4.4',
    },
  },
  {
    className: 'actorble-mark-node-shadow',
    tagName: 'circle',
    attrs: {
      cx: '58',
      cy: '26.4',
      fill: ACTORBLE_COLORS.ink,
      opacity: '0.9',
      r: '6.6',
    },
  },
  {
    className: 'actorble-mark-node',
    tagName: 'circle',
    attrs: {
      cx: '58',
      cy: '26.4',
      fill: ACTORBLE_COLORS.amber,
      r: '4.6',
    },
  },
  {
    className: 'actorble-mark-node-spark',
    tagName: 'circle',
    attrs: {
      cx: '56.7',
      cy: '24.9',
      fill: ACTORBLE_COLORS.amberLight,
      opacity: '0.72',
      r: '1.3',
    },
  },
])

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
      'stroke-width': '32',
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
      'stroke-width': '18',
    },
  },
  {
    className: 'actorble-motion-highlight',
    tagName: 'path',
    attrs: {
      d: 'M110 326C174 186 296 120 406 156',
      fill: 'none',
      stroke: ACTORBLE_COLORS.mintLight,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '5',
    },
  },
  {
    className: 'actorble-motion-cross-rail',
    tagName: 'path',
    attrs: {
      d: MOTION_CROSS_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.ink,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '16',
    },
  },
  {
    className: 'actorble-motion-cross',
    tagName: 'path',
    attrs: {
      d: MOTION_CROSS_PATH,
      fill: 'none',
      stroke: ACTORBLE_COLORS.amber,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '8',
    },
  },
  {
    className: 'actorble-motion-end-shadow',
    tagName: 'circle',
    attrs: {
      cx: '688',
      cy: '216',
      fill: ACTORBLE_COLORS.ink,
      r: '19',
    },
  },
  {
    className: 'actorble-motion-end',
    tagName: 'circle',
    attrs: {
      cx: '688',
      cy: '216',
      fill: ACTORBLE_COLORS.amber,
      r: '12',
    },
  },
  {
    className: 'actorble-motion-end-spark',
    tagName: 'circle',
    attrs: {
      cx: '684',
      cy: '212',
      fill: ACTORBLE_COLORS.amberLight,
      opacity: '0.7',
      r: '3.5',
    },
  },
])

export function renderActorbleSymbolContent(options = {}) {
  const { classNames = false, variant = 'mark' } = options
  const elements = variant === 'motion' ? MOTION_ELEMENTS : MARK_ELEMENTS

  return elements.map((element) => renderElement(element, classNames)).join('\n  ')
}

export function renderActorbleLogoSvg() {
  return renderSvg({
    ariaLabel: 'Actorble',
    content: renderActorbleSymbolContent(),
    viewBox: ACTORBLE_MARK_VIEW_BOX,
  })
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
  })

  return renderSvg({
    ariaLabel: 'Actorble',
    content: `${tile}\n  ${renderActorbleSymbolContent()}`,
    viewBox: ACTORBLE_MARK_VIEW_BOX,
  })
}

function renderSvg({ ariaLabel, content, viewBox }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escapeAttribute(ariaLabel)}">`,
    `  ${content}`,
    '</svg>',
    '',
  ].join('\n')
}

function renderElement(element, classNames = false) {
  const attrs = classNames
    ? { class: element.className, ...element.attrs }
    : element.attrs
  const renderedAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ')

  return `<${element.tagName} ${renderedAttrs}/>`
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
