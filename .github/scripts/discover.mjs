#!/usr/bin/env node
/**
 * discover.mjs — Scan all org repos for .ecosystem.yml and update registry.json
 *
 * Requires:
 *   GH_TOKEN  — PAT with read:org + repo scope
 *   GH_ORG    — GitHub org name
 */

import fs from "node:fs";

const TOKEN = process.env.GH_TOKEN;
const ORG   = process.env.GH_ORG;

if (!TOKEN || !ORG) {
  console.error("Missing GH_TOKEN or GH_ORG");
  process.exit(1);
}

const REGISTRY_PATH = "registry.json";
const ATLAS_RELEASE_TAG = "eco-atlas";
const ATLAS_ASSET_NAME  = "atlas-pack.tgz";

async function ghGet(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${path}`);
  return res.json();
}

async function getFileContent(repo, filePath) {
  const data = await ghGet(`/repos/${ORG}/${repo}/contents/${filePath}`);
  if (!data || data.type !== "file") return null;
  return Buffer.from(data.content, "base64").toString("utf-8");
}

/** Minimal YAML parser for .ecosystem.yml (key: value and lists only) */
function parseEcosystemYml(text) {
  const result = {};
  const lines = text.split("\n");
  let currentKey = null;
  let currentList = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;

    // List item
    if (line.match(/^\s+-\s+/) && currentList !== null) {
      const val = line.replace(/^\s+-\s+/, "").replace(/^['"]|['"]$/g, "").trim();
      result[currentKey].push(val);
      continue;
    }

    currentList = null;

    // key: value or key: [inline, list]
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)?$/);
    if (!m) continue;

    const key = m[1];
    const val = (m[2] || "").trim();
    currentKey = key;

    if (val.startsWith("[")) {
      // Inline array
      const inner = val.replace(/^\[|\]$/g, "");
      result[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else if (val === "" || val === null) {
      result[key] = [];
      currentList = key;
    } else {
      result[key] = val.replace(/^['"]|['"]$/g, "");
    }
  }

  return result;
}

async function getAtlasAssetUrl(repo) {
  const release = await ghGet(`/repos/${ORG}/${repo}/releases/tags/${ATLAS_RELEASE_TAG}`);
  if (!release) return null;

  const asset = (release.assets || []).find((a) => a.name === ATLAS_ASSET_NAME);
  return asset ? asset.browser_download_url : null;
}

async function validateAtlasUrl(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok || res.status === 302;
  } catch {
    return false;
  }
}

async function listOrgRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const data = await ghGet(`/orgs/${ORG}/repos?per_page=100&page=${page}&type=all`);
    if (!data || data.length === 0) break;
    repos.push(...data.map((r) => r.name));
    if (data.length < 100) break;
    page++;
  }
  return repos;
}

// --- Main ---

console.error(`[discover] Scanning ${ORG} for .ecosystem.yml...`);

const existing = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
const existingMap = new Map(existing.map((e) => [e.repo, e]));

const repos = await listOrgRepos();
console.error(`[discover] Found ${repos.length} repos`);

const updated = [];
let added = 0, unchanged = 0, failed = 0;

for (const repo of repos) {
  const fullName = `${ORG}/${repo}`;
  try {
    const content = await getFileContent(repo, ".ecosystem.yml");
    if (!content) continue;

    const cfg = parseEcosystemYml(content);
    if (!cfg.ecosystem || cfg.language === undefined) continue;

    const atlasUrl = await getAtlasAssetUrl(repo);
    const valid    = await validateAtlasUrl(atlasUrl);

    if (!valid && atlasUrl) {
      console.error(`[discover] Warning: atlas URL unreachable for ${fullName}: ${atlasUrl}`);
    }

    const entry = {
      repo: fullName,
      package: cfg.package || repo,
      language: cfg.language || "R",
      atlas_asset_url: atlasUrl || "",
      role: cfg.role || null,
      tags: Array.isArray(cfg.tags) ? cfg.tags : [],
      entrypoints: Array.isArray(cfg.entrypoints) ? cfg.entrypoints : [],
      last_updated: new Date().toISOString(),
    };

    updated.push(entry);

    if (existingMap.has(fullName)) {
      unchanged++;
    } else {
      added++;
      console.error(`[discover] + ${fullName} (${entry.package})`);
    }
  } catch (err) {
    console.error(`[discover] Error processing ${fullName}: ${err.message}`);
    // Keep existing entry if present
    if (existingMap.has(fullName)) {
      updated.push(existingMap.get(fullName));
    }
    failed++;
  }
}

// Preserve entries for repos no longer found (may be private/renamed)
for (const [fullName, entry] of existingMap) {
  if (!updated.find((e) => e.repo === fullName)) {
    console.error(`[discover] Keeping existing entry for missing repo: ${fullName}`);
    updated.push(entry);
  }
}

updated.sort((a, b) => a.repo.localeCompare(b.repo));
fs.writeFileSync(REGISTRY_PATH, JSON.stringify(updated, null, 2) + "\n", "utf-8");

console.error(
  `[discover] Done: ${updated.length} total entries (+${added} new, ${unchanged} unchanged, ${failed} errors)`
);
