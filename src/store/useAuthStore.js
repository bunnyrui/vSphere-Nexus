import { create } from 'zustand';
import { fetchJson } from '../lib/utils';

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
      
      const { response, data: sessionData } = await fetchJson('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
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
