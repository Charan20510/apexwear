import { useEffect, useState } from 'react';

// The landing components were written against a different backend whose products
// looked like {title, sp, mrp, off, tag, images[], in_coverflow, in_fiery}.
// Django is the single source of truth now, so this adapts its shape rather than
// changing every component. Fields Django has no concept of (mrp/off/tag) are left
// undefined — the cards already fall back to '' for those, so nothing renders a
// fake discount.
function fromDjango(p) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.name,
    category: p.category,
    sp: p.base_price,
    images: p.image ? [p.image] : [],
  };
}

export function useProducts() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products/', { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      // DRF paginates: the list lives under `results`.
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data.results ?? []);
        setProducts(list.map(fromDjango));
      })
      .catch(() => {
        // Leave the list empty; every consumer renders placeholder cards.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return products;
}

// Django has no in_coverflow / in_fiery flags, so a plain `.filter(p => p.in_x)`
// would empty these sections. Honour the flag when present, otherwise fall back to
// the first `count` products so the section still fills.
export function pickForSection(products, flag, count) {
  const flagged = products.filter((p) => p[flag]);
  return (flagged.length ? flagged : products).slice(0, count);
}
