import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Rocket, Database, Settings, LogOut, Server, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';

const SidebarItem = ({ to, icon: Icon, label, active }) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
      active 
        ? "bg-primary text-primary-foreground" 
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </Link>
);

export const Layout = ({ children }) => {
  const location = useLocation();
  const logout = useAuthStore(state => state.logout);
  const resetAppStore = useAppStore(state => state.resetStore);
  const { inventory, target, systemSettings } = useAppStore();

  useEffect(() => {
    if (systemSettings?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [systemSettings?.theme]);

  const handleLogout = () => {
    resetAppStore();
    logout();
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg text-primary-foreground">
            <Server size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">vSphere Nexus</h1>
            <p className="text-xs text-muted-foreground mt-1">vSphere Manager</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 py-4">
          <SidebarItem 
            to="/" 
            icon={LayoutDashboard} 
            label="仪表盘" 
            active={location.pathname === '/'} 
          />
          <SidebarItem 
            to="/deploy" 
            icon={Rocket} 
            label="批量部署" 
            active={location.pathname === '/deploy'} 
          />
          <SidebarItem 
            to="/inventory" 
            icon={Database} 
            label="资源管理" 
            active={location.pathname === '/inventory'} 
          />
          <SidebarItem 
            to="/jobs" 
            icon={Activity} 
            label="任务监控" 
            active={location.pathname === '/jobs'} 
          />
          <SidebarItem 
            to="/settings" 
            icon={Settings} 
            label="设置" 
            active={location.pathname === '/settings'} 
          />
        </nav>

        {/* Target Info */}
        {inventory && (
          <div className="px-4 py-4 border-t">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">当前连接</p>
              <p className="text-sm font-medium truncate mt-1">{target.host}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">已连接</span>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-t">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b bg-card flex items-center px-8 justify-between">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {location.pathname === '/' && '仪表盘'}
              {location.pathname === '/deploy' && '批量部署'}
              {location.pathname === '/inventory' && '资源管理'}
              {location.pathname === '/jobs' && '任务监控'}
              {location.pathname === '/settings' && '系统设置'}
            </h2>
            {inventory && (
               <p className="text-xs text-muted-foreground">
                 已连接到: <span className="font-medium text-primary">{target.host}</span> ({target.platform})
               </p>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 bg-muted/30">
          {children}
        </div>
      </main>
    </div>
  );
};
