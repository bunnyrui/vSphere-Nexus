import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import { SnapshotPanel } from './SnapshotPanel';
import { VMConsole } from '../../components/console/VMConsole';
import { 
  Search, 
  RefreshCcw, 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  Camera, 
  MoreHorizontal,
  ChevronRight,
  Database,
  Cpu,
  Zap,
  Activity,
  Box,
  LayoutGrid,
  List as ListIcon,
  ShieldCheck,
  HardDrive,
  Monitor,
  Download,
  Edit3,
  Settings,
  X,
  CheckCircle2
} from 'lucide-react';

const PowerStatus = ({ state }) => {
  const isPoweredOn = state === 'poweredOn';
  const isPoweredOff = state === 'poweredOff';
  
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-2 h-2 rounded-full",
        isPoweredOn ? "bg-green-500 animate-pulse" : isPoweredOff ? "bg-slate-300" : "bg-orange-400"
      )} />
      <span className={cn(
        "text-xs font-medium uppercase tracking-wider",
        isPoweredOn ? "text-green-600" : "text-muted-foreground"
      )}>
        {isPoweredOn ? 'Running' : isPoweredOff ? 'Stopped' : 'Suspended'}
      </span>
    </div>
  );
};

export const InventoryPage = () => {
  const { inventory, target, discoverTarget, setActiveJobId, refreshJobs, refreshInventory } = useAppStore();
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();
  
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVms, setSelectedVms] = useState([]);
  const [viewMode, setViewMode] = useState('table'); // 'list' or 'grid'
  const [processing, setProcessing] = useState(false);
  const [activeVmForSnapshot, setActiveVmForSnapshot] = useState(null);
  const [activeVmForConsole, setActiveVmForConsole] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  
  // Single VM Edit States
  const [vmToRename, setVmToRename] = useState(null);
  const [vmToReconfigure, setVmToReconfigure] = useState(null);
  const [newName, setNewName] = useState('');
  const [configForm, setConfigSpec] = useState({ cpu: 1, memory: 1024 });

  // Bulk Snapshot Modal State
  const [showBulkSnapshotModal, setShowBulkSnapshotModal] = useState(false);
  const [bulkSnapshotForm, setBulkSnapshotForm] = useState({ name: '', description: '', memory: false });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // New States for Sorting and Filtering
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [filters, setFilters] = useState({
    status: 'all', // all, poweredOn, poweredOff
    os: 'all'
  });
  const [showFilters, setShowFilters] = useState(false);

  const heartbeatRef = useRef(null);

  // Background heartbeat
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      if (!processing && !refreshing && document.visibilityState === 'visible') {
        refreshInventory(token);
      }
    }, 5000);
    
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [token, refreshInventory, processing, refreshing]);

  const vms = useMemo(() => {
    if (!inventory?.inventoryItems) return [];
    
    let filtered = inventory.inventoryItems.filter(i => i.kind === 'VM');

    // 1. Keyword Search
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(vm => 
        vm.name.toLowerCase().includes(s) || 
        vm.guestOS?.toLowerCase().includes(s) ||
        vm.ipAddress?.includes(s)
      );
    }

    // 2. Status Filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(vm => vm.powerState === filters.status);
    }

    // 3. OS Filter (Simplified)
    if (filters.os !== 'all') {
      filtered = filtered.filter(vm => vm.guestOS?.toLowerCase().includes(filters.os.toLowerCase()));
    }

    // 4. Sorting
    filtered.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle nested or special cases
      if (sortConfig.key === 'storage') {
        aVal = a.storageCommitted || 0;
        bVal = b.storageCommitted || 0;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [inventory, search, filters, sortConfig]);

  const paginatedVms = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return vms.slice(start, start + pageSize);
  }, [vms, currentPage, pageSize]);

  const totalPages = Math.ceil(vms.length / pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <ChevronRight size={12} className="opacity-20 rotate-90" />;
    return sortConfig.direction === 'asc' ? 
      <ChevronRight size={12} className="-rotate-90 text-primary" /> : 
      <ChevronRight size={12} className="rotate-90 text-primary" />;
  };

  // Dynamic filter options
  const osOptions = useMemo(() => {
    if (!inventory?.inventoryItems) return [];
    const oss = new Set();
    inventory.inventoryItems
      .filter(i => i.kind === 'VM')
      .forEach(vm => {
        if (vm.guestOS) {
          // Simplify OS names for cleaner categories if desired, or keep raw
          // Here we take the first part of the OS name to group (e.g., 'Debian GNU/Linux 13' -> 'Debian')
          const simplified = vm.guestOS.split(' ')[0].split('-')[0];
          oss.add(simplified);
        }
      });
    return Array.from(oss).sort();
  }, [inventory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await discoverTarget(token);
    setRefreshing(false);
  };

  const handleExport = () => {
    const headers = ['名称', '操作系统', '状态', 'IP 地址', 'CPU', '内存(MB)', '存储(GB)'];
    const rows = vms.map(vm => [
      vm.name,
      vm.guestOS || 'Unknown',
      vm.powerState,
      vm.ipAddress || '---',
      vm.numCPU,
      vm.memoryMB,
      Math.round((vm.storageCommitted || 0) / 1024 / 1024 / 1024)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `MassOVA_Inventory_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectAll = () => {
    if (selectedVms.length === vms.length) {
      setSelectedVms([]);
    } else {
      setSelectedVms(vms.map(vm => vm.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedVms(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSingleAction = async (action, vm, data = {}) => {
    setProcessing(true);
    try {
      let endpoint = `/api/vms/${vm.id}/${action}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (response.ok) {
        setVmToRename(null);
        setVmToReconfigure(null);
        // Inventory will refresh via heartbeat or we can trigger it
        await refreshInventory(token);
      } else {
        alert(result.error || '操作失败');
      }
    } catch (err) {
      alert('连接服务器失败: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkAction = async (action, specificIds = null) => {
    const ids = specificIds || selectedVms;
    if (ids.length === 0) return;
    
    if (action === 'snapshot' && !specificIds) {
      setBulkSnapshotForm({ 
        name: `Bulk-Snapshot-${new Date().toLocaleDateString()}`, 
        description: 'Created via vSphere Nexus Bulk Action', 
        memory: false 
      });
      setShowBulkSnapshotModal(true);
      return;
    }

    // Find current states for the selected VMs
    const vmStates = ids.map(id => {
      const vm = vms.find(v => v.id === id);
      return { id, name: vm?.name || id, currentState: vm?.powerState };
    });

    let confirmMsg = '';
    let endpoint = '';
    let body = { target, vmIds: ids, vmStates }; // Pass states to backend

    switch(action) {
      case 'on': 
        endpoint = '/api/vms/power'; 
        body.action = 'on';
        break;
      case 'off': 
        confirmMsg = `确定要关闭选中的 ${ids.length} 台虚拟机吗？`;
        endpoint = '/api/vms/power'; 
        body.action = 'off';
        break;
      case 'reset': 
        confirmMsg = `确定要重启选中的 ${ids.length} 台虚拟机吗？`;
        endpoint = '/api/vms/power'; 
        body.action = 'reset';
        break;
      case 'destroy':
        confirmMsg = `⚠️ 警告：确定要彻底销毁并从磁盘删除选中的 ${ids.length} 台虚拟机吗？此操作不可逆！`;
        endpoint = '/api/vms/destroy';
        break;
      case 'snapshot':
        endpoint = '/api/vms/snapshot';
        body.name = bulkSnapshotForm.name;
        body.description = bulkSnapshotForm.description;
        body.memory = bulkSnapshotForm.memory;
        setShowBulkSnapshotModal(false);
        break;
    }

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setProcessing(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (response.ok) {
        setActiveJobId(data.job.id);
        await refreshJobs(token);
        // Removed navigate('/jobs') to stay on the current page
        // The background heartbeat will update the UI within 5 seconds
      } else {
        alert(data.errors?.join(', ') || '操作失败');
      }
    } catch (err) {
      alert('连接服务器失败: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (!inventory) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground bg-card rounded-xl border border-dashed">
        <Database size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">未连接 vSphere</p>
        <p className="text-sm">请先确保已成功登录并连接到环境</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Action Bar */}
      <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="搜索虚拟机名称, IP 或 操作系统..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm bg-muted/30 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-all",
                showFilters ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
              )}
            >
              <Activity size={16} />
              <span>高级筛选</span>
              {(filters.status !== 'all' || filters.os !== 'all') && (
                <span className="w-2 h-2 bg-primary rounded-full" />
              )}
            </button>

            {showFilters && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-card border rounded-xl shadow-xl z-30 p-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">电源状态</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['all', 'poweredOn', 'poweredOff'].map(s => (
                        <button 
                          key={s}
                          onClick={() => setFilters(prev => ({ ...prev, status: s }))}
                          className={cn(
                            "px-2 py-1.5 rounded-md border text-[11px] font-medium transition-all",
                            filters.status === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                          )}
                        >
                          {s === 'all' ? '全部' : s === 'poweredOn' ? '运行中' : '已停止'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">操作系统</label>
                    <select 
                      className="w-full bg-muted/30 border rounded-md px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                      value={filters.os}
                      onChange={e => setFilters(prev => ({ ...prev, os: e.target.value }))}
                    >
                      <option value="all">全部系统 ({osOptions.length})</option>
                      {osOptions.map(os => (
                        <option key={os} value={os}>{os}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      setFilters({ status: 'all', os: 'all' });
                      setSearch('');
                    }}
                    className="w-full py-2 text-xs text-primary font-bold hover:bg-primary/5 rounded-md transition-all"
                  >
                    重置所有筛选
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="h-6 w-px bg-border mx-2" />
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleBulkAction('on')}
              disabled={selectedVms.length === 0 || processing}
              className="p-2 rounded-md hover:bg-green-50 text-green-600 disabled:opacity-30 transition-all"
              title="批量开启"
            >
              <Play size={18} fill="currentColor" />
            </button>
            <button 
              onClick={() => handleBulkAction('off')}
              disabled={selectedVms.length === 0 || processing}
              className="p-2 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-30 transition-all"
              title="批量关闭"
            >
              <Square size={18} fill="currentColor" />
            </button>
            <button 
              onClick={() => handleBulkAction('reset')}
              disabled={selectedVms.length === 0 || processing}
              className="p-2 rounded-md hover:bg-blue-50 text-blue-600 disabled:opacity-30 transition-all"
              title="批量重启"
            >
              <RotateCcw size={18} />
            </button>
            <button 
              onClick={() => handleBulkAction('snapshot')}
              disabled={selectedVms.length === 0 || processing}
              className="p-2 rounded-md hover:bg-primary/10 text-primary disabled:opacity-30 transition-all"
              title="批量快照"
            >
              <Camera size={18} />
            </button>
            <button 
              onClick={() => handleBulkAction('destroy')}
              disabled={selectedVms.length === 0 || processing}
              className="p-2 rounded-md hover:bg-red-50 text-red-500 disabled:opacity-30 transition-all"
              title="批量销毁"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-muted/50 rounded-lg p-1 border">
            <button 
              onClick={() => setViewMode('table')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'table' ? "bg-white shadow text-primary" : "text-muted-foreground")}
            >
              <ListIcon size={16} />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white shadow text-primary" : "text-muted-foreground")}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted transition-all"
            title="导出资产清单"
          >
            <Download size={16} />
            <span className="hidden md:block">导出</span>
          </button>

          <button 
            onClick={handleRefresh}
            className={cn("flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all", refreshing && "animate-pulse opacity-80")}
          >
            <RefreshCcw size={16} className={cn(refreshing && "animate-spin")} />
            {refreshing ? '同步中...' : '刷新列表'}
          </button>
        </div>
      </div>

      {/* VM List Content */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col flex-1">
        {viewMode === 'table' ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left border-collapse text-slate-600">
              <thead className="bg-secondary/30 text-muted-foreground font-bold text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-4 w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                      checked={selectedVms.length === vms.length && vms.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => requestSort('name')}>
                    <div className="flex items-center gap-2">
                      <span>虚拟机名称 / 操作系统</span>
                      <SortIcon column="name" />
                    </div>
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => requestSort('powerState')}>
                    <div className="flex items-center gap-2">
                      <span>状态</span>
                      <SortIcon column="powerState" />
                    </div>
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => requestSort('ipAddress')}>
                    <div className="flex items-center gap-2">
                      <span>IP 地址</span>
                      <SortIcon column="ipAddress" />
                    </div>
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => requestSort('numCPU')}>
                     <div className="flex items-center gap-2">
                      <span>资源配置</span>
                      <SortIcon column="numCPU" />
                    </div>
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => requestSort('storage')}>
                    <div className="flex items-center gap-2">
                      <span>存储</span>
                      <SortIcon column="storage" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedVms.map(vm => (
                  <tr key={vm.id} className={cn(
                    "group transition-colors hover:bg-primary/5",
                    selectedVms.includes(vm.id) ? "bg-primary/5" : ""
                  )}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                        checked={selectedVms.includes(vm.id)}
                        onChange={() => toggleSelect(vm.id)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-secondary group-hover:bg-primary/10 transition-colors">
                          <Box size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 leading-tight">{vm.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">{vm.guestOS || 'Unknown OS'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <PowerStatus state={vm.powerState} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-slate-500">{vm.ipAddress || '---'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-bold">
                         <span className="flex items-center gap-1"><Cpu size={12} /> {vm.numCPU} vCPU</span>
                         <span className="flex items-center gap-1"><Zap size={12} /> {Math.round(vm.memoryMB / 1024)}GB</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                         <HardDrive size={12} className="text-muted-foreground" />
                         <span className="text-xs font-medium">{Math.round((vm.storageCommitted || 0) / 1024 / 1024 / 1024)}GB</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setActiveVmForSnapshot(vm)}
                          className="p-1.5 hover:bg-white rounded border shadow-sm text-muted-foreground hover:text-primary" 
                          title="快照管理"
                        >
                          <Camera size={14} />
                        </button>
                        <button 
                          onClick={() => handleBulkAction(vm.powerState === 'poweredOn' ? 'off' : 'on', [vm.id])}
                          className={cn(
                            "p-1.5 hover:bg-white rounded border shadow-sm transition-colors",
                            vm.powerState === 'poweredOn' ? "text-red-500 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
                          )} 
                          title={vm.powerState === 'poweredOn' ? '关机' : '开机'}
                        >
                          {vm.powerState === 'poweredOn' ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        </button>
                        
                        <div className="relative">
                          <button 
                            onClick={() => setOpenMenuId(openMenuId === vm.id ? null : vm.id)}
                            className={cn(
                              "p-1.5 rounded border shadow-sm transition-all",
                              openMenuId === vm.id ? "bg-primary text-white" : "text-muted-foreground hover:bg-white"
                            )} 
                            title="更多"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          
                          {openMenuId === vm.id && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 top-full mt-1 w-40 bg-card border rounded-lg shadow-xl z-40 p-1 animate-in fade-in zoom-in-95 duration-100 text-left">
                              <button 
                                onClick={() => {
                                  setActiveVmForConsole(vm);
                                  setOpenMenuId(null);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium hover:bg-primary/10 hover:text-primary rounded-md transition-colors"
                              >
                                <Monitor size={14} /> Web 控制台
                              </button>
                                <button 
                                  onClick={() => {
                                    handleBulkAction('reset', [vm.id]);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
                                >
                                  <RotateCcw size={14} /> 重启虚拟机
                                </button>
                                <button 
                                  onClick={() => {
                                    setVmToRename(vm);
                                    setNewName(vm.name);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium hover:bg-primary/10 hover:text-primary rounded-md transition-colors"
                                >
                                  <Edit3 size={14} /> 重命名 VM
                                </button>
                                <button 
                                  onClick={() => {
                                    if (vm.powerState === 'poweredOn') {
                                      alert('修改配置前请先关闭虚拟机');
                                      return;
                                    }
                                    setVmToReconfigure(vm);
                                    setConfigSpec({ cpu: vm.numCPU, memory: vm.memoryMB });
                                    setOpenMenuId(null);
                                  }}
                                  disabled={vm.powerState === 'poweredOn'}
                                  className={cn(
                                    "flex items-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-md transition-colors",
                                    vm.powerState === 'poweredOn' 
                                      ? "text-muted-foreground cursor-not-allowed bg-muted/30" 
                                      : "hover:bg-primary/10 hover:text-primary"
                                  )}
                                  title={vm.powerState === 'poweredOn' ? "运行中的虚拟机不支持在线修改配置" : ""}
                                >
                                  <Settings size={14} /> 修改配置
                                </button>
                                <div className="h-px bg-border my-1" />
                                <button 
                                  onClick={() => {
                                    handleBulkAction('destroy', [vm.id]);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                                >
                                  <Trash2 size={14} /> 销毁虚拟机
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6 bg-muted/10">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                {paginatedVms.map(vm => (
                  <div key={vm.id} className={cn(
                    "group relative border rounded-2xl p-5 transition-all hover:shadow-2xl hover:border-primary/40 flex flex-col gap-5 min-h-[220px]",
                    selectedVms.includes(vm.id) ? "bg-primary/5 border-primary shadow-xl" : "bg-card shadow-sm"
                  )}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={cn(
                          "p-3 rounded-xl transition-colors shrink-0",
                          vm.powerState === 'poweredOn' ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"
                        )}>
                          <Box size={28} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-800 truncate leading-none mb-1.5" title={vm.name}>{vm.name}</h4>
                          <p className="text-[10px] text-muted-foreground truncate font-medium uppercase tracking-tight" title={vm.guestOS}>{vm.guestOS || 'Unknown OS'}</p>
                        </div>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded-md border-gray-300 text-primary focus:ring-primary cursor-pointer mt-0.5 shrink-0"
                        checked={selectedVms.includes(vm.id)}
                        onChange={() => toggleSelect(vm.id)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-muted/40 p-2.5 rounded-xl space-y-1 border border-border/50">
                          <p className="text-[9px] uppercase font-black text-muted-foreground tracking-widest opacity-60">IP 地址</p>
                          <p className="text-xs font-mono font-bold truncate text-slate-700">{vm.ipAddress || '---'}</p>
                       </div>
                       <div className="bg-muted/40 p-2.5 rounded-xl space-y-1 border border-border/50">
                          <p className="text-[9px] uppercase font-black text-muted-foreground tracking-widest opacity-60">运行状态</p>
                          <PowerStatus state={vm.powerState} />
                       </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-black text-slate-500 border-t border-dashed pt-5 mt-auto">
                       <div className="flex flex-col items-center gap-1">
                          <Cpu size={16} className="text-muted-foreground/60" />
                          <span>{vm.numCPU} 核</span>
                       </div>
                       <div className="flex flex-col items-center gap-1 border-x px-6 border-border/50">
                          <Zap size={16} className="text-muted-foreground/60" />
                          <span>{Math.round(vm.memoryMB / 1024)}GB</span>
                       </div>
                       <div className="flex flex-col items-center gap-1">
                          <HardDrive size={16} className="text-muted-foreground/60" />
                          <span>{Math.round((vm.storageCommitted || 0) / 1024 / 1024 / 1024)}GB</span>
                       </div>
                    </div>

                    <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-2xl flex flex-col items-center justify-center p-6 gap-3 z-10 border-2 border-primary/20">
                        <div className="w-full flex gap-2">
                          <button 
                            onClick={() => setActiveVmForSnapshot(vm)}
                            className="flex-1 flex justify-center items-center gap-2 py-3 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl text-xs font-black transition-all border border-primary/10"
                          >
                            <Camera size={16} /> 快照
                          </button>
                          <button 
                            onClick={() => {
                              setVmToRename(vm);
                              setNewName(vm.name);
                            }}
                            className="flex-1 flex justify-center items-center gap-2 py-3 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl text-xs font-black transition-all border border-primary/10"
                          >
                            <Edit3 size={16} /> 重命名
                          </button>
                        </div>
                        <div className="w-full flex gap-2">
                          <button 
                            onClick={() => handleBulkAction(vm.powerState === 'poweredOn' ? 'off' : 'on', [vm.id])}
                            className={cn(
                              "flex-1 flex justify-center items-center gap-2 py-3 rounded-xl text-xs font-black transition-all border",
                              vm.powerState === 'poweredOn' ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-100" : "bg-green-50 text-green-600 border-green-100 hover:bg-green-100"
                            )}
                          >
                            {vm.powerState === 'poweredOn' ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            {vm.powerState === 'poweredOn' ? '立即关机' : '立即开机'}
                          </button>
                          <button 
                            onClick={() => {
                              if (vm.powerState === 'poweredOn') {
                                alert('修改配置前请先关闭虚拟机');
                                return;
                              }
                              setVmToReconfigure(vm);
                              setConfigSpec({ cpu: vm.numCPU, memory: vm.memoryMB });
                            }}
                            disabled={vm.powerState === 'poweredOn'}
                            className={cn(
                              "flex-1 flex justify-center items-center gap-2 py-3 rounded-xl text-xs font-black transition-all border",
                              vm.powerState === 'poweredOn'
                                ? "bg-muted/30 text-muted-foreground cursor-not-allowed border-muted"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                            )}
                            title={vm.powerState === 'poweredOn' ? "运行中的虚拟机不支持在线修改配置" : ""}
                          >
                             <Settings size={16} /> 配置
                          </button>
                        </div>
                        <button 
                          onClick={() => setActiveVmForConsole(vm)}
                          className="w-full flex justify-center items-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all border border-slate-200"
                        >
                           <Monitor size={16} /> 打开控制台
                        </button>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
        
        {/* Footer info & Pagination */}
        <div className="p-4 bg-muted/20 border-t flex flex-col md:flex-row gap-4 justify-between items-center text-xs text-muted-foreground font-medium">
           <div className="flex items-center gap-6">
              <div>已选中 <span className="text-primary font-bold">{selectedVms.length}</span> / {vms.length} 台虚拟机</div>
              <div className="flex items-center gap-2">
                <span>每页显示:</span>
                <select 
                  className="bg-transparent border rounded px-1 py-0.5 outline-none"
                  value={pageSize}
                  onChange={e => {
                    setPageSize(parseInt(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
           </div>

           <div className="flex items-center gap-4">
              {totalPages > 1 && (
                <div className="flex items-center bg-white border rounded-lg shadow-sm overflow-hidden">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="p-2 hover:bg-muted disabled:opacity-30 transition-colors border-r"
                  >
                    <ChevronRight size={14} className="rotate-180" />
                  </button>
                  <div className="px-4 py-1.5 flex items-center gap-2 bg-muted/20">
                    <span className="text-primary font-bold">{currentPage}</span>
                    <span className="opacity-40">/</span>
                    <span>{totalPages}</span>
                  </div>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="p-2 hover:bg-muted disabled:opacity-30 transition-colors border-l"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              <div className="h-6 w-px bg-border hidden md:block" />

              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-green-500" /> vSphere 状态正常</span>
                <span className="hidden md:block opacity-30">|</span>
                <span>最后更新: {new Date().toLocaleTimeString()}</span>
              </div>
           </div>
        </div>
      </div>

      {/* Snapshot Panel Drawer */}
      {activeVmForSnapshot && (
        <SnapshotPanel 
          vm={activeVmForSnapshot} 
          onClose={() => setActiveVmForSnapshot(null)} 
        />
      )}

      {/* Bulk Snapshot Modal */}
      {showBulkSnapshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkSnapshotModal(false)} />
          <div className="relative bg-card border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b bg-primary/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-primary p-2 rounded-lg text-primary-foreground">
                  <Camera size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">批量拍摄快照</h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">已选择 {selectedVms.length} 台虚拟机</p>
                </div>
              </div>
              <button onClick={() => setShowBulkSnapshotModal(false)} className="p-2 hover:bg-muted rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">快照名称</label>
                <input 
                  type="text" 
                  value={bulkSnapshotForm.name}
                  onChange={e => setBulkSnapshotForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-muted/20"
                  placeholder="输入快照名称"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">描述 (可选)</label>
                <textarea 
                  value={bulkSnapshotForm.description}
                  onChange={e => setBulkSnapshotForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-muted/20 h-20 resize-none"
                  placeholder="备注快照内容..."
                />
              </div>
              <label className="flex items-center gap-3 p-3 border rounded-xl hover:bg-muted/30 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-gray-300 text-primary"
                  checked={bulkSnapshotForm.memory}
                  onChange={e => setBulkSnapshotForm(prev => ({ ...prev, memory: e.target.checked }))}
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-700">包含虚拟机内存</p>
                  <p className="text-[10px] text-muted-foreground">拍摄时将保存 VM 运行内存状态（速度较慢）</p>
                </div>
              </label>
            </div>

            <div className="p-6 bg-muted/10 border-t flex gap-3">
              <button 
                onClick={() => setShowBulkSnapshotModal(false)}
                className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-bold hover:bg-white transition-all"
              >
                取消
              </button>
              <button 
                onClick={() => handleBulkAction('snapshot', selectedVms)}
                disabled={!bulkSnapshotForm.name || processing}
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} /> 开始任务
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VM Console Modal */}
      {activeVmForConsole && (
        <VMConsole 
          vm={activeVmForConsole} 
          onClose={() => setActiveVmForConsole(null)} 
        />
      )}

      {/* Rename VM Modal */}
      {vmToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setVmToRename(null)} />
          <div className="relative bg-card border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b bg-primary/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-primary p-2 rounded-lg text-primary-foreground"><Edit3 size={18} /></div>
                <h3 className="font-bold">重命名虚拟机</h3>
              </div>
              <button onClick={() => setVmToRename(null)} className="p-1 hover:bg-muted rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">新名称</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-muted/20"
                  placeholder="输入新的 VM 名称"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 bg-muted/10 border-t flex gap-3">
              <button onClick={() => setVmToRename(null)} className="flex-1 px-4 py-2 border rounded-xl text-xs font-bold hover:bg-white transition-all">取消</button>
              <button 
                onClick={() => handleSingleAction('rename', vmToRename, { newName })}
                disabled={!newName || newName === vmToRename.name || processing}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconfigure VM Modal */}
      {vmToReconfigure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setVmToReconfigure(null)} />
          <div className="relative bg-card border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b bg-primary/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-primary p-2 rounded-lg text-primary-foreground"><Settings size={18} /></div>
                <h3 className="font-bold">修改配置</h3>
              </div>
              <button onClick={() => setVmToReconfigure(null)} className="p-1 hover:bg-muted rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              {vmToReconfigure.powerState === 'poweredOn' && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-3 text-amber-700">
                  <AlertCircle size={18} className="shrink-0" />
                  <p className="text-[10px] leading-relaxed font-medium">
                    该虚拟机正在运行中。vSphere 不支持在开机状态下热修改 CPU 和内存。请先关闭虚拟机后再尝试应用配置。
                  </p>
                </div>
              )}
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1 flex justify-between">
                  <span>CPU 核心数</span>
                  <span className="text-primary">{configForm.cpu} vCPU</span>
                </label>
                <input 
                  type="range" min="1" max="64" step="1"
                  value={configForm.cpu}
                  disabled={vmToReconfigure.powerState === 'poweredOn'}
                  onChange={e => setConfigSpec(prev => ({ ...prev, cpu: parseInt(e.target.value) }))}
                  className={cn(
                    "w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary",
                    vmToReconfigure.powerState === 'poweredOn' && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1 flex justify-between">
                  <span>内存容量</span>
                  <span className="text-primary">{Math.round(configForm.memory / 1024 * 100) / 100} GB</span>
                </label>
                <div className="flex items-center gap-3">
                   <input 
                    type="number" 
                    value={configForm.memory}
                    disabled={vmToReconfigure.powerState === 'poweredOn'}
                    onChange={e => setConfigSpec(prev => ({ ...prev, memory: parseInt(e.target.value) || 0 }))}
                    className={cn(
                      "flex-1 px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-muted/20",
                      vmToReconfigure.powerState === 'poweredOn' && "opacity-50 cursor-not-allowed"
                    )}
                  />
                  <span className="text-xs font-bold text-muted-foreground">MB</span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-muted/10 border-t flex gap-3">
              <button onClick={() => setVmToReconfigure(null)} className="flex-1 px-4 py-2 border rounded-xl text-xs font-bold hover:bg-white transition-all">取消</button>
              <button 
                onClick={() => handleSingleAction('reconfigure', vmToReconfigure, configForm)}
                disabled={processing || vmToReconfigure.powerState === 'poweredOn'}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                应用配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
