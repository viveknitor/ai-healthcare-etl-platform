import React from "react";
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn.js";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border font-semibold",
    "select-none cursor-pointer transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-ui)]",
    "active:translate-y-[1px] disabled:opacity-45 disabled:cursor-not-allowed disabled:translate-y-0",
    "aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
    "whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] shadow-[var(--shadow-xs)]",
        secondary:
          "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] shadow-[var(--shadow-xs)]",
        success:
          "bg-[var(--ok)] border-[var(--ok)] text-[var(--ok-fg)] hover:bg-[var(--ok-hover)] shadow-[var(--shadow-xs)]",
        danger:
          "bg-[var(--bad-bg)] border-[var(--bad-border)] text-[var(--bad)] hover:brightness-95",
        ghost:
          "bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
        link: "bg-transparent border-transparent text-[var(--brand)] hover:underline px-0 h-auto shadow-none",
      },
      size: {
        sm: "h-[30px] px-2.5 text-xs",
        md: "h-[36px] px-3.5 text-[13px]",
        lg: "h-[40px] px-4 text-sm",
        icon: "h-[32px] w-[32px] p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

export const Button = React.forwardRef(function Button(
  {
    variant,
    size,
    type = "button",
    loading = false,
    disabled = false,
    className,
    children,
    onClick,
    ...props
  },
  ref
) {
  const handleClick = (e) => {
    if (loading || disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled && !loading}
      aria-busy={loading ? "true" : undefined}
      aria-disabled={loading || disabled ? "true" : undefined}
      onClick={handleClick}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
