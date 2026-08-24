import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
  if (existing) return new Promise((res) => existing.addEventListener("load", () => res()));
  return new Promise((res, rej) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => res();
    script.onerror = () => rej(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

export function GoogleButton() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notRegisteredEmail, setNotRegisteredEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (response) => {
            try {
              await loginWithGoogle(response.credential);
              navigate("/");
            } catch (err) {
              const body = err instanceof ApiError ? (err.body as { code?: string; email?: string }) : null;
              if (body?.code === "not_registered" && body.email) {
                setNotRegisteredEmail(body.email);
                setTimeout(() => navigate(`/register?email=${encodeURIComponent(body.email!)}`), 3000);
              } else {
                setError("Google sign-in failed.");
              }
            }
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
        });
      })
      .catch(() => setError("Couldn't load Google sign-in."));

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, navigate]);

  // No client ID configured — keep the UI clean rather than showing a dead button.
  if (!CLIENT_ID) return null;

  return (
    <div className="authoauth">
      <div className="authoauth__divider">
        <span className="authoauth__rule" />
        OR
        <span className="authoauth__rule" />
      </div>
      <div ref={containerRef} className="authoauth__button" />
      {error && <p className="autherror">{error}</p>}
      {notRegisteredEmail && (
        <div className="authtoast" role="alert">
          No account found for {notRegisteredEmail}. Redirecting you to create one…
        </div>
      )}
    </div>
  );
}
