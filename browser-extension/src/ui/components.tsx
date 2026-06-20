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
      className={className}
      data-icon-only={iconOnly ? 'true' : 'false'}
      data-pending={pending ? 'true' : 'false'}
      data-variant={variant}
      disabled={disabled}
      title={tooltip ?? (typeof label === 'string' ? label : undefined)}
      type={props.type ?? 'button'}
    >
      {icon === undefined ? null : <CommandIcon name={icon} />}
      {iconOnly ? <span className="sr-only">{children}</span> : <span className="button-label">{children}</span>}
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
    <label {...props} className={classNames('field', className)}>
      <span>{label}</span>
      {children}
      {hint === undefined ? null : <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement>,
): ReactElement {
  return <input {...props} />
}

export function Textarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
): ReactElement {
  return <textarea {...props} />
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement>,
): ReactElement {
  return <select {...props} />
}

export function StatusPill({
  children,
  status,
  className,
}: Readonly<{
  children: ReactNode
  status: string
  className?: string
}>): ReactElement {
  return (
    <span className={classNames('status-pill', className)} data-status={status}>
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

export function classNames(
  ...values: readonly (string | false | null | undefined)[]
): string | undefined {
  const className = values.filter(Boolean).join(' ')
  return className.length === 0 ? undefined : className
}
