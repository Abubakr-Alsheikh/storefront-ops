import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
} from "react";
import { cx } from "@/lib/cx";
import { ChevronIcon } from "./icons";

/** Small controls with no behaviour of their own. Radix-backed ones live beside this file. */

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "destructive-fill";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  destructive: "border border-line-strong bg-surface text-negative hover:bg-negative-tint",
  "destructive-fill": "bg-negative text-surface hover:opacity-90",
};

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  compact?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "secondary", compact, className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(BUTTON_BASE, compact ? "h-7 px-2" : "h-8 px-3", BUTTON_VARIANTS[variant], className)}
      {...props}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "compact"> {
  /** The accessible name; an icon alone has none. */
  label: string;
}

export function IconButton({ label, variant = "ghost", className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(BUTTON_BASE, "size-8", BUTTON_VARIANTS[variant], className)}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 items-center rounded border border-line-strong bg-surface-2 px-1 font-mono text-2xs text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

const FIELD = "h-8 w-full rounded-md border border-line-strong bg-surface-2 text-sm text-ink placeholder:text-ink-muted";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input className={cx(FIELD, "px-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex w-full">
      <select className={cx(FIELD, "cursor-pointer appearance-none pr-7 pl-2", className)} {...props}>
        {children}
      </select>
      <ChevronIcon className="pointer-events-none absolute top-2 right-2 text-ink-muted" />
    </span>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cx("animate-skeleton rounded bg-surface-2", className)} {...props} />;
}

export interface EmptyStateProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** A line in ink, a helpful line in muted, one action. Never an illustration. */
export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx("rounded-md border border-line bg-surface p-4 xl:p-5", className)}>
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[60ch] text-sm text-ink-muted">{children}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
