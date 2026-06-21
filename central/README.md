# Command Central — a minimal Matter dashboard

A working demo that runs your **own Matter controller fabric** on your computer,
shows every device you commission to it (real vendor / product / device type,
read straight from the device), and lets you control them.

```
┌────────────────────┐   WebSocket    ┌────────────────────┐   Matter    ┌─────────┐
│  Command Central   │ ◀────:5580────▶│ python-matter-     │ ◀─────────▶ │ devices │
│  (Node, this repo) │   ws://…/ws    │ server (controller)│   mDNS/IP   │ on LAN  │
│  http://…:8090     │                │  = our fabric      │             └─────────┘
└────────────────────┘                └────────────────────┘
```

- **Controller** = [`python-matter-server`](https://github.com/home-assistant-libs/python-matter-server),
  the same Matter controller Home Assistant uses. Runs natively on macOS (Apple
  Silicon). Think of it as a background service — you don't edit it.
- **Command Central** = the ~300-line zero-dependency Node app in this folder
  (`server.mjs` + `index.html`). This is the part you own.

## Run

```bash
./central/start.sh      # boots controller + UI (first run installs the controller)
open http://127.0.0.1:8090
./central/stop.sh       # shut down
```

Requires `uv` and Node 18+. No other dependencies.

## Add a device (the one manual step)

Matter is secure by design: you can *see* devices on the network without
permission, but to read/control one you must join its **fabric**. You own the
devices, so use **multi-admin** (no factory reset):

1. Open the device in its current app (Apple Home, Google Home, SmartThings, Alexa).
2. Choose **“Turn on pairing mode” / “Add to another platform / Link apps & services.”**
3. Copy the setup code it shows.
4. Paste it into Command Central → **Add device.**

The controller commissions it on-network onto our fabric, and the card lights up
with the device's self-reported identity and a live on/off toggle.

## What this proves

- A full Matter controller runs locally with no cloud and no vendor lock-in.
- Once on our fabric, we get the device's real **VendorName / ProductName /
  DeviceType** (Basic Information + Descriptor clusters) — the "what is it" that
  passive mDNS discovery deliberately hides.
- Control (On/Off here; Level/Color/Thermostat are the same `device_command`
  pattern) works over the local fabric.

## Limits (Matter's design, not the tool's)

- Devices commissioned to *another* fabric you don't control can't be read until
  their owner shares them via multi-admin.
- **Thread**-only devices live behind a Thread Border Router; reaching them needs
  the Thread operational dataset, not just IP/mDNS.
