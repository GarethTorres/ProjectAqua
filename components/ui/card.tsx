import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";
