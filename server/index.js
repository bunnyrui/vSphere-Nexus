import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { access, constants as fsConstants } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import tls from "node:tls";
import { createJob, getJob, listJobs, cancelJob, retryFailed, initStore, createDestroyJob, createPowerControlJob, createSnapshotJob, deleteJob, saveToDisk } from "./jobs.js";
import { resolveOvfToolPath, getOvfToolPath } from "./ovftool.js";
import { VmService } from "./services/vmService.js";
import http from "node:http";

const app = express();
const port = Number(process.env.PORT || 4173);
const server = http.createServer(app);

// --- WebSocket Proxy for WebMKS ---
const wss = new WebSocketServer({ 
  noServer: true,
  handleProtocols: (protocols) => {
    // Support 'binary' protocol which is required by WMKS
    if (protocols.has("binary")) return "binary";
    return Array.from(protocols)[0];
  }
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const { pathname } = url;

  if (pathname !== "/api/console-proxy") {
    console.warn(`[UPGRADE] Rejected upgrade for ${pathname}`);
    socket.destroy();
    return;
  }

  const targetHost = url.searchParams.get("host");
  const targetPort = parseInt(url.searchParams.get("port") || "443");
  const ticket = url.searchParams.get("ticket");
  const token = url.searchParams.get("token");

  if (!targetHost || !ticket) {
    console.error("[UPGRADE] Missing host or ticket");
    socket.destroy();
    return;
  }

  if (!isValidToken(token)) {
    console.error("[UPGRADE] Invalid or expired token");
    socket.destroy();
    return;
  }

  const session = token ? sessions.get(token) : null;
  const vCenterHost = session?.target?.host;

  console.log(`[UPGRADE] Tunneling to: ${targetHost}:${targetPort} (Ticket: ${ticket.substring(0, 8)}...)`);

  const connect = (host, port, isFallback = false) => {
    const tlsOptions = { host, port, rejectUnauthorized: false };
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host)) tlsOptions.servername = host;

    const esxiSocket = tls.connect(tlsOptions, () => {
      console.log(`[UPGRADE] Connected to ESXi ${host}. Sending handshake...`);
      const handshake = [
        `GET /ticket/${ticket} HTTP/1.1`,
        `Host: ${host}`,
        `Upgrade: websocket`,
        `Connection: Upgrade`,
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}`,
        `Sec-WebSocket-Version: 13`,
        `Sec-WebSocket-Protocol: binary`,
        `Origin: https://${host}`,
        "", ""
      ].join("\r\n");
      esxiSocket.write(handshake);
    });

    let handshakeDone = false;
    let buffer = Buffer.alloc(0);

    esxiSocket.on("data", (data) => {
      if (!handshakeDone) {
        buffer = Buffer.concat([buffer, data]);
        const endOfHeader = buffer.indexOf("\r\n\r\n");
        if (endOfHeader !== -1) {
          const header = buffer.slice(0, endOfHeader).toString();
          if (header.includes("HTTP/1.1 101")) {
            console.log(`[UPGRADE] ESXi handshake successful (${host})`);
            handshakeDone = true;
            
            // Send success to browser
            const responseHeader = [
              "HTTP/1.1 101 Switching Protocols",
              "Upgrade: websocket",
              "Connection: Upgrade",
              `Sec-WebSocket-Accept: ${crypto.createHash("sha1").update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")}`,
              "Sec-WebSocket-Protocol: binary",
              "", ""
            ].join("\r\n");
            socket.write(responseHeader);

            // Forward any remaining data in the buffer
            const remaining = buffer.slice(endOfHeader + 4);
            if (remaining.length > 0) socket.write(remaining);
            
            // Pipe raw sockets
            esxiSocket.pipe(socket);
            socket.pipe(esxiSocket);
          } else {
            console.warn(`[UPGRADE] ESXi handshake failed (${host}):`, header.split("\r\n")[0]);
            if (!isFallback && vCenterHost && vCenterHost !== host) {
              console.log(`[UPGRADE] Retrying with vCenter fallback: ${vCenterHost}`);
              esxiSocket.destroy();
              connect(vCenterHost, 443, true);
            } else {
              socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
              esxiSocket.destroy();
            }
          }
        }
        return;
      }
    });

    esxiSocket.on("error", (err) => {
      console.error(`[UPGRADE] ESXi socket error (${host}):`, err.message);
      if (!handshakeDone && !isFallback && vCenterHost && vCenterHost !== host) {
        esxiSocket.destroy();
        connect(vCenterHost, 443, true);
      } else {
        socket.destroy();
      }
    });

    esxiSocket.on("close", () => {
      console.log(`[UPGRADE] ESXi connection closed (${host})`);
      socket.end();
    });
    
    socket.on("error", (err) => {
      console.error("[UPGRADE] Browser socket error:", err.message);
      esxiSocket.destroy();
    });
    
    socket.on("close", () => {
      console.log("[UPGRADE] Browser connection closed");
      esxiSocket.destroy();
    });
  };

  connect(targetHost, targetPort);
});
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

const sessions = new Map();
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
const loginAttempts = new Map();
const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };

// --- Initialization & Middleware ---

app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: "1mb" }));

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE) sessions.delete(token);
  }
  for (const [key, record] of loginAttempts) {
    if (now - record.windowStart > LOGIN_RATE_LIMIT.windowMs) loginAttempts.delete(key);
  }
}, 60 * 60 * 1000).unref();

// --- Helpers ---

const publicPaths = new Set(["/auth/login", "/health"]);

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

function hydrateTargetFromSession(req) {
  const token = extractToken(req);
  const session = sessions.get(token);
  if (session?.target) {
    if (!req.body) req.body = {};
    req.body.target = { 
      ...session.target, 
      ...(req.body.target || {}),
      password: req.body.target?.password || session.target.password 
    };
  }
}

// --- Security Middleware ---

app.use("/api", (req, res, next) => {
  if (publicPaths.has(req.path)) return next();
  const token = extractToken(req);
  if (!isValidToken(token)) {
    return res.status(401).json({ error: "未认证" });
  }
  next();
});

// --- Auth Routes ---

app.get("/api/auth/session", (req, res) => {
  const token = extractToken(req);
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: "未认证" });

  const { target, inventory } = session;
  const safeTarget = target ? { ...target, password: "" } : null;
  res.json({ target: safeTarget, inventory });
});

app.post("/api/auth/login", async (req, res) => {
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

  const { username, password, host, platform } = req.body ?? {};

  if (!host || !username || !password) {
    return res.status(400).json({ ok: false, error: "请填写完整的连接信息" });
  }

  try {
    const target = { host, username, password, platform: platform || "vcenter" };
    const inventory = await new VmService(target).discoverInventory();
    loginAttempts.delete(clientKey);
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { 
      createdAt: Date.now(),
      target,
      inventory
    });
    return res.json({ ok: true, token, inventory });
  } catch (err) {
    return res.status(401).json({ ok: false, error: `vSphere 认证失败: ${err.message}` });
  }
});

// --- Inventory & Target Routes ---

app.post("/api/targets/discover", async (req, res) => {
  hydrateTargetFromSession(req);
  const target = normalizeTarget(req.body?.target ?? {});
  const errors = validateConnectionTarget(target);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const inventory = await new VmService(target).discoverInventory();
    res.json({ ok: true, message: "连接成功，已读取可选资源", inventory });
  } catch (error) {
    res.status(502).json({ ok: false, errors: [error.message || "读取 vSphere 资源失败"] });
  }
});

app.post("/api/deployments/check", async (req, res) => {
  hydrateTargetFromSession(req);
  const { target, vms, sourceInventoryPath } = req.body ?? {};
  const normalizedTarget = normalizeTarget(target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });

  const vmNames = (vms ?? []).map((vm) => vm.name).filter(Boolean);
  if (!vmNames.length) return res.json({ conflicts: [], warnings: [] });

  try {
    const service = new VmService(normalizedTarget);
    const inventory = await service.discoverInventory();
    const conflicts = await service.checkVmNameConflicts(vmNames);
    const warnings = [];
    const selectedDatastore = inventory.datastores?.find((ds) => ds.name === target?.datastore);
    if (selectedDatastore && selectedDatastore.freeSpace > 0) {
      const templateItem = inventory.inventoryItems?.find((item) => item.inventoryPath === sourceInventoryPath);
      const templateSize = templateItem?.storageCommitted ?? 0;
      if (templateSize > 0) {
        const totalNeeded = templateSize * vmNames.length;
        if (totalNeeded > selectedDatastore.freeSpace) {
          warnings.push(`Datastore "${selectedDatastore.name}" 空间可能不足`);
        }
      }
    }
    res.json({ conflicts, warnings });
  } catch (error) {
    res.status(502).json({ errors: [error.message || "检查失败"] });
  }
});

// --- VM Lifecycle Routes ---

app.post("/api/deployments", async (req, res) => {
  hydrateTargetFromSession(req);
  const validation = validateDeployment(req.body);
  if (validation.length) return res.status(400).json({ errors: validation });

  const templateValidation = await validateTemplateSource(req.body);
  if (templateValidation.length) return res.status(400).json({ errors: templateValidation });

  const job = await createJob(normalizeDeployment(req.body));
  res.status(201).json({ job });
});

app.post("/api/vms/power", async (req, res) => {
  hydrateTargetFromSession(req);
  const { target, vmIds, action } = req.body ?? {};
  const normalizedTarget = normalizeTarget(target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });
  if (!Array.isArray(vmIds) || !vmIds.length) return res.status(400).json({ errors: ["需要选择虚拟机"] });
  if (!["on", "off", "reset"].includes(action)) return res.status(400).json({ errors: ["无效的电源操作"] });

  try {
    const inventory = await new VmService(normalizedTarget).discoverInventory();
    const validIds = new Set(inventory.inventoryItems.map((item) => item.id));
    const ids = vmIds.filter((id) => validIds.has(id));
    if (!ids.length) return res.status(400).json({ errors: ["没有找到有效的虚拟机"] });

    const job = await createPowerControlJob(normalizedTarget, ids, action, req.body);
    res.status(201).json({ job });
  } catch (error) {
    res.status(502).json({ errors: [error.message || "操作失败"] });
  }
});

app.post("/api/vms/snapshot", async (req, res) => {
  hydrateTargetFromSession(req);
  const { target, vmIds, name, description, memory } = req.body ?? {};
  const normalizedTarget = normalizeTarget(target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });
  if (!name) return res.status(400).json({ errors: ["快照名称不能为空"] });
  if (!Array.isArray(vmIds) || !vmIds.length) return res.status(400).json({ errors: ["需要选择虚拟机"] });

  try {
    const job = await createSnapshotJob(normalizedTarget, vmIds, name, description, !!memory, req.body);
    res.status(201).json({ job });
  } catch (error) {
    res.status(502).json({ errors: [error.message || "操作失败"] });
  }
});

app.post("/api/vms/destroy", async (req, res) => {
  hydrateTargetFromSession(req);
  const { target, vmIds } = req.body ?? {};
  const normalizedTarget = normalizeTarget(target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const inventory = await new VmService(normalizedTarget).discoverInventory();
    const validIds = new Set(inventory.inventoryItems.map((item) => item.id));
    const ids = vmIds.filter((id) => validIds.has(id));
    if (!ids.length) return res.status(400).json({ errors: ["没有找到有效的虚拟机"] });

    const job = await createDestroyJob(normalizedTarget, ids, req.body);
    res.status(201).json({ job });
  } catch (error) {
    res.status(502).json({ errors: [error.message || "操作失败"] });
  }
});

// --- Snapshot Routes ---

app.get("/api/vms/:id/snapshots", async (req, res) => {
  hydrateTargetFromSession(req);
  try {
    const snapshots = await new VmService(req.body.target).getVmSnapshots(req.params.id);
    res.json({ snapshots });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/vms/:id/snapshots", async (req, res) => {
  hydrateTargetFromSession(req);
  const { name, description, memory } = req.body;
  if (!name) return res.status(400).json({ error: "快照名称不能为空" });
  try {
    const task = await new VmService(req.body.target).createSnapshot(req.params.id, name, description, memory);
    res.json({ task });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/snapshots/:sid/revert", async (req, res) => {
  hydrateTargetFromSession(req);
  try {
    const task = await new VmService(req.body.target).revertToSnapshot(req.params.sid);
    res.json({ task });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.delete("/api/snapshots/:sid", async (req, res) => {
  hydrateTargetFromSession(req);
  try {
    const task = await new VmService(req.body.target).removeSnapshot(req.params.sid, false);
    res.json({ task });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/vms/:id/rename", async (req, res) => {
  hydrateTargetFromSession(req);
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: "新名称不能为空" });
  try {
    const task = await new VmService(req.body.target).renameVm(req.params.id, newName);
    res.json({ task });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/vms/:id/reconfigure", async (req, res) => {
  hydrateTargetFromSession(req);
  const { cpu, memory } = req.body;
  if (cpu !== undefined && (cpu < 1 || cpu > 128)) return res.status(400).json({ error: "CPU 核心数应在 1-128 之间" });
  if (memory !== undefined && (memory < 4 || memory > 1048576)) return res.status(400).json({ error: "内存应在 4-1048576 MB 之间" });
  try {
    const task = await new VmService(req.body.target).reconfigureVm(req.params.id, {
      numCPUs: cpu,
      memoryMB: memory
    });
    res.json({ task });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/vms/:id/ticket", async (req, res) => {
  hydrateTargetFromSession(req);
  const normalizedTarget = normalizeTarget(req.body.target ?? {});
  const errors = validateConnectionTarget(normalizedTarget);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const service = new VmService(normalizedTarget);
    const ticket = await service.acquireWebMksTicket(req.params.id);
    console.log(`[CONSOLE TICKET] Acquired for VM ${req.params.id}:`, { ...ticket, ticket: ticket.ticket.substring(0, 10) + "..." });
    res.json(ticket);
  } catch (error) {
    console.error(`[CONSOLE TICKET ERROR] VM: ${req.params.id}:`, error.message);
    res.status(502).json({ error: error.message });
  }
});

// --- System & Jobs Routes ---

app.post("/api/jobs/:id/cancel", (req, res) => {
  const success = cancelJob(req.params.id);
  res.json({ ok: success });
});

app.post("/api/jobs/:id/retry", (req, res) => {
  const job = retryFailed(req.params.id);
  if (!job) return res.status(400).json({ error: "重试失败或任务不符合重试条件" });
  res.json({ job });
});

app.delete("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status === "running" || job.status === "queued") {
    return res.status(400).json({ error: "正在运行的任务不能删除" });
  }
  const success = deleteJob(req.params.id);
  res.json({ ok: success });
});

app.get("/api/health", async (_req, res) => {
  const resolvedPath = getOvfToolPath();
  let ovftoolAvailable = false;
  try {
    await access(resolvedPath, fsConstants.X_OK);
    ovftoolAvailable = true;
  } catch {}
  res.json({ ok: true, ovftoolPath: resolvedPath, ovftoolAvailable });
});

app.get("/api/jobs", (_req, res) => {
  res.json({ jobs: listJobs() });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});

app.get("/api/jobs/:id/events", (req, res) => {
  const token = extractToken(req);
  if (!isValidToken(token)) return res.status(401).json({ error: "未认证" });

  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let lastLogIndex = 0;
  let closed = false;
  let heartbeatCounter = 0;

  const interval = setInterval(() => {
    const current = getJob(req.params.id);
    if (!current || closed) {
      clearInterval(interval);
      res.end();
      return;
    }
    if (current.logs.length > lastLogIndex) {
      const newLogs = current.logs.slice(lastLogIndex);
      lastLogIndex = current.logs.length;
      for (const log of newLogs) {
        res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
      }
    }
    res.write(`event: status\ndata: ${JSON.stringify({ status: current.status, progress: current.progress })}\n\n`);
    heartbeatCounter++;
    if (heartbeatCounter % 15 === 0) {
      res.write(': heartbeat\n\n');
    }
    if (current.status !== "running" && current.status !== "queued") {
      clearInterval(interval);
      res.write(`event: close\ndata: {}\n\n`);
      res.end();
      closed = true;
    }
  }, 1000);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
  });
});

// --- Static Hosting & App Start ---

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
}

async function start() {
  try {
    await initStore();
    const ovftoolPath = await resolveOvfToolPath();
    console.log(`ovftool: ${ovftoolPath}`);
    server.listen(port, () => {
      console.log(`vSphere Nexus server listening on http://localhost:${port}`);
    });
    } catch (err) {

    console.error("启动失败:", err.message);
    process.exit(1);
  }
}

start();

function gracefulShutdown() {
  console.log("正在优雅关闭...");
  saveToDisk().then(() => {
    server.close(() => {
      console.log("服务器已关闭");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  }).catch(() => process.exit(1));
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// --- Validation Logic ---

function normalizeDeployment(body) {
  return {
    dryRun: body.dryRun !== false,
    concurrency: Number(body.concurrency) || 1,
    sourceInventoryPath: String(body.sourceInventoryPath ?? "").trim(),
    target: normalizeTarget(body.target ?? {}),
    networkMappings: (body.networkMappings ?? []).filter((item) => item.source || item.target),
    vms: (body.vms ?? []).filter((item) => item.name)
  };
}

function validateDeployment(body) {
  const errors = [];
  if (!body?.sourceInventoryPath) errors.push("需要选择 vSphere 模板");
  errors.push(...validateTarget(normalizeTarget(body?.target ?? {})));
  if (!Array.isArray(body?.vms) || !body.vms.length) errors.push("至少需要一个 VM 名称");
  if (Array.isArray(body?.vms) && body.vms.some((vm) => !vm.name?.trim())) errors.push("VM 名称不能为空");
  if (Array.isArray(body?.vms) && body.vms.length > 100) errors.push("单次部署数量不能超过 100 台");
  return errors;
}

async function validateTemplateSource(body) {
  try {
    const inventory = await new VmService(normalizeTarget(body.target ?? {})).discoverInventory();
    const source = inventory.inventoryItems.find((item) => item.inventoryPath === body.sourceInventoryPath);
    if (!source || source.kind !== "Template") return ["请选择有效的 vSphere 模板"];
    return [];
  } catch (error) {
    return [error.message || "验证模板失败"];
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
    diskMode: String(target.diskMode ?? "thin").trim(),
    powerOn: Boolean(target.powerOn)
  };
}

function validateTarget(target) {
  const errors = validateConnectionTarget(target);
  if (target.platform === "vcenter" && !target.inventoryPath) errors.push("vCenter 模式需要填写目标路径");
  return errors;
}

function validateConnectionTarget(target) {
  const errors = [];
  if (!target.host) errors.push("需要填写 vSphere 地址");
  if (!target.username) errors.push("需要填写用户名");
  if (!target.password) errors.push("需要填写密码");
  return errors;
}
