# eco-registry

Canonical repository: `https://github.com/bbuchsbaum/eco-registry`

This repository is the source of truth for ecosystem package discovery.
It generates and publishes `registry.json`, which the EcoOracle MCP server consumes to help users write analysis scripts using ecosystem packages.

This system is multi-tenant:
- `eco-oracle-mcp` is generic runtime.
- each ecosystem uses its own registry repo + `registry.json`.
- users can consume this repo's ecosystem, or run their own by forking/copying this repo.

## System Overview

1. A package repo opts in by adding `.ecosystem.yml` to its root.
2. Package CI publishes `atlas-pack.tgz` at release tag `eco-atlas`.
3. This repo's nightly discovery workflow scans all repos under an owner, finds `.ecosystem.yml`, resolves release assets, and writes `registry.json`.
4. MCP clients read `registry.json` and load cards/symbols/edges from each package atlas.
5. Users query MCP tools (`eco_howto`, `eco_symbol`, `eco_where_used`) to assemble runnable scripts.

## Repository Contents

| Path | Purpose |
|------|---------|
| `registry.json` | Machine-readable list of ecosystem packages (generated) |
| `.github/scripts/discover.mjs` | Discovery and registry generation logic |
| `.github/workflows/discover-registry.yml` | Nightly + manual discovery workflow |
| `scripts/bootstrap-package.sh` | One-command package onboarding script |
| `scripts/install-eco-oracle-mcp.sh` | One-command MCP client installer |
| `templates/` | Template files copied by the bootstrap script |
| `OPERATIONS.md` | Operator runbook for triage and incidents |

## Onboarding a Package

### Quick Start (Recommended)

From your R package repo root, run the bootstrap script:

```bash
curl -fsSL https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/scripts/bootstrap-package.sh | bash
```

Using your own registry repo (fork or copy):

```bash
export ECO_REGISTRY_REPO="<your-org-or-user>/eco-registry"
export ECO_REGISTRY_REF="main"
curl -fsSL "https://raw.githubusercontent.com/${ECO_REGISTRY_REPO}/${ECO_REGISTRY_REF}/scripts/bootstrap-package.sh" | bash
```

If `eco-registry` is private, use the GitHub CLI instead:

```bash
gh api "repos/bbuchsbaum/eco-registry/contents/scripts/bootstrap-package.sh?ref=main" \
  -H "Accept: application/vnd.github.raw" | bash
```

Private + custom registry repo:

```bash
export ECO_REGISTRY_REPO="<your-org-or-user>/eco-registry"
export ECO_REGISTRY_REF="main"
gh api "repos/${ECO_REGISTRY_REPO}/contents/scripts/bootstrap-package.sh?ref=${ECO_REGISTRY_REF}" \
  -H "Accept: application/vnd.github.raw" | bash
```

To also configure the `OPENAI_API_KEY` secret automatically:

```bash
read -s OPENAI_API_KEY
export OPENAI_API_KEY
gh api "repos/bbuchsbaum/eco-registry/contents/scripts/bootstrap-package.sh?ref=main" \
  -H "Accept: application/vnd.github.raw" | bash
unset OPENAI_API_KEY
```

The bootstrap script creates:

- `.ecosystem.yml`
- `.github/workflows/eco-atlas.yml`
- `tools/eco_atlas_extract.R`
- `tools/eco_atlas_distill.mjs`

Important: bootstrap uses placeholder metadata. Before commit, you must update `.ecosystem.yml`:
- set a package-specific `role`
- replace placeholder `tags`
- add real exported `entrypoints` used by consumers

### Post-Bootstrap Verification

Ask Claude Code to verify onboarding:

```text
Run the EcoOracle bootstrap follow-through for this repo:
1) verify .ecosystem.yml, eco-atlas workflow, and tools files are present
2) update .ecosystem.yml with package-specific role, tags, and canonical entrypoints (no placeholders)
3) verify OPENAI_API_KEY GitHub secret is configured (using current shell env)
4) commit and push only these onboarding files
5) trigger eco-atlas workflow
6) report the workflow run URL and whether release eco-atlas/atlas-pack.tgz exists
```

### Manual Steps (If Not Using Bootstrap)

1. Add `.ecosystem.yml` at repo root:

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

   Mandatory quality rule:
   - `role`, `tags`, and `entrypoints` must be package-specific.
   - Do not leave defaults/placeholders (for example `domain-tag`, `workflow-tag`, `entrypoints: []`).

2. Add the package atlas workflow and tooling from the `templates/` directory.
   Output should be user-facing usage knowledge, not package-maintainer-only internals.

3. Configure the `OPENAI_API_KEY` secret:
   - Automatic (if set before bootstrap): done by the script
   - Manual fallback: `gh secret set OPENAI_API_KEY --repo <owner/repo>`

4. Push to `main` (or trigger the package workflow manually).

5. Optional but recommended: verify the release asset exists (tag: `eco-atlas`, asset: `atlas-pack.tgz`).

   ```bash
   gh release view eco-atlas --repo <owner>/<repo>
   ```

6. Trigger discovery now for immediate availability (optional if you can wait for nightly):

   ```bash
gh workflow run discover-registry.yml --repo bbuchsbaum/eco-registry
```

7. Verify the package appears in `registry.json`.

## Installing the MCP Client

### One-Command Installer

```bash
curl -fsSL https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/scripts/install-eco-oracle-mcp.sh | bash
```

This creates a launcher at `~/.local/bin/eco-oracle-mcp-launch` and registers the MCP server with Claude and/or Codex (if installed).

Installer overrides:

```bash
# Claude only
ECO_INSTALL_TARGET=claude curl -fsSL ... | bash

# Codex only
ECO_INSTALL_TARGET=codex curl -fsSL ... | bash

# Use your own registry repo defaults
ECO_REGISTRY_REPO='<your-org-or-user>/eco-registry' ECO_REGISTRY_REF='main' \
  curl -fsSL "https://raw.githubusercontent.com/<your-org-or-user>/eco-registry/main/scripts/install-eco-oracle-mcp.sh" | bash

# Source-built server (if npm package is unavailable)
ECO_MCP_EXEC='node /absolute/path/to/eco-oracle/packages/eco-oracle-mcp/dist/index.js' \
  curl -fsSL ... | bash
```

### Manual Registration

```bash
# Claude Code
claude mcp add eco-oracle -- npx -y eco-oracle-mcp

# Codex
codex mcp add eco-oracle -- npx -y eco-oracle-mcp
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ECO_REGISTRY_URL` | Registry URL (default: `https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main/registry.json`) |
| `ECO_REGISTRY_REPO` | Registry repo used by installer defaults (default: `bbuchsbaum/eco-registry`) |
| `ECO_REGISTRY_REF` | Registry branch/tag for installer defaults (default: `main`) |
| `ECO_GITHUB_TOKEN` | Optional; needed for private repos/assets |

### Typical Workflow

1. `eco_howto("How do I ...?")` — get task recipes
2. `eco_symbol("pkg::fn")` — inspect exact APIs
3. Stitch returned recipes into a script in your project

## `registry.json` Contract

Each entry contains:

| Field | Description |
|-------|-------------|
| `repo` | `owner/repo` |
| `package` | Package name |
| `language` | `R` or `Python` |
| `release_tag` | Release tag (default: `eco-atlas`) |
| `asset` | Asset filename (default: `atlas-pack.tgz`) |
| `atlas_asset_url` | Direct download URL (convenience; may be empty) |
| `role` | Package role (e.g. `ingest`, `model`, `transform`) |
| `tags` | Searchable tags |
| `entrypoints` | Key exported functions |
| `last_updated` | ISO timestamp of last discovery |

The canonical contract is `release_tag` + `asset`. The `atlas_asset_url` is convenience data that may be empty if the asset was unreachable at discovery time.

## Manual Hints and Manual Cards

To improve retrieval for a package, put hints in **the package repo**, not in `registry.json`.

**Hard rule:** `registry.json` is generated by discovery. Nightly discovery overwrites it. Manual edits are temporary and will be lost.

### Durable Hint Locations (Package Repo)

1. **`.ecosystem.yml`** — `role`, `tags`, `entrypoints`
2. **`R/*.R`** — `# ECO:howto ...` markers above canonical snippets
3. **`README.Rmd` / `vignettes/*.Rmd`** — canonical user-facing code fences
4. **`manual_cards.jsonl`** — deterministic overrides merged into generated `atlas/cards.jsonl`
   - If `id` collides with a generated card, the manual card wins

### `manual_cards.jsonl` Format

One JSON object per line. Required fields: `q`, `a`, `recipe`, `symbols`. Optional: `id`, `tags`, `package`, `language`, `sources`.

```json
{"id":"manual.bidser.load_project","q":"How do I load a BIDS project in R?","a":"Use bidser::bids_project() on the dataset root, then inspect scans with func_scans().","recipe":"library(bidser)\nproj <- bidser::bids_project('/path/to/bids')\nscans <- bidser::func_scans(proj)","symbols":["bidser::bids_project","bidser::func_scans"],"tags":["bids","ingest"]}
```

### Applying Hints

1. Commit hint changes in the package repo.
2. Run/push the package `eco-atlas` workflow (publishes new `atlas-pack.tgz`).
3. Wait for nightly discovery or trigger `discover-registry` manually.
4. In an MCP client, call `eco_refresh`, then verify with `eco_howto` / `eco_symbol`.

## Nightly Discovery

- **Workflow:** `.github/workflows/discover-registry.yml`
- **Schedule:** daily at 04:00 UTC
- **Manual trigger:** `gh workflow run discover-registry.yml --repo <owner>/eco-registry`

### Required Repository Settings

| Setting | Type | Purpose |
|---------|------|---------|
| `GH_ORG_PAT` | Secret (optional) | Needed for private-repo discovery; public-only can use `github.token` |
| `ECO_OWNER` | Variable | Owner to scan (GitHub org or user, e.g. `bbuchsbaum`) |
| `ECO_ORG` | Variable | Backward-compatible fallback for `ECO_OWNER` |

## Troubleshooting

**Package not showing in `registry.json`:**
- Confirm `.ecosystem.yml` exists on default branch
- Confirm release `eco-atlas` exists with asset `atlas-pack.tgz`
- Run discovery manually and inspect workflow logs

**Entry has empty `atlas_asset_url`:**
- Release/asset was likely missing or unreachable at discovery time
- MCP can still resolve via `release_tag` + `asset`

**MCP loads zero packages:**
- Verify MCP env points to the correct registry URL
- Call `eco_refresh` and inspect `registry_source` in the response

For detailed triage and incident handling, see [OPERATIONS.md](OPERATIONS.md).
