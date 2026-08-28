import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import LoginGate from "../landing/components/LoginGate.jsx";

// Route guards built on useAuth's `loading` flag, which prevents a flash of protected content.
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

// Same gate, but explains itself instead of silently redirecting — used by wishlist/cart icons.
export function RequireAuthPrompt() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginGate />;
  return <Outlet />;
}

// Inverse guard for /login and /register — bounces an already-logged-in user to /shop.
export function RedirectIfAuthed() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/shop" replace />;
  return <Outlet />;
}
