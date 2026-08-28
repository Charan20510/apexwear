import { useEffect, useState } from 'react';

// Adapts the Django product shape to the landing UI's original {title, sp, mrp, off, tag, images[]} shape.
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
    tag: p.in_stock === false ? 'Sold out' : undefined,
    images: p.image ? [p.image] : [],
  };
}

// Shared at module scope: Coverflow/ScrollHorizontal/ProductGrid each call this hook,
// one fetch per page load instead of three.
// ponytail: plain module-level promise, add React Query if cache invalidation is ever needed.
let productsPromise = null;

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

// Falls back to the first `count` products when Django has no in_coverflow/in_fiery flag set.
export function pickForSection(products, flag, count) {
  const flagged = products.filter((p) => p[flag]);
  return (flagged.length ? flagged : products).slice(0, count);
}
