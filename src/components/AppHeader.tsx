// Shared cardinal-red top app bar.
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import SettingsSheet from "./SettingsSheet";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** Optional second row (e.g. search input). */
  children?: ReactNode;
  onBack?: () => void;
  showSettings?: boolean;
  className?: string;
}

const AppHeader = ({
  title,
  subtitle,
  left,
  right,
  children,
  onBack,
  showSettings = true,
  className,
}: AppHeaderProps) => {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-primary text-primary-foreground pt-safe shadow-sm",
        className,
      )}
    >
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onBack ? (
              <button
                onClick={onBack}
                className="h-9 w-9 -ml-1 rounded-full flex items-center justify-center active:bg-white/20 shrink-0"
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : left}
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate">{title}</h1>
              {subtitle && (
                <p className="text-[11px] text-primary-foreground/75 leading-tight truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {right}
            {showSettings && <SettingsSheet />}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
};

export default AppHeader;
