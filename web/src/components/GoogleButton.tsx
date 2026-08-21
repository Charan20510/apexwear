import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

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
            } catch {
              setError("Google sign-in failed.");
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className="h-px bg-neutral-200 flex-1" />
        OR
        <span className="h-px bg-neutral-200 flex-1" />
      </div>
      <div ref={containerRef} className="flex justify-center" />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
