import { useEffect, useRef, useState } from 'react';
import { useWishlist } from '../hooks/useWishlist.js';
import { useProducts } from '../hooks/useProducts.js';

const BLANK_COUNT = 4;

function formatRupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || value === '' || value == null) return '';
  return '₹' + n.toLocaleString('en-IN');
}

export function ProductCard({ product }) {
  const [swapped, setSwapped] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const { has, toggle } = useWishlist();

  const badge    = product.tag ?? '';
  const name     = product.title ?? '';
  const category = product.category ?? '';
  const now      = formatRupees(product.sp);
  const was      = formatRupees(product.mrp);
  const off      = product.off ?? '';
  const id       = product.id;
  const liked    = has(id);

  const goToProduct = () => {
    document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="pcard-wrap">
      <article
        className={'pcard' + (swapped ? ' swapped' : '')}
        role="link"
        tabIndex={0}
        onClick={goToProduct}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToProduct(); } }}
        onMouseEnter={() => { timer.current = setTimeout(() => setSwapped(true), 800); }}
        onMouseLeave={() => { clearTimeout(timer.current); setSwapped(false); }}
      >
        <div className="pcard__img-wrap">
          <img
            className="pcard__img pcard__img--primary"
            src={product.images?.[0] ?? ''}
            alt={name}
            loading="lazy"
          />
          <img
            className="pcard__img pcard__img--hover"
            src={product.images?.[1] ?? product.images?.[0] ?? ''}
            alt={name}
            loading="lazy"
          />
          {badge && (
            <span className="pcard__pill">
              <i className="pcard__dot" aria-hidden="true" />
              {badge}
            </span>
          )}
          <div className="pcard__actions">
            <button
              className={'pcard__circle' + (liked ? ' is-liked' : '')}
              type="button"
              aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
              onClick={(e) => { e.stopPropagation(); toggle(id); }}
            >
              {liked ? '♥' : '♡'}
            </button>
          </div>
        </div>

        <div className="pcard__head">
          <div>
            <p className="pcard__name">{name}</p>
            <p className="pcard__cat">{category}</p>
          </div>
          <div className="pcard__pricecol">
            <span className="pcard__plabel">Price</span>
            <span className="pcard__now">{now}</span>
          </div>
        </div>

        {/* Django has no MRP/discount concept, so this row is skipped rather than
            rendered as two empty labels. */}
        {(was || off) && (
          <div className="pcard__stats">
            <div>
              <span className="pcard__slabel">MRP</span>
              <span className="pcard__sval pcard__sval--mrp">{was}</span>
            </div>
            <div>
              <span className="pcard__slabel">Discount</span>
              <span className="pcard__sval">{off}</span>
            </div>
          </div>
        )}

        {/* This used to be a row of marketplace links (Amazon/Flipkart/…). We are the
            shop now, so the card sends you to our own catalogue instead of off-site. */}
        <div className="pcard__links">
          <a
            className="storebtn"
            href="/shop"
            onClick={(e) => e.stopPropagation()}
          >
            Shop now
          </a>
        </div>
      </article>
    </div>
  );
}

function BlankCard() {
  return (
    <div className="pcard-wrap">
      <article className="pcard pcard--blank" aria-hidden="true">
        <div className="pcard__img-wrap">
          <div className="pcard__img pcard__img--primary pcard__img--blank" />
        </div>
        <div className="pcard__head">
          <div>
            <p className="pcard__name">&nbsp;</p>
            <p className="pcard__cat">&nbsp;</p>
          </div>
        </div>
      </article>
    </div>
  );
}

export default function ProductGrid() {
  const products = useProducts();
  if (products.length === 0) {
    return (
      <div className="products">
        {Array.from({ length: BLANK_COUNT }, (_, i) => (
          <BlankCard key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="products">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
