export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export interface ProductListItem {
  id: number;
  name: string;
  slug: string;
  category: string;
  base_price: string;
  image: string | null;
}

export interface Variant {
  id: number;
  size: string;
  colour: string;
  sku: string;
  price: string;
  stock: number;
}

export interface ProductImage {
  id: number;
  image: string;
  alt: string;
  position: number;
}

export interface ProductDetail {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: { id: number; name: string; slug: string; parent: number | null };
  base_price: string;
  images: ProductImage[];
  variants: Variant[];
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
