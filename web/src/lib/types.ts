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
  in_stock?: boolean; // server-annotated; optional so an older cached response isn't all "sold out"
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

// Mirrors backend/orders/serializers.py OrderSerializer — money fields are DRF Decimal strings, rendered as-is.
export interface OrderItem {
  product_name: string;
  variant_size: string;
  variant_colour: string;
  sku: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface OrderPayment {
  status: "created" | "captured" | "failed";
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  created_at: string;
}

export type OrderStatus =
  | "pending"
  | "paid"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "awaiting_refund";

export interface Order {
  number: string;
  status: OrderStatus;
  payment_method: "razorpay" | "cod";
  shipping_address: Record<string, string>;
  subtotal: string;
  shipping_fee: string;
  total: string;
  items: OrderItem[];
  payments: OrderPayment[];
  created_at: string;
  updated_at: string;
}
