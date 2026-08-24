import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../lib/api";
import type { ProductDetail } from "../lib/types";

// /shop/hoodie/<id-or-slug> is an alias for the canonical /shop/:slug URL.
// Django's ProductViewSet.get_object() resolves either an id or a slug for the
// same endpoint, so one fetch covers both and this just redirects to the
// canonical URL once it knows the product's real slug.
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
