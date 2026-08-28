import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchProducts, fetchFacets, type ProductSearchParams } from "../lib/search";

const SORTS: { value: NonNullable<ProductSearchParams["sort"]>; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price", label: "Price: low to high" },
  { value: "-price", label: "Price: high to low" },
];

export function Home() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const size = params.get("size") ?? "";
  const colour = params.get("colour") ?? "";
  const sort = (params.get("sort") as ProductSearchParams["sort"]) ?? "relevance";
  const page = Number(params.get("page") ?? "1");

  const [qInput, setQInput] = useState(q); // local until submit, so typing doesn't refetch

  const searchParams: ProductSearchParams = { q, category, size, colour, sort, page };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["products", searchParams],
    queryFn: () => fetchProducts(searchParams),
  });

  const { data: facets } = useQuery({
    queryKey: ["facets", q, category],
    queryFn: () => fetchFacets({ q, category }),
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page"); // any filter change restarts pagination
    setParams(next);
  }

  if (isLoading) {
    return <p className="max-w-6xl mx-auto px-4 py-16 text-center text-neutral-500">Loading hoodies…</p>;
  }

  if (isError) {
    return (
      <p className="max-w-6xl mx-auto px-4 py-16 text-center text-red-600">
        Couldn't load products. Is the Django server running?
      </p>
    );
  }

  const products = data?.data.results ?? [];
  const count = data?.data.count ?? 0;
  const pageSize = 24;
  const hasNext = !!data?.data.next;
  const hasPrev = !!data?.data.previous;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Hoodies</h1>
      {data?.degraded && (
        <p className="text-xs text-amber-600 mb-4">
          Search is temporarily unavailable — showing the basic catalog (size/colour/price
          filters are off).
        </p>
      )}

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("q", qInput);
        }}
      >
        <input
          key={q}
          type="search"
          autoFocus={params.get("focus") === "search"} // landing nav's magnifier links here with ?focus=search
          defaultValue={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search hoodies…"
          className="border border-neutral-300 rounded-md px-3 py-2 text-sm flex-1"
        />
        <button type="submit" className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-md">
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-8">
        <aside className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase text-neutral-500 mb-2">Sort</p>
            <select
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value)}
              className="border border-neutral-300 rounded-md px-2 py-1 text-sm w-full"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {facets && (
            <>
              <div>
                <p className="text-xs font-semibold uppercase text-neutral-500 mb-2">Category</p>
                <div className="flex flex-wrap gap-1">
                  {facets.categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateParam("category", category === c ? "" : c)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        category === c
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "border-neutral-300"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-neutral-500 mb-2">Size</p>
                <div className="flex flex-wrap gap-1">
                  {facets.sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateParam("size", size === s ? "" : s)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        size === s ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-neutral-500 mb-2">Colour</p>
                <div className="flex flex-wrap gap-1">
                  {facets.colours.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateParam("colour", colour === c ? "" : c)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        colour === c
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "border-neutral-300"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        <div>
          {products.length === 0 ? (
            <div className="text-neutral-500 text-sm py-16 text-center">
              <p>No hoodies match those filters.</p>
              <button
                onClick={() => setParams(new URLSearchParams())}
                className="mt-3 underline hover:text-neutral-900"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {products.map((p) => (
                <Link key={p.id} to={`/shop/${p.slug}`} className="group block">
                  <div className="relative aspect-[3/4] bg-neutral-100 overflow-hidden rounded-md">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform ${
                          p.in_stock === false ? "opacity-60" : ""
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                        No image
                      </div>
                    )}
                    {/* Sold-out hoodies stay listed and keep their URL — the card
                        just says so, rather than the product silently vanishing. */}
                    {p.in_stock === false && (
                      <span className="absolute top-2 left-2 text-xs uppercase tracking-wide bg-neutral-900/85 text-white rounded-full px-2 py-0.5">
                        Sold out
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-sm text-neutral-500">₹{p.base_price}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {(hasNext || hasPrev) && (
            <div className="flex items-center justify-center gap-4 mt-8 text-sm">
              <button
                disabled={!hasPrev}
                onClick={() => updateParam("page", String(page - 1))}
                className="disabled:opacity-30"
              >
                ← Previous
              </button>
              <span className="text-neutral-500">
                Page {page} · {count} hoodies · {pageSize}/page
              </span>
              <button
                disabled={!hasNext}
                onClick={() => updateParam("page", String(page + 1))}
                className="disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
