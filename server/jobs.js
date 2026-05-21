import { nanoid } from "nanoid";
import { buildOvfToolArgs, renderTemplate, runOvfTool, stringifyCommand } from "./ovftool.js";

const jobs = new Map();
const controllers = new Map();

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
    progress: { total: payload.vms.length, completed: 0, failed: 0 },
    commands: payload.vms.map((vm, index) => stringifyCommand(buildOvfToolArgs(payload, vm, index, { masked: true }))),
    logs: []
  };

  jobs.set(id, job);
  runJob(job, payload);
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
}

async function runJob(job, payload) {
  const controller = new AbortController();
  controllers.set(job.id, controller);

  job.status = "running";
  job.startedAt = new Date().toISOString();
  appendLog(job, "system", `开始部署 ${payload.vms.length} 台虚拟机`);

  for (const [index, vm] of payload.vms.entries()) {
    if (job.status === "cancelled") break;

    const maskedArgs = buildOvfToolArgs(payload, vm, index, { masked: true });
    const rawArgs = buildOvfToolArgs(payload, vm, index, { masked: false });
    const vmName = renderTemplate(vm.name || `VM-${index + 1}`, vm, index);

    appendLog(job, "system", `准备部署 ${vmName}`);
    appendLog(job, "command", stringifyCommand(maskedArgs));

    if (payload.dryRun) {
      job.progress.completed += 1;
      appendLog(job, "system", `${vmName} 干跑完成，未执行 ovftool`);
      continue;
    }

    const result = await runOvfTool(rawArgs, {
      signal: controller.signal,
      onLine: (stream, line) => appendLog(job, stream, line)
    });

    if (result.code === 0) {
      job.progress.completed += 1;
      appendLog(job, "system", `${vmName} 部署完成`);
    } else if (job.status !== "cancelled") {
      job.progress.failed += 1;
      appendLog(job, "stderr", `${vmName} 部署失败，退出码 ${result.code}`);
    }
  }

  if (job.status !== "cancelled") {
    job.status = job.progress.failed > 0 ? "failed" : "succeeded";
    job.finishedAt = new Date().toISOString();
    appendLog(job, "system", job.status === "succeeded" ? "全部任务完成" : "任务完成，但存在失败项");
  }

  controllers.delete(job.id);
}
