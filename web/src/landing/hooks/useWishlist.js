import { useSyncExternalStore } from 'react';

const KEY = 'apexwear:wishlist';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

let ids = read();
const listeners = new Set();

function notify() { listeners.forEach((fn) => fn()); }

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) { ids = read(); notify(); }
});

function toggle(id) {
  ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  localStorage.setItem(KEY, JSON.stringify(ids));
  notify();
}

export function useWishlist() {
  const current = useSyncExternalStore(subscribe, () => ids);
  return {
    ids: current,
    has: (id) => current.includes(id),
    toggle,
    count: current.length,
  };
}
