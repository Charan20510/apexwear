import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, apiJson, setAccessToken } from "./api";
import { AuthContext } from "./auth-context";
import type { RegisterPayload, User } from "./types";

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

  async function login(identifier: string, password: string) {
    const data = await apiJson<{ access: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    setAccessToken(data.access);
    setUser(data.user);
  }

  async function register(payload: RegisterPayload) {
    const data = await apiJson<{ access: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
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

  // Step 3 of forgot-password: the server verifies the reset token (scoped to this
  // mobile number) and rotates the password, then issues a session exactly like
  // login()/register() do.
  async function resetPassword(mobile: string, resetToken: string, password: string, confirmPassword: string) {
    const data = await apiJson<{ access: string; user: User }>("/api/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({
        mobile,
        reset_token: resetToken,
        password,
        confirm_password: confirmPassword,
      }),
    });
    setAccessToken(data.access);
    setUser(data.user);
  }

  async function updateProfile(payload: Partial<Omit<User, "id" | "email">>) {
    const data = await apiJson<User>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setUser(data);
  }

  async function deleteAccount() {
    await apiJson("/api/auth/me", { method: "DELETE" });
    setAccessToken(null);
    setUser(null);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        resetPassword,
        updateProfile,
        deleteAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
