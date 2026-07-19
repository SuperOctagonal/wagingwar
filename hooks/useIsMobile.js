'use client';
import { useState, useEffect } from 'react';
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // min(width, height) rather than width alone — a landscape phone can be
    // 800-930px wide but only ~375-430px tall, and still needs the touch-
    // optimized mobile layout, not the desktop branch built for a real monitor.
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}
