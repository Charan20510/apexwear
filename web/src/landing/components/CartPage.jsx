import { Link } from 'react-router-dom';
import Nav from './Nav.jsx';
import Footer from './Footer.jsx';

// Placeholder. The real cart — line items, quantities, server-computed totals — is
// Phase 3 in plan.md and isn't built yet. This exists so the nav's cart icon lands
// somewhere sensible instead of a blank route.
export default function CartPage() {
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
              <p className="wishlist-empty">
                Your cart is empty. <Link to="/shop">Browse the hoodies</Link> to get started.
              </p>
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
