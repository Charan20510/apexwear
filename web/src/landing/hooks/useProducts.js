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

// Coverflow, ScrollHorizontal and ProductGrid each call this hook independently, so
// the fetch is shared at module scope rather than per-component — one network
// request per page load instead of three.
// ponytail: a plain module-level promise, not React Query — add that (already an
// installed dep, see pages/Home.tsx) only if the landing ever needs cache
// invalidation or refetch-on-focus.
let productsPromise = null;

function fetchProducts() {
  if (!productsPromise) {
    productsPromise = fetch('/api/products/', { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      // DRF paginates: the list lives under `results`.
      .then((data) => (Array.isArray(data) ? data : (data.results ?? [])).map(fromDjango))
      .catch(() => {
        productsPromise = null; // let a later mount retry instead of caching the failure
        return [];
      });
  }
  return productsPromise;
}

export function useProducts() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchProducts().then((list) => {
      if (!cancelled) setProducts(list);
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
