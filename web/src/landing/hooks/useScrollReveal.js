import { useEffect, useRef, useState } from 'react';

export default function useScrollReveal(threshold = 0.2, repeat = false) {
  const ref = useRef(null);
  // Reduced-motion users start fully revealed, so this is read once at mount rather
  // than set from inside the effect (which would cause an extra render pass).
  const [isVisible, setIsVisible] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (repeat) {
          setIsVisible(entry.isIntersecting);
        } else if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, repeat]);

  return [ref, isVisible];
}
