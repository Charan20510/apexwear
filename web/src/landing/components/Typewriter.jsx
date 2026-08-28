import { useEffect, useState } from 'react';

export default function Typewriter({
  texts,
  typeSpeed = 70,
  holdMs = 1500,
  deleteSpeed = 100,
  cursorChar = '_',
  paused = false,
  className = '',
}) {
  const [reduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const [displayText, setDisplayText] = useState(reduced ? (texts[0] ?? '') : '');
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    if (reduced || paused) return;

    const current = texts[textIndex] ?? '';
    let timeout;

    if (isDeleting) {
      if (displayText === '') {
        setIsDeleting(false);
        setTextIndex((i) => (i + 1) % texts.length);
        setCharIndex(0);
      } else {
        timeout = setTimeout(
          () => setDisplayText((prev) => prev.slice(0, -1)),
          deleteSpeed
        );
      }
    } else if (charIndex < current.length) {
      timeout = setTimeout(() => {
        setDisplayText((prev) => prev + current[charIndex]);
        setCharIndex((i) => i + 1);
      }, typeSpeed);
    } else if (texts.length > 1) {
      timeout = setTimeout(() => setIsDeleting(true), holdMs);
    }

    return () => clearTimeout(timeout);
  }, [charIndex, displayText, isDeleting, textIndex, reduced, paused, texts, typeSpeed, holdMs, deleteSpeed]);

  const isSingleAndDone =
    texts.length === 1 && !isDeleting && charIndex >= (texts[0]?.length ?? 0);

  const [cursorGone, setCursorGone] = useState(false);

  useEffect(() => { // one-shot hide, not derived — would fight the timer-driven cursor state
    if (reduced && texts.length === 1) setCursorGone(true);
  }, [reduced, texts.length]);

  return (
    <span className={className}>
      <span aria-hidden="true">
        {displayText}
        {!cursorGone && (
          <span
            className={'typed-cursor' + (isSingleAndDone ? ' typed-cursor--limited' : '')}
            onAnimationEnd={() => {
              if (isSingleAndDone) setCursorGone(true);
            }}
          >
            {cursorChar}
          </span>
        )}
      </span>
      <span className="sr-only">{texts.join(' — ')}</span>
    </span>
  );
}
