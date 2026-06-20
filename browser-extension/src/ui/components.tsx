import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Tooltip } from 'radix-ui'
import { CommandIcon, type CommandIconName } from './icons.js'

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger'

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
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-mark-mint" />
      <span className="brand-mark-amber" />
    </span>
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

export function classNames(
  ...values: readonly (string | false | null | undefined)[]
): string | undefined {
  const className = values.filter(Boolean).join(' ')
  return className.length === 0 ? undefined : className
}
