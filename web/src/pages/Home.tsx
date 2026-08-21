import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { Paginated, ProductListItem } from "../lib/types";

export function Home() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiJson<Paginated<ProductListItem>>("/api/products/"),
  });

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

  const products = data?.results ?? [];

  if (products.length === 0) {
    return (
      <p className="max-w-6xl mx-auto px-4 py-16 text-center text-neutral-500">
        No hoodies yet — run <code>manage.py seed_products</code>.
      </p>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Hoodies</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((p) => (
          <div key={p.id} className="group">
            <div className="aspect-[3/4] bg-neutral-100 overflow-hidden rounded-md">
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                  No image
                </div>
              )}
            </div>
            <div className="mt-2">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-sm text-neutral-500">₹{p.base_price}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
