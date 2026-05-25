import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status >= 500) {
    throw new Error(`服务器错误 (${response.status})`);
  }
  return { response, data: await response.json() };
}
