import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  CheckCircle2,
  Copy,
  KeyRound,
  Network,
  Play,
  Plus,
  Power,
  RefreshCw,
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
  const [form, setForm] = useState(loadInitialState);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [error, setError] = useState("");
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [inventory, setInventory] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const activeJob = jobs.find((job) => job.id === activeJobId) ?? jobs[0];
  const effectiveVms = getEffectiveVms(form);
  const vmCount = effectiveVms.length;
  const selectedInventorySource = inventory?.inventoryItems?.find((item) => item.inventoryPath === form.sourceInventoryPath);
  const sourceNetworkOptions = selectedInventorySource?.sourceNetworks ?? [];

  async function refreshJobs() {
    const response = await fetch("/api/jobs");
    const data = await response.json();
    setJobs(data.jobs ?? []);
    if (!activeJobId && data.jobs?.[0]) setActiveJobId(data.jobs[0].id);
  }

  useEffect(() => {
    refreshJobs();
    const timer = setInterval(refreshJobs, 1800);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const { target, ...rest } = form;
    const { password, ...safeTarget } = target;
    localStorage.setItem(storageKey, JSON.stringify({ ...rest, target: safeTarget }));
    sessionStorage.setItem(sessionStorageKey, JSON.stringify({ target: { password } }));
  }, [form]);

  async function submitDeployment(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vms: effectiveVms })
      });
      const data = await response.json();
      if (!response.ok) throw new Error((data.errors ?? [data.error]).filter(Boolean).join("；"));
      setActiveJobId(data.job.id);
      await refreshJobs();
    } catch (err) {
      setError(err.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelActiveJob() {
    if (!activeJob) return;
    await fetch(`/api/jobs/${activeJob.id}/cancel`, { method: "POST" });
    await refreshJobs();
  }

  async function probeTarget() {
    setError("");
    setProbe(null);
    setInventory(null);
    setProbing(true);
    try {
      const response = await fetch("/api/targets/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: form.target })
      });
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
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark"><Server size={22} /></span>
          <div>
            <strong>MassOVA</strong>
            <small>ESXi 批量 OVA 部署</small>
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
        <nav className="jobNav">
          {jobs.map((job) => (
            <button
              className={job.id === activeJob?.id ? "active" : ""}
              key={job.id}
              onClick={() => setActiveJobId(job.id)}
            >
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
            <p>Deployment Console</p>
            <h1>批量部署 OVA 到 ESXi</h1>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={form.dryRun}
              onChange={(event) => setForm((current) => ({ ...current, dryRun: event.target.checked }))}
            />
            <span>干跑模式</span>
          </label>
        </header>

        <div className="contentGrid">
          <form className="panel formPanel" onSubmit={submitDeployment}>
            <SectionTitle icon={<Server />} title="连接与目标" />
            <div className="field">
              <label>平台类型</label>
              <select
                value={form.target.platform}
                onChange={(event) => {
                  resetConnection();
                  updateNested(setForm, ["target", "platform"], event.target.value);
                }}
              >
                <option value="esxi">ESXi</option>
                <option value="vcenter">vCenter</option>
              </select>
            </div>
            <TextField form={form} setForm={setForm} path={["target", "host"]} label="vSphere 地址" placeholder={form.target.platform === "vcenter" ? "172.16.109.250" : "192.168.10.20"} onChangeExtra={resetConnection} />
            <TextField form={form} setForm={setForm} path={["target", "username"]} label="用户名" onChangeExtra={resetConnection} />
            <TextField form={form} setForm={setForm} path={["target", "password"]} label="密码" type="password" icon={<KeyRound size={16} />} onChangeExtra={resetConnection} />

            <div className="probeRow span2">
              <button type="button" className="secondaryAction" onClick={probeTarget} disabled={probing}>
                <RefreshCw size={17} />
                {probing ? "连接中" : "连接并读取资源"}
              </button>
              {probe && (
                <div className={probe.ok ? "probeResult okResult" : "probeResult badResult"}>
                  <StatusIcon status={probe.ok ? "succeeded" : "failed"} />
                  <span>{probe.message}</span>
                </div>
              )}
            </div>

            {inventory && (
              <section className="resourceGrid span2">
                <ResourceSelect
                  label={form.target.platform === "vcenter" ? "部署目标" : "主机"}
                  value={form.target.inventoryPath}
                  options={inventory.computeTargets}
                  valueKey="inventoryPath"
                  render={(item) => item.datacenter ? `${item.datacenter} / ${item.name}` : item.name}
                  onChange={(value) => updateNested(setForm, ["target", "inventoryPath"], value)}
                  disabled={form.target.platform === "esxi"}
                />
                <ResourceSelect
                  label="Datastore"
                  value={form.target.datastore}
                  options={inventory.datastores}
                  valueKey="name"
                  onChange={(value) => updateNested(setForm, ["target", "datastore"], value)}
                />
                <ResourceSelect
                  label="VM Folder"
                  value={form.target.folder}
                  options={[{ id: "", name: "不指定" }, ...(inventory.folders ?? [])]}
                  valueKey="name"
                  onChange={(value) => updateNested(setForm, ["target", "folder"], value === "不指定" ? "" : value)}
                />
                <div className="field">
                  <label>目标路径</label>
                  <input value={form.target.platform === "vcenter" ? form.target.inventoryPath : "ESXi 直连"} readOnly />
                </div>
              </section>
            )}

            {!inventory && (
              <div className="hintBox span2">
                填写地址、账号和密码后先连接，datastore、网络和部署目标会自动变成可选择项。
              </div>
            )}

            <div className="field">
              <label>磁盘模式</label>
              <select
                value={form.target.diskMode}
                onChange={(event) => updateNested(setForm, ["target", "diskMode"], event.target.value)}
              >
                <option value="thin">thin</option>
                <option value="thick">thick</option>
                <option value="eagerZeroedThick">eagerZeroedThick</option>
              </select>
            </div>

            <label className="checkLine">
              <input
                type="checkbox"
                checked={form.target.powerOn}
                onChange={(event) => updateNested(setForm, ["target", "powerOn"], event.target.checked)}
              />
              <Power size={16} />
              部署后开机
            </label>

            <section className="nestedSection span2">
              <SectionTitle icon={<Copy />} title="部署源" />
              <div className="resourceGrid">
                <ResourceSelect
                  label="模板"
                  value={form.sourceInventoryPath}
                  options={(inventory?.inventoryItems ?? []).filter((item) => item.kind === "Template")}
                  valueKey="inventoryPath"
                  render={(item) => `${item.datacenter} / ${item.name}`}
                  onChange={(value) => setForm((current) => applyInventorySourceDefaults({ ...current, sourceInventoryPath: value }, inventory))}
                />
                <div className="hintBox">
                  这里只允许选择 vSphere 模板作为源。大批量部署时不会重复传输本地 OVA。
                </div>
              </div>
            </section>

            <Repeater
              icon={<Network />}
              title="网络映射"
              rows={form.networkMappings}
              columns={[["source", "模板源网络"], ["target", "ESXi Port Group"]]}
              selectOptions={{
                source: sourceNetworkOptions,
                target: inventory?.networks?.map((item) => item.name) ?? []
              }}
              onChange={(rows) => setForm((current) => ({ ...current, networkMappings: rows }))}
              emptyRow={{ source: "", target: "" }}
            />

            <Repeater
              icon={<Settings2 />}
              title="OVF 属性"
              rows={form.properties}
              columns={[["key", "属性名"], ["value", "属性值，支持 {{name}} / {{index}}"]]}
              onChange={(rows) => setForm((current) => ({ ...current, properties: rows }))}
              emptyRow={{ key: "", value: "" }}
              readOnly
              emptyMessage="模板批量部署不使用 OVF 属性"
            />

            <VmEditor form={form} setForm={setForm} />

            {error && <div className="alert"><ShieldAlert size={16} />{error}</div>}

            <button className="primaryAction" type="submit" disabled={submitting}>
              <Play size={18} />
              {form.dryRun ? "生成部署预览" : "开始批量部署"}
            </button>
          </form>

          <JobPanel job={activeJob} onCancel={cancelActiveJob} onRefresh={refreshJobs} />
        </div>
      </section>
    </main>
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
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChangeExtra?.();
            updateNested(setForm, path, event.target.value);
          }}
        />
      </div>
    </div>
  );
}

function ResourceSelect({ label, value, options, valueKey = "id", render = (item) => item.name, onChange, disabled = false }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || !options.length}>
        {!options.length && <option value="">无可用选项</option>}
        {options.map((item) => {
          const optionValue = item[valueKey] ?? "";
          return (
            <option key={`${label}-${item.id}-${optionValue}`} value={optionValue}>
              {render(item)}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function Repeater({ icon, title, rows, columns, selectOptions = {}, onChange, emptyRow, readOnly = false, emptyMessage = "" }) {
  const safeRows = rows.length ? rows : [emptyRow];
  return (
    <section className="nestedSection span2">
      <div className="sectionHeader">
        <SectionTitle icon={icon} title={title} />
        <button type="button" className="iconButton" onClick={() => onChange([...rows, emptyRow])} aria-label={`新增${title}`} disabled={readOnly}>
          <Plus size={17} />
        </button>
      </div>
      {readOnly && !rows.length && <div className="readonlyNotice">{emptyMessage}</div>}
      {safeRows.map((row, index) => (
        <div className="rowEditor" key={index}>
          {columns.map(([key, label]) => (
            selectOptions[key]?.length ? (
              <select
                key={key}
                value={row[key] ?? ""}
                disabled={readOnly}
                onChange={(event) => {
                  const next = [...safeRows];
                  next[index] = { ...next[index], [key]: event.target.value };
                  onChange(next);
                }}
              >
                <option value="">选择{label}</option>
                {selectOptions[key].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input
                key={key}
                value={row[key] ?? ""}
                placeholder={label}
                readOnly={readOnly}
                onChange={(event) => {
                  const next = [...safeRows];
                  next[index] = { ...next[index], [key]: event.target.value };
                  onChange(next);
                }}
              />
            )
          ))}
          <button type="button" className="iconButton danger" onClick={() => onChange(safeRows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`删除${title}`} disabled={readOnly}>
            <Trash2 size={17} />
          </button>
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
          <button
            type="button"
            className={form.vmNaming.mode === "generated" ? "selected" : ""}
            onClick={() => updateNested(setForm, ["vmNaming", "mode"], "generated")}
          >
            简单生成
          </button>
          <button
            type="button"
            className={form.vmNaming.mode === "manual" ? "selected" : ""}
            onClick={() => updateNested(setForm, ["vmNaming", "mode"], "manual")}
          >
            手动清单
          </button>
        </div>
      </div>
      {form.vmNaming.mode === "generated" ? (
        <>
          <div className="vmGenerator">
            <div className="field">
              <label>名称前缀</label>
              <input value={form.vmNaming.prefix} onChange={(event) => updateNested(setForm, ["vmNaming", "prefix"], event.target.value)} />
            </div>
            <div className="field">
              <label>数量</label>
              <input type="number" min="1" max="500" value={form.vmNaming.count} onChange={(event) => updateNested(setForm, ["vmNaming", "count"], Number(event.target.value))} />
            </div>
            <div className="field">
              <label>起始编号</label>
              <input type="number" min="0" value={form.vmNaming.start} onChange={(event) => updateNested(setForm, ["vmNaming", "start"], Number(event.target.value))} />
            </div>
            <div className="field">
              <label>编号位数</label>
              <input type="number" min="1" max="6" value={form.vmNaming.padding} onChange={(event) => updateNested(setForm, ["vmNaming", "padding"], Number(event.target.value))} />
            </div>
          </div>
          <div className="previewList">
            {generatedVms.slice(0, 8).map((vm) => <code key={vm.name}>{vm.name}</code>)}
            {generatedVms.length > 8 && <code>还有 {generatedVms.length - 8} 台...</code>}
          </div>
          <div className="hintBox">这里设置的是新建虚拟机的名称。比如前缀 openclaw、数量 3、起始 1、位数 2，会生成 openclaw-01 到 openclaw-03。</div>
        </>
      ) : (
        <>
          <button type="button" className="secondaryAction inlineAction" onClick={() => setForm((current) => ({ ...current, vms: [...current.vms, { ...emptyVm, name: `lab-${current.vms.length + 1}` }] }))}>
            <Plus size={17} />
            新增一台
          </button>
          <textarea
            value={csvPreview}
            onChange={(event) => {
              const vms = event.target.value.split(/\r?\n/).map((name) => ({ name })).filter((vm) => vm.name.trim());
              setForm((current) => ({ ...current, vms: vms.length ? vms : [{ ...emptyVm }] }));
            }}
            rows={8}
            spellCheck="false"
          />
          <div className="hintBox">一行一个新虚拟机名称。也可以写 {{index}}，提交时会替换成序号。</div>
        </>
      )}
    </section>
  );
}

function JobPanel({ job, onCancel, onRefresh }) {
  return (
    <aside className="panel jobPanel">
      <div className="jobHeader">
        <div>
          <p>当前任务</p>
          <h2>{job ? job.id : "暂无任务"}</h2>
        </div>
        <div className="actions">
          <button className="iconButton" type="button" onClick={onRefresh} aria-label="刷新任务">
            <RefreshCw size={17} />
          </button>
          {job?.status === "running" && (
            <button className="iconButton danger" type="button" onClick={onCancel} aria-label="取消任务">
              <XCircle size={17} />
            </button>
          )}
        </div>
      </div>

      {job ? (
        <>
          <div className="statusStrip">
            <StatusIcon status={job.status} />
            <span>{job.status}</span>
            <strong>{job.progress.completed}/{job.progress.total}</strong>
          </div>
          <div className="commandList">
            {(job.commands ?? []).slice(0, 5).map((command, index) => (
              <code key={index}>{command}</code>
            ))}
          </div>
          <div className="logBox">
            {(job.logs ?? []).map((line, index) => (
              <div className={`logLine ${line.stream}`} key={`${line.at}-${index}`}>
                <time>{new Date(line.at).toLocaleTimeString()}</time>
                <span>{line.message}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="emptyState">
          <Copy size={24} />
          <span>提交后会在这里显示 ovftool 命令和执行日志。</span>
        </div>
      )}
    </aside>
  );
}

function StatusIcon({ status }) {
  if (status === "succeeded") return <CheckCircle2 className="ok" size={17} />;
  if (status === "failed" || status === "cancelled") return <XCircle className="bad" size={17} />;
  return <Activity className="run" size={17} />;
}

function updateNested(setForm, path, value) {
  setForm((current) => {
    const next = structuredClone(current);
    let cursor = next;
    for (const key of path.slice(0, -1)) cursor = cursor[key];
    cursor[path.at(-1)] = value;
    return next;
  });
}

function getEffectiveVms(form) {
  if (form.vmNaming?.mode === "manual") return form.vms.filter((vm) => vm.name.trim());
  return getGeneratedVms(form.vmNaming);
}

function getGeneratedVms(vmNaming = {}) {
  const prefix = String(vmNaming.prefix || "vm").trim() || "vm";
  const count = clampNumber(vmNaming.count, 1, 500);
  const start = clampNumber(vmNaming.start, 0, 999999);
  const padding = clampNumber(vmNaming.padding, 1, 6);
  return Array.from({ length: count }, (_, index) => {
    const number = String(start + index).padStart(padding, "0");
    return { name: `${prefix}-${number}` };
  });
}

function clampNumber(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Number(value) : min;
  return Math.max(min, Math.min(max, number));
}

function mergeState(base, saved, session) {
  return {
    ...base,
    ...saved,
    sourceType: "inventory",
    target: {
      ...base.target,
      ...(saved.target ?? {}),
      ...(session.target ?? {})
    },
    vmNaming: {
      ...base.vmNaming,
      ...(saved.vmNaming ?? {})
    },
    networkMappings: Array.isArray(saved.networkMappings) ? saved.networkMappings : base.networkMappings,
    properties: Array.isArray(saved.properties) ? saved.properties : base.properties,
    vms: Array.isArray(saved.vms) ? saved.vms : base.vms
  };
}

function applyInventoryDefaults(current, inventory) {
  const firstCompute = inventory.computeTargets?.[0];
  const firstDatastore = inventory.datastores?.[0];
  const firstNetwork = inventory.networks?.[0];
  const datastoreNames = new Set((inventory.datastores ?? []).map((item) => item.name));
  const networkNames = new Set((inventory.networks ?? []).map((item) => item.name));
  return {
    ...current,
    sourceInventoryPath: current.sourceInventoryPath || inventory.inventoryItems?.find((item) => item.kind === "Template")?.inventoryPath || "",
    target: {
      ...current.target,
      inventoryPath: current.target.inventoryPath || firstCompute?.inventoryPath || "",
      datastore: datastoreNames.has(current.target.datastore) ? current.target.datastore : firstDatastore?.name || "",
      folder: current.target.folder || "",
      resourcePool: current.target.resourcePool || ""
    },
    networkMappings: current.networkMappings.map((mapping) => ({
      ...mapping,
      target: networkNames.has(mapping.target) ? mapping.target : firstNetwork?.name || ""
    }))
  };
}

function applyInventorySourceDefaults(current, inventory) {
  const source = inventory?.inventoryItems?.find((item) => item.inventoryPath === current.sourceInventoryPath)
    ?? inventory?.inventoryItems?.find((item) => item.kind === "Template")
    ?? null;
  const targetNetworks = new Set((inventory?.networks ?? []).map((item) => item.name));
  const firstTargetNetwork = inventory?.networks?.[0]?.name ?? "";
  const sourceNetworks = source?.sourceNetworks?.length ? source.sourceNetworks : current.networkMappings.map((mapping) => mapping.source).filter(Boolean);
  const networkMappings = sourceNetworks.length
    ? sourceNetworks.map((sourceNetwork) => ({
      source: sourceNetwork,
      target: targetNetworks.has(sourceNetwork) ? sourceNetwork : firstTargetNetwork
    }))
    : current.networkMappings;

  return {
    ...current,
    sourceInventoryPath: source?.inventoryPath ?? current.sourceInventoryPath,
    networkMappings
  };
}

createRoot(document.getElementById("root")).render(<App />);
