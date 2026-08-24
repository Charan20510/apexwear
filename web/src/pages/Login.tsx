import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Nav from "../landing/components/Nav.jsx";
import Footer from "../landing/components/Footer.jsx";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";
import { PasswordField } from "../components/PasswordField";
import { GoogleButton } from "../components/GoogleButton";

// Only ever redirect to a path on this site. A value like "//evil.com" is
// scheme-relative and browsers treat it as an off-site redirect — reject
// anything that isn't a single leading slash.
function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/shop";
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      navigate(safeNextPath(searchParams.get("next")));
    } catch (err) {
      setError(err instanceof ApiError ? "Invalid credentials" : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing-root">
      <div className="reveal-content">
        <Nav />
        <main id="main">
          <section className="section authpage">
            <div className="wrap authpage__wrap">
              <div className="authcard">
                <div className="authtabs">
                  <span className="authtab authtab--active">Login</span>
                  <Link to="/register" className="authtab">
                    Register
                  </Link>
                </div>

                <form onSubmit={onSubmit} className="authform">
                  <div className="authfield">
                    <input
                      required
                      placeholder="Email or Mobile Number"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="authinput"
                    />
                  </div>

                  <PasswordField
                    id="login-password"
                    placeholder="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                  />

                  {error && <p className="autherror">{error}</p>}

                  <button type="submit" disabled={submitting} className="btn btn--primary authsubmit">
                    {submitting ? "Logging in…" : "Proceed"}
                  </button>
                </form>

                <GoogleButton />

                <p className="authswitch">
                  <Link to="/forgot-password">Forgot Password?</Link>
                </p>
                <p className="authswitch">
                  New User? <Link to="/register">Create Account</Link>
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
