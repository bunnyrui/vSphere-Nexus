import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Clock, 
  Play, 
  Trash2, 
  X, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  History,
  Database,
  Cpu,
  Save
} from 'lucide-react';
import { cn, fetchJson } from '../../lib/utils';
import { useAuthStore } from '../../store/useAuthStore';

export const SnapshotPanel = ({ vm, onClose }) => {
  const token = useAuthStore(state => state.token);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // New snapshot form
  const [newName, setNewName] = useState(`Snapshot-${new Date().toLocaleDateString()}`);
  const [newDesc, setNewDesc] = useState('Created via vSphere Nexus');
  const [withMemory, setWithMemory] = useState(false);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const { response, data } = await fetchJson(`/api/vms/${vm.id}/snapshots`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSnapshots(data.snapshots || []);
      } else {
        setError(data.error || '获取快照失败');
      }
    } catch (err) {
      setError(err.message || '连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vm?.id) fetchSnapshots();
  }, [vm?.id]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName) return;
    setSubmitting(true);
    try {
      const { response, data } = await fetchJson(`/api/vms/${vm.id}/snapshots`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newName, description: newDesc, memory: withMemory })
      });
      if (response.ok) {
        setNewName(`Snapshot-${new Date().toLocaleDateString()}`);
        await fetchSnapshots();
      } else {
        alert(data.error || '创建快照失败');
      }
    } catch (err) {
      alert(err.message || '连接失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevert = async (sid, sname) => {
    if (!window.confirm(`确定要将虚拟机恢复到快照 "${sname}" 吗？当前未保存的状态将丢失。`)) return;
    setSubmitting(true);
    try {
      const { response, data } = await fetchJson(`/api/snapshots/${sid}/revert`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert('快照回滚指令已发出');
      } else {
        alert(data.error || '回滚失败');
      }
    } catch (err) {
      alert(err.message || '连接失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sid, sname) => {
    if (!window.confirm(`确定要彻底删除快照 "${sname}" 吗？此操作将整合磁盘数据，无法恢复。`)) return;
    setSubmitting(true);
    try {
      const { response, data } = await fetchJson(`/api/snapshots/${sid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        await fetchSnapshots();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (err) {
      alert(err.message || '连接失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className="relative w-full max-w-md bg-white h-screen shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg text-primary-foreground shadow-lg shadow-primary/20">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight truncate max-w-[200px]">{vm.name}</h3>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Snapshot Manager</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Snapshot List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
               <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <History size={14} /> 快照历史
               </h4>
               <button onClick={fetchSnapshots} className="text-primary hover:underline text-[10px] font-bold">刷新</button>
            </div>
            
            {loading ? (
              <div className="py-12 flex justify-center italic text-muted-foreground text-sm">正在读取快照树...</div>
            ) : snapshots.length === 0 ? (
              <div className="py-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                 <Camera size={32} className="mb-2 opacity-20" />
                 <p className="text-xs">该虚拟机暂无快照</p>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map(s => (
                  <div key={s.id} className="group border rounded-xl p-4 bg-white hover:border-primary/30 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-bold text-sm text-slate-800">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} /> {new Date(s.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={() => handleRevert(s.id, s.name)}
                           disabled={submitting}
                           className="p-1.5 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white transition-colors"
                           title="恢复到此快照"
                         >
                           <Play size={12} fill="currentColor" />
                         </button>
                         <button 
                           onClick={() => handleDelete(s.id, s.name)}
                           disabled={submitting}
                           className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-500 hover:text-white transition-colors"
                           title="删除快照"
                         >
                           <Trash2 size={12} />
                         </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Form */}
          <div className="pt-6 border-t space-y-4">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
               <Plus size={14} /> 创建新快照
            </h4>
            <form onSubmit={handleCreate} className="space-y-4 bg-secondary/30 p-4 rounded-xl border border-secondary">
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">快照名称</label>
                 <input 
                   type="text" 
                   value={newName}
                   onChange={e => setNewName(e.target.value)}
                   className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
                   placeholder="输入快照名称"
                   required
                 />
               </div>
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">描述 (可选)</label>
                 <textarea 
                   value={newDesc}
                   onChange={e => setNewDesc(e.target.value)}
                   className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 h-16 resize-none"
                   placeholder="备注快照内容..."
                 />
               </div>
               <div className="flex items-center gap-2 py-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 text-primary"
                      checked={withMemory}
                      onChange={e => setWithMemory(e.target.checked)}
                    />
                    <span className="text-xs font-medium text-slate-600 group-hover:text-primary transition-colors">包含虚拟机内存</span>
                  </label>
               </div>
               <button 
                 type="submit"
                 disabled={submitting || !newName}
                 className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
               >
                 {submitting ? '正在提交请求...' : '拍摄快照'}
                 {!submitting && <Camera size={16} />}
               </button>
            </form>
          </div>
        </div>

        {/* Footer Info */}
        <div className="p-4 bg-muted/20 border-t text-[10px] text-muted-foreground text-center">
          快照操作将产生异步任务，详情请查看任务监控。
        </div>
      </div>
    </div>
  );
};
