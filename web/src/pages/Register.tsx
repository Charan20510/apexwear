import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Nav from "../landing/components/Nav.jsx";
import Footer from "../landing/components/Footer.jsx";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";
import { PasswordField } from "../components/PasswordField";

const CONFLICT_LABEL: Record<string, string> = {
  email: "Email ID already exists",
  mobile: "Mobile number already exists",
};

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // Pre-filled when arriving from GoogleButton's "no account for this email" redirect —
  // the email is already Google-verified, so retyping it would just be friction.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [mobile, setMobile] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setConflictMessage(null);

    if (password !== confirmPassword) {
      setFieldErrors({ confirm_password: "Passwords do not match." });
      return;
    }

    setSubmitting(true);
    try {
      await register({
        email,
        password,
        confirm_password: confirmPassword,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob,
        mobile,
        gender,
      });
      navigate("/shop");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { conflicts?: string[]; detail?: string };
        const message =
          body.detail ??
          (body.conflicts ?? []).map((f) => CONFLICT_LABEL[f] ?? f).join(" and ");
        setConflictMessage(message || "That account already exists.");
        redirectTimer.current = setTimeout(() => {
          navigate("/login", { replace: true });
        }, 3000);
      } else if (err instanceof ApiError && err.body && typeof err.body === "object") {
        setFieldErrors(err.body as Record<string, string>);
      } else {
        setFieldErrors({ non_field: "Something went wrong. Please try again." });
      }
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
                  <Link to="/login" className="authtab">
                    Login
                  </Link>
                  <span className="authtab authtab--active">Register</span>
                </div>

                <form onSubmit={onSubmit} className="authform">
                  <div className="authrow">
                    <div className="authfield">
                      <input
                        required
                        placeholder="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="authinput"
                      />
                    </div>
                    <div className="authfield">
                      <input
                        placeholder="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="authinput"
                      />
                    </div>
                  </div>

                  <div className="authfield">
                    <input
                      type="email"
                      required
                      placeholder="Email ID"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="authinput"
                    />
                    {fieldErrors.email && <p className="autherror">{fieldErrors.email}</p>}
                  </div>

                  <PasswordField
                    id="register-password"
                    placeholder="Choose New Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                  />
                  {fieldErrors.password && <p className="autherror">{fieldErrors.password}</p>}

                  <PasswordField
                    id="register-confirm-password"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                  {fieldErrors.confirm_password && (
                    <p className="autherror">{fieldErrors.confirm_password}</p>
                  )}

                  <div className="authfield">
                    <label className="authlabel" htmlFor="register-dob">
                      Date of Birth
                    </label>
                    <input
                      id="register-dob"
                      type="date"
                      required
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="authinput"
                    />
                    {fieldErrors.date_of_birth && (
                      <p className="autherror">{fieldErrors.date_of_birth}</p>
                    )}
                  </div>

                  <div className="authfield">
                    <div className="authmobile">
                      <span className="authmobile__prefix">+91</span>
                      <input
                        required
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="Mobile Number"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="authinput authmobile__input"
                      />
                    </div>
                    {fieldErrors.mobile && <p className="autherror">{fieldErrors.mobile}</p>}
                  </div>

                  <fieldset className="authgender">
                    <legend className="authlabel">Gender</legend>
                    {(["male", "female", "other"] as const).map((g) => (
                      <label key={g} className="authradio">
                        <input
                          type="radio"
                          name="gender"
                          checked={gender === g}
                          onChange={() => setGender(g)}
                        />
                        {g[0].toUpperCase() + g.slice(1)}
                      </label>
                    ))}
                  </fieldset>

                  {fieldErrors.non_field && <p className="autherror">{fieldErrors.non_field}</p>}

                  <button type="submit" disabled={submitting} className="btn btn--primary authsubmit">
                    {submitting ? "Creating account…" : "Register"}
                  </button>
                </form>

                <p className="authswitch">
                  Already a Customer? <Link to="/login">Login</Link>
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>

      {conflictMessage && (
        <div className="authtoast" role="alert">
          {conflictMessage}
        </div>
      )}

      <Footer />
    </div>
  );
}
