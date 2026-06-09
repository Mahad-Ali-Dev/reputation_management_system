"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Info,
  Loader2,
  MoreHorizontal,
  Search,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";
type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const iconStroke = 1.75;

function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("h-4 w-4 animate-spin", className)}
      strokeWidth={iconStroke}
    />
  );
}

const buttonBase =
  "rl-focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-rl-control rl-label transition-[background,color,border-color,box-shadow,transform] duration-150 ease-rl active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const buttonVariants = {
  primary:
    "border border-rl-pri bg-rl-pri text-rl-text-on-pri hover:bg-rl-pri-700 active:bg-rl-pri-700",
  secondary:
    "border border-rl-border-strong bg-rl-surface text-rl-text hover:bg-rl-surface-3 active:bg-rl-surface-3",
  ghost:
    "border border-transparent bg-transparent text-rl-text-muted hover:bg-rl-surface-3 hover:text-rl-text",
  danger:
    "border border-rl-danger bg-rl-danger text-white hover:brightness-95 active:brightness-90",
};

const buttonSizes = {
  sm: "h-8 gap-2 px-[12px]",
  md: "h-10 gap-2 px-[16px]",
  lg: "h-12 gap-2 px-[20px]",
  iconSm: "h-8 w-8 p-0",
  iconMd: "h-10 w-10 p-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: Size;
  iconOnly?: boolean;
  loading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      disabled,
      iconOnly = false,
      leftIcon: LeftIcon,
      loading = false,
      rightIcon: RightIcon,
      size = "md",
      variant = "primary",
      ...props
    },
    ref,
  ) => {
    const iconSize = size === "sm" ? 16 : 16;
    const squareSize = size === "sm" ? buttonSizes.iconSm : buttonSizes.iconMd;

    return (
      <button
        ref={ref}
        className={cn(
          buttonBase,
          buttonVariants[variant],
          iconOnly ? squareSize : buttonSizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Spinner className={cn(children && "mr-0")} />
        ) : LeftIcon ? (
          <LeftIcon
            aria-hidden="true"
            className="h-4 w-4"
            size={iconSize}
            strokeWidth={iconStroke}
          />
        ) : null}
        {children ? <span className={cn(loading && "opacity-70")}>{children}</span> : null}
        {!loading && RightIcon ? (
          <RightIcon
            aria-hidden="true"
            className="h-4 w-4"
            size={iconSize}
            strokeWidth={iconStroke}
          />
        ) : null}
      </button>
    );
  },
);
Button.displayName = "Button";

interface FieldChromeProps {
  label?: string;
  helper?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}

function FieldChrome({ children, error, helper, htmlFor, label }: FieldChromeProps) {
  const helperId = `${htmlFor}-helper`;
  const errorId = `${htmlFor}-error`;

  return (
    <div className="grid gap-2">
      {label ? (
        <label className="rl-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="rl-caption flex items-center gap-2 text-rl-danger" id={errorId}>
          <AlertCircle aria-hidden="true" className="h-4 w-4" strokeWidth={iconStroke} />
          {error}
        </p>
      ) : helper ? (
        <p className="rl-caption" id={helperId}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      error,
      helper,
      id,
      label,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <FieldChrome error={error} helper={helper} htmlFor={inputId} label={label}>
        <div className="relative">
          {LeadingIcon ? (
            <LeadingIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-[12px] top-1/2 h-4 w-4 -translate-y-1/2 text-rl-text-subtle"
              strokeWidth={iconStroke}
            />
          ) : null}
          <input
            ref={ref}
            aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
            aria-invalid={Boolean(error)}
            className={cn(
              "rl-focus-ring h-10 w-full rounded-rl-control border border-rl-border-strong bg-rl-surface px-[12px] py-[10px] rl-body text-rl-text placeholder:text-rl-text-subtle transition-[border-color,background,box-shadow] duration-150 hover:border-rl-text-subtle focus:border-rl-pri disabled:bg-rl-surface-3 disabled:text-rl-text-subtle",
              LeadingIcon && "pl-[36px]",
              TrailingIcon && "pr-[36px]",
              error && "border-rl-danger",
              className,
            )}
            id={inputId}
            {...props}
          />
          {TrailingIcon ? (
            <TrailingIcon
              aria-hidden="true"
              className="pointer-events-none absolute right-[12px] top-1/2 h-4 w-4 -translate-y-1/2 text-rl-text-subtle"
              strokeWidth={iconStroke}
            />
          ) : null}
        </div>
      </FieldChrome>
    );
  },
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, helper, id, label, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;

    return (
      <FieldChrome error={error} helper={helper} htmlFor={textareaId} label={label}>
        <textarea
          ref={ref}
          aria-describedby={
            error ? `${textareaId}-error` : helper ? `${textareaId}-helper` : undefined
          }
          aria-invalid={Boolean(error)}
          className={cn(
            "rl-focus-ring min-h-[96px] w-full resize-y rounded-rl-control border border-rl-border-strong bg-rl-surface px-[12px] py-[10px] rl-body text-rl-text placeholder:text-rl-text-subtle transition-[border-color,background,box-shadow] duration-150 hover:border-rl-text-subtle focus:border-rl-pri disabled:bg-rl-surface-3 disabled:text-rl-text-subtle",
            error && "border-rl-danger",
            className,
          )}
          id={textareaId}
          {...props}
        />
      </FieldChrome>
    );
  },
);
Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helper?: string;
  error?: string;
  options: Array<{ label: string; value: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, helper, id, label, options, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;

    return (
      <FieldChrome error={error} helper={helper} htmlFor={selectId} label={label}>
        <div className="relative">
          <select
            ref={ref}
            aria-describedby={
              error ? `${selectId}-error` : helper ? `${selectId}-helper` : undefined
            }
            aria-invalid={Boolean(error)}
            className={cn(
              "rl-focus-ring h-10 w-full appearance-none rounded-rl-control border border-rl-border-strong bg-rl-surface px-[12px] py-[10px] pr-[36px] rl-body text-rl-text transition-[border-color,background,box-shadow] duration-150 hover:border-rl-text-subtle focus:border-rl-pri disabled:bg-rl-surface-3 disabled:text-rl-text-subtle",
              error && "border-rl-danger",
              className,
            )}
            id={selectId}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-[12px] top-1/2 h-4 w-4 -translate-y-1/2 text-rl-text-subtle"
            strokeWidth={iconStroke}
          />
        </div>
      </FieldChrome>
    );
  },
);
Select.displayName = "Select";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }
>(({ className, hover = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-rl-card border border-rl-border bg-rl-surface p-[20px] text-rl-text shadow-rl-sm md:p-[24px]",
      hover && "transition-shadow duration-150 ease-rl hover:shadow-rl-md",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export function CardHeader({
  action,
  children,
  className,
  divided = false,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-[16px] flex items-start justify-between gap-[16px]",
        divided && "border-b border-rl-border pb-[16px]",
        className,
      )}
    >
      <div>{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("rl-h3", className)}>{children}</h3>;
}

export function CardDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("rl-body mt-1", className)}>{children}</p>;
}

export function CardFooter({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-[16px] flex justify-end gap-[12px] border-t border-rl-border pt-[16px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Sparkline({ values = [8, 11, 10, 14, 13, 18, 20] }: { values?: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 96;
      const y = 40 - ((value - min) / Math.max(max - min, 1)) * 32 - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className="h-10 w-24 overflow-visible" viewBox="0 0 96 40">
      <polyline
        fill="none"
        points={points}
        stroke="var(--pri)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function StatCard({
  delta,
  deltaTone = "success",
  label,
  value,
  values,
}: {
  delta?: string;
  deltaTone?: "success" | "danger" | "neutral";
  label: string;
  value: string;
  values?: number[];
}) {
  const DeltaIcon = deltaTone === "danger" ? ArrowDownRight : ArrowUpRight;

  return (
    <Card hover className="p-[20px]">
      <div className="flex items-start justify-between gap-[16px]">
        <div>
          <p className="rl-overline">{label}</p>
          <p className="rl-h1 rl-tabular mt-[12px]">{value}</p>
        </div>
        {delta ? (
          <Badge
            icon={DeltaIcon}
            variant={
              deltaTone === "danger" ? "danger" : deltaTone === "success" ? "success" : "neutral"
            }
          >
            {delta}
          </Badge>
        ) : null}
      </div>
      <div className="mt-[16px] flex justify-end">
        <Sparkline values={values} />
      </div>
    </Card>
  );
}

const badgeStyles: Record<Tone, string> = {
  neutral: "border-transparent bg-rl-surface-3 text-rl-text-muted",
  success: "border-rl-success-border bg-rl-success-bg text-rl-success",
  warning: "border-rl-warning-border bg-rl-warning-bg text-rl-warning",
  danger: "border-rl-danger-border bg-rl-danger-bg text-rl-danger",
  info: "border-rl-pri-100 bg-rl-info-bg text-rl-pri-700",
};

export function Badge({
  children,
  className,
  dot = false,
  icon: Icon,
  variant = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  icon?: LucideIcon;
  variant?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-[6px] rounded-rl-pill border px-[10px] py-[2px] text-[12px] font-medium leading-4",
        badgeStyles[variant],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="h-[6px] w-[6px] rounded-rl-pill bg-current" />
      ) : null}
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={iconStroke} /> : null}
      {children}
    </span>
  );
}

export function SourcePill({ source }: { source: "Google" | "Yelp" | "Facebook" }) {
  return (
    <Badge className="gap-[6px] bg-rl-surface text-rl-text-muted">
      <span className="grid h-4 w-4 place-items-center rounded-rl-pill bg-rl-surface-3 text-[10px] font-semibold text-rl-text">
        {source[0]}
      </span>
      {source}
    </Badge>
  );
}

interface Column<T extends Record<string, React.ReactNode>> {
  key: keyof T & string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
}

export function DataTable<T extends Record<string, React.ReactNode>>({
  columns,
  dense = false,
  rows,
  selectedRowIds = [],
}: {
  columns: Array<Column<T>>;
  dense?: boolean;
  rows: T[];
  selectedRowIds?: string[];
}) {
  return (
    <div>
      <div className="hidden overflow-hidden rounded-rl-card border border-rl-border md:block">
        <table className="w-full border-collapse bg-rl-surface">
          <thead className="sticky top-0 bg-rl-surface-2">
            <tr>
              <th className="w-12 px-[16px] py-[12px] text-left">
                <span className="sr-only">Select</span>
              </th>
              {columns.map((column) => (
                <th
                  className={cn(
                    "rl-overline px-[16px] py-[12px]",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                  key={column.key}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      column.align === "right" && "justify-end",
                    )}
                  >
                    {column.label}
                    {column.sortable ? (
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowId = String(row.id ?? index);
              const selected = selectedRowIds.includes(rowId);

              return (
                <tr
                  className={cn(
                    "border-t border-rl-border transition-colors hover:bg-rl-surface-3",
                    selected && "bg-rl-pri-50",
                  )}
                  key={rowId}
                >
                  <td className={cn("px-[16px]", dense ? "py-[10px]" : "py-[16px]")}>
                    <input
                      aria-label={`Select row ${index + 1}`}
                      checked={selected}
                      className="rl-focus-ring h-4 w-4 rounded border-rl-border-strong accent-rl-pri"
                      readOnly
                      type="checkbox"
                    />
                  </td>
                  {columns.map((column) => (
                    <td
                      className={cn(
                        "rl-body px-[16px] text-rl-text",
                        dense ? "py-[10px]" : "py-[16px]",
                        column.align === "right" && "text-right rl-tabular",
                      )}
                      key={column.key}
                    >
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-[12px] md:hidden">
        {rows.map((row, index) => (
          <Card className="p-[16px]" key={String(row.id ?? index)}>
            <dl className="grid gap-[12px]">
              {columns.map((column) => (
                <div className="flex items-start justify-between gap-[16px]" key={column.key}>
                  <dt className="rl-caption">{column.label}</dt>
                  <dd className="rl-body-strong text-right">{row[column.key]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Tabs({
  items,
  style = "underline",
}: {
  items: Array<{ value: string; label: string; content?: React.ReactNode }>;
  style?: "underline" | "segmented";
}) {
  const [active, setActive] = React.useState(items[0]?.value);
  const activeItem = items.find((item) => item.value === active);

  return (
    <div>
      <div
        aria-label="Preview tabs"
        className={cn(
          "flex",
          style === "underline"
            ? "gap-[16px] border-b border-rl-border"
            : "w-fit gap-1 rounded-rl-pill bg-rl-surface-3 p-1",
        )}
        role="tablist"
      >
        {items.map((item) => {
          const selected = item.value === active;
          return (
            <button
              aria-selected={selected}
              className={cn(
                "rl-focus-ring rl-label transition-[background,color,box-shadow] duration-150",
                style === "underline"
                  ? "border-b-2 px-0 pb-[10px] pt-1"
                  : "h-8 rounded-rl-pill px-[12px]",
                style === "underline" && selected && "border-rl-pri text-rl-text",
                style === "underline" && !selected && "border-transparent text-rl-text-muted",
                style === "segmented" && selected && "bg-rl-surface text-rl-text shadow-rl-sm",
                style === "segmented" && !selected && "text-rl-text-muted hover:text-rl-text",
              )}
              key={item.value}
              onClick={() => setActive(item.value)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {activeItem?.content ? <div className="mt-[16px]">{activeItem.content}</div> : null}
    </div>
  );
}

export function Modal({
  children,
  description,
  footer,
  size = "sm",
  title,
  trigger,
}: {
  children: React.ReactNode;
  description?: string;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  title: string;
  trigger: React.ReactNode;
}) {
  const sizes = {
    sm: "max-w-[480px]",
    md: "max-w-[640px]",
    lg: "max-w-[800px]",
  };

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-rl-layer border border-rl-border bg-rl-surface p-[24px] shadow-rl-lg",
            sizes[size],
          )}
        >
          <div className="flex items-start justify-between gap-[16px]">
            <div>
              <DialogPrimitive.Title className="rl-h3">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="rl-body mt-1">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button aria-label="Close modal" iconOnly leftIcon={X} variant="ghost" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-[20px]">{children}</div>
          {footer ? <div className="mt-[24px] flex justify-end gap-[12px]">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({
  children,
  footer,
  title,
  trigger,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  title: string;
  trigger: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed bottom-0 right-0 top-auto z-50 flex h-[88vh] w-full flex-col rounded-t-rl-layer border border-rl-border bg-rl-surface p-[24px] shadow-rl-lg md:top-0 md:h-full md:max-w-[520px] md:rounded-none">
          <div className="flex items-start justify-between gap-[16px]">
            <DialogPrimitive.Title className="rl-h3">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button aria-label="Close drawer" iconOnly leftIcon={X} variant="ghost" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-[20px] flex-1 overflow-auto">{children}</div>
          {footer ? (
            <div className="mt-[24px] flex justify-end gap-[12px] border-t border-rl-border pt-[16px]">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DropdownMenu({
  items = [
    { label: "Configure", icon: MoreHorizontal },
    { label: "Duplicate" },
    { label: "Archive" },
  ],
  trigger,
}: {
  items?: Array<{ label: string; danger?: boolean; icon?: LucideIcon }>;
  trigger?: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger ?? (
          <Button aria-label="Open menu" iconOnly leftIcon={MoreHorizontal} variant="secondary" />
        )}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          className="z-50 min-w-[180px] rounded-rl-control border border-rl-border bg-rl-surface p-1 shadow-rl-md"
          sideOffset={8}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuPrimitive.Item
                className={cn(
                  "rl-focus-ring flex h-9 cursor-default select-none items-center gap-[8px] rounded-[6px] px-[12px] rl-body-strong outline-none transition-colors hover:bg-rl-surface-3 focus:bg-rl-surface-3",
                  item.danger ? "text-rl-danger" : "text-rl-text",
                )}
                key={item.label}
              >
                {Icon ? (
                  <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={iconStroke} />
                ) : null}
                {item.label}
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-rl-text px-[8px] py-[6px] text-[12px] leading-4 text-white opacity-0 shadow-rl-md transition-opacity delay-200 duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}

export function Toast({
  action,
  children,
  variant = "neutral",
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  variant?: Tone;
}) {
  const iconMap: Record<Tone, LucideIcon> = {
    danger: AlertCircle,
    info: Info,
    neutral: Circle,
    success: Check,
    warning: AlertCircle,
  };
  const Icon = iconMap[variant];

  return (
    <div
      aria-live={variant === "danger" ? "assertive" : "polite"}
      className="flex w-full max-w-[360px] items-center gap-[12px] rounded-rl-card border border-rl-border bg-rl-surface p-[16px] shadow-rl-md"
      role="status"
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "h-5 w-5 shrink-0",
          variant === "success" && "text-rl-success",
          variant === "warning" && "text-rl-warning",
          variant === "danger" && "text-rl-danger",
          variant === "info" && "text-rl-pri",
        )}
        strokeWidth={iconStroke}
      />
      <p className="rl-body-strong flex-1">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Avatar({
  alt,
  initials,
  size = "md",
  src,
}: {
  alt: string;
  initials: string;
  size?: "sm" | "md" | "lg";
  src?: string;
}) {
  const sizeClass = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-[12px]",
    lg: "h-10 w-10 text-[13px]",
  };

  return (
    <AvatarPrimitive.Root
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-rl-pill bg-rl-pri-100 font-semibold text-rl-pri-900",
        sizeClass[size],
      )}
    >
      <AvatarPrimitive.Image alt={alt} className="h-full w-full object-cover" src={src} />
      <AvatarPrimitive.Fallback delayMs={0}>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarGroup({
  avatars,
  overflow,
}: {
  avatars: Array<{ alt: string; initials: string; src?: string }>;
  overflow?: number;
}) {
  return (
    <div className="flex items-center">
      {avatars.map((avatar) => (
        <span className="-ml-2 first:ml-0" key={avatar.initials}>
          <Avatar {...avatar} />
        </span>
      ))}
      {overflow ? (
        <span className="-ml-2 grid h-8 min-w-8 place-items-center rounded-rl-pill border border-rl-surface bg-rl-surface-3 px-2 rl-caption text-rl-text-muted">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

export function StarRating({
  interactive = false,
  rating,
  size = "sm",
}: {
  interactive?: boolean;
  rating: number;
  size?: "sm" | "md";
}) {
  const [preview, setPreview] = React.useState<number | null>(null);
  const shown = preview ?? rating;
  const iconSize = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div
      aria-label={`${rating} out of 5 stars`}
      className="inline-flex items-center gap-1"
      role="img"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= shown;
        const icon = (
          <Star
            aria-hidden="true"
            className={cn(iconSize, filled ? "text-rl-rating" : "text-rl-rating-empty")}
            fill={filled ? "currentColor" : "none"}
            strokeWidth={iconStroke}
          />
        );

        if (!interactive) return <span key={star}>{icon}</span>;

        return (
          <button
            aria-label={`${star} stars`}
            className="rl-focus-ring rounded-[4px]"
            key={star}
            onClick={() => setPreview(star)}
            onFocus={() => setPreview(star)}
            onMouseEnter={() => setPreview(star)}
            onMouseLeave={() => setPreview(null)}
            type="button"
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  action,
  description,
  icon: Icon = Info,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="mx-auto grid max-w-[360px] justify-items-center px-[24px] py-[64px] text-center">
      <div className="grid h-12 w-12 place-items-center rounded-rl-pill bg-rl-surface-3 text-rl-text-muted">
        <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={iconStroke} />
      </div>
      <h3 className="rl-h3 mt-[16px]">{title}</h3>
      <p className="rl-body mt-[8px]">{description}</p>
      {action ? <div className="mt-[20px]">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-rl-surface-3 before:absolute before:inset-0 before:-translate-x-full before:animate-[rl-shimmer_1.2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent",
        className,
      )}
    />
  );
}

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-[12px]">
      <p className="rl-caption rl-tabular">
        {start}-{end} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-[8px]">
        <Button
          aria-label="Previous page"
          iconOnly
          leftIcon={ChevronLeft}
          size="sm"
          variant="secondary"
        />
        <Button
          aria-label="Next page"
          iconOnly
          leftIcon={ChevronRight}
          size="sm"
          variant="secondary"
        />
      </div>
    </div>
  );
}

export function DateRangePicker({
  label = "Mar 1 - Mar 31, 2026",
}: {
  label?: string;
}) {
  return (
    <Button leftIcon={CalendarDays} rightIcon={ChevronDown} variant="secondary">
      {label}
    </Button>
  );
}

export function ProgressMeter({
  label,
  max,
  value,
}: {
  label: string;
  max: number;
  value: number;
}) {
  const percent = Math.min((value / max) * 100, 100);
  const tone = value > max ? "danger" : percent >= 80 ? "warning" : "info";

  return (
    <div className="grid gap-[8px]">
      <div className="flex items-center justify-between gap-[12px]">
        <p className="rl-label text-rl-text-muted">{label}</p>
        <p className="rl-caption rl-tabular">
          {value.toLocaleString()}/{max.toLocaleString()}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-rl-pill bg-rl-surface-3">
        <div
          className={cn(
            "h-full rounded-rl-pill",
            tone === "info" && "bg-rl-pri",
            tone === "warning" && "bg-rl-warning",
            tone === "danger" && "bg-rl-danger",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
