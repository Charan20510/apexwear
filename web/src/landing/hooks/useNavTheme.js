import { useLayoutEffect, useState } from 'react';

export default function useNavTheme() {
  const [theme, setTheme] = useState('light');

  useLayoutEffect(() => {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    function compute() {
      const navRect = nav.getBoundingClientRect();
      const probe = navRect.top + navRect.height / 2;
      const sections = document.querySelectorAll('[data-nav-theme]');
      for (let i = 0; i < sections.length; i++) {
        const r = sections[i].getBoundingClientRect();
        if (probe >= r.top && probe <= r.bottom) {
          return sections[i].getAttribute('data-nav-theme');
        }
      }
      return 'light';
    }

    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setTheme(compute());
      });
    }

    setTheme(compute());
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, []);

  return theme;
}
