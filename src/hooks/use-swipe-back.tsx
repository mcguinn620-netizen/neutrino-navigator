import { useEffect, useRef } from "react";

interface Options {
  enabled: boolean;
  onBack: () => void;
  edgeThreshold?: number; // px from left edge where swipe must start
  distanceThreshold?: number; // px to travel right
  verticalTolerance?: number; // max vertical drift
}

/**
 * iOS-style edge-swipe-back gesture.
 * Triggers `onBack` when the user starts a touch within `edgeThreshold` px of the
 * left screen edge and drags right past `distanceThreshold` without significant
 * vertical movement.
 */
export function useSwipeBack({
  enabled,
  onBack,
  edgeThreshold = 24,
  distanceThreshold = 70,
  verticalTolerance = 60,
}: Options) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= edgeThreshold) {
        start.current = { x: t.clientX, y: t.clientY };
        fired.current = false;
      } else {
        start.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!start.current || fired.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - start.current.x;
      const dy = Math.abs(t.clientY - start.current.y);
      if (dy > verticalTolerance) {
        start.current = null;
        return;
      }
      if (dx >= distanceThreshold) {
        fired.current = true;
        start.current = null;
        onBack();
      }
    };

    const onTouchEnd = () => {
      start.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onBack, edgeThreshold, distanceThreshold, verticalTolerance]);
}
