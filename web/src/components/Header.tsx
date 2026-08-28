import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { useCartCount, refreshCartCount } from "../lib/cartCount";

// Icon paths reused from the landing nav, restyled here with Tailwind for this shell.
function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M2.5 3.5h2.4l1.1 5m0 0 1.4 6.4h9.3l1.7-6.4H6zm.6 6.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9.25" strokeLinecap="round" />
      <circle cx="12" cy="9.75" r="2.75" strokeLinecap="round" />
      <path d="M5.6 19.2a7.2 7.2 0 0 1 12.8 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M9 3.5H5.5A1.5 1.5 0 0 0 4 5v14a1.5 1.5 0 0 0 1.5 1.5H9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 16.5 19 12l-5-4.5M19 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const cartCount = useCartCount();

  useEffect(() => {
    if (user) refreshCartCount();
  }, [user]);

  return (
    <header className="border-b border-neutral-200 sticky top-0 bg-white/95 backdrop-blur z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight">
          APEXWEAR
        </Link>
        <nav className="flex items-center gap-5">
          <Link to="/cart" aria-label="Cart" className="relative text-neutral-700 hover:text-neutral-900">
            <CartIcon />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-neutral-900 text-white text-[10px] font-bold leading-none rounded-full px-1.5 py-0.5">
                {cartCount}
              </span>
            )}
          </Link>
          {/* loading guards against flashing "Login" before /api/auth/me resolves */}
          {loading ? null : user ? (
            <>
              <Link to="/profile" aria-label="Profile" className="text-neutral-700 hover:text-neutral-900">
                <AccountIcon />
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                aria-label="Logout"
                className="text-neutral-700 hover:text-neutral-900"
              >
                <LogoutIcon />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm hover:underline">
                Login
              </Link>
              <Link to="/register" className="text-sm hover:underline">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
