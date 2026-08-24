import { createContext, useContext } from "react";
import type { RegisterPayload, User } from "./types";

// The context and its hook live apart from AuthProvider so that auth.tsx exports
// only components — otherwise React Fast Refresh can't hot-reload that module.
export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  resetPassword: (mobile: string, resetToken: string, password: string, confirmPassword: string) => Promise<void>;
  updateProfile: (payload: Partial<Omit<User, "id" | "email">>) => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
