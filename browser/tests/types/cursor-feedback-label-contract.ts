import { createActorble } from '../../src/index.js';
import type { ActorbleFeedback, CursorFeedback } from '../../src/index.js';

const cursor: CursorFeedback = { label: 'Admin' };
const feedback: ActorbleFeedback = { cursor };
const actorble = createActorble({ feedback });

const legacyBoolean: ActorbleFeedback = { cursor: true };
const legacyPreset: ActorbleFeedback = 'cursor';

// @ts-expect-error cursor label must be text.
const invalidLabel: ActorbleFeedback = { cursor: { label: 42 } };

void [actorble, legacyBoolean, legacyPreset, invalidLabel];
