import { useEffect, useRef, useState } from "react";

interface UseStickyOptions {
  topOffset?: number;
  customEvent?: string;
}

export function useSticky(options: UseStickyOptions = {}) {
  const { topOffset = 0, customEvent = "pss:columns-changed" } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [isFixed, setIsFixed] = useState(false);
  const [stickyHeight, setStickyHeight] = useState(0);

  useEffect(() => {
    const sticky = stickyRef.current;
    const container = containerRef.current;
    if (!sticky || !container) return;

    const update = () => {
      const stickyRect = sticky.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Make header fixed when it reaches the top of the viewport regardless of
      // the column height, so short columns also keep their header visible while
      // other columns scroll.
      if (stickyRect.top <= topOffset) {
        setIsFixed(true);
        setStickyHeight(stickyRect.height);

        sticky.style.position = "fixed";
        sticky.style.top = `${topOffset}px`;
        sticky.style.left = `${containerRect.left}px`;
        sticky.style.width = `${containerRect.width}px`;
        sticky.style.zIndex = "9999";
      } else {
        setIsFixed(false);
        setStickyHeight(0);
        sticky.style.position = "";
        sticky.style.top = "";
        sticky.style.left = "";
        sticky.style.width = "";
        sticky.style.zIndex = "";
      }
    };

    const findScrollParent = (el: Element | null): Element | Window => {
      let cur = el?.parentElement;
      while (cur) {
        const style = getComputedStyle(cur);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;
        if (/(auto|scroll|overlay)/.test(overflowX) || /(auto|scroll|overlay)/.test(overflowY)) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return window;
    };

    const scrollParent = findScrollParent(container);

    const addListeners = (target: Element | Window) => {
      if ("addEventListener" in target) {
        target.addEventListener("scroll", update, { passive: true } as any);
        target.addEventListener("resize", update);
      }
    };

    const removeListeners = (target: Element | Window) => {
      if ("removeEventListener" in target) {
        target.removeEventListener("scroll", update);
        target.removeEventListener("resize", update);
      }
    };

    addListeners(window);
    if (scrollParent && scrollParent !== window) addListeners(scrollParent);
    if (customEvent) window.addEventListener(customEvent, update);
    update();

    return () => {
      removeListeners(window);
      if (scrollParent && scrollParent !== window) removeListeners(scrollParent);
      if (customEvent) window.removeEventListener(customEvent, update);
    };
  }, [topOffset, customEvent]);

  return {
    containerRef,
    stickyRef,
    isFixed,
    stickyHeight,
  };
}
