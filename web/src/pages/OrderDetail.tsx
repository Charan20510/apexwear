import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson, ApiError } from "../lib/api";
import { buildTimeline, formatDate, statusInfo } from "../lib/orderStatus";
import type { Order } from "../lib/types";

export function OrderDetail() {
  const { number } = useParams<{ number: string }>();
  // Keyed by order number so "loading" derives during render when navigating between orders.
  const [result, setResult] = useState<{ number: string; order?: Order; error?: string } | null>(null);

  useEffect(() => {
    if (!number) return;
    let stale = false;
    apiJson<Order>(`/api/orders/${number}/`)
      .then((order) => !stale && setResult({ number, order }))
      .catch((err) => {
        if (stale) return;
        setResult({
          number,
          error:
            err instanceof ApiError && err.status === 404
              ? "We couldn't find that order."
              : "Could not load this order.",
        });
      });
    return () => {
      stale = true;
    };
  }, [number]);

  const settled = result?.number === number ? result : null;
  const loading = settled === null;
  const order = settled?.order ?? null;
  const error = settled?.error ?? "";

  if (loading) return <p className="max-w-2xl mx-auto px-4 py-12 text-sm text-neutral-500">Loading…</p>;
  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-sm text-red-600">{error || "Could not load this order."}</p>
        <Link to="/profile/orders" className="text-sm underline mt-4 inline-block">
          Back to your orders
        </Link>
      </div>
    );
  }

  const status = statusInfo(order.status);
  const address = order.shipping_address;
  const timeline = buildTimeline(order);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link to="/profile/orders" className="text-sm text-neutral-500 hover:underline">
        ← Back to your orders
      </Link>

      <div className="flex items-center gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-bold">{order.number}</h1>
        <span className={`text-xs uppercase rounded-full px-2 py-0.5 ${status.tone}`}>
          {status.label}
        </span>
      </div>
      <p className="text-sm text-neutral-600 mb-8">{status.blurb}</p>

      <h2 className="text-sm font-semibold uppercase text-neutral-500 mb-3">Items</h2>
      <div className="flex flex-col gap-3 mb-8">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between gap-4 border-b border-neutral-100 pb-3">
            <div>
              <p className="font-medium">{item.product_name}</p>
              <p className="text-sm text-neutral-500">
                {item.variant_size} / {item.variant_colour} × {item.quantity}
              </p>
            </div>
            <p className="font-medium shrink-0">₹{item.line_total}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 mb-8 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Subtotal</span>
          <span>₹{order.subtotal}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Shipping</span>
          <span>₹{order.shipping_fee}</span>
        </div>
        <div className="flex justify-between font-semibold text-base mt-1 pt-2 border-t border-neutral-200">
          <span>Total</span>
          <span>₹{order.total}</span>
        </div>
        <p className="text-neutral-500 mt-2">
          {order.payment_method === "cod" ? "Cash on delivery" : "Paid online (Razorpay)"}
        </p>
      </div>

      <h2 className="text-sm font-semibold uppercase text-neutral-500 mb-3">Delivering to</h2>
      <div className="text-sm text-neutral-700 mb-8">
        <p className="font-medium">{address.name}</p>
        <p>
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}
        </p>
        <p>
          {address.city}, {address.state} {address.pincode}
        </p>
        <p className="text-neutral-500 mt-1">{address.phone}</p>
      </div>

      <h2 className="text-sm font-semibold uppercase text-neutral-500 mb-3">Timeline</h2>
      <ol className="flex flex-col gap-3">
        {timeline.map((entry, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="mt-1.5 h-2 w-2 rounded-full bg-neutral-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">{entry.label}</p>
              <p className="text-neutral-500">{formatDate(entry.at)}</p>
              {entry.detail && <p className="text-neutral-400 text-xs">{entry.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
