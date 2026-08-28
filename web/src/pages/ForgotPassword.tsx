import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../landing/components/Nav.jsx";
import Footer from "../landing/components/Footer.jsx";
import { apiJson, ApiError, errorDetail } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { PasswordField } from "../components/PasswordField";

const RESEND_COOLDOWN_SECONDS = 30;

type Step = "mobile" | "otp" | "reset";

// Step lives in component state, not the URL — step "reset" is only reachable via a real server token.
export function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword: submitReset } = useAuth();

  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const OTP_LENGTH = 6; // must match accounts/models.py PasswordResetOTP.CODE_LENGTH
  const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(""));
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function requestOtp(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiJson("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ mobile }),
      });
      setDigits(["", "", "", ""]);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep("otp");
    } catch (err) {
      setError(errorDetail(err) ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < 3) boxRefs.current[index + 1]?.focus();
  }

  function onDigitKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      boxRefs.current[index - 1]?.focus();
    }
  }

  function onDigitPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    boxRefs.current[Math.min(pasted.length, 3)]?.focus();
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiJson<{ reset_token: string }>("/api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ mobile, code: digits.join("") }),
      });
      setResetToken(data.reset_token);
      setStep("reset");
    } catch (err) {
      const body = (err as { body?: { restart?: boolean; detail?: string } }).body;
      if (body?.restart) {
        setError("Too many wrong attempts. Please request a new OTP.");
        setStep("mobile");
      } else {
        setError(body?.detail ?? "Incorrect OTP.");
        setDigits(["", "", "", ""]);
        boxRefs.current[0]?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await submitReset(mobile, resetToken, password, confirmPassword);
      navigate("/");
    } catch (err) {
      // Only a dead token sends the user back to step 1 — a weak-password rejection stays on this step.
      const body = err instanceof ApiError ? (err.body as Record<string, unknown> | null) : null;
      const fieldError = [body?.password, body?.confirm_password, body?.non_field_errors]
        .flat()
        .find((m): m is string => typeof m === "string");
      if (fieldError) {
        setError(fieldError);
      } else {
        setError("That reset link has expired. Please start again.");
        setStep("mobile");
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
                  <span className="authtab authtab--active">Reset Password</span>
                </div>

                {step === "mobile" && (
                  <form onSubmit={requestOtp} className="authform">
                    <p className="authhint">Enter your registered mobile number to receive an OTP.</p>
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
                    </div>
                    {error && <p className="autherror">{error}</p>}
                    <button type="submit" disabled={submitting} className="btn btn--primary authsubmit">
                      {submitting ? "Sending…" : "Send OTP"}
                    </button>
                  </form>
                )}

                {step === "otp" && (
                  <form onSubmit={verifyOtp} className="authform">
                    <p className="authhint">Enter the {OTP_LENGTH}-digit code sent to +91 {mobile}.</p>
                    <div className="otpboxes">
                      {digits.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            boxRefs.current[i] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          className="otpbox"
                          value={d}
                          onChange={(e) => onDigitChange(i, e.target.value)}
                          onKeyDown={(e) => onDigitKeyDown(i, e)}
                          onPaste={onDigitPaste}
                        />
                      ))}
                    </div>
                    {error && <p className="autherror">{error}</p>}
                    <button
                      type="submit"
                      disabled={submitting || digits.some((d) => !d)}
                      className="btn btn--primary authsubmit"
                    >
                      {submitting ? "Verifying…" : "Verify OTP"}
                    </button>
                    <button
                      type="button"
                      disabled={cooldown > 0}
                      onClick={() => requestOtp()}
                      className="authresend"
                    >
                      {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                    </button>
                  </form>
                )}

                {step === "reset" && (
                  <form onSubmit={resetPassword} className="authform">
                    <PasswordField
                      id="reset-password"
                      placeholder="New Password"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                    />
                    <PasswordField
                      id="reset-confirm-password"
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                    />
                    {error && <p className="autherror">{error}</p>}
                    <button type="submit" disabled={submitting} className="btn btn--primary authsubmit">
                      {submitting ? "Saving…" : "Reset Password"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
