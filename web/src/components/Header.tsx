import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-neutral-200 sticky top-0 bg-white/95 backdrop-blur z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight">
          APEXWEAR
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <span className="text-neutral-400" title="Coming in a later phase">
            Cart
          </span>
          {user ? (
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
