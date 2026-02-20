# eco-registry

Canonical repository: `https://github.com/bbuchsbaum/eco-registry`

This repository is the source of truth for ecosystem package discovery.
It generates and publishes `registry.json`, which the EcoOracle MCP server consumes.
Primary purpose: help users write new analysis/application scripts outside package development repos.

## What This Repo Owns

- `registry.json`: machine-readable list of ecosystem packages
- `.github/scripts/discover.mjs`: discovery/generation logic
- `.github/workflows/discover-registry.yml`: nightly + manual update workflow

If your local workspace has a parent folder (for example `eco-oracle/`), this repo is still the actual git/GitHub root.

## System Overview

1. Package repo opts in via `.ecosystem.yml`.
2. Package CI publishes `atlas-pack.tgz` at release tag `eco-atlas`.
3. This repo's discovery workflow scans all repos under an owner, finds `.ecosystem.yml`, resolves release assets, and writes `registry.json`.
4. MCP clients read `registry.json` and load cards/symbols/edges from each package atlas.
5. Users query the MCP tools to assemble runnable external scripts (`eco_howto`, `eco_symbol`, `eco_where_used`).

## Turnkey: Add Any New R Package

In the package repository:

1. Add `.ecosystem.yml` at repo root.

```yaml
ecosystem: true
package: mypkg
language: R
role: transform
tags: [domain-tag, canonicalization]
entrypoints:
  - mypkg::main_fn
  - mypkg::read_input
# optional overrides (defaults shown)
release_tag: eco-atlas
asset: atlas-pack.tgz
```

2. Add package atlas workflow/tooling (from EcoOracle templates).
The output should be user-facing usage knowledge, not package-maintainer-only internals.

3. Configure package secret:
- `OPENAI_API_KEY`

4. Push to `main` (or run package workflow manually).

5. Verify package release asset exists:
- tag: `eco-atlas`
- asset: `atlas-pack.tgz`

6. Trigger discovery here (or wait nightly):

```bash
gh workflow run discover-registry.yml --repo bbuchsbaum/eco-registry
```

7. Verify package appears in `registry.json`.

## Nightly Registry Updates

Workflow: `.github/workflows/discover-registry.yml`

Schedule:
- daily at `04:00 UTC`

Required repository settings (in `bbuchsbaum/eco-registry`):

1. Secret: `GH_ORG_PAT`
- must read repos under the target owner
- must push commits to this repo

2. Variable: `ECO_OWNER`
- owner to scan
- supports GitHub org or user (for example `bbuchsbaum`)

3. Optional variable: `ECO_ORG`
- backward-compatible fallback

## `registry.json` Contract

Each entry includes:

- `repo`: `owner/repo`
- `package`
- `language`: `R` or `Python`
- `release_tag`: defaults to `eco-atlas`
- `asset`: defaults to `atlas-pack.tgz`
- `atlas_asset_url`: optional direct URL when resolvable
- `role`, `tags`, `entrypoints`, `last_updated`

Design intent:
- `release_tag` + `asset` is the canonical contract
- `atlas_asset_url` is convenience data
- this makes registry generation deterministic and avoids ad-hoc entries

## How Claude/Codex Uses This Registry

Use this URL in MCP config:

`https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/registry.json`

## Turnkey Client Install (One Command)

From any remote machine, install and register the MCP server for Claude/Codex:

```bash
curl -fsSL https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/scripts/install-eco-oracle-mcp.sh | bash
```

Installer behavior:
- creates a launcher script at `~/.local/bin/eco-oracle-mcp-launch`
- sets `ECO_REGISTRY_URL` to this registry
- registers MCP server `eco-oracle` with Claude and Codex (if installed)

Useful overrides:

```bash
# install for Claude only
ECO_INSTALL_TARGET=claude curl -fsSL https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/scripts/install-eco-oracle-mcp.sh | bash

# install for Codex only
ECO_INSTALL_TARGET=codex curl -fsSL https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/scripts/install-eco-oracle-mcp.sh | bash

# use a source-built server command (if npm package is unavailable)
ECO_MCP_EXEC='node /absolute/path/to/eco-oracle/packages/eco-oracle-mcp/dist/index.js' \
curl -fsSL https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/scripts/install-eco-oracle-mcp.sh | bash
```

Claude Code example:

```bash
claude mcp add eco-oracle -- npx -y eco-oracle-mcp
```

Codex example:

```bash
codex mcp add eco-oracle -- npx -y eco-oracle-mcp
```

Typical MCP env:

- `ECO_REGISTRY_URL=https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/registry.json`
- `ECO_GITHUB_TOKEN` (optional, needed for private repos/assets)

Typical consumer workflow in an external script project:
1. Ask `eco_howto("How do I ...?")` for task recipes.
2. Inspect exact APIs with `eco_symbol("pkg::fn")`.
3. Stitch returned recipes into a script in your project.

## Troubleshooting

1. Package not showing in `registry.json`
- confirm `.ecosystem.yml` exists on default branch
- confirm package `eco-atlas` release exists with `atlas-pack.tgz`
- run discovery manually and inspect workflow logs

2. Discovery runs but entry has empty `atlas_asset_url`
- release/asset likely missing or temporarily unreachable
- canonical `release_tag` + `asset` still present for MCP resolution

3. MCP loads zero packages
- verify MCP env points to this exact registry URL
- call MCP tool `eco_refresh` and inspect returned `registry_source`
