import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Nav from './Nav.jsx';
import Footer from './Footer.jsx';

const REDIRECT_MS = 2000;

// What to call the thing behind the gate, keyed by pathname — avoids threading a
// prop through App.tsx's route element for two known routes.
const LABELS = {
  '/cart': 'cart',
  '/mywishlist': 'wishlist',
};

// Shown in place of a protected landing page when the visitor isn't signed in.
// Renders the page's own "please login" copy plus an overlay popup, then redirects
// to /login?next=<page> after a short delay so login sends them right back.
export default function LoginGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const timerRef = useRef(null);

  const thing = LABELS[location.pathname] ?? 'page';
  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  useEffect(() => {
    timerRef.current = setTimeout(() => navigate(loginHref, { replace: true }), REDIRECT_MS);
    return () => clearTimeout(timerRef.current);
  }, [loginHref, navigate]);

  function goLogin() {
    clearTimeout(timerRef.current);
    navigate(loginHref, { replace: true });
  }

  function cancel() {
    clearTimeout(timerRef.current);
    navigate('/', { replace: true });
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') cancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="landing-root">
      <div className="reveal-content">
        <Nav />
        <main id="main">
          <section className="section">
            <div className="wrap">
              <div className="wishlist-header">
                <h1>{thing[0].toUpperCase() + thing.slice(1)}</h1>
              </div>
              <p className="wishlist-empty">Please login to view your {thing}.</p>
            </div>
          </section>
        </main>
      </div>
      <Footer />

      <div className="logingate__backdrop" role="presentation">
        <div
          className="logingate__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logingate-title"
        >
          <div className="logingate__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="5" y="10.5" width="14" height="10" rx="2" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" />
            </svg>
          </div>
          <h2 id="logingate-title">Please login</h2>
          <p>You need an account to view your {thing}.</p>
          <div className="logingate__actions">
            <button type="button" className="btn btn--primary" onClick={goLogin} autoFocus>
              Login now
            </button>
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          </div>
          <p className="logingate__timer">Redirecting in a moment…</p>
        </div>
      </div>
    </div>
  );
}
