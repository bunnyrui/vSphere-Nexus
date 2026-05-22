import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  HardDrive,
  KeyRound,
  Layers,
  LogIn,
  MemoryStick,
  Network,
  Play,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  Terminal,
  Trash2,
  XCircle
} from "lucide-react";
import "./styles.css";

const emptyVm = { name: "lab-{{index}}" };
const defaultState = {
  dryRun: true,
  concurrency: 1,
  sourceType: "inventory",
  sourceInventoryPath: "",
  vmNaming: {
    mode: "generated",
    prefix: "lab",
    count: 1,
    start: 1,
    padding: 2
  },
  target: {
    platform: "esxi",
    host: "",
    username: "root",
    password: "",
    inventoryPath: "",
    datastore: "datastore1",
    folder: "",
    resourcePool: "",
    diskMode: "thin",
    powerOn: false
  },
  networkMappings: [{ source: "VM Network", target: "VM Network" }],
  properties: [],
  vms: [{ ...emptyVm }]
};

const storageKey = "massova.form.v1";
const sessionStorageKey = "massova.session.v1";
const tokenKey = "massova.token";

function authHeaders() {
  const token = localStorage.getItem(tokenKey);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录失败");
      if (data.token) localStorage.setItem(tokenKey, data.token);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 24 }}>
          <span className="brandMark"><Server size={22} /></span>
          <div>
            <strong>MassOVA</strong>
            <small>ESXi 批量 OVA 部署</small>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>用户名</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
           <div className="field">
             <label>密码</label>
             <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
           </div>
          {error && <div className="alert"><ShieldAlert size={16} />{error}</div>}
          <button className="primaryAction" type="submit" disabled={loading}>
            <LogIn size={18} />
            {loading ? "登录中" : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}

function loadInitialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const session = JSON.parse(sessionStorage.getItem(sessionStorageKey) || "{}");
    return mergeState(defaultState, saved, session);
  } catch {
    return defaultState;
  }
}

function App() {
  const [authed, setAuthed] = useState(true);
  const [form, setForm] = useState(loadInitialState);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [error, setError] = useState("");
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [inventory, setInventory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [datastoreInfo, setDatastoreInfo] = useState(null);
  const [selectedVmIds, setSelectedVmIds] = useState(new Set());
  const [destroying, setDestroying] = useState(false);
  const [activeTab, setActiveTab] = useState("deploy");

  const activeJob = jobs.find((job) => job.id === activeJobId) ?? jobs[0];
  const effectiveVms = getEffectiveVms(form);
  const vmCount = effectiveVms.length;
  const selectedInventorySource = inventory?.inventoryItems?.find((item) => item.inventoryPath === form.sourceInventoryPath);
  const sourceNetworkOptions = selectedInventorySource?.sourceNetworks ?? [];

  async function refreshJobs() {
    const response = await fetch("/api/jobs", { headers: authHeaders() });
    if (response.status === 401) { setAuthed(false); return; }
    const data = await response.json();
    setJobs(data.jobs ?? []);
    if (!activeJobId && data.jobs?.[0]) setActiveJobId(data.jobs[0].id);
  }

  async function loadTemplates() {
    const response = await fetch("/api/templates", { headers: authHeaders() });
    if (response.status === 401) { setAuthed(false); return; }
    const data = await response.json();
    setTemplates(data.templates ?? []);
  }

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/status");
      const data = await response.json();
      if (!data.enabled) return;
      const token = localStorage.getItem(tokenKey);
      if (!token) { setAuthed(false); return; }
      const testResponse = await fetch("/api/jobs", { headers: authHeaders() });
      if (testResponse.status === 401) {
        localStorage.removeItem(tokenKey);
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    }
  }

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (!authed) return;
    refreshJobs();
    loadTemplates();
  }, [authed]);

  useEffect(() => {
    const { target, ...rest } = form;
    const { password, ...safeTarget } = target;
    localStorage.setItem(storageKey, JSON.stringify({ ...rest, target: safeTarget }));
    sessionStorage.setItem(sessionStorageKey, JSON.stringify({ target: { password } }));
  }, [form]);

  if (!authed) return <LoginPage onLogin={() => { setAuthed(true); }} />;

  async function submitDeployment(event) {
    event.preventDefault();
    setError("");
    setConflicts([]);
    setWarnings([]);
    setSubmitting(true);
    try {
      if (inventory) {
        const checkResponse = await fetch("/api/deployments/check", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ target: form.target, vms: effectiveVms, sourceInventoryPath: form.sourceInventoryPath })
        });
        if (checkResponse.status === 401) { setAuthed(false); return; }
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          setConflicts(checkData.conflicts ?? []);
          setWarnings(checkData.warnings ?? []);
          setDatastoreInfo(checkData.datastoreInfo ?? null);
          if (checkData.conflicts?.length) { setSubmitting(false); return; }
        }
      }
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...form, vms: effectiveVms })
      });
      if (response.status === 401) { setAuthed(false); return; }
      const data = await response.json();
      if (!response.ok) throw new Error((data.errors ?? [data.error]).filter(Boolean).join("；"));
      setActiveJobId(data.job.id);
      setConflicts([]);
      setWarnings([]);
      await refreshJobs();
    } catch (err) {
      setError(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function forceSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...form, vms: effectiveVms })
      });
      if (response.status === 401) { setAuthed(false); return; }
      const data = await response.json();
      if (!response.ok) throw new Error((data.errors ?? [data.error]).filter(Boolean).join("；"));
      setActiveJobId(data.job.id);
      setConflicts([]);
      setWarnings([]);
      await refreshJobs();
    } catch (err) {
      setError(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelActiveJob() {
    if (!activeJob) return;
    await fetch(`/api/jobs/${activeJob.id}/cancel`, { method: "POST", headers: authHeaders() });
    await refreshJobs();
  }

  async function retryActiveJob() {
    if (!activeJob) return;
    try {
      const response = await fetch(`/api/jobs/${activeJob.id}/retry`, { method: "POST", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "重试失败");
      await refreshJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  async function probeTarget() {
    setError("");
    setProbe(null);
    setInventory(null);
    setDatastoreInfo(null);
    setSelectedVmIds(new Set());
    setProbing(true);
    try {
      const response = await fetch("/api/targets/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ target: form.target })
      });
      if (response.status === 401) { setAuthed(false); return; }
      const data = await response.json();
      if (!response.ok) throw new Error((data.errors ?? [data.error]).filter(Boolean).join("；"));
      setProbe({ ok: data.ok, message: data.message });
      setInventory(data.inventory);
      setForm((current) => applyInventoryDefaults(current, data.inventory));
    } catch (err) {
      setError(err.message || "连接测试失败");
    } finally {
      setProbing(false);
    }
  }

  function resetConnection() {
    setProbe(null);
    setInventory(null);
    setDatastoreInfo(null);
    setSelectedVmIds(new Set());
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return;
    const { target, ...rest } = form;
    const { password, ...safeTarget } = target;
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: templateName.trim(), config: { ...rest, target: safeTarget } })
      });
      if (!response.ok) throw new Error("保存失败");
      setShowTemplateDialog(false);
      setTemplateName("");
      await loadTemplates();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadTemplate(name) {
    const tpl = templates.find((t) => t.name === name);
    if (!tpl) return;
    const session = JSON.parse(sessionStorage.getItem(sessionStorageKey) || "{}");
    const loaded = mergeState(defaultState, tpl.config, session);
    loaded.sourceInventoryPath = tpl.config.sourceInventoryPath || "";
    loaded.networkMappings = tpl.config.networkMappings || defaultState.networkMappings;
    setForm(loaded);
    setInventory(null);
    setProbe(null);
    setDatastoreInfo(null);
  }

  function toggleVmSelect(vmId) {
    setSelectedVmIds((prev) => {
      const next = new Set(prev);
      if (next.has(vmId)) next.delete(vmId); else next.add(vmId);
      return next;
    });
  }

  function toggleSelectAllVms() {
    const vms = inventory?.inventoryItems?.filter((item) => item.kind === "VM") ?? [];
    if (selectedVmIds.size === vms.length && vms.length > 0) setSelectedVmIds(new Set());
    else setSelectedVmIds(new Set(vms.map((v) => v.id)));
  }

  async function destroySelectedVms() {
    if (!selectedVmIds.size) return;
    const names = (inventory?.inventoryItems ?? []).filter((item) => selectedVmIds.has(item.id)).map((item) => item.name);
    if (!confirm(`确认关机并删除以下 ${names.length} 台虚拟机？\n\n${names.slice(0, 10).join("\n")}${names.length > 10 ? `\n...还有 ${names.length - 10} 台` : ""}`)) return;
    setDestroying(true);
    setError("");
    try {
      const response = await fetch("/api/vms/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ target: form.target, vmIds: [...selectedVmIds] })
      });
      if (response.status === 401) { setAuthed(false); return; }
      const data = await response.json();
      if (!response.ok) throw new Error((data.errors ?? [data.error]).filter(Boolean).join("；"));
      setActiveJobId(data.job.id);
      setSelectedVmIds(new Set());
      await refreshJobs();
    } catch (err) {
      setError(err.message || "销毁失败");
    } finally {
      setDestroying(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark"><Server size={22} /></span>
          <div>
            <strong>MassOVA</strong>
            <small>vSphere 批量部署工具</small>
          </div>
        </div>
        <div className="metric">
          <span>本批次 VM</span>
          <strong>{vmCount}</strong>
        </div>
        <div className="metric">
          <span>历史任务</span>
          <strong>{jobs.length}</strong>
        </div>
        {datastoreInfo && (
          <div className="metric datastoreMetric">
            <span><HardDrive size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />Datastore</span>
            <div className="datastoreInfo">
              <small>{datastoreInfo.name}</small>
              <div className="datastoreBar">
                <div className="datastoreFill" style={{ width: `${100 - datastoreInfo.freePercent}%` }} />
              </div>
              <small>{datastoreInfo.freeSpace} 可用 / {datastoreInfo.capacity}</small>
            </div>
          </div>
        )}
        <nav className="jobNav">
          {jobs.map((job) => (
            <button className={job.id === activeJob?.id ? "active" : ""} key={job.id} onClick={() => setActiveJobId(job.id)}>
              <StatusIcon status={job.status} />
              <span>{job.id}</span>
              <small>{job.status}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>MassOVA Console</p>
            <h1>vSphere 批量部署与虚拟机管理</h1>
          </div>
          <div className="topbarActions">
            {templates.length > 0 && (
              <select className="templateSelect" value="" onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); }}>
                <option value="">加载模板...</option>
                {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            )}
            <button type="button" className="secondaryAction" onClick={() => setShowTemplateDialog(true)}>
              <Bookmark size={16} /> 保存模板
            </button>
          </div>
        </header>

        {showTemplateDialog && (
          <div className="dialogOverlay" onClick={() => setShowTemplateDialog(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <h3>保存为部署模板</h3>
              <div className="field">
                <label>模板名称</label>
                <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="例如：生产环境基础模板" />
              </div>
              <div className="dialogActions">
                <button className="secondaryAction" onClick={() => setShowTemplateDialog(false)}>取消</button>
                <button className="primaryAction" onClick={saveAsTemplate}>保存</button>
              </div>
            </div>
          </div>
        )}

        <section className="panel connectionPanel">
          <SectionTitle icon={<Server />} title="连接 vSphere" />
          <div className="connectionGrid">
            <div className="field">
              <label>平台</label>
              <select value={form.target.platform} onChange={(e) => { resetConnection(); updateNested(setForm, ["target", "platform"], e.target.value); }}>
                <option value="esxi">ESXi</option>
                <option value="vcenter">vCenter</option>
              </select>
            </div>
            <TextField form={form} setForm={setForm} path={["target", "host"]} label="地址" placeholder={form.target.platform === "vcenter" ? "172.16.109.250" : "192.168.10.20"} onChangeExtra={resetConnection} />
            <TextField form={form} setForm={setForm} path={["target", "username"]} label="用户名" onChangeExtra={resetConnection} />
            <TextField form={form} setForm={setForm} path={["target", "password"]} label="密码" type="password" icon={<KeyRound size={16} />} onChangeExtra={resetConnection} />
            <div className="connectionAction">
              <button type="button" className="secondaryAction" onClick={probeTarget} disabled={probing}>
                <RefreshCw size={16} />
                {probing ? "连接中..." : "连接"}
              </button>
              {probe && (
                <span className={probe.ok ? "probeTag okTag" : "probeTag badTag"}>
                  <StatusIcon status={probe.ok ? "succeeded" : "failed"} /> {probe.message}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="tabBar">
          <button className={activeTab === "deploy" ? "tab active" : "tab"} onClick={() => setActiveTab("deploy")}>
            <Play size={15} /> 批量部署
          </button>
          <button className={activeTab === "overview" ? "tab active" : "tab"} onClick={() => setActiveTab("overview")}>
            <Server size={15} /> 虚拟机概览
          </button>
          <button className={activeTab === "cleanup" ? "tab active" : "tab"} onClick={() => setActiveTab("cleanup")}>
            <Trash2 size={15} /> 虚拟机清理
          </button>
          <div className="tabSpacer" />
          <label className="switch small">
            <input type="checkbox" checked={form.dryRun} onChange={(e) => setForm((c) => ({ ...c, dryRun: e.target.checked }))} />
            <span>干跑模式</span>
          </label>
        </div>

        <div className="contentGrid">
          {activeTab === "deploy" ? (
            <DeployTab
              form={form} setForm={setForm} inventory={inventory} error={error} setError={setError}
              submitting={submitting} conflicts={conflicts} warnings={warnings} sourceNetworkOptions={sourceNetworkOptions}
              onSubmit={submitDeployment} onForceSubmit={forceSubmit} onResetConnection={resetConnection}
            />
          ) : activeTab === "overview" ? (
            <OverviewTab inventory={inventory} />
          ) : (
            <CleanupTab
              inventory={inventory} error={error} destroying={destroying}
              selectedVmIds={selectedVmIds} onToggleVm={toggleVmSelect} onToggleAll={toggleSelectAllVms}
              onDestroy={destroySelectedVms}
            />
          )}

          <JobPanel job={activeJob} onCancel={cancelActiveJob} onRetry={retryActiveJob} onRefresh={refreshJobs} />
        </div>
      </section>
    </main>
  );
}

function DeployTab({ form, setForm, inventory, error, submitting, conflicts, warnings, sourceNetworkOptions, onSubmit, onForceSubmit, onResetConnection }) {
  return (
    <form className="panel formPanel" onSubmit={onSubmit}>
      {inventory && (
        <section className="resourceGrid span2">
          <ResourceSelect
            label={form.target.platform === "vcenter" ? "部署目标" : "主机"}
            value={form.target.inventoryPath}
            options={inventory.computeTargets}
            valueKey="inventoryPath"
            render={(item) => item.datacenter ? `${item.datacenter} / ${item.name}` : item.name}
            onChange={(v) => updateNested(setForm, ["target", "inventoryPath"], v)}
            disabled={form.target.platform === "esxi"}
          />
          <DatastoreSelect value={form.target.datastore} datastores={inventory.datastores ?? []} onChange={(v) => updateNested(setForm, ["target", "datastore"], v)} />
          <ResourceSelect
            label="VM Folder" value={form.target.folder}
            options={[{ id: "", name: "不指定" }, ...(inventory.folders ?? [])]}
            valueKey="name"
            onChange={(v) => updateNested(setForm, ["target", "folder"], v === "不指定" ? "" : v)}
          />
          <div className="field">
            <label>磁盘模式</label>
            <select value={form.target.diskMode} onChange={(e) => updateNested(setForm, ["target", "diskMode"], e.target.value)}>
              <option value="thin">thin</option>
              <option value="thick">thick</option>
              <option value="eagerZeroedThick">eagerZeroedThick</option>
            </select>
          </div>
        </section>
      )}

      {!inventory && <div className="hintBox span2">请先在顶部填写地址和账号，点击"连接"后配置部署参数。</div>}

      {inventory && (
        <>
          <section className="nestedSection span2">
            <SectionTitle icon={<Copy />} title="部署源" />
            <div className="resourceGrid">
              <ResourceSelect
                label="模板" value={form.sourceInventoryPath}
                options={(inventory.inventoryItems ?? []).filter((item) => item.kind === "Template")}
                valueKey="inventoryPath"
                render={(item) => `${item.datacenter} / ${item.name}`}
                onChange={(v) => setForm((c) => applyInventorySourceDefaults({ ...c, sourceInventoryPath: v }, inventory))}
              />
              <label className="checkLine">
                <input type="checkbox" checked={form.target.powerOn} onChange={(e) => updateNested(setForm, ["target", "powerOn"], e.target.checked)} />
                <Power size={16} /> 部署后开机
              </label>
            </div>
          </section>

          <Repeater
            icon={<Network />} title="网络映射" rows={form.networkMappings}
            columns={[["source", "模板源网络"], ["target", "目标 Port Group"]]}
            selectOptions={{ source: sourceNetworkOptions, target: inventory?.networks?.map((i) => i.name) ?? [] }}
            onChange={(rows) => setForm((c) => ({ ...c, networkMappings: rows }))}
            emptyRow={{ source: "", target: "" }}
          />

          <Repeater
            icon={<Settings2 />} title="OVF 属性" rows={form.properties}
            columns={[["key", "属性名"], ["value", "属性值 ({{index}})"]]}
            onChange={(rows) => setForm((c) => ({ ...c, properties: rows }))}
            emptyRow={{ key: "", value: "" }} readOnly emptyMessage="模板批量部署不使用 OVF 属性"
          />
        </>
      )}

      <VmEditor form={form} setForm={setForm} />

      <div className="field">
        <label><Layers size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />并发数</label>
        <select value={form.concurrency ?? 1} onChange={(e) => updateNested(setForm, ["concurrency"], Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {conflicts.length > 0 && (
        <div className="alert alertWarn span2">
          <AlertTriangle size={16} />
          <div>
            <strong>VM 名称冲突：</strong> {conflicts.join("、")}
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button type="button" className="secondaryAction" onClick={() => setConflicts([])}>返回修改</button>
              <button type="button" className="primaryAction" style={{ fontSize: 13, minHeight: 34 }} onClick={onForceSubmit}>仍然部署</button>
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="alert alertWarn span2">
          <AlertTriangle size={16} />
          <div>{warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
        </div>
      )}

      {error && <div className="alert span2"><ShieldAlert size={16} />{error}</div>}

      <button className="primaryAction" type="submit" disabled={submitting}>
        <Play size={18} />
        {form.dryRun ? "生成部署预览" : "开始批量部署"}
      </button>
    </form>
  );
}

function CleanupTab({ inventory, error, destroying, selectedVmIds, onToggleVm, onToggleAll, onDestroy }) {
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);

  if (!inventory) {
    return (
      <div className="panel emptyPanel">
        <div className="emptyState"><Server size={32} /><span>请先连接 vSphere 后查看虚拟机列表。</span></div>
      </div>
    );
  }
  const rawVms = inventory.inventoryItems?.filter((item) => item.kind === "VM") ?? [];
  const vms = [...rawVms].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "createdAt") cmp = (a.createdAt || "").localeCompare(b.createdAt || "");
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function formatCreatedAt(iso) {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  return (
    <div className="panel formPanel">
      <div className="sectionHeader span2">
        <SectionTitle icon={<Trash2 />} title={`虚拟机列表 (${vms.length} 台)`} />
        <button type="button" className="dangerAction" disabled={!selectedVmIds.size || destroying} onClick={onDestroy}>
          <PowerOff size={16} />
          {destroying ? "执行中..." : `关机并删除 (${selectedVmIds.size})`}
        </button>
      </div>
      <div className="hintBox span2">勾选要清理的虚拟机，点击"关机并删除"将强制关机后删除。此操作不可撤销。点击列标题排序。</div>
      {error && <div className="alert span2"><ShieldAlert size={16} />{error}</div>}
      <div className="vmCleanupList span2">
        <div className="vmCleanupRow vmCleanupHeader">
          <input type="checkbox" checked={rawVms.length > 0 && rawVms.every((v) => selectedVmIds.has(v.id))} onChange={onToggleAll} />
          <span className="sortableHeader" onClick={() => toggleSort("name")}>名称 {sortKey === "name" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span>数据中心</span>
          <span className="sortableHeader" onClick={() => toggleSort("createdAt")}>创建时间 {sortKey === "createdAt" ? (sortAsc ? "▲" : "▼") : ""}</span>
        </div>
        {vms.map((item) => (
          <label key={item.id} className="vmCleanupRow">
            <input type="checkbox" checked={selectedVmIds.has(item.id)} onChange={() => onToggleVm(item.id)} />
            <span>{item.name}</span>
            <span className="muted">{item.datacenter}</span>
            <span className="muted">{formatCreatedAt(item.createdAt)}</span>
          </label>
        ))}
        {vms.length === 0 && <div className="emptyState small"><span>当前环境没有普通虚拟机。</span></div>}
      </div>
    </div>
  );
}

function OverviewTab({ inventory }) {
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  if (!inventory) {
    return (
      <div className="panel emptyPanel">
        <div className="emptyState"><Server size={32} /><span>请先连接 vSphere 后查看虚拟机概览。</span></div>
      </div>
    );
  }

  const allVms = inventory.inventoryItems?.filter((item) => item.kind === "VM") ?? [];
  const poweredOn = allVms.filter((v) => v.powerState === "poweredOn").length;
  const poweredOff = allVms.filter((v) => v.powerState === "poweredOff").length;
  const totalCPU = allVms.reduce((s, v) => s + (v.numCPU || 0), 0);
  const totalMemoryMB = allVms.reduce((s, v) => s + (v.memoryMB || 0), 0);
  const totalStorage = allVms.reduce((s, v) => s + (v.storageCommitted || 0), 0);

  const filtered = allVms.filter((vm) => {
    if (filterStatus === "poweredOn" && vm.powerState !== "poweredOn") return false;
    if (filterStatus === "poweredOff" && vm.powerState !== "poweredOff") return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return vm.name.toLowerCase().includes(q)
        || vm.ipAddress?.toLowerCase().includes(q)
        || vm.datacenter?.toLowerCase().includes(q)
        || vm.guestOS?.toLowerCase().includes(q);
    }
    return true;
  });

  const vms = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "createdAt") cmp = (a.createdAt || "").localeCompare(b.createdAt || "");
    else if (sortKey === "powerState") cmp = (a.powerState || "").localeCompare(b.powerState || "");
    else if (sortKey === "numCPU") cmp = (a.numCPU || 0) - (b.numCPU || 0);
    else if (sortKey === "memoryMB") cmp = (a.memoryMB || 0) - (b.memoryMB || 0);
    else if (sortKey === "storageCommitted") cmp = (a.storageCommitted || 0) - (b.storageCommitted || 0);
    else if (sortKey === "ipAddress") cmp = (a.ipAddress || "").localeCompare(b.ipAddress || "");
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function formatCreatedAt(iso) {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function powerLabel(state) {
    if (state === "poweredOn") return "运行中";
    if (state === "poweredOff") return "已关机";
    if (state === "suspended") return "已挂起";
    return state || "未知";
  }

  return (
    <div className="panel formPanel">
      <div className="sectionHeader span2">
        <SectionTitle icon={<Server />} title={`虚拟机概览 (${allVms.length} 台)`} />
      </div>

      <div className="overviewStats span2">
        <div className="overviewStat">
          <span className="overviewStatLabel">总 VM</span>
          <strong>{allVms.length}</strong>
        </div>
        <div className="overviewStat ok">
          <span className="overviewStatLabel">运行中</span>
          <strong>{poweredOn}</strong>
        </div>
        <div className="overviewStat bad">
          <span className="overviewStatLabel">已关机</span>
          <strong>{poweredOff}</strong>
        </div>
        <div className="overviewStat">
          <span className="overviewStatLabel"><Cpu size={13} style={{ verticalAlign: "middle", marginRight: 3 }} />总 CPU</span>
          <strong>{totalCPU} 核</strong>
        </div>
        <div className="overviewStat">
          <span className="overviewStatLabel"><MemoryStick size={13} style={{ verticalAlign: "middle", marginRight: 3 }} />总内存</span>
          <strong>{totalMemoryMB >= 1024 ? `${(totalMemoryMB / 1024).toFixed(1)} GB` : `${totalMemoryMB} MB`}</strong>
        </div>
        <div className="overviewStat">
          <span className="overviewStatLabel"><HardDrive size={13} style={{ verticalAlign: "middle", marginRight: 3 }} />总存储</span>
          <strong>{formatBytes(totalStorage)}</strong>
        </div>
      </div>

      <div className="overviewFilters span2">
        <div className="inputWithIcon">
          <Search size={16} />
          <input placeholder="搜索名称、IP、数据中心、操作系统..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <div className="segmented">
          <button type="button" className={filterStatus === "all" ? "selected" : ""} onClick={() => setFilterStatus("all")}>全部</button>
          <button type="button" className={filterStatus === "poweredOn" ? "selected" : ""} onClick={() => setFilterStatus("poweredOn")}>运行中</button>
          <button type="button" className={filterStatus === "poweredOff" ? "selected" : ""} onClick={() => setFilterStatus("poweredOff")}>已关机</button>
        </div>
      </div>

      <div className="vmOverviewList span2">
        <div className="vmOverviewRow vmOverviewHeader">
          <span className="sortableHeader" onClick={() => toggleSort("name")}>名称 {sortKey === "name" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span className="sortableHeader" onClick={() => toggleSort("powerState")}>状态 {sortKey === "powerState" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span className="sortableHeader" onClick={() => toggleSort("ipAddress")}>IP 地址 {sortKey === "ipAddress" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span className="sortableHeader" onClick={() => toggleSort("numCPU")}>CPU {sortKey === "numCPU" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span className="sortableHeader" onClick={() => toggleSort("memoryMB")}>内存 {sortKey === "memoryMB" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span className="sortableHeader" onClick={() => toggleSort("storageCommitted")}>存储 {sortKey === "storageCommitted" ? (sortAsc ? "▲" : "▼") : ""}</span>
          <span>操作系统</span>
          <span className="sortableHeader" onClick={() => toggleSort("createdAt")}>创建时间 {sortKey === "createdAt" ? (sortAsc ? "▲" : "▼") : ""}</span>
        </div>
        {vms.map((item) => (
          <div key={item.id} className="vmOverviewRow">
            <span className="vmName">{item.name}</span>
            <span>
              <span className={`powerBadge ${item.powerState === "poweredOn" ? "on" : item.powerState === "poweredOff" ? "off" : ""}`}>
                {powerLabel(item.powerState)}
              </span>
            </span>
            <span className={item.ipAddress ? "" : "muted"}>{item.ipAddress || "-"}</span>
            <span>{item.numCPU || "-"} 核</span>
            <span>{item.memoryMB ? (item.memoryMB >= 1024 ? `${(item.memoryMB / 1024).toFixed(1)} GB` : `${item.memoryMB} MB`) : "-"}</span>
            <span>{formatBytes(item.storageCommitted)}</span>
            <span className="muted osCell" title={item.guestOS}>{item.guestOS || "-"}</span>
            <span className="muted">{formatCreatedAt(item.createdAt)}</span>
          </div>
        ))}
        {vms.length === 0 && <div className="emptyState small"><span>没有匹配的虚拟机。</span></div>}
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return <h2 className="sectionTitle">{React.cloneElement(icon, { size: 18 })}{title}</h2>;
}

function TextField({ form, setForm, path, label, placeholder = "", type = "text", icon, onChangeExtra }) {
  const value = path.reduce((acc, key) => acc?.[key], form) ?? "";
  return (
    <div className="field">
      <label>{label}</label>
      <div className="inputWithIcon">
        {icon}
        <input type={type} value={value} placeholder={placeholder} onChange={(e) => { onChangeExtra?.(); updateNested(setForm, path, e.target.value); }} />
      </div>
    </div>
  );
}

function ResourceSelect({ label, value, options, valueKey = "id", render = (item) => item.name, onChange, disabled = false }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || !options.length}>
        {!options.length && <option value="">无可用选项</option>}
        {options.map((item) => {
          const v = item[valueKey] ?? "";
          return <option key={`${label}-${item.id}-${v}`} value={v}>{render(item)}</option>;
        })}
      </select>
    </div>
  );
}

function DatastoreSelect({ value, datastores, onChange }) {
  return (
    <div className="field">
      <label><HardDrive size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />Datastore</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!datastores.length}>
        {!datastores.length && <option value="">无可用选项</option>}
        {datastores.map((ds) => (
          <option key={ds.id} value={ds.name}>{ds.name}{ds.freeSpace > 0 ? ` (${formatBytes(ds.freeSpace)} 可用)` : ""}</option>
        ))}
      </select>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function Repeater({ icon, title, rows, columns, selectOptions = {}, onChange, emptyRow, readOnly = false, emptyMessage = "" }) {
  const [rowIds] = useState(() => ({ counter: 0, map: new Map() }));
  function getRowId(index) {
    if (!rowIds.map.has(index)) rowIds.map.set(index, ++rowIds.counter);
    return rowIds.map.get(index);
  }
  const safeRows = (readOnly && !rows.length) ? [] : (rows.length ? rows : [emptyRow]);
  return (
    <section className="nestedSection span2">
      <div className="sectionHeader">
        <SectionTitle icon={icon} title={title} />
        <button type="button" className="iconButton" onClick={() => onChange([...rows, emptyRow])} aria-label={`新增${title}`} disabled={readOnly}><Plus size={17} /></button>
      </div>
      {readOnly && !rows.length && <div className="readonlyNotice">{emptyMessage}</div>}
      {safeRows.map((row, index) => (
        <div className="rowEditor" key={getRowId(index)}>
          {columns.map(([key, label]) => (
            selectOptions[key]?.length ? (
              <select key={key} value={row[key] ?? ""} disabled={readOnly} onChange={(e) => { const n = [...safeRows]; n[index] = { ...n[index], [key]: e.target.value }; onChange(n); }}>
                <option value="">选择{label}</option>
                {selectOptions[key].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input key={key} value={row[key] ?? ""} placeholder={label} readOnly={readOnly} onChange={(e) => { const n = [...safeRows]; n[index] = { ...n[index], [key]: e.target.value }; onChange(n); }} />
            )
          ))}
          <button type="button" className="iconButton danger" onClick={() => onChange(safeRows.filter((_, ri) => ri !== index))} aria-label={`删除${title}`} disabled={readOnly}><Trash2 size={17} /></button>
        </div>
      ))}
    </section>
  );
}

function VmEditor({ form, setForm }) {
  const csvPreview = useMemo(() => form.vms.map((vm) => vm.name).join("\n"), [form.vms]);
  const generatedVms = getGeneratedVms(form.vmNaming);
  return (
    <section className="nestedSection span2">
      <div className="sectionHeader">
        <SectionTitle icon={<Terminal />} title="虚拟机清单" />
        <div className="segmented">
          <button type="button" className={form.vmNaming.mode === "generated" ? "selected" : ""} onClick={() => updateNested(setForm, ["vmNaming", "mode"], "generated")}>简单生成</button>
          <button type="button" className={form.vmNaming.mode === "manual" ? "selected" : ""} onClick={() => updateNested(setForm, ["vmNaming", "mode"], "manual")}>手动清单</button>
        </div>
      </div>
      {form.vmNaming.mode === "generated" ? (
        <>
          <div className="vmGenerator">
            <div className="field"><label>前缀</label><input value={form.vmNaming.prefix} onChange={(e) => updateNested(setForm, ["vmNaming", "prefix"], e.target.value)} /></div>
            <div className="field"><label>数量</label><input type="number" min="1" max="500" value={form.vmNaming.count} onChange={(e) => updateNested(setForm, ["vmNaming", "count"], Number(e.target.value))} /></div>
            <div className="field"><label>起始</label><input type="number" min="0" value={form.vmNaming.start} onChange={(e) => updateNested(setForm, ["vmNaming", "start"], Number(e.target.value))} /></div>
            <div className="field"><label>位数</label><input type="number" min="1" max="6" value={form.vmNaming.padding} onChange={(e) => updateNested(setForm, ["vmNaming", "padding"], Number(e.target.value))} /></div>
          </div>
          <div className="previewList">
            {generatedVms.slice(0, 8).map((vm) => <code key={vm.name}>{vm.name}</code>)}
            {generatedVms.length > 8 && <code>...还有 {generatedVms.length - 8} 台</code>}
          </div>
        </>
      ) : (
        <>
          <textarea value={csvPreview} onChange={(e) => { const vms = e.target.value.split(/\r?\n/).map((n) => ({ name: n })).filter((v) => v.name.trim()); setForm((c) => ({ ...c, vms: vms.length ? vms : [{ ...emptyVm }] })); }} rows={6} spellCheck="false" />
          <div className="hintBox">一行一个名称，支持 {"{{index}}"} 变量。</div>
        </>
      )}
    </section>
  );
}

function JobPanel({ job, onCancel, onRetry, onRefresh }) {
  const logBoxRef = useRef(null);
  const [sseLogs, setSseLogs] = useState([]);
  const [sseStatus, setSseStatus] = useState(null);

  useEffect(() => {
    if (!job) return;
    if (job.status !== "running" && job.status !== "queued") { setSseLogs([]); setSseStatus(null); return; }

    let es = null;
    let closed = false;

    async function connect() {
      setSseLogs([]); setSseStatus(null);
      const token = localStorage.getItem("massova.token");
      let url = `/api/jobs/${job.id}/events`;
      if (token) {
        try {
          const ticketRes = await fetch(`/api/jobs/${job.id}/events-ticket`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (ticketRes.ok && !closed) {
            const { ticket } = await ticketRes.json();
            url += `?ticket=${encodeURIComponent(ticket)}`;
          }
        } catch {
        }
      }
      if (closed) return;
      es = new EventSource(url);
      es.addEventListener("log", (e) => setSseLogs((p) => [...p, JSON.parse(e.data)]));
      es.addEventListener("status", (e) => setSseStatus(JSON.parse(e.data)));
      es.addEventListener("close", () => es.close());
      es.onerror = () => es.close();
    }

    connect();
    return () => { closed = true; es?.close(); };
  }, [job?.id, job?.status]);

  const allLogs = useMemo(() => {
    const base = job?.logs ?? [];
    return sseLogs.length === 0 ? base : [...base, ...sseLogs];
  }, [job?.logs?.length, sseLogs]);

  const logLineId = useMemo(() => {
    let counter = 0;
    return allLogs.map(() => ++counter);
  }, [allLogs]);

  useEffect(() => { if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight; }, [allLogs]);

  const status = sseStatus?.status ?? job?.status;
  const progress = sseStatus?.progress ?? job?.progress;
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const failed = progress?.failed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  function exportLogs() {
    if (!job) return;
    const lines = allLogs.map((l) => `[${new Date(l.at).toLocaleString()}] [${l.stream}] ${l.message}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `massova-${job.id}.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }

  return (
    <aside className="panel jobPanel">
      <div className="jobHeader">
        <div><p>当前任务</p><h2>{job ? job.id : "暂无任务"}</h2></div>
        <div className="actions">
          {job && <button className="iconButton" type="button" onClick={exportLogs} aria-label="导出日志"><Download size={17} /></button>}
          <button className="iconButton" type="button" onClick={onRefresh}><RefreshCw size={17} /></button>
          {status === "running" && <button className="iconButton danger" type="button" onClick={onCancel}><XCircle size={17} /></button>}
          {status === "failed" && <button className="iconButton" type="button" onClick={onRetry} title="重试失败项"><RotateCcw size={17} /></button>}
        </div>
      </div>
      {job ? (
        <>
          <div className="statusStrip"><StatusIcon status={status} /><span>{status}</span><strong>{completed}/{total}</strong></div>
          <div className="progressBar"><div className="progressFill" style={{ width: `${percent}%` }} /></div>
          {(completed > 0 || failed > 0) && (
            <div className="progressMeta">
              <span className="ok">{completed} 完成</span>
              {failed > 0 && <span className="bad">{failed} 失败</span>}
              <span>{total - completed - failed} 待执行</span>
            </div>
          )}
          <div className="commandList">
            {(job.commands ?? []).slice(0, 5).map((cmd, i) => <code key={i}>{cmd}</code>)}
          </div>
          <div className="logBox" ref={logBoxRef}>
            {allLogs.map((line, i) => (
              <div className={`logLine ${line.stream}`} key={logLineId[i]}>
                <time>{new Date(line.at).toLocaleTimeString()}</time>
                <span>{line.message}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="emptyState"><Copy size={24} /><span>提交后会在这里显示命令和日志。</span></div>
      )}
    </aside>
  );
}

function StatusIcon({ status }) {
  if (status === "succeeded") return <CheckCircle2 className="ok" size={17} />;
  if (status === "failed" || status === "cancelled" || status === "interrupted") return <XCircle className="bad" size={17} />;
  return <Activity className="run" size={17} />;
}

function updateNested(setForm, path, value) {
  setForm((current) => { const next = structuredClone(current); let c = next; for (const k of path.slice(0, -1)) c = c[k]; c[path.at(-1)] = value; return next; });
}

function getEffectiveVms(form) {
  return form.vmNaming?.mode === "manual" ? form.vms.filter((vm) => vm.name.trim()) : getGeneratedVms(form.vmNaming);
}

function getGeneratedVms(vmNaming = {}) {
  const prefix = String(vmNaming.prefix || "vm").trim() || "vm";
  const count = clampNumber(vmNaming.count, 1, 500);
  const start = clampNumber(vmNaming.start, 0, 999999);
  const padding = clampNumber(vmNaming.padding, 1, 6);
  return Array.from({ length: count }, (_, i) => ({ name: `${prefix}-${String(start + i).padStart(padding, "0")}` }));
}

function clampNumber(v, min, max) { const n = Number.isFinite(Number(v)) ? Number(v) : min; return Math.max(min, Math.min(max, n)); }

function mergeState(base, saved, session) {
  return {
    ...base, ...saved, sourceType: "inventory",
    target: { ...base.target, ...(saved.target ?? {}), ...(session.target ?? {}) },
    vmNaming: { ...base.vmNaming, ...(saved.vmNaming ?? {}) },
    networkMappings: Array.isArray(saved.networkMappings) ? saved.networkMappings : base.networkMappings,
    properties: Array.isArray(saved.properties) ? saved.properties : base.properties,
    vms: Array.isArray(saved.vms) ? saved.vms : base.vms
  };
}

function applyInventoryDefaults(current, inventory) {
  const firstCompute = inventory.computeTargets?.[0];
  const firstDatastore = inventory.datastores?.[0];
  const firstNetwork = inventory.networks?.[0];
  const dsNames = new Set((inventory.datastores ?? []).map((i) => i.name));
  const netNames = new Set((inventory.networks ?? []).map((i) => i.name));
  return {
    ...current,
    sourceInventoryPath: current.sourceInventoryPath || inventory.inventoryItems?.find((i) => i.kind === "Template")?.inventoryPath || "",
    target: {
      ...current.target,
      inventoryPath: current.target.inventoryPath || firstCompute?.inventoryPath || "",
      datastore: dsNames.has(current.target.datastore) ? current.target.datastore : firstDatastore?.name || "",
      folder: current.target.folder || "",
      resourcePool: current.target.resourcePool || ""
    },
    networkMappings: current.networkMappings.map((m) => ({ ...m, target: netNames.has(m.target) ? m.target : firstNetwork?.name || "" }))
  };
}

function applyInventorySourceDefaults(current, inventory) {
  const source = inventory?.inventoryItems?.find((i) => i.inventoryPath === current.sourceInventoryPath)
    ?? inventory?.inventoryItems?.find((i) => i.kind === "Template") ?? null;
  const targetNets = new Set((inventory?.networks ?? []).map((i) => i.name));
  const firstNet = inventory?.networks?.[0]?.name ?? "";
  const srcNets = source?.sourceNetworks?.length ? source.sourceNetworks : current.networkMappings.map((m) => m.source).filter(Boolean);
  return {
    ...current,
    sourceInventoryPath: source?.inventoryPath ?? current.sourceInventoryPath,
    networkMappings: srcNets.length ? srcNets.map((s) => ({ source: s, target: targetNets.has(s) ? s : firstNet })) : current.networkMappings
  };
}

createRoot(document.getElementById("root")).render(<App />);
