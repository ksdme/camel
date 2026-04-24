import { create } from "zustand";
import { ApiError } from "@/lib/api";
import * as AuthApi from "@/lib/auth-api";

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  signOut: () => Promise<void>;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: "idle",
  hydrated: false,

  async hydrate() {
    if (get().status === "loading") return;
    set({ status: "loading" });
    try {
      const user = await AuthApi.me();
      set({ user, status: "authenticated", hydrated: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ user: null, status: "unauthenticated", hydrated: true });
        return;
      }
      set({ status: "unauthenticated", hydrated: true });
    }
  },

  setUser(user) {
    set({ user, status: user ? "authenticated" : "unauthenticated", hydrated: true });
  },

  async signOut() {
    try {
      await AuthApi.logout();
    } catch {
      // best-effort; the server cookie clears regardless
    }
    set({ user: null, status: "unauthenticated", hydrated: true });
  },

  clear() {
    set({ user: null, status: "unauthenticated", hydrated: true });
  },
}));
