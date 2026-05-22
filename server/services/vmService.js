import { VimClient, firstRef, escapeXml, decodeXml } from "./vimClient.js";

const VIM_NS = "urn:vim25";
const sessionCache = new Map();

export class VmService {
  constructor(target) {
    this.target = target;
    this.client = new VimClient(target.host);
    this.serviceContent = null;
  }

  async ensureSession() {
    const cacheKey = `${this.target.host}:${this.target.username}`;
    const cached = sessionCache.get(cacheKey);
    if (cached) {
      this.client.setCookie(cached.cookie);
      this.serviceContent = cached.serviceContent;
    }

    if (!this.serviceContent) {
      const body = `<RetrieveServiceContent xmlns="${VIM_NS}"><_this type="ServiceInstance">ServiceInstance</_this></RetrieveServiceContent>`;
      const { text, cookie } = await this.client.soap(body);
      this.serviceContent = {
        rootFolder: firstRef(text, "rootFolder"),
        propertyCollector: firstRef(text, "propertyCollector"),
        sessionManager: firstRef(text, "sessionManager"),
        ovfManager: firstRef(text, "ovfManager")
      };

      const loginBody = `
        <Login xmlns="${VIM_NS}">
          ${this.client.ref("_this", this.serviceContent.sessionManager)}
          <userName>${escapeXml(this.target.username)}</userName>
          <password>${escapeXml(this.target.password)}</password>
        </Login>
      `;
      const loginRes = await this.client.soap(loginBody);
      sessionCache.set(cacheKey, { cookie: loginRes.cookie, serviceContent: this.serviceContent });
    }
  }

  async discoverInventory() {
    await this.ensureSession();
    const body = `
      <RetrievePropertiesEx xmlns="${VIM_NS}">
        ${this.client.ref("_this", this.serviceContent.propertyCollector)}
        <specSet>
          <propSet><type>Datacenter</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>vmFolder</pathSet><pathSet>hostFolder</pathSet><pathSet>datastore</pathSet><pathSet>network</pathSet></propSet>
          <propSet><type>ComputeResource</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>host</pathSet><pathSet>resourcePool</pathSet><pathSet>datastore</pathSet><pathSet>network</pathSet></propSet>
          <propSet><type>HostSystem</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>summary.hardware.cpuModel</pathSet><pathSet>summary.hardware.memorySize</pathSet><pathSet>runtime.powerState</pathSet><pathSet>runtime.connectionState</pathSet></propSet>
          <propSet><type>ResourcePool</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>owner</pathSet><pathSet>resourcePool</pathSet></propSet>
          <propSet><type>Datastore</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>summary.capacity</pathSet><pathSet>summary.freeSpace</pathSet><pathSet>summary.type</pathSet></propSet>
          <propSet><type>Network</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet></propSet>
          <propSet><type>DistributedVirtualPortgroup</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet></propSet>
          <propSet><type>VirtualMachine</type><all>false</all><pathSet>name</pathSet><pathSet>parent</pathSet><pathSet>config.template</pathSet><pathSet>network</pathSet><pathSet>summary.storage.committed</pathSet><pathSet>config.createDate</pathSet><pathSet>runtime.powerState</pathSet><pathSet>config.hardware.numCPU</pathSet><pathSet>config.hardware.memoryMB</pathSet><pathSet>guest.ipAddress</pathSet><pathSet>guest.guestFullName</pathSet></propSet>
          <objectSet>
            ${this.client.ref("obj", this.serviceContent.rootFolder)}
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
    `;

    const { text } = await this.client.soap(body);
    const objects = this.parseObjects(text);
    return this.normalizeInventory(objects);
  }

  async acquireWebMksTicket(vmId) {
    await this.ensureSession();
    
    // Attempt 1: AcquireTicket (More common across versions)
    try {
      const body = `<AcquireTicket xmlns="urn:vim25"><_this type="VirtualMachine">${escapeXml(vmId)}</_this><ticketType>webmks</ticketType></AcquireTicket>`;
      const { text } = await this.client.soap(body);
      const ticket = this.client.textTag(text, "ticket");
      const host = this.client.textTag(text, "host");
      const port = this.client.textTag(text, "port");
      if (ticket && host) {
        return { 
          ticket, 
          host, 
          port: parseInt(port || "443"), 
          cfgFile: this.client.textTag(text, "cfgFile"), 
          sslThumbprint: this.client.textTag(text, "sslThumbprint") 
        };
      }
    } catch (e) { console.log("AcquireTicket (webmks) failed:", e.message); }

    // Attempt 2: AcquireWebMksTicket (Modern)
    const bodyM = `<AcquireWebMksTicket xmlns="urn:vim25"><_this type="VirtualMachine">${escapeXml(vmId)}</_this></AcquireWebMksTicket>`;
    const { text: textM } = await this.client.soap(bodyM);
    return {
      ticket: this.client.textTag(textM, "ticket"),
      host: this.client.textTag(textM, "host") || this.target.host,
      port: parseInt(this.client.textTag(textM, "port") || "443"),
      cfgFile: this.client.textTag(textM, "cfgFile"),
      sslThumbprint: this.client.textTag(textM, "sslThumbprint")
    };
  }

  async powerOn(vmId) {
    await this.ensureSession();
    const body = `<PowerOnVM_Task xmlns="${VIM_NS}">${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}</PowerOnVM_Task>`;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async powerOff(vmId) {
    await this.ensureSession();
    const body = `<PowerOffVM_Task xmlns="${VIM_NS}">${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}</PowerOffVM_Task>`;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async reset(vmId) {
    await this.ensureSession();
    const body = `<ResetVM_Task xmlns="${VIM_NS}">${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}</ResetVM_Task>`;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async destroy(vmId) {
    await this.ensureSession();
    const body = `<Destroy_Task xmlns="${VIM_NS}">${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}</Destroy_Task>`;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async renameVm(vmId, newName) {
    await this.ensureSession();
    const body = `
      <Rename_Task xmlns="${VIM_NS}">
        ${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}
        <newName>${escapeXml(newName)}</newName>
      </Rename_Task>
    `;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async reconfigureVm(vmId, spec) {
    await this.ensureSession();
    const body = `
      <ReconfigVM_Task xmlns="${VIM_NS}">
        ${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}
        <spec>
          ${spec.numCPUs ? `<numCPUs>${Number(spec.numCPUs)}</numCPUs>` : ""}
          ${spec.memoryMB ? `<memoryMB>${Number(spec.memoryMB)}</memoryMB>` : ""}
        </spec>
      </ReconfigVM_Task>
    `;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async createSnapshot(vmId, name, description = "", memory = false) {
    await this.ensureSession();
    const body = `
      <CreateSnapshot_Task xmlns="${VIM_NS}">
        ${this.client.ref("_this", { type: "VirtualMachine", id: vmId })}
        <name>${escapeXml(name)}</name>
        <description>${escapeXml(description)}</description>
        <memory>${Boolean(memory)}</memory>
        <quiesce>false</quiesce>
      </CreateSnapshot_Task>
    `;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async revertToSnapshot(snapshotId) {
    await this.ensureSession();
    const body = `
      <RevertToSnapshot_Task xmlns="${VIM_NS}">
        ${this.client.ref("_this", { type: "VirtualMachineSnapshot", id: snapshotId })}
      </RevertToSnapshot_Task>
    `;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async removeSnapshot(snapshotId, removeChildren = false) {
    await this.ensureSession();
    const body = `
      <RemoveSnapshot_Task xmlns="${VIM_NS}">
        ${this.client.ref("_this", { type: "VirtualMachineSnapshot", id: snapshotId })}
        <removeChildren>${Boolean(removeChildren)}</removeChildren>
      </RemoveSnapshot_Task>
    `;
    const { text } = await this.client.soap(body);
    return firstRef(text, "returnval");
  }

  async getVmSnapshots(vmId) {
    await this.ensureSession();
    const body = `
      <RetrievePropertiesEx xmlns="${VIM_NS}">
        ${this.client.ref("_this", { type: "PropertyCollector", id: this.serviceContent.propertyCollector.id })}
        <specSet>
          <propSet><type>VirtualMachine</type><all>false</all><pathSet>snapshot</pathSet></propSet>
          <objectSet>${this.client.ref("obj", { type: "VirtualMachine", id: vmId })}</objectSet>
        </specSet>
        <options/>
      </RetrievePropertiesEx>
    `;
    const { text } = await this.client.soap(body);
    return this.parseSnapshotTree(text);
  }

  parseSnapshotTree(xml) {
    const snapshots = [];
    const matches = xml.matchAll(/<rootSnapshotList>([\s\S]+?)<\/rootSnapshotList>/g);
    for (const match of matches) {
      this.extractSnapshots(match[1], snapshots);
    }
    return snapshots;
  }

  extractSnapshots(xml, list) {
    const blocks = xml.matchAll(/<snapshot type="VirtualMachineSnapshot">([^<]+)<\/snapshot>[\s\S]+?<name>([^<]+)<\/name>[\s\S]+?<createTime>([^<]+)<\/createTime>/g);
    for (const block of blocks) {
      list.push({
        id: block[1],
        name: block[2],
        createdAt: block[3]
      });
    }
  }

  async checkVmNameConflicts(vmNames) {
    try {
      const inventory = await this.discoverInventory();
      const vms = (inventory.inventoryItems ?? []).filter((item) => item.kind === "VM");
      const existingNames = new Set(vms.map((item) => item.name));
      return vmNames.filter((name) => existingNames.has(name));
    } catch {
      return [];
    }
  }

  normalizeInventory(objects) {
    const datacenters = objects.filter((o) => o.type === "Datacenter").map((o) => this.toOption(o));
    const hosts = objects.filter((o) => o.type === "HostSystem").map((o) => this.toOption(o));
    const resourcePools = objects.filter((o) => o.type === "ResourcePool").map((o) => this.toOption(o));
    const datastores = objects.filter((o) => o.type === "Datastore").map((o) => ({
      id: o.id,
      name: o.props.name?.[0] || o.id,
      capacity: this.parseNumber(o.props["summary.capacity"]?.[0]),
      freeSpace: this.parseNumber(o.props["summary.freeSpace"]?.[0])
    }));
    const networks = objects.filter((o) => o.type === "Network" || o.type === "DistributedVirtualPortgroup").map((o) => this.toOption(o));
    const folders = objects.filter((o) => o.type === "Folder").map((o) => this.toOption(o));

    const computeTargets = objects.filter((o) => o.type === "ComputeResource").map((o) => ({
      id: o.id,
      name: o.props.name?.[0] || o.id,
      hosts: (o.props.host || []).map((h) => h.id),
      resourcePool: (o.props.resourcePool || [])[0]?.id
    }));

    const inventoryItems = objects.filter((o) => o.type === "VirtualMachine").map((o) => {
      const isTemplate = o.props["config.template"]?.[0] === "true";
      const storageCommitted = this.parseNumber(o.props["summary.storage.committed"]?.[0]);
      const createdAt = o.props["config.createDate"]?.[0];
      const powerState = o.props["runtime.powerState"]?.[0];
      const numCPU = this.parseNumber(o.props["config.hardware.numCPU"]?.[0]);
      const memoryMB = this.parseNumber(o.props["config.hardware.memoryMB"]?.[0]);
      const ipAddress = o.props["guest.ipAddress"]?.[0];
      const guestOS = o.props["guest.guestFullName"]?.[0];

      const dc = this.findDatacenter(objects, o);
      const folderPath = this.folderPathParts(objects, o.props.parent?.[0]?.id, dc).join("/");
      const inventoryPath = dc ? `${dc.props.name?.[0]}/${folderPath ? folderPath + "/" : ""}${o.props.name?.[0]}` : o.props.name?.[0];

      return {
        id: o.id,
        name: o.props.name?.[0],
        kind: isTemplate ? "Template" : "VM",
        inventoryPath,
        storageCommitted,
        createdAt,
        powerState,
        numCPU,
        memoryMB,
        ipAddress,
        guestOS
      };
    }).filter((item) => item.inventoryPath);

    return {
      platform: this.target.platform,
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

  parseNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  folderPathParts(objects, folderId, datacenter) {
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

  findDatacenter(objects, start) {
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

  parseObjects(xml) {
    const blocks = [...xml.matchAll(/<objects>([\s\S]*?)<\/objects>/g)].map((match) => match[1]);
    return blocks.map((block) => {
      const obj = block.match(/<obj type="([^"]+)">([^<]+)<\/obj>/);
      const props = {};
      for (const prop of block.matchAll(/<propSet>([\s\S]*?)<\/propSet>/g)) {
        const propXml = prop[1];
        const name = this.client.textTag(propXml, "name");
        if (!name) continue;
        props[name] = this.parseValue(propXml);
      }
      return {
        id: obj?.[2] ?? "",
        type: obj?.[1] ?? "",
        props
      };
    }).filter((object) => object.id);
  }

  parseValue(propXml) {
    const val = propXml.match(/<val(?: [^>]*)?>([\s\S]*?)<\/val>/)?.[1] ?? "";
    const refs = [...val.matchAll(/<(?:ManagedObjectReference|val)[^>]*type="([^"]+)"[^>]*>([^<]+)<\/(?:ManagedObjectReference|val)>/g)]
      .map((match) => ({ type: match[1], id: match[2] }));
    if (refs.length) return refs;
    return [decodeXml(val.replace(/<[^>]+>/g, "").trim())].filter(Boolean);
  }

  toOption(object) {
    return {
      id: object.id,
      name: object.props.name?.[0] ?? object.id
    };
  }
}
