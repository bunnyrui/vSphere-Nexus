import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import { 
  Settings, 
  Server, 
  Monitor, 
  Terminal, 
  Shield, 
  Clock, 
  Save,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
  Layout
} from 'lucide-react';

export const SettingsPage = () => {
  const { 
    target, 
    deploymentConfig, 
    systemSettings, 
    setTarget, 
    setDeploymentConfig, 
    setSystemSettings 
  } = useAppStore();
  
  const token = useAuthStore(state => state.token);
  const logout = useAuthStore(state => state.logout);
  
  const [localSettings, setLocalSettings] = useState(systemSettings);
  const [localDeployment, setLocalDeployment] = useState(deploymentConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error'

  useEffect(() => {
    // Fetch real-time health/system info from backend
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          setSystemSettings({
            ovftoolPath: data.ovftoolPath,
            ovftoolAvailable: data.ovftoolAvailable
          });
          setLocalSettings(prev => ({
            ...prev,
            ovftoolPath: data.ovftoolPath,
            ovftoolAvailable: data.ovftoolAvailable
          }));
        }
      } catch (error) {
        console.error('Failed to fetch system health:', error);
      }
    };
    fetchHealth();
  }, [setSystemSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      setSystemSettings(localSettings);
      setDeploymentConfig(localDeployment);
      
      // Simulate save delay
      await new Promise(r => setTimeout(r, 500));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const Section = ({ title, icon: Icon, children }) => (
    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-6 space-y-6">
        {children}
      </div>
    </div>
  );

  const InputGroup = ({ label, description, children }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
      <div className="space-y-1">
        <label className="text-sm font-bold text-slate-700">{label}</label>
        {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
      </div>
      <div className="md:col-span-2">
        {children}
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">系统设置</h2>
          <p className="text-muted-foreground mt-1 text-sm">管理 vSphere 连接、部署预设及系统首选项</p>
        </div>
        
        <div className="flex items-center gap-3">
          {saveStatus === 'success' && (
            <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium animate-in fade-in slide-in-from-right-4">
              <CheckCircle2 size={16} /> 已保存
            </span>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all",
              isSaving ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:shadow-primary/30 active:scale-95"
            )}
          >
            <Save size={18} />
            {isSaving ? '保存中...' : '保存更改'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* vSphere Connection */}
        <Section title="vSphere 连接" icon={Server}>
          <InputGroup label="当前连接" description="正在使用的 vSphere 或 ESXi 主机地址">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-dashed">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-600 rounded-full">
                  <Shield size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">{target.host || '未连接'}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{target.username}</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors"
              >
                断开并退出
              </button>
            </div>
          </InputGroup>

          <InputGroup label="默认磁盘模式" description="批量部署时默认使用的磁盘置备类型">
            <div className="grid grid-cols-3 gap-2">
              {['thin', 'thick', 'eagerZeroed'].map(mode => (
                <button 
                  key={mode}
                  onClick={() => setTarget({ diskMode: mode })}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                    target.diskMode === mode ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                  )}
                >
                  {mode === 'thin' ? '精简置备' : mode === 'thick' ? '厚置备' : '厚置备置零'}
                </button>
              ))}
            </div>
          </InputGroup>
        </Section>

        {/* Deployment Presets */}
        <Section title="部署预设" icon={Layout}>
          <InputGroup label="并发任务数" description="执行批量任务时允许的最大并行数量">
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="1" 
                max="20" 
                className="flex-1 accent-primary"
                value={localDeployment.concurrency}
                onChange={e => setLocalDeployment(prev => ({ ...prev, concurrency: parseInt(e.target.value) }))}
              />
              <span className="w-12 text-center font-bold text-primary bg-primary/10 py-1 rounded border border-primary/20">
                {localDeployment.concurrency}
              </span>
            </div>
          </InputGroup>

          <InputGroup label="自动刷新频率" description="资源管理页面背景自动同步的时间间隔">
            <select 
              className="w-full p-2.5 bg-muted/30 border rounded-lg text-sm outline-none"
              value={localSettings.autoRefreshInterval}
              onChange={e => setLocalSettings(prev => ({ ...prev, autoRefreshInterval: parseInt(e.target.value) }))}
            >
              <option value={3000}>3 秒 (极速)</option>
              <option value={5000}>5 秒 (推荐)</option>
              <option value={10000}>10 秒 (节省资源)</option>
              <option value={30000}>30 秒</option>
              <option value={0}>禁用自动刷新</option>
            </select>
          </InputGroup>
        </Section>

        {/* System & Tools */}
        <Section title="系统与组件" icon={Terminal}>
          <InputGroup label="VMware OVF Tool" description="后端用于执行导出和部署的核心命令行工具">
            <div className="space-y-3">
              <div className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                systemSettings.ovftoolAvailable ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"
              )}>
                {systemSettings.ovftoolAvailable ? 
                  <CheckCircle2 size={18} className="text-green-500 shrink-0" /> : 
                  <AlertCircle size={18} className="text-red-500 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">
                    {systemSettings.ovftoolPath}
                  </p>
                  <p className={cn("text-[10px] font-medium", systemSettings.ovftoolAvailable ? "text-green-600" : "text-red-600")}>
                    {systemSettings.ovftoolAvailable ? '组件已就绪' : '未找到组件，请检查服务器配置'}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                提示：vSphere Nexus 会自动检测 bin 目录或系统 PATH 下的 ovftool。
              </p>
            </div>
          </InputGroup>

          <InputGroup label="界面主题" description="切换应用程序的视觉风格">
            <div className="flex p-1 bg-muted/50 rounded-xl border w-fit">
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, theme: 'light' }))}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  localSettings.theme === 'light' ? "bg-white shadow text-primary" : "text-muted-foreground"
                )}
              >
                <Sun size={14} /> 亮色模式
              </button>
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, theme: 'dark' }))}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  localSettings.theme === 'dark' ? "bg-white shadow text-primary" : "text-muted-foreground"
                )}
              >
                <Moon size={14} /> 暗色模式
              </button>
            </div>
          </InputGroup>
        </Section>
      </div>
    </div>
  );
};
