import { create } from 'zustand';

const tokenKey = 'nexus_token';

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(tokenKey) || null,
  isAuthenticated: false, // Start as false, verify in checkAuthStatus
  authEnabled: false,
  isInitialized: false, // New flag to track if we've checked auth once
  
  setToken: (token) => {
    if (token) {
      localStorage.setItem(tokenKey, token);
    } else {
      localStorage.removeItem(tokenKey);
    }
    set({ token, isAuthenticated: !!token });
  },
  
  setAuthEnabled: (enabled) => set({ authEnabled: enabled }),
  
  logout: () => {
    localStorage.removeItem(tokenKey);
    set({ token: null, isAuthenticated: false });
  },

  checkAuthStatus: async (onSessionHydrated) => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      set({ authEnabled: data.enabled });
      
      const token = localStorage.getItem(tokenKey);
      if (!token) {
        set({ isAuthenticated: false, isInitialized: true });
        return;
      }
      
      // Fetch session info
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
