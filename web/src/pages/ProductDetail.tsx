import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { ProductDetail as ProductDetailType, Variant } from "../lib/types";

export function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => apiJson<ProductDetailType>(`/api/products/${slug}/`),
    enabled: !!slug,
  });

  const sizes = useMemo(
    () => (product ? [...new Set(product.variants.map((v) => v.size))] : []),
    [product],
  );
  const colours = useMemo(
    () => (product ? [...new Set(product.variants.map((v) => v.colour))] : []),
    [product],
  );

  const [size, setSize] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);

  if (isLoading) {
    return <p className="max-w-4xl mx-auto px-4 py-16 text-center text-neutral-500">Loading…</p>;
  }
  if (isError || !product) {
    return (
      <p className="max-w-4xl mx-auto px-4 py-16 text-center text-red-600">
        Couldn't load that hoodie. <Link to="/shop" className="underline">Back to shop</Link>
      </p>
    );
  }

  const selected: Variant | undefined = product.variants.find(
    (v) => v.size === size && v.colour === colour,
  );
  const availableFor = (dim: "size" | "colour", value: string) =>
    product.variants.some((v) =>
      dim === "size"
        ? v.size === value && (!colour || v.colour === colour) && v.stock > 0
        : v.colour === value && (!size || v.size === size) && v.stock > 0,
    );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 grid sm:grid-cols-2 gap-8">
      <div className="aspect-[3/4] bg-neutral-100 rounded-md overflow-hidden">
        {product.images[0] ? (
          <img
            src={product.images[0].image}
            alt={product.images[0].alt || product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
            No image
          </div>
        )}
      </div>

      <div>
        <p className="text-xs uppercase text-neutral-500">{product.category.name}</p>
        <h1 className="text-2xl font-bold mt-1">{product.name}</h1>
        <p className="text-lg mt-2 flex items-baseline gap-2">
          <span>₹{selected ? selected.price : product.base_price}</span>
          {product.mrp && Number(product.mrp) > Number(product.base_price) && (
            <span className="text-sm text-neutral-400 line-through">₹{product.mrp}</span>
          )}
        </p>
        <p className="text-sm text-neutral-600 mt-4">{product.description}</p>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-neutral-500 mb-2">Colour</p>
          <div className="flex flex-wrap gap-2">
            {colours.map((c) => (
              <button
                key={c}
                disabled={!availableFor("colour", c)}
                onClick={() => setColour(c)}
                className={`text-sm px-3 py-1 rounded-full border disabled:opacity-30 disabled:line-through ${
                  colour === c ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-neutral-500 mb-2">Size</p>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                disabled={!availableFor("size", s)}
                onClick={() => setSize(s)}
                className={`text-sm px-3 py-1 rounded-full border disabled:opacity-30 disabled:line-through ${
                  size === s ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm mt-6 text-neutral-500">
          {selected
            ? selected.stock > 0
              ? `${selected.stock} in stock`
              : "Out of stock"
            : "Pick a size and colour"}
        </p>

        {/* Cart isn't built yet (Phase 3) — see plan.md. */}
        <button
          disabled
          title="Cart arrives in Phase 3"
          className="mt-4 w-full py-3 bg-neutral-300 text-neutral-500 rounded-md cursor-not-allowed"
        >
          Add to cart — coming soon
        </button>
      </div>
    </div>
  );
}
