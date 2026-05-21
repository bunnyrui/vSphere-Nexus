import { nanoid } from "nanoid";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOvfToolArgs, renderTemplate, runOvfTool, stringifyCommand } from "./ovftool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const jobsFile = join(dataDir, "jobs.json");
const payloadsFile = join(dataDir, "payloads.json");

const jobs = new Map();
const controllers = new Map();
const payloads = new Map();
let saveTimer = null;

export async function initStore() {
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
        payloads.set(id, payload);
      }
    }
  } catch {
  }
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToDisk, 500);
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
      .map(([id, payload]) => ({ id, payload }));
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
  const safePayload = {
    ...payload,
    target: { ...payload.target }
  };
  payloads.set(id, safePayload);
  scheduleSave();
  runJob(job, safePayload);
  return job;
}

export function retryFailed(id) {
  const job = jobs.get(id);
  const payload = payloads.get(id);
  if (!job || !payload) return null;
  if (job.status !== "failed") return null;

  const failedIndices = (job.vmResults ?? [])
    .map((r, i) => (r.status === "failed" ? i : -1))
    .filter((i) => i >= 0);

  if (!failedIndices.length) return null;

  for (const idx of failedIndices) {
    job.vmResults[idx].status = "pending";
  }
  job.progress.failed -= failedIndices.length;
  job.status = "queued";
  job.finishedAt = null;
  appendLog(job, "system", `重试 ${failedIndices.length} 台失败的虚拟机`);
  scheduleSave();

  runRetryJob(job, payload, failedIndices);
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
  scheduleSave();
}

async function runJob(job, payload) {
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

  controllers.delete(job.id);
  scheduleSave();
}

async function runRetryJob(job, payload, failedIndices) {
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

  controllers.delete(job.id);
  scheduleSave();
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
