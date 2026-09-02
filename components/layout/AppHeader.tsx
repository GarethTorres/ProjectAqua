import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  /** When set, shows a back chevron linking here. */
  backHref?: string;
  backLabel?: string;
  /** Optional trailing action (button / link). */
  action?: React.ReactNode;
  className?: string;
};

export function AppHeader({
  backHref,
  backLabel = "Back",
  action,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[560px] items-center justify-between px-5">
        <div className="flex items-center gap-1">
          {backHref ? (
            <Link
              href={backHref}
              className="-ml-2 flex items-center gap-0.5 rounded-lg py-1 pr-2 pl-1 text-[15px] text-accent hover:bg-muted"
            >
              <ChevronLeft className="size-5" />
              <span>{backLabel}</span>
            </Link>
          ) : (
            <Link href="/" className="text-[17px] font-semibold tracking-tight">
              PinTrip
            </Link>
          )}
        </div>
        {action ? <div className="flex items-center">{action}</div> : null}
      </div>
    </header>
  );
}
