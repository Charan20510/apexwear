import { useEffect, useRef, useState } from 'react';

export default function useScrollReveal(threshold = 0.2, repeat = false) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState( // reduced-motion users start fully revealed
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
