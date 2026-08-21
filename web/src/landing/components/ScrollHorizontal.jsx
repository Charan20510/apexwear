import { useEffect, useMemo, useRef } from 'react';
import { useProducts, pickForSection } from '../hooks/useProducts.js';

const ITEM_WIDTH = 400;
const GAP = 30;
const SLOTS = 5;
const COLORS = ['#ff6a00', '#ff3d00', '#e11d2a', '#ff8f1f', '#d21f3c'];

export default function ScrollHorizontal() {
  const products = useProducts();
  const items = useMemo(() => {
    const picked = pickForSection(products, 'in_fiery', SLOTS);
    const padded = [...picked];
    while (padded.length < SLOTS) padded.push(null);
    return padded;
  }, [products]);

  const totalDistance = (items.length - 1) * (ITEM_WIDTH + GAP);

  const containerRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const container = containerRef.current;
    const gallery = galleryRef.current;
    if (!container || !gallery) return;

    function onScroll() {
      const rect = container.getBoundingClientRect();
      const scrollable = container.offsetHeight - window.innerHeight;
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      gallery.style.transform = `translateX(${-progress * totalDistance}px)`;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [totalDistance]);

  function goToBuy() {
    document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="fiery-section" data-nav-theme="dark">
      <div className="fiery-intro">
        <h1 className="fiery-heading">
          Fiery Collections of the <span className="fiery-heading__hl">Week</span>
        </h1>
      </div>

      <div ref={containerRef} className="fiery-scroll-container">
        <div className="fiery-sticky">
          <div ref={galleryRef} className="fiery-gallery">
            {items.map((product, i) => (
              <div
                key={product?.id ?? `blank-${i}`}
                className="fiery-card"
                role="link"
                tabIndex={0}
                style={{
                  '--item-color': COLORS[i % COLORS.length],
                  ...(product?.images?.[0] ? { '--item-image': `url(${product.images[0]})` } : {}),
                }}
                onClick={goToBuy}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToBuy(); } }}
              >
                <div className="fiery-card__content">
                  <span className="fiery-card__num">0{i + 1}</span>
                  {product && <h2>{product.title}</h2>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
