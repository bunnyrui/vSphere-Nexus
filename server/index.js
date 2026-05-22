import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { access, constants as fsConstants } from "node:fs/promises";
import { createJob, getJob, listJobs, cancelJob, retryFailed, initStore, createDestroyJob } from "./jobs.js";
import { makeViUrl, runOvfTool, resolveOvfToolPath, getOvfToolPath } from "./ovftool.js";
import { discoverVsphere, checkVmNameConflicts, powerOffAndDestroy } from "./vsphere.js";

const app = express();
const port = Number(process.env.PORT || 4173);
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const authUser = process.env.MASSOVA_USER || "";
const authPass = process.env.MASSOVA_PASS || "";
const authEnabled = Boolean(authUser && authPass);
const sessions = new Map();
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
const loginAttempts = new Map();
const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };
const sseTickets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE) sessions.delete(token);
  }
  for (const [key, record] of loginAttempts) {
    if (now - record.windowStart > LOGIN_RATE_LIMIT.windowMs) loginAttempts.delete(key);
  }
  for (const [ticket, entry] of sseTickets) {
    if (now - entry.createdAt > 30000) sseTickets.delete(ticket);
  }
}, 60 * 60 * 1000).unref();

app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: "1mb" }));

const publicPaths = new Set(["/auth/login", "/auth/status", "/health"]);

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.query?.token || "";
}

function isValidToken(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_MAX_AGE) {
    sessions.delete(token);
    return false;
  }
  return true;
}

if (authEnabled) {
  app.use("/api", (req, res, next) => {
    if (publicPaths.has(req.path)) return next();
    const token = extractToken(req);
    if (!isValidToken(token)) {
      return res.status(401).json({ error: "未认证" });
    }
    next();
  });
}

app.get("/api/auth/status", (_req, res) => {
  res.json({ enabled: authEnabled });
});

app.post("/api/auth/login", (req, res) => {
  if (!authEnabled) return res.json({ ok: true, token: "" });

  const clientKey = req.ip || "unknown";
  const now = Date.now();
  let record = loginAttempts.get(clientKey);
  if (!record || now - record.windowStart > LOGIN_RATE_LIMIT.windowMs) {
    record = { windowStart: now, count: 0 };
    loginAttempts.set(clientKey, record);
  }
  record.count++;
  if (record.count > LOGIN_RATE_LIMIT.maxAttempts) {
    return res.status(429).json({ ok: false, error: "登录尝试过于频繁，请稍后再试" });
  }

  const { username, password } = req.body ?? {};
  if (username === authUser && password === authPass) {
    loginAttempts.delete(clientKey);
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { createdAt: Date.now() });
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: "用户名或密码错误" });
});

app.get("/api/health", async (_req, res) => {
  const resolvedPath = getOvfToolPath();
  let ovftoolAvailable = false;
  try {
    await access(resolvedPath, fsConstants.X_OK);
    ovftoolAvailable = true;
  } catch {
  }
  res.json({
    ok: true,
    authEnabled,
    ovftoolPath: resolvedPath,
    ovftoolAvailable
  });
});

app.get("/api/jobs", (_req, res) => {
  res.json({ jobs: listJobs() });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});

app.post("/api/jobs/:id/events-ticket", (req, res) => {
  const ticket = crypto.randomBytes(16).toString("hex");
  sseTickets.set(ticket, { jobId: req.params.id, createdAt: Date.now() });
  res.json({ ticket });
});

app.get("/api/jobs/:id/events", (req, res) => {
  const ticketParam = req.query?.ticket;
  if (ticketParam) {
    const ticketEntry = sseTickets.get(ticketParam);
    if (!ticketEntry || ticketEntry.jobId !== req.params.id || Date.now() - ticketEntry.createdAt > 30000) {
      return res.status(401).json({ error: "无效或已过期的 SSE ticket" });
    }
    sseTickets.delete(ticketParam);
  } else if (authEnabled) {
    const token = extractToken(req);
    if (!isValidToken(token)) return res.status(401).json({ error: "未认证" });
  }

  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let lastLogIndex = job.logs.length;
  let closed = false;

  function safeWrite(data) {
    if (closed) return false;
    try {
      res.write(data);
      return true;
    } catch {
      return false;
    }
  }

  const interval = setInterval(() => {
    const current = getJob(req.params.id);
    if (!current) {
      clearInterval(interval);
      safeWrite(`event: close\ndata: {}\n\n`);
      res.end();
      closed = true;
      return;
    }

    if (current.logs.length > lastLogIndex) {
      const newLogs = current.logs.slice(lastLogIndex);
      lastLogIndex = current.logs.length;
      for (const log of newLogs) {
        if (!safeWrite(`event: log\ndata: ${JSON.stringify(log)}\n\n`)) {
          clearInterval(interval);
          closed = true;
          return;
        }
      }
    }

    if (!safeWrite(`event: status\ndata: ${JSON.stringify({
      status: current.status,
      progress: current.progress,
      vmResults: current.vmResults
    })}\n\n`)) {
      clearInterval(interval);
      closed = true;
      return;
    }

    if (current.status !== "running" && current.status !== "queued") {
      clearInterval(interval);
      safeWrite(`event: close\ndata: {}\n\n`);
      res.end();
      closed = true;
    }
  }, 500);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
  });
});

app.post("/api/jobs/:id/cancel", (req, res) => {
  const cancelled = cancelJob(req.params.id);
  if (!cancelled) return res.status(404).json({ errors: ["Job not found or already finished"] });
  res.json({ ok: true });
});

app.post("/api/jobs/:id/retry", (req, res) => {
  const job = retryFailed(req.params.id);
  if (!job) return res.status(400).json({ errors: ["Job not found or not in failed state"] });
  res.json({ job });
});

app.post("/api/vms/destroy", async (req, res) => {
  const { target, vmIds } = req.body ?? {};
  const normalizedTarget = normalizeTarget(target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });
  if (!Array.isArray(vmIds) || !vmIds.length) return res.status(400).json({ errors: ["需要选择要删除的虚拟机"] });

  try {
    const inventory = await discoverVsphere(normalizedTarget);
    const validIds = new Set(inventory.inventoryItems.map((item) => item.id));
    const ids = vmIds.filter((id) => validIds.has(id));
    if (!ids.length) return res.status(400).json({ errors: ["没有找到有效的虚拟机"] });

    const job = await createDestroyJob(normalizedTarget, ids);
    res.status(201).json({ job });
  } catch (error) {
    res.status(502).json({ errors: [error.message || "操作失败"] });
  }
});

app.post("/api/deployments/check", async (req, res) => {
  const { target, vms, sourceInventoryPath } = req.body ?? {};
  const normalizedTarget = normalizeTarget(target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });

  const vmNames = (vms ?? []).map((vm) => vm.name).filter(Boolean);
  if (!vmNames.length) return res.json({ conflicts: [], warnings: [] });

  try {
    const inventory = await discoverVsphere(normalizedTarget);
    const conflicts = await checkVmNameConflicts(normalizedTarget, vmNames);

    const warnings = [];
    const selectedDatastore = inventory.datastores?.find((ds) => ds.name === target?.datastore);
    if (selectedDatastore && selectedDatastore.freeSpace > 0) {
      const templateItem = inventory.inventoryItems?.find((item) => item.inventoryPath === sourceInventoryPath);
      const templateSize = templateItem?.storageCommitted ?? 0;
      if (templateSize > 0) {
        const totalNeeded = templateSize * vmNames.length;
        if (totalNeeded > selectedDatastore.freeSpace) {
          warnings.push(
            `Datastore "${selectedDatastore.name}" 可用空间 ${formatBytes(selectedDatastore.freeSpace)}，` +
            `预估需要 ${formatBytes(totalNeeded)} (${vmNames.length} 台 × ${formatBytes(templateSize)})，空间可能不足`
          );
        }
      }
    }

    res.json({
      conflicts,
      warnings,
      datastoreInfo: selectedDatastore ? {
        name: selectedDatastore.name,
        capacity: formatBytes(selectedDatastore.capacity),
        freeSpace: formatBytes(selectedDatastore.freeSpace),
        freePercent: selectedDatastore.capacity > 0
          ? Math.round((selectedDatastore.freeSpace / selectedDatastore.capacity) * 100)
          : 0
      } : null
    });
  } catch (error) {
    res.status(502).json({ errors: [error.message || "检查失败"] });
  }
});

app.post("/api/deployments", async (req, res) => {
  const validation = validateDeployment(req.body);
  if (validation.length) return res.status(400).json({ errors: validation });

  const templateValidation = await validateTemplateSource(req.body);
  if (templateValidation.length) return res.status(400).json({ errors: templateValidation });

  const job = await createJob(normalizeDeployment(req.body));
  res.status(201).json({ job });
});

app.post("/api/targets/probe", async (req, res) => {
  const target = normalizeTarget(req.body?.target ?? {});
  const errors = validateTarget(target);
  if (errors.length) return res.status(400).json({ errors });

  const result = await runOvfTool(["--noSSLVerify", "--machineOutput", makeViUrl(target, true)], {
    onLine: undefined
  });

  const output = `${result.stdout}\n${result.stderr}`;
  const completions = parseCompletions(output);
  const authenticated = result.code === 0 || completions.length > 0 || /Found wrong kind of object/i.test(output);

  res.json({
    ok: authenticated,
    code: result.code,
    completions,
    message: authenticated
      ? "连接成功，已读取到 vSphere inventory"
      : sanitizeProbeOutput(output).slice(0, 1200)
  });
});

app.post("/api/targets/discover", async (req, res) => {
  const target = normalizeTarget(req.body?.target ?? {});
  const errors = validateConnectionTarget(target);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const inventory = await discoverVsphere(target);
    res.json({
      ok: true,
      message: "连接成功，已读取可选资源",
      inventory
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      errors: [error.message || "读取 vSphere 资源失败"]
    });
  }
});

app.get("/api/templates", async (_req, res) => {
  try {
    const { readFile } = await import("node:fs/promises");
    const templatesFile = join(__dirname, "..", "data", "templates.json");
    const data = await readFile(templatesFile, "utf-8");
    res.json({ templates: JSON.parse(data) });
  } catch {
    res.json({ templates: [] });
  }
});

app.post("/api/templates", async (req, res) => {
  const { name, config } = req.body;
  if (!name || !config) return res.status(400).json({ errors: ["需要模板名称和配置"] });

  const { readFile: rf, writeFile: wf, mkdir } = await import("node:fs/promises");
  const templatesFile = join(__dirname, "..", "data", "templates.json");
  let templates = [];
  try {
    templates = JSON.parse(await rf(templatesFile, "utf-8"));
  } catch {
  }

  const existing = templates.findIndex((t) => t.name === name);
  const entry = { name, config, updatedAt: new Date().toISOString() };
  if (existing >= 0) {
    templates[existing] = { ...templates[existing], ...entry };
  } else {
    entry.createdAt = new Date().toISOString();
    templates.push(entry);
  }

  await mkdir(dirname(templatesFile), { recursive: true });
  await wf(templatesFile, JSON.stringify(templates, null, 2), "utf-8");
  res.json({ ok: true, templates });
});

app.delete("/api/templates/:name", async (req, res) => {
  const { readFile: rf, writeFile: wf, mkdir } = await import("node:fs/promises");
  const templatesFile = join(__dirname, "..", "data", "templates.json");
  let templates = [];
  try {
    templates = JSON.parse(await rf(templatesFile, "utf-8"));
  } catch {
  }

  templates = templates.filter((t) => t.name !== req.params.name);
  await mkdir(dirname(templatesFile), { recursive: true });
  await wf(templatesFile, JSON.stringify(templates, null, 2), "utf-8");
  res.json({ ok: true, templates });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
}

async function start() {
  try {
    await initStore();
  } catch (err) {
    console.error("初始化存储失败:", err.message);
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`MassOVA server listening on http://localhost:${port}${authEnabled ? " (auth enabled)" : ""}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`端口 ${port} 已被占用，请修改 PORT 环境变量`);
      process.exit(1);
    }
    console.error("服务器错误:", err.message);
  });

  const ovftoolPath = await resolveOvfToolPath();
  console.log(`ovftool: ${ovftoolPath}`);

  function gracefulShutdown(signal) {
    console.log(`\n收到 ${signal}，正在关闭...`);
    server.close(() => {
      console.log("HTTP 服务器已关闭");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("强制关闭（等待超时）");
      process.exit(1);
    }, 5000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

start().catch((err) => {
  console.error("启动失败:", err.message);
  process.exit(1);
});

function normalizeDeployment(body) {
  return {
    dryRun: body.dryRun !== false,
    concurrency: Number(body.concurrency) || 1,
    sourceType: "inventory",
    sourceInventoryPath: String(body.sourceInventoryPath ?? "").trim(),
    target: normalizeTarget(body.target ?? {}),
    networkMappings: (body.networkMappings ?? []).filter((item) => item.source || item.target),
    properties: (body.properties ?? []).filter((item) => item.key),
    vms: (body.vms ?? []).filter((item) => item.name)
  };
}

function validateDeployment(body) {
  const errors = [];
  if (!body || typeof body !== "object") errors.push("请求体不能为空");
  if (!body?.sourceInventoryPath) errors.push("需要选择 vSphere 模板");
  errors.push(...validateTarget(normalizeTarget(body?.target ?? {})));
  if (!body?.target?.datastore) errors.push("需要填写 datastore");
  if (!Array.isArray(body?.vms) || !body.vms.some((vm) => vm.name)) errors.push("至少需要一个 VM 名称");
  return errors;
}

async function validateTemplateSource(body) {
  try {
    const inventory = await discoverVsphere(normalizeTarget(body.target ?? {}));
    const source = inventory.inventoryItems.find((item) => item.inventoryPath === body.sourceInventoryPath);
    if (!source) return ["没有在 vSphere inventory 中找到所选模板"];
    if (source.kind !== "Template") return ["只允许选择 vSphere 模板，不能选择普通虚拟机"];
    return [];
  } catch (error) {
    return [error.message || "验证模板来源失败"];
  }
}

function normalizeTarget(target) {
  return {
    platform: target.platform === "vcenter" ? "vcenter" : "esxi",
    host: String(target.host ?? "").trim(),
    username: String(target.username ?? "").trim(),
    password: String(target.password ?? ""),
    inventoryPath: String(target.inventoryPath ?? "").trim(),
    datastore: String(target.datastore ?? "").trim(),
    folder: String(target.folder ?? "").trim(),
    resourcePool: String(target.resourcePool ?? "").trim(),
    diskMode: String(target.diskMode ?? "thin").trim(),
    powerOn: Boolean(target.powerOn)
  };
}

function validateTarget(target) {
  const errors = [];
  errors.push(...validateConnectionTarget(target));
  if (target.platform === "vcenter" && !target.inventoryPath) {
    errors.push("vCenter 模式需要填写目标路径");
  }
  return errors;
}

function validateConnectionTarget(target) {
  const errors = [];
  if (!target.host) errors.push("需要填写 vSphere 地址");
  if (!target.username) errors.push("需要填写用户名");
  if (!target.password) errors.push("需要填写密码");
  return errors;
}

function parseCompletions(output) {
  const match = output.match(/Possible completions are:\s*([\s\S]*?)<\/LocalizedMsg>/i);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\+\s*/, "").trim())
    .filter(Boolean);
}

function sanitizeProbeOutput(output) {
  return output.replace(/vi:\/\/([^:]+):([^@]+)@/g, "vi://$1:***@");
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
