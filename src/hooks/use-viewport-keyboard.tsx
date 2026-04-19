import { useEffect, useState } from "react";

/**
 * Returns the current on-screen keyboard inset (in CSS px) by watching
 * window.visualViewport. Used to lift bottom sheets above the keyboard.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard height
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setInset(diff > 50 ? diff : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
