import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
  /** Distance in px to trigger refresh */
  threshold?: number;
  /** Max visual pull distance */
  maxPull?: number;
  className?: string;
}

/**
 * iOS-style pull-to-refresh. Listens on window scroll/touch so the entire
 * screen feels native. Only fires when scroll is at top.
 *
 * IMPORTANT: This must NOT trigger any scrape — caller decides what to do
 * (typically `queryClient.invalidateQueries()` or local re-read).
 */
const PullToRefresh = ({
  onRefresh,
  children,
  threshold = 70,
  maxPull = 120,
  className,
}: PullToRefreshProps) => {
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const isAtTop = () => {
      // Window scroll OR no scroll container above us
      return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (!isAtTop()) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshing) return;
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        // Scrolling up — let the page handle it normally
        if (pulling.current) {
          pulling.current = false;
          setPull(0);
        }
        return;
      }
      // Only treat as pull when at top of page
      if (!isAtTop()) {
        pulling.current = false;
        setPull(0);
        return;
      }
      pulling.current = true;
      // Resistance curve
      const resisted = Math.min(maxPull, dy * 0.5);
      setPull(resisted);
      // Prevent rubber-band scrolling while we're pulling
      if (e.cancelable) e.preventDefault();
    };

    const finish = async () => {
      if (!pulling.current) {
        setPull(0);
        startY.current = null;
        return;
      }
      const shouldRefresh = pull >= threshold;
      pulling.current = false;
      startY.current = null;
      if (shouldRefresh) {
        setRefreshing(true);
        setPull(threshold);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    const onTouchEnd = () => {
      void finish();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onRefresh, pull, threshold, maxPull, refreshing]);

  const progress = Math.min(1, pull / threshold);
  const showIndicator = pull > 4 || refreshing;

  return (
    <div className={cn("relative", className)}>
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex justify-center"
        style={{
          transform: `translateY(${Math.max(0, pull - 36)}px)`,
          opacity: showIndicator ? 1 : 0,
          transition: refreshing || pulling.current ? "none" : "transform 200ms ease, opacity 200ms ease",
        }}
        aria-hidden={!showIndicator}
      >
        <div className="mt-2 h-9 w-9 rounded-full bg-card border border-border shadow-md flex items-center justify-center">
          <RefreshCw
            className={cn(
              "h-4 w-4 text-primary",
              refreshing && "animate-spin",
            )}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
              transition: "transform 80ms linear",
            }}
          />
        </div>
      </div>

      {/* Content shifted down while pulling */}
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: refreshing || pulling.current ? "none" : "transform 200ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
