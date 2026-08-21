import Nav from './Nav.jsx';
import Footer from './Footer.jsx';
import { ProductCard } from './ProductGrid.jsx';
import { useWishlist } from '../hooks/useWishlist.js';
import { useProducts } from '../hooks/useProducts.js';

export default function WishlistPage() {
  const { has } = useWishlist();
  const products = useProducts();
  const liked = products.filter((p) => has(p.id ?? p.href));

  return (
    <div className="landing-root">
      <div className="reveal-content">
        <Nav />
        <main id="main">
          <section className="section">
            <div className="wrap">
              <div className="wishlist-header">
                <h1>Wishlist</h1>
              </div>
              {liked.length === 0 ? (
                <p className="wishlist-empty">No liked hoodies yet — tap ♡ on any card to save it here.</p>
              ) : (
                <div className="products">
                  {liked.map((p, i) => (
                    <ProductCard key={p.id ?? p.href ?? i} product={p} />
                  ))}
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
