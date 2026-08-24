export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  mobile: string;
  date_of_birth: string;
  gender: "male" | "female" | "other";
}

export interface RegisterPayload {
  email: string;
  password: string;
  confirm_password: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  mobile: string;
  gender: "male" | "female" | "other";
}

export interface ProductListItem {
  id: number;
  name: string;
  slug: string;
  category: string;
  base_price: string;
  mrp: string | null;
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
  mrp: string | null;
  images: ProductImage[];
  variants: Variant[];
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
