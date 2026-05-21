import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJob, getJob, listJobs, cancelJob } from "./jobs.js";
import { makeViUrl, runOvfTool } from "./ovftool.js";
import { discoverVsphere } from "./vsphere.js";

const app = express();
const port = Number(process.env.PORT || 4173);
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ovftoolAvailable: Boolean(process.env.OVFTOOL_PATH) || existsSync("/usr/local/bin/ovftool") || existsSync("/Applications/VMware OVF Tool/ovftool")
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

app.post("/api/jobs/:id/cancel", (req, res) => {
  const cancelled = cancelJob(req.params.id);
  if (!cancelled) return res.status(404).json({ error: "Job not found or already finished" });
  res.json({ ok: true });
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
      error: error.message || "读取 vSphere 资源失败"
    });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
}

app.listen(port, () => {
  console.log(`MassOVA server listening on http://localhost:${port}`);
});

function normalizeDeployment(body) {
  return {
    dryRun: body.dryRun !== false,
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
  if (body?.sourceType && body.sourceType !== "inventory") errors.push("只允许从 vSphere 模板批量部署");
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
