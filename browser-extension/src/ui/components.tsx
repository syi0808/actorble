import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { DropdownMenu, Tooltip } from 'radix-ui'
import { CommandIcon, type CommandIconName } from './icons.js'

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'
export type ControlSize = 'sm' | 'md' | 'lg'
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
export type BadgeSize = 'sm' | 'md'

export type OverflowMenuItem = Readonly<{
  label: string
  icon?: CommandIconName
  disabled?: boolean
  danger?: boolean
  onSelect(): void
}>

const actorbleLogoUrl = new URL('./assets/actorble-logo.svg', import.meta.url).href
const actorbleWordmarkUrl = new URL('./assets/actorble-wordmark.svg', import.meta.url).href
const actorbleWordmarkLightUrl = new URL(
  './assets/actorble-wordmark-light.svg',
  import.meta.url,
).href

export function UiProvider({
  children,
}: Readonly<{
  children: ReactNode
}>): ReactElement {
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={100}>
      {children}
    </Tooltip.Provider>
  )
}

export function Button({
  children,
  icon,
  iconOnly = false,
  pending = false,
  size = 'sm',
  tooltip,
  variant = 'secondary',
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  Readonly<{
    icon?: CommandIconName
    iconOnly?: boolean
    pending?: boolean
    size?: ButtonSize
    tooltip?: string
    variant?: ButtonVariant
  }>): ReactElement {
  const label = typeof children === 'string'
    ? children
    : props['aria-label'] ?? tooltip
  const ariaLabel = typeof label === 'string' ? label : undefined
  const button = (
    <button
      {...props}
      aria-label={iconOnly ? ariaLabel : props['aria-label']}
      aria-busy={pending ? true : props['aria-busy']}
      className={classNames('ui-button', className)}
      data-icon-only={iconOnly ? 'true' : 'false'}
      data-pending={pending ? 'true' : 'false'}
      data-size={size}
      data-variant={variant}
      disabled={disabled}
      title={tooltip ?? (typeof label === 'string' ? label : undefined)}
      type={props.type ?? 'button'}
    >
      {icon === undefined ? null : <CommandIcon name={icon} />}
      {iconOnly
        ? <span className="sr-only">{children}</span>
        : <span className="button-label">{children}</span>}
    </button>
  )

  if (tooltip === undefined) {
    return button
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="ui-tooltip" sideOffset={6}>
          {tooltip}
          <Tooltip.Arrow className="ui-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function IconButton(
  {
    label,
    tooltip,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> &
    Readonly<{
      icon: CommandIconName
      label: string
      pending?: boolean
      size?: ButtonSize
      tooltip?: string
      variant?: ButtonVariant
    }>,
): ReactElement {
  return (
    <Button
      {...props}
      aria-label={label}
      iconOnly
      tooltip={tooltip ?? label}
    >
      {label}
    </Button>
  )
}

export function BrandMark(): ReactElement {
  return (
    <img className="brand-symbol" src={actorbleLogoUrl} alt="" aria-hidden="true" />
  )
}

export function BrandWordmark({
  className = 'brand-wordmark',
}: Readonly<{
  className?: string
}>): ReactElement {
  return (
    <picture>
      <source srcSet={actorbleWordmarkLightUrl} media="(prefers-color-scheme: dark)" />
      <img className={className} src={actorbleWordmarkUrl} alt="Actorble" />
    </picture>
  )
}

export function Field({
  label,
  children,
  className,
  hint,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> &
  Readonly<{
    label: string
    children: ReactNode
    hint?: string
  }>): ReactElement {
  return (
    <label {...props} className={classNames('field', 'ui-field', className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint === undefined ? null : <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function TextInput(
  {
    className,
    size = 'sm',
    ...props
  }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
    Readonly<{
      size?: ControlSize
    }>,
): ReactElement {
  return (
    <input
      {...props}
      className={classNames('ui-input', className)}
      data-size={size}
    />
  )
}

export function Textarea(
  {
    className,
    size = 'sm',
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement> &
    Readonly<{
      size?: ControlSize
    }>,
): ReactElement {
  return (
    <textarea
      {...props}
      className={classNames('ui-textarea', className)}
      data-size={size}
    />
  )
}

export function Select(
  {
    className,
    size = 'sm',
    ...props
  }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> &
    Readonly<{
      size?: ControlSize
    }>,
): ReactElement {
  return (
    <select
      {...props}
      className={classNames('ui-select', className)}
      data-size={size}
    />
  )
}

export function StatusPill({
  children,
  size = 'sm',
  status,
  tone,
  className,
}: Readonly<{
  children: ReactNode
  size?: BadgeSize
  status: string
  tone?: BadgeTone
  className?: string
}>): ReactElement {
  return (
    <span
      className={classNames('status-pill', 'ui-badge', className)}
      data-size={size}
      data-status={status}
      data-tone={tone ?? toneFromStatus(status)}
    >
      {children}
    </span>
  )
}

export function OverflowMenu({
  items,
  label = 'More actions',
}: Readonly<{
  items: readonly OverflowMenuItem[]
  label?: string
}>): ReactElement {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton icon="more" label={label} variant="subtle" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ui-menu" align="end" sideOffset={6}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className="ui-menu-item"
              data-danger={item.danger ? 'true' : 'false'}
              disabled={item.disabled}
              onSelect={() => item.onSelect()}
            >
              {item.icon === undefined ? null : <CommandIcon name={item.icon} />}
              <span>{item.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function toneFromStatus(status: string): BadgeTone {
  if (
    status === 'running' ||
    status === 'recording' ||
    status === 'completed' ||
    status === 'ready'
  ) {
    return 'success'
  }

  if (status === 'paused' || status === 'stopped' || status === 'blocked') {
    return 'warning'
  }

  if (status === 'failed' || status === 'error' || status === 'invalid') {
    return 'danger'
  }

  return 'neutral'
}

export function classNames(
  ...values: readonly (string | false | null | undefined)[]
): string | undefined {
  const className = values.filter(Boolean).join(' ')
  return className.length === 0 ? undefined : className
}
