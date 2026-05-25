import { create } from 'zustand';

const tokenKey = 'nexus_token';

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(tokenKey) || null,
  isAuthenticated: false,
  isInitialized: false,
  
  setToken: (token) => {
    if (token) {
      localStorage.setItem(tokenKey, token);
    } else {
      localStorage.removeItem(tokenKey);
    }
    set({ token, isAuthenticated: !!token });
  },
  
  logout: () => {
    localStorage.removeItem(tokenKey);
    set({ token: null, isAuthenticated: false });
  },

  checkAuthStatus: async (onSessionHydrated) => {
    try {
      const token = localStorage.getItem(tokenKey);
      if (!token) {
        set({ isAuthenticated: false, isInitialized: true });
        return;
      }
      
      const sessionResponse = await fetch('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        set({ isAuthenticated: true, isInitialized: true });
        if (onSessionHydrated) onSessionHydrated(sessionData);
      } else {
        localStorage.removeItem(tokenKey);
        set({ token: null, isAuthenticated: false, isInitialized: true });
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      set({ isAuthenticated: false, isInitialized: true });
    }
  }
}));
