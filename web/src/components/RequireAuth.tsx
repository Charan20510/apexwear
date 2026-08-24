import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import LoginGate from "../landing/components/LoginGate.jsx";

// While the refresh-cookie check on mount is still in flight, render nothing —
// that's what prevents a flash of /shop before the redirect (or of /shop before
// confirming the user really is logged in). `loading` already exists for exactly
// this reason (see Header.tsx).
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

// Same gate as RequireAuth, but for pages that should explain themselves instead of
// silently teleporting a signed-out visitor to /login (the wishlist/cart icons land
// here directly on click, so this doubles as their click handler).
export function RequireAuthPrompt() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginGate />;
  return <Outlet />;
}

// Inverse guard for /login and /register: bounce an already-logged-in user
// straight to /shop instead of showing them the auth forms again.
export function RedirectIfAuthed() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/shop" replace />;
  return <Outlet />;
}
