import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Nav from './Nav.jsx';
import Footer from './Footer.jsx';
import { apiJson, ApiError, toFieldErrors } from '../../lib/api';
import { setCartCountFromCart } from '../../lib/cartCount';
import { loadRazorpayScript } from '../../lib/loadRazorpay';
import { useAuth } from '../../lib/auth-context';

// Cart, address, and checkout page — talks to the Django cart/order API.

// Polls server status rather than trusting the Razorpay modal's own success callback.
async function pollOrderUntilSettled(orderNumber, { tries = 10, delayMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const latest = await apiJson(`/api/orders/${orderNumber}/`);
    if (latest.status !== 'pending') return latest;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return apiJson(`/api/orders/${orderNumber}/`); // one last read for the caller to show as-is
}

const EMPTY_ADDRESS = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

export default function CartPage() {
  const { user } = useAuth();
  const [cart, setCart] = useState(null);
  const [error, setError] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  const [addressError, setAddressError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutNote, setCheckoutNote] = useState('');
  const [pendingOrderNumber, setPendingOrderNumber] = useState(null); // paid, webhook not landed yet
  const [order, setOrder] = useState(null);

  const loadCart = () => {
    apiJson('/api/cart/')
      .then((data) => {
        setCart(data);
        setCartCountFromCart(data);
      })
      .catch(() => setError('Could not load your cart.'));
  };

  const loadAddresses = () => {
    apiJson('/api/auth/addresses/')
      .then((page) => {
        const list = page.results ?? page; // DRF pagination wraps as {count, next, previous, results}
        setAddresses(list);
        const preferred = list.find((a) => a.is_default) ?? list[0];
        if (preferred) setSelectedAddressId(preferred.id);
        if (list.length === 0) setShowAddressForm(true);
      })
      .catch(() => setError('Could not load your saved addresses. You can still enter one below.'));
  };

  useEffect(() => {
    loadCart();
    loadAddresses();
  }, []);

  const updateQuantity = (itemId, quantity) => {
    if (quantity < 1) return;
    apiJson(`/api/cart/items/${itemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
      .then((data) => {
        setCart(data);
        setCartCountFromCart(data);
      })
      .catch(() => setError('Could not update that item.'));
  };

  const removeItem = (itemId) => {
    apiJson(`/api/cart/items/${itemId}/`, { method: 'DELETE' })
      .then((data) => {
        setCart(data);
        setCartCountFromCart(data);
      })
      .catch(() => setError('Could not remove that item.'));
  };

  const submitAddress = (e) => {
    e.preventDefault();
    setAddressError('');
    apiJson('/api/auth/addresses/', {
      method: 'POST',
      body: JSON.stringify({ ...addressForm, is_default: addresses.length === 0 }),
    })
      .then((created) => {
        setAddresses((prev) => [...prev, created]);
        setSelectedAddressId(created.id);
        setShowAddressForm(false);
        setAddressForm(EMPTY_ADDRESS);
      })
      .catch((err) => {
        const fields = toFieldErrors(err);
        const named = Object.entries(fields)
          .filter(([key]) => key !== 'non_field')
          .map(([key, msg]) => `${key}: ${msg}`);
        setAddressError(
          named.length ? named.join(' ') : 'Could not save that address — check the fields and try again.',
        );
      });
  };

  const placeOrder = async () => {
    if (!selectedAddressId) return;
    setPlacingOrder(true);
    setCheckoutError('');
    setCheckoutNote('');
    try {
      const result = await apiJson('/api/checkout/', {
        method: 'POST',
        body: JSON.stringify({ address_id: selectedAddressId, payment_method: paymentMethod }),
      });

      if (paymentMethod === 'cod') {
        setOrder(result);
        setCart(null);
        setCartCountFromCart(null);
        return;
      }

      // Order is still PENDING here — the webhook confirms it, so the success handler only polls.
      await loadRazorpayScript();
      const razorpay = new window.Razorpay({
        key: result.razorpay_key_id,
        order_id: result.razorpay_order_id, // Razorpay reads the amount off this, not the browser
        name: 'APEXWEAR',
        description: `Order ${result.order.number}`,
        prefill: {
          name: user ? `${user.first_name} ${user.last_name}`.trim() : undefined,
          email: user?.email,
          contact: user?.mobile,
        },
        theme: { color: '#e02e2e' },
        handler: async () => {
          setCheckoutNote('Payment received — confirming your order…');
          const settled = await pollOrderUntilSettled(result.order.number);
          if (settled.status === 'pending') {
            setCheckoutNote('');
            setPendingOrderNumber(result.order.number);
            setPlacingOrder(false);
            return;
          }
          setOrder(settled);
          setCart(null);
          setCartCountFromCart(null);
        },
        modal: {
          ondismiss: () => {
            // Cancels server-side rather than leaving the PENDING order stranded.
            apiJson(`/api/orders/${result.order.number}/cancel/`, { method: 'POST' })
              .then((cancelled) => {
                setCheckoutNote(
                  cancelled.status === 'cancelled'
                    ? 'Payment cancelled — your order was cancelled and nothing was charged.'
                    : 'Payment window closed, but your order went through. Check your orders.',
                );
              })
              .catch(() => setCheckoutNote('Payment cancelled — your order was not completed.'))
              .finally(() => setPlacingOrder(false));
          },
        },
      });
      razorpay.on('payment.failed', () => { // declined card fires this, not `handler`
        setCheckoutError('Payment failed — you have not been charged. Please try another method.');
        setPlacingOrder(false);
      });
      razorpay.open();
    } catch (err) {
      const detail = err instanceof ApiError && err.body?.detail ? err.body.detail : 'Could not place your order — please try again.';
      setCheckoutError(detail);
      setPlacingOrder(false);
    }
  };

  const items = cart?.items ?? [];

  if (order) {
    return (
      <div className="landing-root">
        <div className="reveal-content">
          <Nav />
          <main id="main">
            <section className="section">
              <div className="wrap">
                <div className="wishlist-header">
                  <h1>Order placed</h1>
                </div>
                <p className="wishlist-empty">
                  Thanks — order <strong>{order.number}</strong> is <strong>{order.status}</strong>.{' '}
                  {order.payment_method === 'cod'
                    ? 'Pay cash on delivery when it arrives.'
                    : 'Payment confirmed.'}
                </p>
                <ul className="cart-list">
                  {order.items.map((item, i) => (
                    <li key={i} className="cart-item cart-item--summary">
                      <div className="cart-item__info">
                        <span>{item.product_name}</span>
                        <p className="cart-item__variant">
                          {item.variant_size} / {item.variant_colour} × {item.quantity}
                        </p>
                      </div>
                      <p className="cart-item__line-total">₹{item.line_total}</p>
                    </li>
                  ))}
                </ul>
                <div className="cart-summary">
                  <div className="cart-summary__row cart-summary__total">
                    <span>Total</span>
                    <span>₹{order.total}</span>
                  </div>
                </div>
                <p className="wishlist-empty">
                  <Link to={`/profile/orders/${order.number}`}>View order details</Link>
                  {' · '}
                  <Link to="/shop">Keep shopping</Link>
                </p>
              </div>
            </section>
          </main>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="landing-root">
      <div className="reveal-content">
        <Nav />
        <main id="main">
          <section className="section">
            <div className="wrap">
              <div className="wishlist-header">
                <h1>Cart</h1>
              </div>

              {error && <p className="wishlist-empty">{error}</p>}

              {!error && cart && items.length === 0 && (
                <p className="wishlist-empty">
                  Your cart is empty. <Link to="/shop">Browse the hoodies</Link> to get started.
                </p>
              )}

              {items.length > 0 && (
                <div className="cart-layout">
                  <ul className="cart-list">
                    {items.map((item) => (
                      <li key={item.id} className="cart-item">
                        {item.image ? (
                          <img src={item.image} alt={item.product_name} className="cart-item__image" />
                        ) : (
                          <div className="cart-item__image cart-item__image--empty" />
                        )}
                        <div className="cart-item__info">
                          <Link to={`/shop/${item.product_slug}`}>{item.product_name}</Link>
                          <p className="cart-item__variant">
                            {item.variant.size} / {item.variant.colour}
                          </p>
                          <p className="cart-item__price">₹{item.variant.price}</p>
                        </div>
                        <div className="cart-item__qty">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} aria-label="Decrease quantity">
                            −
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} aria-label="Increase quantity">
                            +
                          </button>
                        </div>
                        <p className="cart-item__line-total">₹{item.line_total}</p>
                        <button className="cart-item__remove" onClick={() => removeItem(item.id)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="cart-summary">
                    <p className="cart-summary__label">Deliver to</p>

                    {addresses.length > 0 && (
                      <div className="address-list">
                        {addresses.map((a) => (
                          <label key={a.id} className="address-card">
                            <input
                              type="radio"
                              name="address"
                              checked={selectedAddressId === a.id}
                              onChange={() => setSelectedAddressId(a.id)}
                            />
                            <span>
                              {a.name} — {a.line1}, {a.city} {a.pincode}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {!showAddressForm && (
                      <button className="cart-item__remove" onClick={() => setShowAddressForm(true)}>
                        + Add a new address
                      </button>
                    )}

                    {showAddressForm && (
                      <form className="authform" onSubmit={submitAddress}>
                        {['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((field) => (
                          <div className="cart-field" key={field}>
                            <input
                              required={field !== 'line2'}
                              placeholder={field[0].toUpperCase() + field.slice(1)}
                              value={addressForm[field]}
                              onChange={(e) => setAddressForm((f) => ({ ...f, [field]: e.target.value }))}
                              className="cart-input"
                            />
                          </div>
                        ))}
                        {addressError && <p className="autherror">{addressError}</p>}
                        <div className="address-form__actions">
                          <button type="submit" className="btn btn--primary">
                            Save address
                          </button>
                          {addresses.length > 0 && (
                            <button type="button" className="cart-item__remove" onClick={() => setShowAddressForm(false)}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>
                    )}

                    <div className="cart-summary__row">
                      <span>Subtotal</span>
                      <span>₹{cart.subtotal}</span>
                    </div>
                    <div className="cart-summary__row">
                      <span>Shipping</span>
                      <span>₹{cart.shipping_fee}</span>
                    </div>
                    <div className="cart-summary__row cart-summary__total">
                      <span>Total</span>
                      <span>₹{cart.total}</span>
                    </div>

                    <div className="address-list">
                      <label className="address-card">
                        <input
                          type="radio"
                          name="paymentMethod"
                          checked={paymentMethod === 'cod'}
                          onChange={() => setPaymentMethod('cod')}
                        />
                        <span>Cash on Delivery</span>
                      </label>
                      <label className="address-card">
                        <input
                          type="radio"
                          name="paymentMethod"
                          checked={paymentMethod === 'razorpay'}
                          onChange={() => setPaymentMethod('razorpay')}
                        />
                        <span>Pay online (Razorpay)</span>
                      </label>
                    </div>

                    {checkoutError && <p className="autherror">{checkoutError}</p>}
                    {checkoutNote && <p className="cart-summary__label">{checkoutNote}</p>}
                    {pendingOrderNumber && (
                      <p className="cart-summary__label">
                        Payment received — still confirming.{' '}
                        <Link to={`/profile/orders/${pendingOrderNumber}`}>
                          Track order {pendingOrderNumber}
                        </Link>
                      </p>
                    )}

                    <button
                      className="btn btn--primary"
                      disabled={!selectedAddressId || placingOrder}
                      onClick={placeOrder}
                    >
                      {placingOrder
                        ? 'Placing order…'
                        : paymentMethod === 'cod'
                          ? 'Place order — Cash on Delivery'
                          : `Pay ₹${cart.total} with Razorpay`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
