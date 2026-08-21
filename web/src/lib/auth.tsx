import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, apiJson, setAccessToken } from "./api";
import { AuthContext } from "./auth-context";
import type { User } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to turn the HttpOnly refresh cookie into a session, so a page
  // reload doesn't log the user out.
  useEffect(() => {
    (async () => {
      const res = await apiFetch("/api/auth/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.access);
        const me = await apiFetch("/api/auth/me");
        if (me.ok) setUser(await me.json());
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const data = await apiJson<{ access: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.access);
    setUser(data.user);
  }

  async function register(email: string, password: string) {
    const data = await apiJson<{ access: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.access);
    setUser(data.user);
  }

  // `credential` is the ID token from Google Identity Services. The server verifies
  // it — we never trust it client-side.
  async function loginWithGoogle(credential: string) {
    const data = await apiJson<{ access: string; user: User }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    setAccessToken(data.access);
    setUser(data.user);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
