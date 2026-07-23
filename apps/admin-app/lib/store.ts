import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: { id: string; name: string; role: string } | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAuth: (token, user) => set({ accessToken: token, user }),
  logout: () => set({ accessToken: null, user: null }),
}));
