import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../lib/api";
import { formatDate, statusInfo } from "../lib/orderStatus";
import type { Order, Paginated } from "../lib/types";

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<Paginated<Order> | Order[]>("/api/orders/") // handles bare or DRF-paginated shape
      .then((data) => setOrders("results" in data ? data.results : data))
      .catch(() => setError("Could not load your orders."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link to="/profile" className="text-sm text-neutral-500 hover:underline">
        ← Back to profile
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-8">Your Orders</h1>

      {loading && <p className="text-sm text-neutral-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="text-sm text-neutral-500">
          No orders yet.{" "}
          <Link to="/shop" className="underline">
            Start shopping
          </Link>
          .
        </p>
      )}

      <div className="flex flex-col gap-4">
        {orders.map((order) => {
          const status = statusInfo(order.status);
          const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <Link
              key={order.number}
              to={`/profile/orders/${order.number}`}
              className="border border-neutral-200 rounded-md p-4 hover:border-neutral-400"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{order.number}</p>
                  <p className="text-sm text-neutral-500 mt-1">{formatDate(order.created_at)}</p>
                  <p className="text-sm text-neutral-600 mt-1">
                    {count} item{count === 1 ? "" : "s"} ·{" "}
                    {order.payment_method === "cod" ? "Cash on delivery" : "Paid online"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs uppercase rounded-full px-2 py-0.5 ${status.tone}`}>
                    {status.label}
                  </span>
                  <p className="font-semibold mt-2">₹{order.total}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
