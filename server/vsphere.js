const VIM_NS = "urn:vim25";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function discoverVsphere(target) {
  const service = await retrieveServiceContent(target);
  const cookie = await login(target, service.sessionManager);
  const objects = await retrieveInventory(target, cookie, service.rootFolder, service.propertyCollector);
  return normalizeInventory(target, objects);
}

async function retrieveServiceContent(target) {
  const body = envelope(`
    <RetrieveServiceContent xmlns="${VIM_NS}">
      <_this type="ServiceInstance">ServiceInstance</_this>
    </RetrieveServiceContent>
  `);
  const { text } = await soap(target.host, body);
  assertNoSoapFault(text);
  return {
    rootFolder: firstRef(text, "rootFolder"),
    propertyCollector: firstRef(text, "propertyCollector"),
    sessionManager: firstRef(text, "sessionManager")
  };
}

async function login(target, sessionManager) {
  const body = envelope(`
    <Login xmlns="${VIM_NS}">
      ${ref("_this", sessionManager)}
      <userName>${escapeXml(target.username)}</userName>
      <password>${escapeXml(target.password)}</password>
    </Login>
  `);
  const { text, cookie } = await soap(target.host, body);
  assertNoSoapFault(text);
  if (!cookie) throw new Error("vSphere 登录成功但没有返回会话 cookie");
  return cookie;
}

async function retrieveInventory(target, cookie, rootFolder, propertyCollector) {
  const body = envelope(`
    <RetrievePropertiesEx xmlns="${VIM_NS}">
      ${ref("_this", propertyCollector)}
      <specSet>
        <propSet><type>Datacenter</type><all>false</all><pathSet>name</pathSet><pathSet>hostFolder</pathSet><pathSet>vmFolder</pathSet><pathSet>datastore</pathSet><pathSet>network</pathSet></propSet>
        <propSet><type>Folder</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>childEntity</pathSet></propSet>
        <propSet><type>ComputeResource</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>host</pathSet><pathSet>resourcePool</pathSet><pathSet>datastore</pathSet><pathSet>network</pathSet></propSet>
        <propSet><type>ClusterComputeResource</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>host</pathSet><pathSet>resourcePool</pathSet><pathSet>datastore</pathSet><pathSet>network</pathSet></propSet>
        <propSet><type>HostSystem</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>datastore</pathSet><pathSet>network</pathSet></propSet>
        <propSet><type>ResourcePool</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>owner</pathSet><pathSet>resourcePool</pathSet></propSet>
        <propSet><type>Datastore</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet></propSet>
        <propSet><type>Network</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet></propSet>
        <propSet><type>DistributedVirtualPortgroup</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet></propSet>
        <propSet><type>VirtualMachine</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>config.template</pathSet><pathSet>network</pathSet></propSet>
        <objectSet>
          ${ref("obj", rootFolder)}
          <skip>false</skip>
          <selectSet xsi:type="TraversalSpec">
            <name>folderTraversal</name><type>Folder</type><path>childEntity</path><skip>false</skip>
            <selectSet><name>folderTraversal</name></selectSet>
            <selectSet><name>dcHostTraversal</name></selectSet>
            <selectSet><name>dcVmTraversal</name></selectSet>
            <selectSet><name>computeHostTraversal</name></selectSet>
            <selectSet><name>computeRpTraversal</name></selectSet>
            <selectSet><name>computeDatastoreTraversal</name></selectSet>
            <selectSet><name>computeNetworkTraversal</name></selectSet>
            <selectSet><name>rpTraversal</name></selectSet>
            <selectSet><name>dcDatastoreTraversal</name></selectSet>
            <selectSet><name>dcNetworkTraversal</name></selectSet>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>dcHostTraversal</name><type>Datacenter</type><path>hostFolder</path><skip>false</skip>
            <selectSet><name>folderTraversal</name></selectSet>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>dcVmTraversal</name><type>Datacenter</type><path>vmFolder</path><skip>false</skip>
            <selectSet><name>folderTraversal</name></selectSet>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>dcDatastoreTraversal</name><type>Datacenter</type><path>datastore</path><skip>false</skip>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>dcNetworkTraversal</name><type>Datacenter</type><path>network</path><skip>false</skip>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>computeHostTraversal</name><type>ComputeResource</type><path>host</path><skip>false</skip>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>computeRpTraversal</name><type>ComputeResource</type><path>resourcePool</path><skip>false</skip>
            <selectSet><name>rpTraversal</name></selectSet>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>computeDatastoreTraversal</name><type>ComputeResource</type><path>datastore</path><skip>false</skip>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>computeNetworkTraversal</name><type>ComputeResource</type><path>network</path><skip>false</skip>
          </selectSet>
          <selectSet xsi:type="TraversalSpec">
            <name>rpTraversal</name><type>ResourcePool</type><path>resourcePool</path><skip>false</skip>
            <selectSet><name>rpTraversal</name></selectSet>
          </selectSet>
        </objectSet>
      </specSet>
      <options/>
    </RetrievePropertiesEx>
  `);

  const { text } = await soap(target.host, body, cookie);
  assertNoSoapFault(text);
  return parseObjects(text);
}

async function soap(host, body, cookie = "") {
  const response = await fetch(`https://${host}/sdk`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"${VIM_NS}/8.0.3.0"`,
      ...(cookie ? { Cookie: cookie } : {})
    },
    body
  });
  const text = await response.text();
  const setCookie = response.headers.get("set-cookie") ?? "";
  return {
    text,
    cookie: setCookie.split(";")[0]
  };
}

function normalizeInventory(target, objects) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const datacenters = objects.filter((object) => object.type === "Datacenter").map(toOption);
  const datastores = uniqueOptions(objects.filter((object) => object.type === "Datastore").map(toOption));
  const networks = uniqueOptions(objects.filter((object) => object.type === "Network" || object.type === "DistributedVirtualPortgroup").map(toOption));
  const hosts = objects.filter((object) => object.type === "HostSystem").map((object) => {
    const compute = byId.get(object.props.parent?.[0]?.id);
    const datacenter = findDatacenter(objects, compute ?? object);
    return {
      id: object.id,
      name: object.props.name?.[0] ?? object.id,
      datacenter: datacenter?.props.name?.[0] ?? "",
      inventoryPath: datacenter ? `/${datacenter.props.name?.[0]}/host/${compute?.props.name?.[0] ?? object.props.name?.[0]}/Resources` : ""
    };
  });

  const computeTargets = objects
    .filter((object) => object.type === "ComputeResource" || object.type === "ClusterComputeResource")
    .map((object) => {
      const datacenter = findDatacenter(objects, object);
      return {
        id: object.id,
        name: object.props.name?.[0] ?? object.id,
        kind: object.type === "ClusterComputeResource" ? "Cluster" : "Host",
        datacenter: datacenter?.props.name?.[0] ?? "",
        inventoryPath: datacenter ? `/${datacenter.props.name?.[0]}/host/${object.props.name?.[0]}/Resources` : ""
      };
    });

  const resourcePools = objects.filter((object) => object.type === "ResourcePool").map((object) => {
    const owner = byId.get(object.props.owner?.[0]?.id);
    const datacenter = findDatacenter(objects, owner ?? object);
    const name = object.props.name?.[0] ?? object.id;
    return {
      id: object.id,
      name,
      owner: owner?.props.name?.[0] ?? "",
      datacenter: datacenter?.props.name?.[0] ?? "",
      inventoryPath: datacenter && owner ? `/${datacenter.props.name?.[0]}/host/${owner.props.name?.[0]}/${name}` : ""
    };
  });

  const folders = objects.filter((object) => object.type === "Folder").map((object) => ({
    id: object.id,
    name: object.props.name?.[0] ?? object.id
  }));
  const inventoryItems = objects.filter((object) => object.type === "VirtualMachine").map((object) => {
    const datacenter = findDatacenter(objects, object);
    const folderParts = folderPathParts(objects, object.props.parent?.[0]?.id, datacenter);
    const name = object.props.name?.[0] ?? object.id;
    return {
      id: object.id,
      name,
      kind: object.props["config.template"]?.[0] === "true" ? "Template" : "VM",
      datacenter: datacenter?.props.name?.[0] ?? "",
      inventoryPath: datacenter ? `/${datacenter.props.name?.[0]}/vm/${[...folderParts, name].join("/")}` : "",
      sourceNetworks: uniqueOptions((object.props.network ?? [])
        .map((networkRef) => byId.get(networkRef.id))
        .filter(Boolean)
        .map(toOption))
        .map((network) => network.name)
    };
  }).filter((item) => item.inventoryPath);

  return {
    platform: target.platform,
    datacenters,
    computeTargets,
    hosts,
    resourcePools,
    datastores,
    networks,
    folders,
    inventoryItems
  };
}

function folderPathParts(objects, folderId, datacenter) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const vmFolderId = datacenter?.props.vmFolder?.[0]?.id;
  const parts = [];
  const seen = new Set();
  let current = byId.get(folderId);
  while (current && current.id !== vmFolderId && !seen.has(current.id)) {
    seen.add(current.id);
    const name = current.props.name?.[0];
    if (name) parts.unshift(name);
    current = byId.get(current.props.parent?.[0]?.id);
  }
  return parts;
}

function findDatacenter(objects, start) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const seen = new Set();
  let current = start;
  while (current && !seen.has(current.id)) {
    if (current.type === "Datacenter") return current;
    seen.add(current.id);
    const parentRef = current.props.parent?.[0];
    current = parentRef ? byId.get(parentRef.id) : null;
  }
  return objects.find((object) => object.type === "Datacenter");
}

function parseObjects(xml) {
  const blocks = [...xml.matchAll(/<objects>([\s\S]*?)<\/objects>/g)].map((match) => match[1]);
  return blocks.map((block) => {
    const obj = block.match(/<obj type="([^"]+)">([^<]+)<\/obj>/);
    const props = {};
    for (const prop of block.matchAll(/<propSet>([\s\S]*?)<\/propSet>/g)) {
      const propXml = prop[1];
      const name = textTag(propXml, "name");
      if (!name) continue;
      props[name] = parseValue(propXml);
    }
    return {
      id: obj?.[2] ?? "",
      type: obj?.[1] ?? "",
      props
    };
  }).filter((object) => object.id);
}

function parseValue(propXml) {
  const val = propXml.match(/<val(?: [^>]*)?>([\s\S]*?)<\/val>/)?.[1] ?? "";
  const refs = [...val.matchAll(/<(?:ManagedObjectReference|val)[^>]*type="([^"]+)"[^>]*>([^<]+)<\/(?:ManagedObjectReference|val)>/g)]
    .map((match) => ({ type: match[1], id: match[2] }));
  if (refs.length) return refs;
  return [decodeXml(val.replace(/<[^>]+>/g, "").trim())].filter(Boolean);
}

function toOption(object) {
  return {
    id: object.id,
    name: object.props.name?.[0] ?? object.id
  };
}

function uniqueOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    const key = option.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstRef(xml, tag) {
  const match = xml.match(new RegExp(`<${tag} type="([^"]+)">([^<]+)<\\/${tag}>`));
  if (!match) throw new Error(`没有找到 ${tag}`);
  return { type: match[1], id: match[2] };
}

function textTag(xml, tag) {
  return decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
}

function ref(tag, object) {
  return `<${tag} type="${object.type}">${escapeXml(object.id)}</${tag}>`;
}

function envelope(content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soapenv:Body>${content}</soapenv:Body>
    </soapenv:Envelope>`;
}

function assertNoSoapFault(xml) {
  const fault = textTag(xml, "faultstring");
  if (fault) throw new Error(fault);
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value = "") {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
