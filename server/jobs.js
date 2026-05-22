import { nanoid } from "nanoid";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { buildOvfToolArgs, renderTemplate, runOvfTool, stringifyCommand } from "./ovftool.js";
import { VmService } from "./services/vmService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const jobsFile = join(dataDir, "jobs.json");
const payloadsFile = join(dataDir, "payloads.json");
const ENCRYPTION_KEY_FILE = join(dataDir, ".payload-key");

const ALGO = "aes-256-gcm";
let encryptionKey = null;
let keyPromise = null;

async function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  return keyPromise ??= (async () => {
    try {
      encryptionKey = await readFile(ENCRYPTION_KEY_FILE);
    } catch {
      encryptionKey = randomBytes(32);
      await mkdir(dataDir, { recursive: true });
      await writeFile(ENCRYPTION_KEY_FILE, encryptionKey, { mode: 0o600 });
    }
    return encryptionKey;
  })();
}

function encryptField(plaintext) {
  const iv = randomBytes(12);
  const key = encryptionKey;
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptField(ciphertext) {
  if (!ciphertext.startsWith("enc:v1:")) return ciphertext;
  const parts = ciphertext.split(":");
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const data = Buffer.from(parts[4], "base64");
  const key = encryptionKey;
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, undefined, "utf8") + decipher.final("utf8");
}

function encryptPayload(payload) {
  if (!encryptionKey || !payload?.target?.password) return payload;
  const copy = JSON.parse(JSON.stringify(payload));
  copy.target.password = encryptField(copy.target.password);
  return copy;
}

function decryptPayload(payload) {
  if (!payload?.target?.password) return payload;
  const copy = JSON.parse(JSON.stringify(payload));
  if (copy.target.password.startsWith("enc:v1:")) {
    copy.target.password = decryptField(copy.target.password);
  }
  return copy;
}

const jobs = new Map();
const controllers = new Map();
const payloads = new Map();
const JOB_MAX_AGE = 24 * 60 * 60 * 1000;
let saveTimer = null;
let savePending = false;

function purgeExpiredJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (controllers.has(id)) continue;
    const terminalStates = ["succeeded", "failed", "cancelled", "interrupted"];
    if (terminalStates.includes(job.status) && job.finishedAt) {
      if (now - new Date(job.finishedAt).getTime() > JOB_MAX_AGE) {
        jobs.delete(id);
        payloads.delete(id);
      }
    }
  }
}

export async function initStore() {
  await getEncryptionKey();
  try {
    const raw = await readFile(jobsFile, "utf-8");
    const entries = JSON.parse(raw);
    if (Array.isArray(entries)) {
      for (const job of entries) {
        if (job.status === "running" || job.status === "queued") {
          job.status = job.progress?.failed > 0 ? "failed" : "interrupted";
          job.finishedAt = job.finishedAt || new Date().toISOString();
        }
        jobs.set(job.id, job);
      }
    }
  } catch {
  }
  try {
    const raw = await readFile(payloadsFile, "utf-8");
    const entries = JSON.parse(raw);
    if (Array.isArray(entries)) {
      for (const { id, payload } of entries) {
        payloads.set(id, decryptPayload(payload));
      }
    }
  } catch {
  }
  purgeExpiredJobs();
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  savePending = true;
  saveTimer = setTimeout(() => {
    savePending = false;
    saveToDisk();
  }, 500);
}

async function saveToDisk() {
  try {
    await mkdir(dataDir, { recursive: true });
    const entries = [...jobs.values()].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    await writeFile(jobsFile, JSON.stringify(entries, null, 2), "utf-8");

    const payloadEntries = [...payloads.entries()]
      .filter(([id]) => jobs.has(id))
      .map(([id, payload]) => ({ id, payload: encryptPayload(payload) }));
    await writeFile(payloadsFile, JSON.stringify(payloadEntries, null, 2), "utf-8");
  } catch (err) {
    console.error("保存任务数据失败:", err.message);
  }
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getJob(id) {
  return jobs.get(id);
}

export function cancelJob(id) {
  const job = jobs.get(id);
  const controller = controllers.get(id);
  if (!job || !controller) return false;
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  controller.abort();
  appendLog(job, "system", "任务已取消");
  scheduleSave();
  return true;
}

export function deleteJob(id) {
  if (jobs.has(id)) {
    jobs.delete(id);
    payloads.delete(id);
    controllers.delete(id);
    scheduleSave();
    return true;
  }
  return false;
}

export async function createJob(payload) {
  const id = nanoid(10);
  const job = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    dryRun: Boolean(payload.dryRun),
    concurrency: Math.max(1, Math.min(10, Number(payload.concurrency) || 1)),
    progress: { total: payload.vms.length, completed: 0, failed: 0 },
    commands: payload.vms.map((vm, index) =>
      stringifyCommand(buildOvfToolArgs(payload, vm, index, { masked: true }))
    ),
    logs: [],
    vmResults: payload.vms.map((vm, index) => ({
      index,
      name: renderTemplate(vm.name || `VM-${index + 1}`, vm, index),
      status: "pending"
    }))
  };

  jobs.set(id, job);
  const safePayload = JSON.parse(JSON.stringify(payload));
  payloads.set(id, safePayload);
  scheduleSave();
  runJob(job, safePayload).catch((err) => console.error(`runJob ${job.id} unhandled:`, err));
  return job;
}

export function retryFailed(id) {
  const job = jobs.get(id);
  const payload = payloads.get(id);
  if (!job || !payload) return null;
  if (job.status !== "failed") return null;
  if (controllers.has(id)) return null;

  const failedIndices = (job.vmResults ?? [])
    .map((r, i) => (r.status === "failed" ? i : -1))
    .filter((i) => i >= 0);

  if (!failedIndices.length) return null;

  for (const idx of failedIndices) {
    job.vmResults[idx].status = "pending";
  }
  job.progress.failed = Math.max(0, job.progress.failed - failedIndices.length);
  job.status = "queued";
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  appendLog(job, "system", `重试 ${failedIndices.length} 台失败的虚拟机`);
  scheduleSave();

  runRetryJob(job, payload, failedIndices).catch((err) => console.error(`runRetryJob ${job.id} unhandled:`, err));
  return job;
}

export async function createDestroyJob(target, vmIds, incomingPayload = {}) {
  const uniqueVmIds = [...new Set(vmIds)];
  const id = nanoid(10);
  const job = {
    id,
    type: "destroy",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    dryRun: false,
    concurrency: 1,
    progress: { total: uniqueVmIds.length, completed: 0, failed: 0 },
    commands: [],
    logs: [],
    vmResults: uniqueVmIds.map((vmId, index) => ({
      index,
      name: vmId,
      status: "pending"
    }))
  };

  jobs.set(id, job);
  payloads.set(id, { ...incomingPayload, type: "destroy", target, vmIds: uniqueVmIds });
  scheduleSave();
  runDestroyJob(job, target, uniqueVmIds).catch((err) => console.error(`runDestroyJob ${job.id} unhandled:`, err));
  return job;
}

export async function createPowerControlJob(target, vmIds, action, incomingPayload = {}) {
  const uniqueVmIds = [...new Set(vmIds)];
  const id = nanoid(10);
  const job = {
    id,
    type: "power",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    dryRun: false,
    concurrency: 1,
    progress: { total: uniqueVmIds.length, completed: 0, failed: 0 },
    commands: [],
    logs: [],
    vmResults: uniqueVmIds.map((vmId, index) => ({
      index,
      name: vmId,
      status: "pending"
    }))
  };

  jobs.set(id, job);
  payloads.set(id, { ...incomingPayload, type: "power", target, vmIds: uniqueVmIds, action });
  scheduleSave();
  runPowerControlJob(job, target, uniqueVmIds, action).catch((err) => console.error(`runPowerControlJob ${job.id} unhandled:`, err));
  return job;
}

function appendLog(job, stream, message) {
  job.logs.push({
    at: new Date().toISOString(),
    stream,
    message
  });

  if (job.logs.length > 1000) {
    job.logs.splice(0, job.logs.length - 1000);
  }
  if (job.logs.length % 10 === 0 || stream === "system" || !savePending) {
    scheduleSave();
  }
}

async function runJob(job, payload) {
  try {
    const controller = new AbortController();
    controllers.set(job.id, controller);

    job.status = "running";
    job.startedAt = new Date().toISOString();
    const concurrency = job.concurrency || 1;
    appendLog(job, "system", `开始部署 ${payload.vms.length} 台虚拟机 (并发数: ${concurrency})`);

    const pendingIndices = payload.vms
      .map((_, i) => i)
      .filter((i) => job.vmResults[i].status === "pending");

    await runWithConcurrency(pendingIndices, concurrency, async (index) => {
      if (job.status === "cancelled") return;
      if (job.vmResults[index].status !== "pending") return;

      const vm = payload.vms[index];
      const maskedArgs = buildOvfToolArgs(payload, vm, index, { masked: true });
      const rawArgs = buildOvfToolArgs(payload, vm, index, { masked: false });
      const vmName = renderTemplate(vm.name || `VM-${index + 1}`, vm, index);

      appendLog(job, "system", `准备部署 ${vmName}`);
      appendLog(job, "command", stringifyCommand(maskedArgs));

      if (payload.dryRun) {
        job.progress.completed += 1;
        job.vmResults[index].status = "succeeded";
        appendLog(job, "system", `${vmName} 干跑完成，未执行 ovftool`);
        return;
      }

      const result = await runOvfTool(rawArgs, {
        signal: controller.signal,
        onLine: (stream, line) => appendLog(job, stream, line)
      });

      if (result.code === 0) {
        job.progress.completed += 1;
        job.vmResults[index].status = "succeeded";
        appendLog(job, "system", `${vmName} 部署完成`);
      } else if (job.status !== "cancelled") {
        job.progress.failed += 1;
        job.vmResults[index].status = "failed";
        appendLog(job, "stderr", `${vmName} 部署失败，退出码 ${result.code}`);
      }
    });

    if (job.status !== "cancelled") {
      job.status = job.progress.failed > 0 ? "failed" : "succeeded";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "system", job.status === "succeeded" ? "全部任务完成" : "任务完成，但存在失败项");
    }
  } catch (err) {
    if (job.status !== "cancelled") {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "stderr", `任务异常: ${err.message}`);
    }
    console.error(`runJob ${job.id} error:`, err);
  } finally {
    controllers.delete(job.id);
    scheduleSave();
  }
}

async function runRetryJob(job, payload, failedIndices) {
  try {
    const controller = new AbortController();
    controllers.set(job.id, controller);

    job.status = "running";
    const concurrency = job.concurrency || 1;
    appendLog(job, "system", `开始重试 ${failedIndices.length} 台虚拟机 (并发数: ${concurrency})`);

    await runWithConcurrency(failedIndices, concurrency, async (index) => {
      if (job.status === "cancelled") return;
      if (job.vmResults[index].status !== "pending") return;

      const vm = payload.vms[index];
      const rawArgs = buildOvfToolArgs(payload, vm, index, { masked: false });
      const maskedArgs = buildOvfToolArgs(payload, vm, index, { masked: true });
      const vmName = job.vmResults[index].name;

      appendLog(job, "system", `准备重试部署 ${vmName}`);
      appendLog(job, "command", stringifyCommand(maskedArgs));

      if (job.dryRun) {
        job.progress.completed += 1;
        job.vmResults[index].status = "succeeded";
        appendLog(job, "system", `${vmName} 干跑完成`);
        return;
      }

      const result = await runOvfTool(rawArgs, {
        signal: controller.signal,
        onLine: (stream, line) => appendLog(job, stream, line)
      });

      if (result.code === 0) {
        job.progress.completed += 1;
        job.vmResults[index].status = "succeeded";
        appendLog(job, "system", `${vmName} 重试部署完成`);
      } else if (job.status !== "cancelled") {
        job.progress.failed += 1;
        job.vmResults[index].status = "failed";
        appendLog(job, "stderr", `${vmName} 重试失败，退出码 ${result.code}`);
      }
    });

    if (job.status !== "cancelled") {
      job.status = job.progress.failed > 0 ? "failed" : "succeeded";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "system", job.status === "succeeded" ? "重试全部成功" : "重试完成，但仍有失败项");
    }
  } catch (err) {
    if (job.status !== "cancelled") {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "stderr", `重试异常: ${err.message}`);
    }
    console.error(`runRetryJob ${job.id} error:`, err);
  } finally {
    controllers.delete(job.id);
    scheduleSave();
  }
}

async function runDestroyJob(job, target, vmIds) {
  const controller = new AbortController();
  controllers.set(job.id, controller);

  try {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    appendLog(job, "system", `开始批量销毁 ${vmIds.length} 台虚拟机`);

    const service = new VmService(target);

    for (const vmId of vmIds) {
      if (job.status === "cancelled") break;
      const idx = vmIds.indexOf(vmId);
      
      try {
        appendLog(job, "system", `正在销毁: ${vmId}...`);
        // First try to power off if it's on (simple best effort)
        try { await service.powerOff(vmId); } catch (e) { appendLog(job, "system", `关机跳过: ${e.message}`); }
        
        await service.destroy(vmId);
        job.progress.completed += 1;
        job.vmResults[idx].status = "succeeded";
        appendLog(job, "system", `${vmId} 已删除`);
      } catch (err) {
        job.progress.failed += 1;
        job.vmResults[idx].status = "failed";
        appendLog(job, "stderr", `${vmId} 销毁失败: ${err.message}`);
      }
      scheduleSave();
    }

    if (job.status !== "cancelled") {
      job.status = job.progress.failed > 0 ? "failed" : "succeeded";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "system", job.status === "succeeded" ? "全部销毁完成" : "销毁完成，但存在失败项");
    }
  } catch (err) {
    if (job.status !== "cancelled") {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "stderr", `销毁异常: ${err.message}`);
    }
    console.error(`runDestroyJob ${job.id} error:`, err);
  } finally {
    controllers.delete(job.id);
    scheduleSave();
  }
}

async function runWithConcurrency(indices, concurrency, taskFn) {
  let nextIndex = 0;

  async function next() {
    while (nextIndex < indices.length) {
      const idx = indices[nextIndex++];
      await taskFn(idx);
    }
  }

  const workers = [];
  const limit = Math.min(concurrency, indices.length);
  for (let i = 0; i < limit; i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

async function runPowerControlJob(job, target, vmIds, action) {
  const controller = new AbortController();
  controllers.set(job.id, controller);

  const label = action === "on" ? "开机" : action === "reset" ? "重启" : "关机";

  try {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    appendLog(job, "system", `开始批量${label} ${vmIds.length} 台虚拟机`);

    const service = new VmService(target);

    for (const vmId of vmIds) {
      if (job.status === "cancelled") break;
      const idx = vmIds.indexOf(vmId);
      
      try {
        appendLog(job, "system", `正在${label}: ${vmId}...`);
        
        if (action === "on") await service.powerOn(vmId);
        else if (action === "reset") await service.reset(vmId);
        else await service.powerOff(vmId);

        job.progress.completed += 1;
        job.vmResults[idx].status = "succeeded";
        appendLog(job, "system", `${vmId} ${label}成功`);
      } catch (err) {
        job.progress.failed += 1;
        job.vmResults[idx].status = "failed";
        appendLog(job, "stderr", `${vmId} ${label}失败: ${err.message}`);
      }
      scheduleSave();
    }

    if (job.status !== "cancelled") {
      job.status = job.progress.failed > 0 ? "failed" : "succeeded";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "system", job.status === "succeeded" ? `全部${label}完成` : `${label}完成，但存在失败项`);
    }
  } catch (err) {
    if (job.status !== "cancelled") {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "stderr", `批量${label}异常: ${err.message}`);
    }
    console.error(`runPowerControlJob ${job.id} error:`, err);
  } finally {
    controllers.delete(job.id);
    scheduleSave();
  }
}

export async function createSnapshotJob(target, vmIds, name, description, memory, incomingPayload = {}) {
  const uniqueVmIds = [...new Set(vmIds)];
  const id = nanoid(10);
  const job = {
    id,
    type: "snapshot",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    dryRun: false,
    concurrency: 1,
    progress: { total: uniqueVmIds.length, completed: 0, failed: 0 },
    commands: [],
    logs: [],
    vmResults: uniqueVmIds.map((vmId, index) => ({
      index,
      name: vmId,
      status: "pending"
    }))
  };

  jobs.set(id, job);
  payloads.set(id, { ...incomingPayload, type: "snapshot", target, vmIds: uniqueVmIds, snapshotName: name });
  scheduleSave();
  runSnapshotJob(job, target, uniqueVmIds, name, description, memory).catch((err) => console.error(`runSnapshotJob ${job.id} unhandled:`, err));
  return job;
}

async function runSnapshotJob(job, target, vmIds, name, description, memory) {
  const controller = new AbortController();
  controllers.set(job.id, controller);

  try {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    appendLog(job, "system", `开始对 ${vmIds.length} 台虚拟机拍摄快照: ${name}`);

    const service = new VmService(target);

    for (const vmId of vmIds) {
      if (job.status === "cancelled") break;
      const idx = vmIds.indexOf(vmId);
      
      try {
        appendLog(job, "system", `正在拍摄快照: ${vmId}...`);
        await service.createSnapshot(vmId, name, description, memory);
        job.progress.completed += 1;
        job.vmResults[idx].status = "succeeded";
        appendLog(job, "system", `${vmId} 快照拍摄完成`);
      } catch (err) {
        job.progress.failed += 1;
        job.vmResults[idx].status = "failed";
        appendLog(job, "stderr", `${vmId} 快照拍摄失败: ${err.message}`);
      }
      scheduleSave();
    }

    if (job.status !== "cancelled") {
      job.status = job.progress.failed > 0 ? "failed" : "succeeded";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "system", job.status === "succeeded" ? "全部快照任务完成" : "快照任务完成，但存在失败项");
    }
  } catch (err) {
    if (job.status !== "cancelled") {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "stderr", `批量快照异常: ${err.message}`);
    }
    console.error(`runSnapshotJob ${job.id} error:`, err);
  } finally {
    controllers.delete(job.id);
    scheduleSave();
  }
}
