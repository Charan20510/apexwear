import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProducts, pickForSection } from '../hooks/useProducts.js';
import useScrollReveal from '../hooks/useScrollReveal.js';

const GAP = 8, TILT = 12, SIDE_TILT = 8, DEPTH = 240, SCALE_STEP = 0.16, MAX_VISIBLE = 2;
const INTERVAL_MS = 5000;
const SLOTS = 5;

export default function Coverflow() {
  const products = useProducts();
  const slides = useMemo(() => {
    const picked = pickForSection(products, 'in_coverflow', SLOTS);
    const padded = [...picked];
    while (padded.length < SLOTS) padded.push(null);
    return padded;
  }, [products]);
  const n = slides.length;

  const [active, setActive] = useState(0);
  const [revealRef, revealed] = useScrollReveal(0.2, true);

  const intervalId = useRef(null);
  const startTime = useRef(0);
  const remaining = useRef(INTERVAL_MS);
  const resumeTimeout = useRef(null);

  const startFreshInterval = useCallback(() => {
    intervalId.current = setInterval(() => {
      setActive((a) => (a + 1) % n);
      startTime.current = Date.now();
    }, INTERVAL_MS);
    startTime.current = Date.now();
  }, [n]);

  const restartAutoplay = useCallback(() => {
    clearInterval(intervalId.current); intervalId.current = null;
    clearTimeout(resumeTimeout.current); resumeTimeout.current = null;
    remaining.current = INTERVAL_MS;
    startFreshInterval();
  }, [startFreshInterval]);

  const pauseAutoplay = useCallback(() => {
    if (intervalId.current === null) return;
    remaining.current = Math.max(0, INTERVAL_MS - (Date.now() - startTime.current));
    clearInterval(intervalId.current); intervalId.current = null;
  }, []);

  const resumeAutoplay = useCallback(() => {
    if (intervalId.current !== null || resumeTimeout.current !== null) return;
    resumeTimeout.current = setTimeout(() => {
      resumeTimeout.current = null;
      setActive((a) => (a + 1) % n);
      startFreshInterval();
    }, remaining.current);
  }, [startFreshInterval, n]);

  useEffect(() => {
    startFreshInterval();
    return () => {
      clearInterval(intervalId.current);
      clearTimeout(resumeTimeout.current);
    };
  }, [startFreshInterval]);

  function relOf(i) {
    let r = i - active;
    if (r > n / 2) r -= n;
    if (r < -n / 2) r += n;
    return r;
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActive((a) => (a + 1) % n);
      restartAutoplay();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => ((a - 1) + n) % n);
      restartAutoplay();
    }
  }

  function goToBuy() {
    document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth' });
  }

  function onCardClick(i) {
    if (relOf(i) === 0) {
      goToBuy();
    } else {
      setActive(i);
      restartAutoplay();
    }
  }

  return (
    <div
      id="coverflow"
      ref={revealRef}
      className={`coverflow${revealed ? ' is-visible' : ''}`}
      role="group"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="coverflow__track" id="cftrack">
        {slides.map((product, i) => {
          const r = relOf(i);
          const ax = Math.abs(r);
          const visible = ax <= MAX_VISIBLE;
          const isActive = r === 0;
          const sc = Math.max(0.4, 1 - ax * SCALE_STEP);
          const tx = r * (GAP * 30);
          const tz = -ax * DEPTH;
          const ry = -r * TILT;
          const rz = r * SIDE_TILT;
          const src = product?.images?.[0];
          return (
            <div
              key={product?.id ?? `blank-${i}`}
              className="coverflow__card"
              aria-label={'Slide ' + (i + 1)}
              aria-hidden={visible ? 'false' : 'true'}
              style={{
                transform:
                  `translate(-50%,-50%) translateX(${tx}px) translateZ(${tz}px) ` +
                  `rotateY(${ry}deg) rotateZ(${rz}deg) scale(${sc})`,
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? 'auto' : 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={() => { if (isActive) pauseAutoplay(); }}
              onMouseLeave={() => { if (isActive) resumeAutoplay(); }}
              onClick={() => onCardClick(i)}
            >
              <div
                className="coverflow__reveal"
                style={{ '--reveal-delay': `${ax * 420}ms` }}
              >
                {src ? (
                  <img
                    src={src}
                    alt={product.title ?? 'Hoodie ' + (i + 1)}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                ) : (
                  <div className="coverflow__blank" aria-hidden="true" />
                )}
                <div
                  className="coverflow__dim"
                  style={{ opacity: isActive ? 0 : 0.4 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
