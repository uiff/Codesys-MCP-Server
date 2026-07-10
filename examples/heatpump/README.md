# Example: Heat-Pump Controller (Wärmepumpen-Steuerung)

A complete, buildable heat-pump control application — generated entirely through
this MCP server's tooling. Demonstrates whole-application generation: enum DUT,
two GVLs, four function blocks, a 7-state machine, task wiring, and a clean build.

## Features

- **Heat curve** — flow setpoint linear over outside temperature (clamped)
- **DHW priority** — domestic hot water interrupts heating via 3-way valve
- **Compressor protection** — minimum run time + minimum off time (anti-short-cycle)
- **Pump sequencing** — pre-run before and post-run after the compressor
- **Backup heater** — electric element below the bivalence point
- **Safety interlocks** — high/low pressure, flow switch (delayed), source minimum
  temperature; latched `FAULT` state with manual reset

State machine (`E_HpState`):
`OFF → STANDBY → PREPUMP → HEATING ⇄ DHW → POSTPUMP → STANDBY`, plus `FAULT`
from any operating state.

> ⚠️ Functional control logic only — **not** certified functional safety.
> Personnel protection belongs on safety-rated hardware with certified
> PLCopen Safety function blocks.

## Files

| Path | Content |
|---|---|
| `Waermepumpe.project` | Ready-built CODESYS project (Control Win V3, compiles clean) — open directly in the IDE |
| `st/*.st` | All IEC 61131-3 sources (declaration/implementation per POU) |
| `generate.mjs` | Regenerates the project from the ST sources via the server's engine |

## Regenerate from source

```bash
# from the repository root, after npm install
node examples/heatpump/generate.mjs
```

Creates `Waermepumpe.generated.project` next to this file and builds it —
expected output ends with `"clean":true`. Target any other controller by
changing the `insert Control Win V3` step (see `codesys_list_devices` for
installed DeviceID triples).

## Retargeting to real hardware

The application is controller-agnostic: swap the `insertDevice` triple (e.g. a
Weidmüller UC20-M4000: type `4096`, id `16C1 0205`) and bind `GVL_IO.*` to real
channels with `codesys_map_io`. Analog temperature inputs typically need a
scaling layer (raw INT → REAL °C) appropriate to your IO cards.
