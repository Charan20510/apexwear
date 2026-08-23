import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-neutral-200 sticky top-0 bg-white/95 backdrop-blur z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight">
          APEXWEAR
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/shop" className="hover:underline">
            Shop
          </Link>
          <Link to="/cart" className="hover:underline">
            Cart
          </Link>
          {/* Wait for the refresh-cookie check on mount so a logged-in user never
              flashes "Login" before /api/auth/me resolves. */}
          {loading ? null : user ? (
            <>
              <span className="text-neutral-600">{user.email}</span>
              <button
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="text-neutral-900 hover:underline"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:underline">
                Login
              </Link>
              <Link to="/register" className="hover:underline">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
