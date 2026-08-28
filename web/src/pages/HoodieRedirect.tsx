import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { ProductDetail } from "../lib/types";

// /shop/hoodie/<id-or-slug> alias — fetches the product, then redirects to its canonical /shop/:slug.
export function HoodieRedirect() {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["product", slugOrId],
    queryFn: () => apiJson<ProductDetail>(`/api/products/${slugOrId}/`),
    enabled: !!slugOrId,
  });

  if (isLoading) return null;
  if (isError || !product) return <Navigate to="/shop" replace />;
  return <Navigate to={`/shop/${product.slug}`} replace />;
}
