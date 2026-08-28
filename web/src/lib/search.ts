// Talks to FastAPI search (/search/*), falling back to Django's /api/products/ if it's down.
import { apiFetch } from "./api";
import type { Paginated, ProductListItem } from "./types";

export interface ProductSearchParams {
  q?: string;
  category?: string;
  size?: string;
  colour?: string;
  min_price?: number;
  max_price?: number;
  sort?: "relevance" | "price" | "-price" | "newest";
  page?: number;
}

export interface Facets {
  sizes: string[];
  colours: string[];
  categories: string[];
  min_price: number | null;
  max_price: number | null;
}

export interface ProductSearchResult {
  data: Paginated<ProductListItem>;
  degraded: boolean;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

const FALLBACK_ORDERING: Partial<Record<NonNullable<ProductSearchParams["sort"]>, string>> = {
  price: "base_price",
  "-price": "-base_price",
  newest: "-created_at",
};

export async function fetchProducts(params: ProductSearchParams = {}): Promise<ProductSearchResult> {
  try {
    const res = await apiFetch(`/search/products${toQuery({ ...params })}`);
    if (res.ok) return { data: await res.json(), degraded: false };
  } catch {
    // network error — FastAPI is down, fall through to the Django fallback below
  }

  const res = await apiFetch(
    `/api/products/${toQuery({
      q: params.q,
      category: params.category,
      ordering: params.sort ? FALLBACK_ORDERING[params.sort] : undefined,
      page: params.page,
    })}`,
  );
  if (!res.ok) throw new Error(`catalog request failed (${res.status})`);
  return { data: await res.json(), degraded: true };
}

export async function fetchFacets(
  params: Pick<ProductSearchParams, "q" | "category" | "min_price" | "max_price"> = {},
): Promise<Facets | null> {
  try {
    const res = await apiFetch(`/search/facets${toQuery(params)}`);
    if (res.ok) return await res.json();
  } catch {
    // FastAPI down — no facet sidebar, not fatal
  }
  return null;
}
