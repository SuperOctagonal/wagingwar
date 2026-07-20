'use client';
import { useState, useEffect } from 'react';
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Narrow width = mobile always (portrait phones). Short height only counts
    // as mobile on a genuine touch device (coarse pointer) — a landscape phone
    // can be 800-930px wide but only ~375-430px tall and still needs the mobile
    // layout, but a maximized laptop browser (short viewport, fine pointer)
    // must stay on desktop. Deferred by one frame: on iOS Safari, resize/
    // orientationchange can fire before innerWidth/innerHeight finish updating
    // to the new orientation, so reading them synchronously can capture stale
    // pre-rotation values.
    const check = () => {
      requestAnimationFrame(() => {
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const w = window.innerWidth, h = window.innerHeight;
        setIsMobile(w <= 768 || (coarse && Math.min(w, h) <= 768));
      });
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isMobile;
}
