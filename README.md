# eco-registry

Central registry of packages participating in the internal R/Python package ecosystem.

## How it works

1. Each package repo contains a `.ecosystem.yml` at its root.
2. The `discover-registry.yml` GitHub Action scans all org repos for this file.
3. Found packages are compiled into `registry.json` and committed automatically.
4. EcoOracle downloads `registry.json` on startup to discover atlas pack URLs.

## registry.json format

An array of registry entries:

```json
[
  {
    "repo": "myorg/mypkg",
    "package": "mypkg",
    "language": "R",
    "atlas_asset_url": "https://github.com/myorg/mypkg/releases/download/eco-atlas/atlas-pack.tgz",
    "role": "ingest",
    "tags": ["transactions", "canonicalization"],
    "entrypoints": ["mypkg::canonicalize_transactions"],
    "last_updated": "2026-02-19T00:00:00Z"
  }
]
```

## Adding a package

From the package repo, ask your agent: **"Add this package to the ecosystem."**

The `eco-join` skill will scaffold all required files. After the PR merges and CI runs, the package appears in `registry.json` automatically within 24 hours (or trigger `workflow_dispatch` on this repo for immediate update).

## Manual registration

If you need to add a package manually, append an entry to `registry.json` following the schema above, then open a PR.

## Validation

The discovery action validates:
- `atlas_asset_url` is reachable (HTTP 200 or 302)
- `manifest.json` inside the pack is parseable
- Package name matches DESCRIPTION

Packages that fail validation are logged but not removed from the registry (to avoid breaking the oracle on transient failures).
