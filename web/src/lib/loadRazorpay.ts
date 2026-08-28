// Loads Razorpay's Checkout.js from their CDN once, cached — it isn't npm-installable.
declare global {
  interface Window {
    Razorpay?: unknown;
  }
}

let loading: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null; // don't let one flaky CDN load poison every later attempt
        script.remove();
        reject(new Error("Could not load Razorpay checkout"));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}
