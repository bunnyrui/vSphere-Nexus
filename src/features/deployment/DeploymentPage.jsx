import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { cn, fetchJson } from '../../lib/utils';
import { 
  Database, 
  Network, 
  Layers, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Copy,
  Settings2,
  HardDrive,
  Rocket
} from 'lucide-react';

const StepIndicator = ({ currentStep, steps }) => (
  <div className="flex items-center justify-between mb-8">
    {steps.map((step, idx) => (
      <React.Fragment key={step.id}>
        <div className="flex flex-col items-center flex-1 relative">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all z-10 bg-background",
            idx <= currentStep ? "border-primary text-primary" : "border-muted text-muted-foreground",
            idx < currentStep && "bg-primary text-primary-foreground"
          )}>
            {idx < currentStep ? <CheckCircle2 size={20} /> : <span>{idx + 1}</span>}
          </div>
          <span className={cn(
            "text-xs mt-2 font-medium",
            idx <= currentStep ? "text-foreground" : "text-muted-foreground"
          )}>{step.title}</span>
        </div>
        {idx < steps.length - 1 && (
          <div className={cn(
            "h-[2px] flex-1 -mt-6 mx-2",
            idx < currentStep ? "bg-primary" : "bg-muted"
          )} />
        )}
      </React.Fragment>
    ))}
  </div>
);

export const DeploymentPage = () => {
  const { target, setTarget, inventory, deploymentConfig, setDeploymentConfig, refreshJobs, setActiveJobId } = useAppStore();
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const steps = [
    { id: 'source', title: '部署源', icon: Copy },
    { id: 'config', title: 'VM 配置', icon: Settings2 },
    { id: 'confirm', title: '确认部署', icon: Play },
  ];

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const generatePreview = () => {
    const { prefix, start, count } = deploymentConfig.naming;
    
    if (!start) {
      return prefix || '(请输入名称)';
    }

    const startNum = parseInt(start, 10) || 0;
    const padding = start.length;
    const names = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      names.push(`${prefix}${String(startNum + i).padStart(padding, '0')}`);
    }
    if (count > 3) names.push('...');
    if (count > 1) {
       names.push(`${prefix}${String(startNum + count - 1).padStart(padding, '0')}`);
    }
    return names.join(', ');
  };

  const getEffectiveVms = () => {
    const { prefix, start, count } = deploymentConfig.naming;
    const startNum = parseInt(start, 10) || 0;
    const padding = start.length;
    return Array.from({ length: count }).map((_, i) => ({
      name: start ? `${prefix}${String(startNum + i).padStart(padding, '0')}` : prefix
    }));
  };

  const handleStartDeployment = async () => {
    setError('');
    const count = deploymentConfig.naming.count;
    if (!deploymentConfig.naming.prefix.trim()) {
      setError('名称前缀不能为空');
      return;
    }
    if (!count || count < 1 || count > 100) {
      setError('部署数量必须在 1-100 之间');
      return;
    }
    setSubmitting(true);
    try {
      const vms = getEffectiveVms();
      const payload = {
        target,
        sourceInventoryPath: target.sourceInventoryPath,
        networkMappings: deploymentConfig.networkMappings,
        concurrency: deploymentConfig.concurrency,
        vms,
        dryRun: false
      };

      const { response, data } = await fetchJson('/api/deployments', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setActiveJobId(data.job.id);
        await refreshJobs(token);
        navigate('/jobs');
      } else {
        const errorMsg = data.errors ? data.errors.join(', ') : (data.error || '提交部署任务失败');
        throw new Error(errorMsg);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateNetworkMapping = (source, targetNet) => {
    const current = [...deploymentConfig.networkMappings];
    const idx = current.findIndex(m => m.source === source);
    if (idx >= 0) {
      current[idx] = { source, target: targetNet };
    } else {
      current.push({ source, target: targetNet });
    }
    setDeploymentConfig({ networkMappings: current });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card rounded-xl border shadow-sm p-8">
        <StepIndicator currentStep={currentStep} steps={steps} />

        <div className="mt-12 min-h-[400px]">
          {/* Step 1: Source & Target Resources */}
          {currentStep === 0 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Copy size={18} className="text-primary" /> 部署源
                  </h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">选择模板 (OVA/VM)</label>
                    <select 
                      value={target.sourceInventoryPath || ''}
                      onChange={e => {
                        setTarget({ sourceInventoryPath: e.target.value });
                        setDeploymentConfig({ networkMappings: [] });
                      }}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="">请选择...</option>
                      {inventory?.inventoryItems?.filter(i => i.kind === 'Template').map(i => (
                        <option key={i.id} value={i.inventoryPath}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <HardDrive size={18} className="text-primary" /> 目标资源
                  </h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">计算资源 (Host / Cluster)</label>
                    <select 
                      value={target.inventoryPath || ''}
                      onChange={e => setTarget({ inventoryPath: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="">请选择...</option>
                      {inventory?.computeTargets?.map(ct => (
                        <option key={ct.id} value={ct.inventoryPath}>
                          {ct.datacenter ? `${ct.datacenter} / ` : ''}{ct.name} ({ct.kind})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">存储 (Datastore)</label>
                    <select 
                      value={target.datastore || ''}
                      onChange={e => setTarget({ datastore: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="">请选择...</option>
                      {(inventory?.datastores ?? [])
                        .filter(ds => {
                          if (!target.inventoryPath) return true;
                          const selectedCompute = inventory.computeTargets.find(ct => ct.inventoryPath === target.inventoryPath);
                          return selectedCompute ? selectedCompute.datastores.includes(ds.id) : true;
                        })
                        .map(ds => (
                          <option key={ds.id} value={ds.name}>{ds.name} ({Math.round(ds.freeSpace/1024/1024/1024)}GB 可用)</option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">磁盘模式</label>
                    <select 
                      value={target.diskMode || 'thin'}
                      onChange={e => setTarget({ diskMode: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="thin">Thin Provision (精简置备)</option>
                      <option value="thick">Thick Provision (厚置备延迟置零)</option>
                      <option value="eagerZeroedThick">Thick Provision Eager Zeroed (厚置备置零)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-12 flex justify-end">
                <button 
                  onClick={handleNext}
                  disabled={!target.sourceInventoryPath || !target.datastore}
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  下一步 <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: VM Config */}
          {currentStep === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                {(() => {
                  const sourceNetworks = inventory?.inventoryItems?.find(i => i.inventoryPath === target.sourceInventoryPath)?.sourceNetworks ?? ['VM Network'];
                  const hasUnmappedNetwork = sourceNetworks.some(net => !deploymentConfig.networkMappings.find(m => m.source === net)?.target);
                  const prefixEmpty = !deploymentConfig.naming.prefix.trim();
                  const countInvalid = deploymentConfig.naming.count > 100 || deploymentConfig.naming.count < 1;
                  const stepDisabled = prefixEmpty || countInvalid || hasUnmappedNetwork;
                  return (
                    <>
                <div className="space-y-6">
                <h3 className="font-semibold flex items-center gap-2">
                  <Layers size={18} className="text-primary" /> 批量命名规则
                </h3>
                <div className="grid grid-cols-3 gap-4 bg-secondary/30 p-4 rounded-lg">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">名称前缀</label>
                    <input 
                      type="text"
                      value={deploymentConfig.naming.prefix}
                      onChange={e => setDeploymentConfig({ naming: { prefix: e.target.value } })}
                      placeholder="VM-Prod-"
                      className={cn("w-full px-3 py-2 border rounded-md outline-none", prefixEmpty && "border-destructive")}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">起始编号 (支持 001 补全)</label>
                    <input 
                      type="text"
                      value={deploymentConfig.naming.start}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        setDeploymentConfig({ 
                          naming: { 
                            start: val,
                            count: !val ? 1 : deploymentConfig.naming.count 
                          } 
                        });
                      }}
                      placeholder="留空即不编号"
                      className="w-full px-3 py-2 border rounded-md outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">部署数量</label>
                    <input 
                      type="number"
                      value={deploymentConfig.naming.count}
                      onChange={e => setDeploymentConfig({ naming: { count: parseInt(e.target.value, 10) || 1 } })}
                      min="1"
                      disabled={!deploymentConfig.naming.start}
                      className="w-full px-3 py-2 border rounded-md outline-none disabled:bg-secondary disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {deploymentConfig.naming.start && deploymentConfig.naming.count > 100 ? (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm font-medium">
                    单次部署数量不能超过 100 台（当前：{deploymentConfig.naming.count}）
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground bg-primary/5 p-3 rounded border border-primary/10">
                    <span className="font-medium text-primary">命名预览：</span>
                    {generatePreview()}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={target.powerOn}
                        onChange={e => setTarget({ powerOn: e.target.checked })}
                      />
                      <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors"></div>
                      <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform shadow-sm"></div>
                    </div>
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">部署完成后自动开机</span>
                  </label>
                </div>

                <h3 className="font-semibold flex items-center gap-2 pt-4">
                  <Network size={18} className="text-primary" /> 网络映射
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/50 text-muted-foreground font-medium">
                      <tr>
                        <th className="px-4 py-2">模板源网络</th>
                        <th className="px-4 py-2">目标网络 (Port Group)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sourceNetworks.map((net, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3">{net}</td>
                          <td className="px-4 py-3">
                            <select 
                              className={cn("w-full px-2 py-1 border rounded outline-none", !deploymentConfig.networkMappings.find(m => m.source === net)?.target && "border-destructive")}
                              value={deploymentConfig.networkMappings.find(m => m.source === net)?.target || ''}
                              onChange={e => updateNetworkMapping(net, e.target.value)}
                            >
                              <option value="">请选择目标网络...</option>
                              {inventory?.networks?.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasUnmappedNetwork && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm font-medium">
                    请为所有模板源网络选择目标网络映射
                  </div>
                )}
              </div>

              <div className="pt-12 flex justify-between">
                <button 
                  onClick={handleBack}
                  className="px-6 py-2 rounded-md font-medium text-muted-foreground hover:bg-secondary transition-all flex items-center gap-2"
                >
                  <ChevronLeft size={18} /> 上一步
                </button>
                <button 
                  onClick={handleNext}
                  disabled={stepDisabled}
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  下一步 <ChevronRight size={18} />
                </button>
              </div>
                    </>
                  );
                })()}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {currentStep === 2 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                <div className="md:col-span-1 bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-6 flex flex-col">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-primary pb-2 border-b border-primary/10">
                    <CheckCircle2 size={20} /> 部署策略
                  </h3>
                  <div className="flex-1 space-y-5 text-sm">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">目标环境</p>
                        <p className="font-semibold">{target.host}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">计算资源</p>
                        <p className="font-semibold text-xs bg-white/50 border border-primary/10 rounded px-2 py-1 inline-block">
                          {inventory?.computeTargets?.find(t => t.inventoryPath === target.inventoryPath)?.name || '未指定'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">所选模板</p>
                        <p className="font-semibold text-xs">{inventory?.inventoryItems?.find(i => i.inventoryPath === target.sourceInventoryPath)?.name || '未指定'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">存储与磁盘</p>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs">{target.datastore}</p>
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase">
                            {target.diskMode}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">网络映射预览</p>
                        <div className="space-y-1.5 mt-1">
                          {(inventory?.inventoryItems?.find(i => i.inventoryPath === target.sourceInventoryPath)?.sourceNetworks ?? ['VM Network']).map((net, idx) => (
                             <div key={idx} className="flex items-center gap-2 text-[10px] bg-white/40 border border-primary/5 rounded px-2 py-1">
                               <span className="text-muted-foreground">{net}</span>
                               <ChevronRight size={10} className="text-primary/40" />
                                <span className="font-bold">{deploymentConfig.networkMappings.find(m => m.source === net)?.target || '未映射'}</span>
                             </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-primary/10 mt-auto">
                    <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mb-1">执行规模</p>
                    <div className="flex items-baseline gap-2 text-primary">
                      <span className="text-3xl font-black tracking-tighter">{deploymentConfig.naming.count}</span>
                      <span className="text-sm font-bold opacity-80">台虚拟机</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col">
                  <div className="flex justify-between items-center pb-2 border-b border-primary/10 mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                      <Layers size={20} /> 待创建清单
                    </h3>
                    <span className="text-[10px] font-bold bg-white/50 border border-primary/10 px-2 py-1 rounded text-primary uppercase tracking-widest">
                      Final Manifest
                    </span>
                  </div>
                  
                  <div className="flex-1 border border-primary/10 rounded-lg bg-white/30 overflow-hidden flex flex-col shadow-inner">
                    <div className="overflow-y-auto max-h-[380px]">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-primary/10 text-primary text-[11px] uppercase font-bold tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="px-6 py-3 w-16">#</th>
                            <th className="px-6 py-3">虚拟机名称 (VM Name)</th>
                            <th className="px-6 py-3">开机策略</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-primary/5">
                          {(() => {
                            const { prefix, start, count } = deploymentConfig.naming;
                            const startNum = parseInt(start, 10) || 0;
                            const padding = start.length;
                            return Array.from({ length: count }).map((_, i) => {
                              const name = start ? `${prefix}${String(startNum + i).padStart(padding, '0')}` : prefix;
                              return (
                                <tr key={i} className="hover:bg-primary/5 transition-colors group">
                                  <td className="px-6 py-3 text-muted-foreground font-mono">{String(i + 1).padStart(2, '0')}</td>
                                  <td className="px-6 py-3 font-bold group-hover:text-primary transition-colors">{name}</td>
                                  <td className="px-6 py-3">
                                    <span className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full font-bold border",
                                      target.powerOn 
                                        ? "bg-green-500/10 text-green-700 border-green-500/20" 
                                        : "bg-orange-500/10 text-orange-700 border-orange-500/20"
                                    )}>
                                      {target.powerOn ? 'ON' : 'OFF'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex gap-3 items-center animate-shake">
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="flex items-center gap-4 bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 text-orange-700">
                <AlertCircle size={20} className="shrink-0" />
                <p className="text-sm font-medium">请核对以上信息。点击下方按钮后，vSphere Nexus 将开始异步部署任务。</p>
              </div>

              <div className="pt-12 flex justify-between">
                <button 
                  onClick={handleBack}
                  className="px-6 py-2 rounded-md font-medium text-muted-foreground hover:bg-secondary transition-all flex items-center gap-2"
                >
                  <ChevronLeft size={18} /> 上一步
                </button>
                <button 
                  onClick={handleStartDeployment}
                  disabled={submitting}
                  className="bg-primary text-primary-foreground px-10 py-3 rounded-md font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? '正在创建任务...' : '开始执行任务'}
                  {!submitting && <Rocket size={20} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
