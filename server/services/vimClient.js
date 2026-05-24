const VIM_NS = "urn:vim25";

import https from "node:https";

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function httpsPost(url, options, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = https.request(url, { ...options, agent: insecureAgent }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (!settled) {
          settled = true;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString("utf-8")
          });
        }
      });
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy(new Error(`vSphere 连接超时 (${Math.round(timeoutMs / 1000)}s): ${url.host}`));
      }
    }, timeoutMs);

    req.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    req.on("close", () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

export class VimClient {
  constructor(host) {
    this.host = host;
    this.cookie = "";
  }

  setCookie(cookie) {
    this.cookie = cookie;
  }

  async soap(body, soapAction = "urn:vim25/6.0") {
    const envelope = this.envelope(body);
    const url = new URL(`https://${this.host}/sdk`);
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${soapAction}"`,
        ...(this.cookie ? { Cookie: this.cookie } : {})
      }
    };

    const response = await httpsPost(url, options, envelope);

    const setCookie = response.headers["set-cookie"];
    if (setCookie) {
      this.cookie = Array.isArray(setCookie) ? setCookie[0].split(";")[0] : setCookie.split(";")[0];
    }

    if (response.status >= 400) {
      // Check if it's a SOAP fault
      const fault = this.textTag(response.text, "faultstring") || this.textTag(response.text, "message");
      if (fault) throw new Error(fault);
      throw new Error(`HTTP ${response.status}: ${response.text.slice(0, 200)}`);
    }

    this.assertNoSoapFault(response.text);
    return { text: response.text, cookie: this.cookie };
  }

  envelope(content) {
    return `<?xml version="1.0" encoding="UTF-8"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Body>${content}</soapenv:Body>
      </soapenv:Envelope>`;
  }

  assertNoSoapFault(xml) {
    const fault = this.textTag(xml, "faultstring");
    if (fault) throw new Error(fault);
  }

  textTag(xml, tag) {
    return decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
  }

  ref(tag, object) {
    return `<${tag} type="${object.type}">${escapeXml(object.id)}</${tag}>`;
  }
}

export function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function decodeXml(value = "") {
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function firstRef(xml, tag) {
  const match = xml.match(new RegExp(`<${tag} type="([^"]+)">([^<]+)<\\/${tag}>`));
  if (!match) throw new Error(`没有找到 ${tag}`);
  return { type: match[1], id: match[2] };
}
