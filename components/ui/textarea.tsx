import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed",
      "placeholder:text-muted-foreground/60",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/50",
      "resize-y min-h-40",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
