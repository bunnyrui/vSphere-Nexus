import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

export async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function maskSecret(value = "") {
  if (!value) return "";
  if (value.length <= 2) return "**";
  return `${value.slice(0, 1)}${"*".repeat(Math.min(value.length - 1, 10))}`;
}

export function getOvfToolPath() {
  return process.env.OVFTOOL_PATH || "ovftool";
}

export function renderTemplate(template = "", vm, index) {
  return String(template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    if (key === "index") return String(index + 1);
    if (key === "zeroIndex") return String(index);
    return vm[key] ?? "";
  });
}

function encodeInventoryPath(path = "") {
  const trimmed = path.trim();
  if (!trimmed) return "";
  const hasLeadingSlash = trimmed.startsWith("/");
  const encoded = trimmed
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${hasLeadingSlash ? "/" : "/"}${encoded}`;
}

export function makeViUrl(target, includePassword = true) {
  return makeInventoryViUrl(target, target.platform === "vcenter" ? target.inventoryPath : "", includePassword);
}

export function makeInventoryViUrl(target, inventoryPath = "", includePassword = true) {
  const host = target.host?.trim();
  const username = encodeURIComponent(target.username?.trim() ?? "");
  const password = includePassword ? encodeURIComponent(target.password ?? "") : maskSecret(target.password ?? "");
  return `vi://${username}:${password}@${host}${encodeInventoryPath(inventoryPath)}`;
}

export function buildOvfToolArgs(payload, vm, index, { masked = false } = {}) {
  const renderedVm = { ...vm, name: renderTemplate(vm.name, vm, index) };
  const args = [
    "--acceptAllEulas",
    "--noSSLVerify",
    `--name=${renderedVm.name}`,
    `--datastore=${payload.target.datastore}`
  ];

  if (payload.target.folder) args.push(`--folder=${payload.target.folder}`);
  if (payload.target.resourcePool) args.push(`--resourcePool=${payload.target.resourcePool}`);
  if (payload.target.diskMode) args.push(`--diskMode=${payload.target.diskMode}`);
  if (payload.target.powerOn) args.push("--powerOn");

  for (const mapping of payload.networkMappings ?? []) {
    if (mapping.source && mapping.target) {
      args.push(`--net:${mapping.source}=${mapping.target}`);
    }
  }

  for (const property of payload.properties ?? []) {
    if (property.key) {
      args.push(`--prop:${property.key}=${renderTemplate(property.value, renderedVm, index)}`);
    }
  }

  args.push(makeInventoryViUrl(payload.target, payload.sourceInventoryPath, !masked));
  args.push(makeViUrl(payload.target, !masked));
  return args;
}

export function stringifyCommand(args) {
  return [getOvfToolPath(), ...args].map((part) => {
    const text = String(part);
    if (/^[\w@%/:.,=+~-]+$/.test(text)) return text;
    return `'${text.replaceAll("'", "'\\''")}'`;
  }).join(" ");
}

export function runOvfTool(args, { signal, onLine }) {
  return new Promise((resolve) => {
    const child = spawn(getOvfToolPath(), args, { shell: false, signal });
    let stdout = "";
    let stderr = "";

    const handleChunk = (source) => (chunk) => {
      const text = chunk.toString();
      if (source === "stdout") stdout += text;
      if (source === "stderr") stderr += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        onLine?.(source, line);
      }
    };

    child.stdout.on("data", handleChunk("stdout"));
    child.stderr.on("data", handleChunk("stderr"));

    child.on("error", (error) => {
      onLine?.("stderr", error.message);
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` });
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
