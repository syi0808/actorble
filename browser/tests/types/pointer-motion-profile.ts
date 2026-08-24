import type { MoveOptions, PointerMotionProfile } from '../../src/index.js';

const linearTiming: PointerMotionProfile = {
  kind: 'ease',
  timing: 'linear',
  duration: 10,
};
const inertiaProfile: PointerMotionProfile = {
  kind: 'inertia',
  initialVelocity: 1200,
  deceleration: 4800,
};
const springProfile: PointerMotionProfile = {
  kind: 'spring',
  stiffness: 170,
  damping: 26,
  mass: 1,
};
const moveOptions: MoveOptions = { motion: linearTiming };

// @ts-expect-error linear profile kind was removed; use ease timing instead.
const legacyLinear: PointerMotionProfile = { kind: 'linear', duration: 10 };

const legacyEasing: PointerMotionProfile = {
  kind: 'ease',
  // @ts-expect-error ease profiles use timing, not easing.
  easing: 'ease-in-out',
  duration: 10,
};

// @ts-expect-error inertia profiles no longer accept duration.
const legacyInertiaDuration: PointerMotionProfile = { kind: 'inertia', duration: 10 };

// @ts-expect-error spring profiles no longer accept duration.
const legacySpringDuration: PointerMotionProfile = { kind: 'spring', duration: 10 };

void [
  inertiaProfile,
  springProfile,
  moveOptions,
  legacyLinear,
  legacyEasing,
  legacyInertiaDuration,
  legacySpringDuration,
];
