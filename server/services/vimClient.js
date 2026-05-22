const VIM_NS = "urn:vim25";

export class VimClient {
  constructor(host) {
    this.host = host;
    this.cookie = "";
    this.tlsBypassCount = 0;
    this.tlsOriginalValue = undefined;
  }

  setCookie(cookie) {
    this.cookie = cookie;
  }

  async soap(body, soapAction = `${VIM_NS}/6.0`) {
    if (this.tlsBypassCount === 0) {
      this.tlsOriginalValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
    this.tlsBypassCount++;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const envelope = this.envelope(body);
      const response = await fetch(`https://${this.host}/sdk`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${soapAction}"`,
          ...(this.cookie ? { Cookie: this.cookie } : {})
        },
        body: envelope
      });
      
      const text = await response.text();
      const setCookie = response.headers.get("set-cookie") ?? "";
      if (setCookie) {
        this.cookie = setCookie.split(";")[0];
      }
      
      this.assertNoSoapFault(text);
      return { text, cookie: this.cookie };
    } catch (err) {
      if (err.name === "AbortError") throw new Error(`vSphere 连接超时 (15s): ${this.host}`);
      throw err;
    } finally {
      clearTimeout(timeout);
      this.tlsBypassCount--;
      if (this.tlsBypassCount <= 0) {
        this.tlsBypassCount = 0;
        if (this.tlsOriginalValue === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = this.tlsOriginalValue;
        }
      }
    }
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
