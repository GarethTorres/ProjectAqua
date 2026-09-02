import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:brightness-95 active:brightness-90 shadow-sm",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-muted active:bg-muted",
  ghost: "text-foreground hover:bg-muted active:bg-muted",
  danger: "bg-danger text-white hover:brightness-95 active:brightness-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-4 text-[15px] rounded-2xl",
  lg: "h-13 px-5 text-base rounded-2xl",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-[filter,background-color,color] select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "disabled:opacity-50 disabled:pointer-events-none",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
