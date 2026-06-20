#!/usr/bin/env node
/**
 * Generate an agent-friendly list of Matter-certified devices.
 *
 * Source of truth: the Connectivity Standards Alliance (CSA) Distributed
 * Compliance Ledger (DCL) — the public, on-chain registry that every certified
 * Matter product is written to. This is the same data that powers sites like
 * matterdatabase.com, fetched directly from the canonical API so the output is
 * reproducible and license-clean.
 *
 * DCL REST API: https://on.dcl.csa-iot.org/  (no auth required)
 *
 * Outputs:
 *   matter-devices.md    Human/agent-readable Markdown, grouped by device type
 *   matter-devices.json  Same data, machine-readable
 *
 * Run:  node generate-matter.mjs   (Node 18+, no dependencies)
 */

import { writeFile } from "node:fs/promises";

const DCL = "https://on.dcl.csa-iot.org";
const UA = { "User-Agent": "matter-devices-md/1.0" };

// Matter Device Library type IDs -> spec display names (typeName from the
// project-chip/connectedhomeip data model). Unknowns fall back to "Unknown".
const DEVICE_TYPES = {
  10: "Door Lock", 11: "Door Lock Controller", 14: "Aggregator",
  15: "Generic Switch", 17: "Power Source", 19: "Bridged Node",
  21: "Contact Sensor", 22: "Root Node", 40: "Basic Video Player",
  43: "Fan", 44: "Air Quality Sensor", 45: "Air Purifier",
  66: "Water Valve", 67: "Water Leak Detector", 68: "Rain Sensor",
  112: "Refrigerator", 114: "Room Air Conditioner", 115: "Laundry Washer",
  116: "Robotic Vacuum Cleaner", 117: "Dishwasher", 118: "Smoke CO Alarm",
  123: "Oven", 124: "Laundry Dryer", 145: "Thread Border Router",
  256: "On/Off Light", 257: "Dimmable Light", 259: "On/Off Light Switch",
  260: "Dimmer Switch", 261: "Color Dimmer Switch", 263: "Occupancy Sensor",
  266: "On/Off Plug-in Unit", 267: "Dimmable Plug-in Unit",
  268: "Color Temperature Light", 269: "Extended Color Light",
  271: "Mounted On/Off Control", 272: "Mounted Dimmable Load Control",
  322: "Camera", 514: "Window Covering", 515: "Window Covering Controller",
  769: "Thermostat", 770: "Temperature Sensor",
  1292: "EV Supply Equipment (EVSE)", 1296: "Electrical Sensor",
};

const hex = (n, w = 4) => "0x" + n.toString(16).toUpperCase().padStart(w, "0");
const typeName = (id) => DEVICE_TYPES[id] ?? `Unknown (${hex(id)})`;
const esc = (s) => String(s ?? "").replaceAll("|", "\\|");
const anchor = (t) =>
  t.toLowerCase().replaceAll("/", "").replaceAll("(", "").replaceAll(")", "").replaceAll(" ", "-");

async function fetchAll(path, listKey) {
  const rows = [];
  let key = null;
  for (;;) {
    let q = "pagination.limit=2000";
    if (key) q += "&pagination.key=" + encodeURIComponent(key);
    const res = await fetch(`${DCL}${path}?${q}`, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const data = await res.json();
    rows.push(...data[listKey]);
    key = data.pagination?.next_key;
    if (!key) return rows;
  }
}

async function main() {
  console.log("Fetching vendors from DCL...");
  const vendors = await fetchAll("/dcl/vendorinfo/vendors", "vendorInfo");
  const vmap = new Map(
    vendors.map((v) => [v.vendorID, (v.companyPreferredName || v.vendorName || "").trim()])
  );

  console.log("Fetching models from DCL...");
  const models = await fetchAll("/dcl/model/models", "model");
  console.log(`  ${models.length} models, ${vmap.size} vendors`);

  const devices = models.map((m) => ({
    vendor: vmap.get(m.vid) ?? `VID ${hex(m.vid)}`,
    vendorId: m.vid,
    productId: m.pid,
    product: (m.productName || m.productLabel || "").trim(),
    deviceType: typeName(m.deviceTypeId),
    deviceTypeId: m.deviceTypeId,
  }));

  const cmp = (a, b) => a.localeCompare(b);
  devices.sort(
    (a, b) =>
      cmp(a.deviceType.toLowerCase(), b.deviceType.toLowerCase()) ||
      cmp(a.vendor.toLowerCase(), b.vendor.toLowerCase()) ||
      cmp(a.product.toLowerCase(), b.product.toLowerCase())
  );

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    "matter-devices.json",
    JSON.stringify(
      {
        source: "CSA Distributed Compliance Ledger (https://on.dcl.csa-iot.org)",
        generated: today,
        count: devices.length,
        devices,
      },
      null,
      2
    )
  );

  const byType = new Map();
  for (const d of devices) {
    if (!byType.has(d.deviceType)) byType.set(d.deviceType, []);
    byType.get(d.deviceType).push(d);
  }
  const types = [...byType.keys()].sort(
    (a, b) => byType.get(b).length - byType.get(a).length || cmp(a.toLowerCase(), b.toLowerCase())
  );
  const vendorCount = new Set(devices.map((d) => d.vendorId)).size;
  const n = (x) => x.toLocaleString("en-US");

  const L = [];
  L.push("# Matter-Certified Devices", "");
  L.push("> Agent-friendly reference of every device certified for **Matter**, the smart-home");
  L.push("> interoperability standard. Use this to know which product categories and which");
  L.push("> specific products are officially Matter-compatible when building on top of Matter.", "");
  L.push(
    "**Source:** [CSA Distributed Compliance Ledger (DCL)](https://on.dcl.csa-iot.org) — " +
      "the canonical public registry maintained by the Connectivity Standards Alliance. " +
      "Every certified Matter product is written here; this file is generated directly from it.",
    ""
  );
  L.push(`**Generated:** ${today}  `);
  L.push(`**Devices:** ${n(devices.length)} certified models  `);
  L.push(`**Vendors:** ${n(vendorCount)}  `);
  L.push(`**Device categories:** ${byType.size}`, "");
  L.push(
    "Each row is one certified product. `VID`/`PID` are the Matter Vendor ID and Product ID " +
      "(hex), the unique identifiers the protocol uses on the wire and in the DCL. Regenerate " +
      "anytime with `npm run matter`.",
    ""
  );

  L.push("## Supported device categories", "");
  L.push("| Device type | Matter type ID | Certified products |", "|---|---|---|");
  for (const t of types) {
    const tid = byType.get(t)[0].deviceTypeId;
    const tidS = Number.isInteger(tid) && tid >= 0 ? hex(tid) : "—";
    L.push(`| [${t}](#${anchor(t)}) | ${tidS} | ${byType.get(t).length} |`);
  }
  L.push("");

  for (const t of types) {
    const rows = byType.get(t);
    L.push(`## ${t}`, "");
    L.push(`_${rows.length} certified products._`, "");
    L.push("| Vendor | Product | VID | PID |", "|---|---|---|---|");
    for (const d of rows) {
      L.push(`| ${esc(d.vendor)} | ${esc(d.product || "—")} | ${hex(d.vendorId)} | ${hex(d.productId)} |`);
    }
    L.push("");
  }

  await writeFile("matter-devices.md", L.join("\n"));
  console.log(`Wrote matter-devices.md and matter-devices.json (${devices.length} devices)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
