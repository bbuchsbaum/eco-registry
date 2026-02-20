#!/usr/bin/env bash
set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/bbuchsbaum/eco-registry/main"

if [[ ! -f "DESCRIPTION" ]]; then
  echo "[bootstrap] ERROR: DESCRIPTION not found. Run this from an R package repo root." >&2
  exit 1
fi

pkg_name="$(awk -F': *' '/^Package:/ {print $2; exit}' DESCRIPTION | tr -d '\r')"
if [[ -z "${pkg_name}" ]]; then
  echo "[bootstrap] ERROR: Could not parse Package from DESCRIPTION." >&2
  exit 1
fi

default_role="${ECO_ROLE:-ingest}"
default_tags="${ECO_TAGS:-bids,neuroimaging,fmri}"

mkdir -p .github/workflows tools

write_ecosystem_yml() {
  if [[ -f ".ecosystem.yml" ]]; then
    echo "[bootstrap] .ecosystem.yml already exists; leaving as-is."
    return
  fi

  IFS=',' read -r -a tags <<< "${default_tags}"

  {
    echo "ecosystem: true"
    echo "package: ${pkg_name}"
    echo "language: R"
    echo "role: ${default_role}"
    echo "tags:"
    for t in "${tags[@]}"; do
      tag_trimmed="$(echo "${t}" | xargs)"
      [[ -n "${tag_trimmed}" ]] && echo "  - ${tag_trimmed}"
    done
    echo "entrypoints: []"
    echo "release_tag: eco-atlas"
    echo "asset: atlas-pack.tgz"
  } > .ecosystem.yml

  echo "[bootstrap] Wrote .ecosystem.yml"
}

fetch_template() {
  local remote_path="$1"
  local local_path="$2"
  if [[ -f "${local_path}" ]]; then
    echo "[bootstrap] ${local_path} already exists; leaving as-is."
    return
  fi
  curl -fsSL "${REPO_RAW_BASE}/${remote_path}" -o "${local_path}"
  echo "[bootstrap] Wrote ${local_path}"
}

write_ecosystem_yml
fetch_template "templates/.github/workflows/eco-atlas.yml" ".github/workflows/eco-atlas.yml"
fetch_template "templates/tools/eco_atlas_extract.R" "tools/eco_atlas_extract.R"
fetch_template "templates/tools/eco_atlas_distill.mjs" "tools/eco_atlas_distill.mjs"

cat <<MSG

[bootstrap] Done.

Next steps:
1. Add GitHub secret OPENAI_API_KEY in this package repo.
2. Commit and push these files.
3. Trigger workflow (or push to main/master):
   gh workflow run eco-atlas.yml
4. Trigger registry discovery:
   gh workflow run discover-registry.yml --repo bbuchsbaum/eco-registry

Definition of done:
- Release tag eco-atlas contains atlas-pack.tgz
- bbuchsbaum/eco-registry registry.json includes ${pkg_name}
- eco_refresh shows package in MCP clients
MSG
