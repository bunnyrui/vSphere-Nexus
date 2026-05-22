import { create } from 'zustand';

const STORAGE_KEY = 'nexus_config';

const defaultTarget = {
  platform: 'vcenter',
  host: '',
  username: '',
  password: '',
  inventoryPath: '',
  datastore: '',
  folder: '',
  diskMode: 'thin',
  powerOn: true
};

const defaultDeploymentConfig = {
  naming: {
    prefix: 'VM-Prod-',
    start: '001',
    count: 1
  },
  concurrency: 5,
  networkMappings: []
};

const defaultSystemSettings = {
  theme: 'light',
  ovftoolPath: 'ovftool',
  ovftoolAvailable: false,
  autoRefreshInterval: 5000
};

const loadInitialState = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { 
      target: { ...defaultTarget, ...saved.target, password: '' },
      deploymentConfig: { ...defaultDeploymentConfig, ...saved.deploymentConfig },
      systemSettings: { ...defaultSystemSettings, ...saved.systemSettings }
    };
  } catch {
    return { 
      target: defaultTarget, 
      deploymentConfig: defaultDeploymentConfig,
      systemSettings: defaultSystemSettings
    };
  }
};

const initialState = loadInitialState();

function persistToStorage(state) {
  const { password, ...safeTarget } = state.target;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    target: safeTarget,
    deploymentConfig: state.deploymentConfig,
    systemSettings: state.systemSettings
  }));
}

export const useAppStore = create((set, get) => ({
  target: initialState.target,
  deploymentConfig: initialState.deploymentConfig,
  systemSettings: initialState.systemSettings,
  inventory: null,
  jobs: [],
  activeJobId: null,
  isProbing: false,
  
  setTarget: (updates) => {
    const newTarget = { ...get().target, ...updates };
    set({ target: newTarget });
    persistToStorage(get());
  },

  setDeploymentConfig: (updates) => {
    const currentConfig = get().deploymentConfig;
    const newConfig = { 
      ...currentConfig, 
      ...updates,
      naming: updates.naming ? { ...currentConfig.naming, ...updates.naming } : currentConfig.naming
    };
    set({ deploymentConfig: newConfig });
    persistToStorage(get());
  },

  setSystemSettings: (updates) => {
    const newSettings = { ...get().systemSettings, ...updates };
    set({ systemSettings: newSettings });
    persistToStorage(get());
  },
  
  setInventory: (inventory) => set({ inventory }),
  
  setJobs: (jobs) => {
    set({ jobs });
    if (!get().activeJobId && jobs.length > 0) {
      set({ activeJobId: jobs[0].id });
    }
  },
  
  setActiveJobId: (id) => set({ activeJobId: id }),
  
  setProbing: (probing) => set({ isProbing: probing }),

  refreshInventory: async (token) => {
    const { target } = get();
    if (!target.host) return;
    
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch('/api/targets/discover', {
        method: 'POST',
        headers,
        body: JSON.stringify({ target })
      });
      
      if (response.status === 401) {
         // Auto logout on session expiry
         window.location.reload(); 
         return;
      }

      const data = await response.json();
      if (response.ok) {
        set({ inventory: data.inventory });
      }
    } catch (error) {
      console.error('Background inventory refresh failed:', error);
    }
  },

  refreshJobs: async (token) => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch('/api/jobs', { headers });
      
      if (response.status === 401) {
         window.location.reload();
         return;
      }

      if (response.ok) {
        const data = await response.json();
        set({ jobs: data.jobs || [] });
        if (!get().activeJobId && data.jobs?.[0]) {
          set({ activeJobId: data.jobs[0].id });
        }
      }
    } catch (error) {
      console.error('Failed to refresh jobs:', error);
    }
  },

  discoverTarget: async (token) => {
    const { target } = get();
    set({ isProbing: true });
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch('/api/targets/discover', {
        method: 'POST',
        headers,
        body: JSON.stringify({ target })
      });
      
      const data = await response.json();
      if (response.ok) {
        set({ inventory: data.inventory });
        return { ok: true, message: data.message };
      } else {
        return { ok: false, message: data.error || '连接失败' };
      }
    } catch (error) {
      return { ok: false, message: error.message };
    } finally {
      set({ isProbing: false });
    }
  },

  resetStore: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ 
      inventory: null, 
      jobs: [], 
      activeJobId: null,
      target: { ...defaultTarget, password: '' } 
    });
  }
}));
