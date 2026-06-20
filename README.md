# Smart-Home Building Blocks — Agent Context

Agent-friendly, regularly-regenerable catalogs of what the two big smart-home
building blocks support. Drop these files into an agent's context (or fetch the
JSON) so it has accurate, grounded knowledge of which devices and services are
supported when building on top of **Matter** or **Home Assistant** — instead of
guessing from stale training data.

Everything here is generated **directly from each project's canonical public
data source**, so it's reproducible, license-clean, and easy to keep current.

## Catalogs

| Catalog | What it covers | Markdown | JSON | Source |
|---|---|---|---|---|
| **Matter devices** | Every device certified for the Matter interop standard | [`matter-devices.md`](matter-devices.md) | [`matter-devices.json`](matter-devices.json) | [CSA Distributed Compliance Ledger](https://on.dcl.csa-iot.org) |
| **Home Assistant integrations** | Every integration HA ships (device / hub / service it can talk to) | [`home-assistant-integrations.md`](home-assistant-integrations.md) | [`home-assistant-integrations.json`](home-assistant-integrations.json) | [HA integrations index](https://www.home-assistant.io/integrations.json) |

## Why these sources

- **Matter** → the **Distributed Compliance Ledger (DCL)** is the on-chain
  registry the Connectivity Standards Alliance writes every certified product
  to. It's the authoritative upstream that consumer-facing sites (e.g.
  matterdatabase.com) are built on, and its REST API is public and unthrottled —
  so we pull straight from the root rather than scraping a frontend.
- **Home Assistant** → the project publishes a machine-readable index of every
  integration, generated from each integration's `manifest.json` plus its docs.

## Regenerate

```bash
npm run matter          # -> matter-devices.md / .json
npm run homeassistant   # -> home-assistant-integrations.md / .json
npm run build           # both
```

Plain Node (18+), **no dependencies** — just the built-in `fetch`. Both scripts
hit only the public APIs above. Re-run anytime to refresh — the certified-device
and integration lists grow constantly.

## Notes

- Matter device categories are mapped from numeric Matter Device Library type
  IDs to spec display names; a handful of vendor-specific / unset IDs show as
  `Unknown (0x….)`.
- `VID`/`PID` (Matter) are the Vendor ID / Product ID used on the wire and in
  the DCL. `domain` (Home Assistant) is the integration's internal id and its
  docs slug.
- Data is owned by the CSA and the Home Assistant project respectively; these
  files are a derived, attributed convenience copy.
