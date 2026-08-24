import { useEffect, useState } from 'react';

// The landing components were written against a different backend whose products
// looked like {title, sp, mrp, off, tag, images[], in_coverflow, in_fiery}.
// Django is the single source of truth now, so this adapts its shape rather than
// changing every component. `tag` (a promo badge) has no Django concept and stays
// undefined — the cards already fall back to '' for that, so nothing renders a fake
// badge. `mrp`/`off` are derived below when Django's mrp is a real markup.
function fromDjango(p) {
  const mrp = p.mrp && Number(p.mrp) > Number(p.base_price) ? p.mrp : undefined;
  return {
    id: p.id,
    slug: p.slug,
    title: p.name,
    category: p.category,
    sp: p.base_price,
    mrp,
    off: mrp ? `${Math.round((1 - p.base_price / mrp) * 100)}% OFF` : undefined,
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

// DRF paginates at 24/page — follows `next` so the wishlist (which looks products up
// by id) and the coverflow/fiery sections still see every product once the catalog
// grows past one page, not just the first 24.
async function fetchAllPages(url, acc = []) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  const page = Array.isArray(data) ? data : (data.results ?? []);
  const combined = acc.concat(page);
  const next = Array.isArray(data) ? null : data.next;
  return next ? fetchAllPages(next, combined) : combined;
}

function fetchProducts() {
  if (!productsPromise) {
    productsPromise = fetchAllPages('/api/products/')
      .then((list) => list.map(fromDjango))
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
