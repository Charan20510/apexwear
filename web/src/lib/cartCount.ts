import { useSyncExternalStore } from "react";
import { apiJson } from "./api";

// Shared module-store for the cart badge count, backed by the server cart. In lib/, not
// landing/hooks/, so both the TS pages tree and the plain-JS landing tree can import it.
let count = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

interface CartLike {
  items: { quantity: number }[];
}

export function setCartCountFromCart(cart: CartLike | null) {
  count = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
  notify();
}

export async function refreshCartCount() {
  try {
    setCartCountFromCart(await apiJson<CartLike>("/api/cart/"));
  } catch {
    setCartCountFromCart(null); // signed out, or the request failed — badge shows no count
  }
}

export function useCartCount() {
  return useSyncExternalStore(subscribe, () => count);
}
