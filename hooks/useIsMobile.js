'use client';
import { useState, useEffect } from 'react';
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // min(width, height) rather than width alone — a landscape phone can be
    // 800-930px wide but only ~375-430px tall, and still needs the touch-
    // optimized mobile layout, not the desktop branch built for a real monitor.
    // Deferred by one frame: on iOS Safari, resize/orientationchange can fire
    // before innerWidth/innerHeight finish updating to the new orientation,
    // so reading them synchronously can capture stale pre-rotation values.
    const check = () => {
      requestAnimationFrame(() => {
        setIsMobile(Math.min(window.innerWidth, window.innerHeight) <= 768);
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
