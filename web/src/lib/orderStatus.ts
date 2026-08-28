import type { Order, OrderStatus } from "./types";

// Shared order-status labels/timeline for the order list and order detail pages.
const LABELS: Record<OrderStatus, { label: string; blurb: string; tone: string }> = {
  pending: {
    label: "Pending",
    blurb: "Waiting for payment to be confirmed.",
    tone: "bg-amber-100 text-amber-800",
  },
  paid: {
    label: "Paid",
    blurb: "Payment confirmed. We're getting it ready to ship.",
    tone: "bg-green-100 text-green-800",
  },
  confirmed: {
    label: "Confirmed",
    blurb: "Confirmed — pay cash when it arrives.",
    tone: "bg-green-100 text-green-800",
  },
  failed: {
    label: "Failed",
    blurb: "Payment didn't go through. Nothing was charged.",
    tone: "bg-red-100 text-red-700",
  },
  cancelled: {
    label: "Cancelled",
    blurb: "This order was cancelled before payment.",
    tone: "bg-neutral-200 text-neutral-700",
  },
  awaiting_refund: {
    label: "Refund due",
    blurb: "Payment went through but the item sold out. A refund is on its way.",
    tone: "bg-orange-100 text-orange-800",
  },
};

export function statusInfo(status: OrderStatus) {
  return LABELS[status] ?? { label: status, blurb: "", tone: "bg-neutral-200 text-neutral-700" };
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface TimelineEntry {
  label: string;
  at: string;
  detail?: string;
}

// ponytail: derived timeline, not a status-history table — add an OrderStatusEvent
// model if a real audit trail is ever needed.
export function buildTimeline(order: Order): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { label: "Order placed", at: order.created_at },
  ];

  for (const payment of order.payments) {
    const label =
      payment.status === "captured"
        ? "Payment received"
        : payment.status === "failed"
          ? "Payment failed"
          : "Payment started";
    entries.push({
      label,
      at: payment.created_at,
      detail: payment.razorpay_payment_id ?? payment.razorpay_order_id ?? undefined,
    });
  }

  if (order.status !== "pending") { // otherwise updated_at just echoes created_at
    entries.push({ label: statusInfo(order.status).label, at: order.updated_at });
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
