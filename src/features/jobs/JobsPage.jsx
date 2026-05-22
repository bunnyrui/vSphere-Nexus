import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Terminal, 
  RefreshCcw,
  Play,
  History,
  Info,
  X,
  RotateCcw,
  Trash2
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const styles = {
    running: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    queued: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    succeeded: "bg-green-500/10 text-green-600 border-green-500/20",
    failed: "bg-red-500/10 text-red-600 border-red-500/20",
    cancelled: "bg-muted text-muted-foreground border-muted",
  };
  
  const labels = {
    running: "执行中",
    queued: "队列中",
    succeeded: "已完成",
    failed: "已失败",
    cancelled: "已取消",
  };

  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded font-bold border uppercase tracking-wider", styles[status] || styles.queued)}>
      {labels[status] || status}
    </span>
  );
};

export const JobsPage = () => {
  const { jobs, activeJobId, setActiveJobId, refreshJobs, refreshInventory } = useAppStore();
  const token = useAuthStore(state => state.token);
  const [logs, setLogs] = React.useState([]);
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);
  const seenLogsRef = useRef(new Set());

  const activeJob = jobs.find(j => j.id === activeJobId) || jobs[0];

  useEffect(() => {
    refreshJobs(token);
    const interval = setInterval(() => refreshJobs(token), 5000);
    return () => clearInterval(interval);
  }, [refreshJobs, token]);

  useEffect(() => {
    if (!activeJob?.id) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setLogs([]);
    seenLogsRef.current.clear();
    
    // Add cache buster and explicit token for reliable connection
    const url = `/api/jobs/${activeJob.id}/events?t=${Date.now()}${token ? `&token=${token}` : ''}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('log', (e) => {
      try {
        const log = JSON.parse(e.data);
        const key = `${log.at}:${log.message}`;
        if (seenLogsRef.current.has(key)) return;
        seenLogsRef.current.add(key);
        setLogs(prev => [...prev, log]);
      } catch (err) {
        console.error('Failed to parse log:', err);
      }
    });

    es.addEventListener('status', (e) => {
      try {
        const statusData = JSON.parse(e.data);
        refreshJobs(token);
        
        // Immediate sync on final states
        if (statusData.status === 'succeeded' || statusData.status === 'failed') {
          refreshInventory(token);
        }
      } catch (err) {}
    });

    es.addEventListener('close', () => {
      // Final hard sync
      refreshJobs(token);
      refreshInventory(token);
      es.close();
    });

    es.onerror = () => {
      // If error occurs, try to sync jobs anyway
      refreshJobs(token);
    };

    return () => es.close();
  }, [activeJob?.id, token, refreshJobs, refreshInventory]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCancel = async () => {
    if (!activeJob || !['running', 'queued'].includes(activeJob.status)) return;
    if (!window.confirm('确定要取消当前正在运行的任务吗？')) return;

    try {
      const response = await fetch(`/api/jobs/${activeJob.id}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        refreshJobs(token);
      } else {
        alert('取消任务失败');
      }
    } catch (err) {
      alert('连接服务器失败');
    }
  };

  const handleRetry = async () => {
    if (!activeJob || activeJob.status !== 'failed') return;
    if (!window.confirm('确定要重试失败的子任务吗？')) return;

    try {
      const response = await fetch(`/api/jobs/${activeJob.id}/retry`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setActiveJobId(data.job.id);
        refreshJobs(token);
      } else {
        alert('重试任务失败');
      }
    } catch (err) {
      alert('连接服务器失败');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要永久删除此任务记录吗？')) return;

    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        refreshJobs(token);
        if (activeJobId === id) {
           setActiveJobId(null);
        }
      } else {
        alert('删除失败');
      }
    } catch (err) {
      alert('连接服务器失败');
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground bg-card rounded-xl border border-dashed">
        <Activity size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">暂无部署任务</p>
        <p className="text-sm">前往 "批量部署" 开始您的第一个任务</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-6">
      {/* Top: Task Summary Header */}
      <div className="bg-card border rounded-xl p-6 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="bg-primary/10 p-3 rounded-lg text-primary">
            <Activity size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight">任务 #{activeJob?.id.slice(0, 8)}</h2>
              <StatusBadge status={activeJob?.status} />
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Clock size={14} /> {new Date(activeJob?.createdAt).toLocaleString()}</span>
              <span className="w-px h-3 bg-border" />
              <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-500" /> 已完成 {activeJob?.progress.completed}</span>
              <span className="flex items-center gap-1.5"><XCircle size={14} className="text-red-500" /> 已失败 {activeJob?.progress.failed}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 border-r pr-6 border-border">
            {['running', 'queued'].includes(activeJob?.status) && (
              <button 
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-all"
              >
                <X size={16} /> 取消任务
              </button>
            )}
            {activeJob?.status === 'failed' && (
              <button 
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:shadow-lg shadow-blue-500/20 transition-all"
              >
                <RotateCcw size={16} /> 重试失败项
              </button>
            )}
          </div>

          <div className="text-right pl-2">
             <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">总体进度</p>
             <div className="flex items-center gap-3">
               <span className="text-2xl font-black text-primary">{activeJob?.progress?.total > 0 ? Math.round((activeJob.progress.completed / activeJob.progress.total) * 100) : 0}%</span>
               <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-primary transition-all duration-500" 
                   style={{ width: `${activeJob?.progress?.total > 0 ? (activeJob.progress.completed / activeJob.progress.total) * 100 : 0}%` }}
                 />
               </div>
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left: Job History (Professional List) */}
        <div className="w-80 bg-card border rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
            <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <History size={14} /> 任务历史
            </h3>
            <button onClick={() => refreshJobs(token)} className="text-muted-foreground hover:text-primary transition-colors">
              <RefreshCcw size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => setActiveJobId(job.id)}
                className={cn(
                  "w-full p-4 text-left hover:bg-secondary/50 transition-all flex flex-col gap-1.5 relative group",
                  activeJobId === job.id ? "bg-primary/5 active-job-indicator" : ""
                )}
              >
                {activeJobId === job.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-muted-foreground">ID: {job.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(job.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all"
                      title="删除记录"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold truncate">部署 {job.progress.total} 台虚拟机</p>
                <p className="text-[10px] text-muted-foreground">{new Date(job.createdAt).toLocaleTimeString()}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Integrated Log Viewer */}
        <div className="flex-1 bg-white border rounded-xl overflow-hidden flex flex-col shadow-sm relative">
          <div className="px-4 py-3 border-b bg-muted/20 flex justify-between items-center">
             <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
               <Terminal size={14} className="text-primary" /> 执行日志 (Log Output)
             </div>
             {activeJob?.status === 'running' && (
               <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 animate-pulse text-[10px] font-bold">
                 <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" /> 实时同步中
               </div>
             )}
          </div>
          
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 font-mono text-xs selection:bg-primary/20">
            {logs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 opacity-50">
                <Info size={32} />
                <p>等待日志输出...</p>
              </div>
            )}
            <div className="space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className={cn(
                  "flex gap-4 py-0.5 group rounded px-2 transition-colors",
                  log.stream === 'stderr' 
                    ? "text-red-600 bg-red-50/50 hover:bg-red-100/50" 
                    : "text-slate-700 hover:bg-slate-100"
                )}>
                  <span className="text-slate-300 shrink-0 w-14 select-none">
                    {new Date(log.at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="break-all whitespace-pre-wrap leading-relaxed">{log.message}</span>
                </div>
              ))}
            </div>
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
