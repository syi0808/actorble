import type { ComponentType, ReactElement, SVGProps } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileUp,
  Focus,
  HandGrab,
  Keyboard,
  PanelRight,
  Pause,
  Play,
  Plus,
  Save,
  Scroll,
  Square,
  Target,
  TextCursorInput,
  Timer,
  Trash2,
  Type,
  MousePointerClick,
  Move,
} from 'lucide-react';

export type CommandIconName =
  | 'arrow-down'
  | 'arrow-up'
  | 'check'
  | 'copy'
  | 'download'
  | 'more'
  | 'eye'
  | 'eye-off'
  | 'file-up'
  | 'focus'
  | 'grab'
  | 'keyboard'
  | 'panel-right'
  | 'pause'
  | 'play'
  | 'plus'
  | 'record'
  | 'save'
  | 'scroll'
  | 'square'
  | 'target'
  | 'text-cursor'
  | 'timer'
  | 'trash'
  | 'type'
  | 'mouse-pointer-click'
  | 'move';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const icons = {
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  check: Check,
  copy: Copy,
  download: Download,
  more: Ellipsis,
  eye: Eye,
  'eye-off': EyeOff,
  'file-up': FileUp,
  focus: Focus,
  grab: HandGrab,
  keyboard: Keyboard,
  'panel-right': PanelRight,
  pause: Pause,
  play: Play,
  plus: Plus,
  record: Circle,
  save: Save,
  scroll: Scroll,
  square: Square,
  target: Target,
  'text-cursor': TextCursorInput,
  timer: Timer,
  trash: Trash2,
  type: Type,
  'mouse-pointer-click': MousePointerClick,
  move: Move,
} satisfies Readonly<Record<CommandIconName, IconComponent>>;

export function CommandIcon({
  name,
  className = 'ui-icon',
}: Readonly<{
  name: CommandIconName;
  className?: string;
}>): ReactElement {
  const Icon = icons[name];

  return (
    <Icon aria-hidden="true" className={className} fill="none" focusable="false" strokeWidth={2} />
  );
}
