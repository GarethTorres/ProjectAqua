import * as React from "react";
import { cn } from "@/lib/utils";

/** Mobile-first centered column. Everything in PinTrip lives inside one of these. */
export function PageContainer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[560px] px-5 pb-16",
        className,
      )}
      {...props}
    />
  );
}
