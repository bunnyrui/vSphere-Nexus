import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Server, Database, Activity, Rocket, RefreshCcw } from 'lucide-react';
import { Layout } from './components/Layout';
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';
import { cn } from './lib/utils';

import { DeploymentPage } from './features/deployment/DeploymentPage';
import { JobsPage } from './features/jobs/JobsPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { SettingsPage } from './features/settings/SettingsPage';

// Temporary placeholders
const StatCard = ({ title, value, subtext, icon: Icon, colorClass }) => (
  <div className="bg-card p-6 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className={cn("text-3xl font-bold mt-2", colorClass)}>{value}</h3>
        {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      </div>
      <div className={cn("p-2 rounded-lg bg-secondary", colorClass?.replace('text-', 'text-opacity-20 bg-'))}>
        <Icon size={20} className={colorClass} />
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const { inventory, refreshInventory } = useAppStore();
  const token = useAuthStore(state => state.token);
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshInventory(token);
    setRefreshing(false);
  };
  
  if (!inventory) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground bg-card rounded-xl border border-dashed">
        <Server size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">未连接 vSphere</p>
        <p className="text-sm">请先确保已成功登录并连接到环境</p>
      </div>
    );
  }

  const vms = inventory.inventoryItems?.filter(i => i.kind === 'VM') || [];
  const runningVms = vms.filter(vm => vm.powerState === 'poweredOn');
  
  const totalCapacity = inventory.datastores?.reduce((acc, ds) => acc + (ds.capacity || 0), 0) || 0;
  const totalFree = inventory.datastores?.reduce((acc, ds) => acc + (ds.freeSpace || 0), 0) || 0;
  const storageUsedPercent = totalCapacity > 0 ? Math.round(((totalCapacity - totalFree) / totalCapacity) * 100) : 0;
  const storageUsedGB = Math.round((totalCapacity - totalFree) / 1024 / 1024 / 1024);
  const totalCapacityGB = Math.round(totalCapacity / 1024 / 1024 / 1024);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="总虚拟机数" 
          value={vms.length} 
          subtext={`包含 ${inventory.inventoryItems?.filter(i => i.kind === 'Template').length || 0} 个模板`} 
          icon={Database} 
          colorClass="text-blue-500"
        />
        <StatCard 
          title="运行中" 
          value={runningVms.length} 
          subtext={`健康率 ${vms.length > 0 ? Math.round((runningVms.length / vms.length) * 100) : 0}%`} 
          icon={Activity} 
          colorClass="text-green-500"
        />
        <StatCard 
          title="存储已用" 
          value={`${storageUsedPercent}%`} 
          subtext={`已用 ${storageUsedGB}GB / 共 ${totalCapacityGB}GB`} 
          icon={Server} 
          colorClass="text-orange-500"
        />
      </div>

      <div className="bg-card rounded-xl border shadow-sm">
        <div className="p-6 border-b flex justify-between items-center">
          <h3 className="font-semibold text-lg">环境概览</h3>
          <div className="flex items-center gap-3">
             <button 
               onClick={handleRefresh}
               disabled={refreshing}
               className={cn(
                 "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all border",
                 refreshing ? "bg-muted text-muted-foreground" : "hover:bg-secondary text-primary border-primary/20"
               )}
             >
               <RefreshCcw size={14} className={cn(refreshing && "animate-spin")} />
               {refreshing ? '同步中...' : '刷新状态'}
             </button>
             <span className="text-xs bg-secondary px-2 py-1 rounded-full font-medium">实时数据</span>
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-bold">数据中心</p>
            <p className="text-xl font-semibold">{inventory.datacenters?.length || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-bold">计算节点 (Host)</p>
            <p className="text-xl font-semibold">{inventory.hosts?.length || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-bold">集群 (Cluster)</p>
            <p className="text-xl font-semibold">{inventory.computeTargets?.filter(t => t.kind === 'Cluster').length || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-bold">网络 (PortGroups)</p>
            <p className="text-xl font-semibold">{inventory.networks?.length || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const LoginPage = () => {
  const { isAuthenticated, setToken } = useAuthStore();
  const { target, setTarget, setInventory } = useAppStore();
  const [host, setHost] = React.useState(target.host || '');
  const [platform, setPlatform] = React.useState(target.platform || 'vcenter');
  const [username, setUsername] = React.useState(target.username || '');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          password, 
          host, 
          platform
        })
      });
      if (response.status >= 500) {
        setError(`服务器错误 (${response.status})，请稍后重试`);
        return;
      }
      const data = await response.json();
      if (data.ok) {
        setToken(data.token);
        setTarget({ host, platform, username, password });
        if (data.inventory) setInventory(data.inventory);
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err) {
      setError('连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border shadow-lg space-y-6">
        <div className="text-center">
          <div className="bg-primary w-12 h-12 rounded-lg flex items-center justify-center mx-auto text-primary-foreground mb-4">
            <Server size={28} />
          </div>
          <h1 className="text-2xl font-bold">vSphere Nexus Console</h1>
          <p className="text-muted-foreground text-sm mt-1">使用 vSphere 凭据直接登录</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">平台类型</label>
              <select 
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full px-3 py-2 border rounded-md outline-none"
              >
                <option value="vcenter">vCenter</option>
                <option value="esxi">ESXi</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">地址 (IP/Host)</label>
              <input 
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                className="w-full px-3 py-2 border rounded-md outline-none"
                placeholder="192.168.1.10"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">用户名</label>
            <input 
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-md outline-none"
              placeholder="administrator@vsphere.local"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">密码</label>
            <input 
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded leading-relaxed">{error}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? '正在验证并登录...' : '登录控制台'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isInitialized } = useAuthStore();
  
  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <RefreshCcw size={32} className="text-primary animate-spin" />
      </div>
    );
  }
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
};

export default function App() {
  const checkAuthStatus = useAuthStore(state => state.checkAuthStatus);
  const { setTarget, setInventory } = useAppStore();

  useEffect(() => {
    checkAuthStatus((sessionData) => {
      if (sessionData.target) setTarget(sessionData.target);
      if (sessionData.inventory) setInventory(sessionData.inventory);
    });
  }, [checkAuthStatus, setTarget, setInventory]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/deploy" element={
          <ProtectedRoute>
            <DeploymentPage />
          </ProtectedRoute>
        } />

        <Route path="/inventory" element={
          <ProtectedRoute>
            <InventoryPage />
          </ProtectedRoute>
        } />

        <Route path="/jobs" element={
          <ProtectedRoute>
            <JobsPage />
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
