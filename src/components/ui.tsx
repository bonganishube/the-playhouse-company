import Link from "next/link";
import type { ReactNode } from "react";

/** Shared presentational primitives, kept deliberately small and explicit. */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

function buttonClass(variant: string, size: string, extra: string): string {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center";
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
  };
  const variants: Record<string, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary:
      "bg-white text-ink-900 border border-parchment-300 hover:bg-parchment-100",
    ghost: "text-brand-600 hover:bg-brand-50",
    danger: "bg-red-700 text-white hover:bg-red-800",
  };
  return `${base} ${sizes[size]} ${variants[variant]} ${extra}`;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-parchment-300 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeading({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl text-ink-900">{title}</h1>
        {lead && <p className="mt-1 text-ink-500 max-w-2xl">{lead}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-900 border-green-300",
  COMPLETED: "bg-green-100 text-green-900 border-green-300",
  PENDING_APPROVAL: "bg-amber-100 text-amber-900 border-amber-300",
  PENDING_PAYMENT: "bg-blue-100 text-blue-900 border-blue-300",
  CANCELLED: "bg-parchment-200 text-ink-500 border-parchment-400",
  REJECTED: "bg-red-100 text-red-900 border-red-300",
  EXPIRED: "bg-parchment-200 text-ink-500 border-parchment-400",
  HELD: "bg-blue-100 text-blue-900 border-blue-300",
  SUCCEEDED: "bg-green-100 text-green-900 border-green-300",
  FAILED: "bg-red-100 text-red-900 border-red-300",
  PENDING: "bg-amber-100 text-amber-900 border-amber-300",
  INITIATED: "bg-parchment-200 text-ink-700 border-parchment-400",
  REFUNDED: "bg-purple-100 text-purple-900 border-purple-300",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-parchment-200 text-ink-700 border-parchment-400";
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium border uppercase tracking-wide ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "bg-blue-50 border-blue-300 text-blue-900",
    success: "bg-green-50 border-green-300 text-green-900",
    warning: "bg-amber-50 border-amber-300 text-amber-900",
    error: "bg-red-50 border-red-300 text-red-900",
  };
  return (
    <div className={`border-l-4 px-4 py-3 text-sm ${tones[tone]}`} role="status">
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-700 mb-1">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-500 mt-1">{hint}</span>}
      {error && <span className="block text-xs text-red-700 mt-1">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full border border-parchment-300 bg-white px-3 py-2 text-sm text-ink-900 " +
  "placeholder:text-ink-500/60 focus:border-brand-600 focus:outline-none";

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-parchment-400 bg-white/60 px-6 py-12 text-center">
      <p className="font-display text-lg text-ink-700">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-500">{children}</div>}
    </div>
  );
}

/** Definition row used across booking and venue detail panels. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-parchment-200 last:border-0 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900 text-right">{children}</dd>
    </div>
  );
}
