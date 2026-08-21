import { useEffect, useRef, useState } from 'react';
import { CAPTIONS } from '../data.js';
import Typewriter from './Typewriter.jsx';

const FRAMES = 300;
const src = (i) => 'frames/frame_' + String(i + 1).padStart(4, '0') + '.jpg';

export default function ScrollSequence() {
  const cvRef = useRef(null);
  const trackRef = useRef(null);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  const hintRef = useRef(null);

  const [activeCap, setActiveCap] = useState(0);

  const [reduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv.getContext('2d', { alpha: false });
    const track = trackRef.current;
    const stage = stageRef.current;
    const bar = barRef.current;
    const hint = hintRef.current;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cv.clientWidth * dpr);
      const h = Math.round(cv.clientHeight * dpr);
      if (w === cv.width && h === cv.height) return;
      cv.width = w; cv.height = h;
    }

    function paint(img) {
      if (!img) return;
      const cw = cv.width, ch = cv.height;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    }

    if (reduced) {
      const only = new Image();
      const redraw = () => { resize(); paint(only); };
      only.onload = redraw;
      only.src = src(0);
      const ro = new ResizeObserver(redraw);
      ro.observe(cv);
      return () => { only.onload = null; ro.disconnect(); };
    }

    const imgs = new Array(FRAMES);
    let loaded = 0;
    let current = -1;
    let exact = false;
    let cancelled = false;

    function onSettled() {
      if (cancelled) return;
      loaded++;
      const pct = Math.round(loaded / FRAMES * 100);
      bar.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', String(pct));
      if (loaded === FRAMES) {
        bar.setAttribute('data-done', '');
        bar.setAttribute('aria-hidden', 'true');
      }
      if (!exact) render(true);
    }

    for (let i = 0; i < FRAMES; i++) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = onSettled;
      im.onerror = onSettled;
      im.src = src(i);
      imgs[i] = im;
    }

    function nearest(i) {
      for (let b = i; b >= 0; b--) if (imgs[b].naturalWidth) return imgs[b];
      for (let f = i + 1; f < FRAMES; f++) if (imgs[f].naturalWidth) return imgs[f];
      return null;
    }

    function progress() {
      const total = track.offsetHeight - stage.offsetHeight;
      if (total <= 0) return 0;
      const p = -track.getBoundingClientRect().top / total;
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }

    function render(force) {
      const p = progress();
      const i = Math.round(p * (FRAMES - 1));
      if (i !== current || force) {
        current = i;
        exact = !!imgs[i].naturalWidth;
        paint(exact ? imgs[i] : nearest(i));
      }
      const active = CAPTIONS.findIndex(
        (c) => p >= c.phase[0] && p < c.phase[1]
      );
      setActiveCap(active);
      if (p > 0.02) hint.setAttribute('data-hide', '');
      else hint.removeAttribute('data-hide');
    }

    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; if (!cancelled) render(false); });
    }

    addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => { resize(); render(true); });
    ro.observe(cv);
    resize();
    render(true);

    return () => {
      cancelled = true;
      removeEventListener('scroll', onScroll);
      ro.disconnect();
      for (let i = 0; i < FRAMES; i++) {
        if (imgs[i]) { imgs[i].onload = null; imgs[i].onerror = null; }
      }
    };
  }, [reduced]);

  return (
    <section className="track" ref={trackRef} id="track" aria-labelledby="cap1-h" data-nav-theme="dark">
      <div className="stage" ref={stageRef} id="stage">
        <canvas
          id="seq"
          ref={cvRef}
          role="img"
          aria-label="The ARCWEAR Core Hoodie rotating, separating into its eleven construction panels, then closing in on the brushed fleece and reflective chest mark."
        />

        <div className="caps wrap">
          {CAPTIONS.map((cap, i) => {
            if (cap.quote) {
              return (
                <div key={i} className={'hero-quote' + (i === activeCap ? ' on' : '')} data-cap={i}>
                  <span className="hero-quote__line hero-quote__top">{cap.quote[0]}</span>
                  <span className="hero-quote__line hero-quote__bottom">{cap.quote[1]}</span>
                </div>
              );
            }
            const Heading = i === 0 ? 'h1' : 'h2';
            return (
              <div
                key={i}
                className={'cap' + (i === activeCap ? ' on' : '')}
                data-cap={i}
              >
                <Heading {...(i === 0 ? { id: 'cap1-h', className: 'cap__brand' } : {})}>{cap.heading}</Heading>
                {cap.typed && (
                  <Typewriter texts={cap.typed} paused={i !== activeCap} className="cap__typed" />
                )}
                {cap.body && <p>{cap.body}</p>}
                {cap.cta && (
                  <a className={'btn ' + cap.cta.variant} href={cap.cta.href}>
                    {cap.cta.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {!reduced && (
          <div
            className="loadbar"
            ref={barRef}
            id="loadbar"
            role="progressbar"
            aria-label="Loading hoodie animation"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          />
        )}
        <p className="hint" ref={hintRef} id="hint" aria-hidden="true">Scroll</p>
      </div>
    </section>
  );
}
