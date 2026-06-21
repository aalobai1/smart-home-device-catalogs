#!/usr/bin/env node
/**
 * Command Central — a tiny Matter dashboard.
 *
 * Connects to a local python-matter-server controller over WebSocket, keeps a
 * live cache of every node on OUR fabric, decodes each one into a friendly
 * device (vendor, product, type, on/off state), and serves a web UI to view &
 * control them. Zero dependencies — Node 22+ built-in WebSocket + http.
 *
 *   Controller WS : ws://127.0.0.1:5580/ws   (matter-server)
 *   This UI        : http://127.0.0.1:8090
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MATTER_WS = process.env.MATTER_WS || "ws://127.0.0.1:5580/ws";
const PORT = Number(process.env.PORT || 8090);

// Matter Device Library type IDs -> display names (same map as our catalog).
const DEVICE_TYPES = {
  10: "Door Lock", 14: "Aggregator", 15: "Generic Switch", 17: "Power Source",
  19: "Bridged Node", 21: "Contact Sensor", 22: "Root Node", 43: "Fan",
  44: "Air Quality Sensor", 45: "Air Purifier", 65: "Bridged Node",
  66: "Water Valve", 67: "Water Leak Detector", 68: "Rain Sensor",
  112: "Refrigerator", 114: "Room Air Conditioner", 116: "Robotic Vacuum",
  118: "Smoke/CO Alarm", 256: "On/Off Light", 257: "Dimmable Light",
  259: "On/Off Light Switch", 260: "Dimmer Switch", 261: "Color Dimmer Switch",
  263: "Occupancy Sensor", 266: "On/Off Plug", 267: "Dimmable Plug",
  268: "Color Temperature Light", 269: "Extended Color Light",
  271: "Mounted On/Off", 272: "Mounted Dimmable", 322: "Camera",
  514: "Window Covering", 769: "Thermostat", 770: "Temperature Sensor",
  775: "Humidity Sensor", 1292: "EV Charger (EVSE)", 1296: "Electrical Sensor",
};
const typeName = (id) => DEVICE_TYPES[id] ?? `Type 0x${Number(id).toString(16).toUpperCase()}`;

// ---- Matter controller WebSocket client -----------------------------------

const nodes = new Map(); // node_id -> raw node object from matter-server
let ws = null;
let connected = false;
let serverInfo = null;
let msgId = 0;
const pending = new Map(); // message_id -> {resolve, reject}

function rpc(command, args = {}) {
  return new Promise((resolve, reject) => {
    if (!connected) return reject(new Error("controller not connected"));
    const id = String(++msgId);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ message_id: id, command, args }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error("controller timeout")); }
    }, 60000);
  });
}

function connect() {
  ws = new WebSocket(MATTER_WS);
  ws.onopen = () => console.log("→ connected to controller", MATTER_WS);
  ws.onclose = () => {
    connected = false; serverInfo = null;
    console.log("× controller disconnected, retrying in 3s");
    setTimeout(connect, 3000);
  };
  ws.onerror = () => {};
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);

    // First frame is the ServerInfo handshake.
    if (m.sdk_version && !connected) {
      serverInfo = m;
      connected = true;
      console.log("controller ready — fabric", m.fabric_id, "sdk", m.sdk_version);
      rpc("start_listening").then((result) => {
        for (const n of result) nodes.set(n.node_id, n);
        console.log(`loaded ${nodes.size} node(s) on our fabric`);
      }).catch((err) => console.log("start_listening failed:", err.message));
      return;
    }

    // Command responses.
    if (m.message_id && pending.has(m.message_id)) {
      const { resolve, reject } = pending.get(m.message_id);
      pending.delete(m.message_id);
      if (m.error_code) reject(new Error(m.details || `error ${m.error_code}`));
      else resolve(m.result);
      return;
    }

    // Event stream.
    if (m.event) handleEvent(m);
  };
}

function handleEvent(m) {
  const d = m.data;
  switch (m.event) {
    case "node_added":
    case "node_updated":
      nodes.set(d.node_id, d);
      break;
    case "node_removed":
      nodes.delete(d);
      break;
    case "attribute_updated": {
      const [nodeId, path, value] = d;
      const n = nodes.get(nodeId);
      if (n) { n.attributes ||= {}; n.attributes[path] = value; }
      break;
    }
  }
}

// ---- Decode a raw node into a friendly device -----------------------------

const attr = (n, path) => n.attributes?.[path];

function decodeNode(n) {
  // Basic Information cluster (0x0028 = 40) lives on endpoint 0.
  const vendor = attr(n, "0/40/1");
  const product = attr(n, "0/40/3");
  const vendorId = attr(n, "0/40/2");
  const productId = attr(n, "0/40/4");
  const label = attr(n, "0/40/5");
  const serial = attr(n, "0/40/15");

  // Walk endpoints: find device types (Descriptor 0x1D=29 attr 0) + controls.
  const endpoints = new Map();
  for (const path of Object.keys(n.attributes || {})) {
    const ep = Number(path.split("/")[0]);
    if (!endpoints.has(ep)) endpoints.set(ep, {});
  }

  const deviceTypeIds = new Set();
  const controls = [];
  for (const ep of endpoints.keys()) {
    const dtl = attr(n, `${ep}/29/0`); // DeviceTypeList: [{0:type,1:rev}]
    if (Array.isArray(dtl)) for (const e of dtl) {
      const t = e["0"] ?? e.deviceType;
      if (t != null && t !== 22 && t !== 19) deviceTypeIds.add(t); // skip Root/Bridged
    }
    // On/Off cluster (6) present on this endpoint?
    const onoff = attr(n, `${ep}/6/0`);
    if (onoff !== undefined) {
      controls.push({ endpoint: ep, kind: "onoff", on: !!onoff });
    }
    // Level Control (8) current level 0-254
    const level = attr(n, `${ep}/8/0`);
    if (level !== undefined && onoff !== undefined) {
      controls[controls.length - 1].level = Math.round((level / 254) * 100);
    }
  }

  const types = [...deviceTypeIds].map(typeName);
  return {
    nodeId: n.node_id,
    available: n.available !== false,
    vendor: vendor || (vendorId ? `Vendor 0x${Number(vendorId).toString(16)}` : "Unknown"),
    product: product || label || "Matter device",
    label: label || "",
    vendorId, productId,
    serial: serial || "",
    types: types.length ? types : ["Unknown type"],
    controls,
    commissioned: n.date_commissioned,
  };
}

const devices = () => [...nodes.values()].map(decodeNode).sort((a, b) => a.nodeId - b.nodeId);

// ---- HTTP / API ------------------------------------------------------------

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

const json = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/") {
      const html = await readFile(join(HERE, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(html);
    }

    if (url.pathname === "/api/state") {
      return json(res, 200, {
        connected,
        controller: serverInfo && { fabricId: serverInfo.fabric_id, sdk: serverInfo.sdk_version },
        devices: devices(),
      });
    }

    if (url.pathname === "/api/commission" && req.method === "POST") {
      const { code } = await readBody(req);
      if (!code) return json(res, 400, { error: "missing pairing code" });
      console.log("commissioning with code…");
      try {
        const node = await rpc("commission_with_code", { code: String(code).trim(), network_only: true });
        if (node) nodes.set(node.node_id, node);
        return json(res, 200, { ok: true, nodeId: node?.node_id });
      } catch (err) {
        return json(res, 500, { error: err.message });
      }
    }

    if (url.pathname === "/api/toggle" && req.method === "POST") {
      const { nodeId, endpoint } = await readBody(req);
      try {
        await rpc("device_command", {
          node_id: nodeId, endpoint_id: endpoint,
          cluster_id: 6, command_name: "Toggle", payload: {},
        });
        return json(res, 200, { ok: true });
      } catch (err) {
        return json(res, 500, { error: err.message });
      }
    }

    res.writeHead(404); res.end("not found");
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

connect();
server.listen(PORT, () => {
  console.log(`\n  Command Central → http://127.0.0.1:${PORT}\n`);
});
