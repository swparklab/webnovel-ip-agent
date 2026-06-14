"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { config } = require("./config");

/**
 * File-based project store. One JSON file per project under data/projects/.
 * Good enough for a single-tenant commercial MVP; swap for a real DB later
 * without changing the route layer.
 */

const projectsDir = path.join(config.dataDir, "projects");

function ensureDir() {
  fs.mkdirSync(projectsDir, { recursive: true });
}

function projectPath(id) {
  // Guard against path traversal — ids are hex tokens only.
  if (!/^[a-f0-9]{8,40}$/i.test(id)) return null;
  return path.join(projectsDir, `${id}.json`);
}

function newId() {
  return crypto.randomBytes(10).toString("hex");
}

function listProjects() {
  ensureDir();
  const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith(".json"));
  const items = files
    .map((file) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(projectsDir, file), "utf8"));
        return {
          id: data.id,
          title: data.title || "무제 SF",
          genre: data.input?.genre || "aiForesight",
          score: data.score ?? null,
          updatedAt: data.updatedAt,
          createdAt: data.createdAt,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items;
}

function getProject(id) {
  const file = projectPath(id);
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveProject(payload) {
  ensureDir();
  const now = new Date().toISOString();
  const id = payload.id && projectPath(payload.id) ? payload.id : newId();
  const existing = getProject(id);
  const record = {
    id,
    title: (payload.title || payload.input?.ipTitle || "무제 SF").slice(0, 200),
    input: payload.input || existing?.input || {},
    report: payload.report ?? existing?.report ?? null,
    score: payload.score ?? existing?.score ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  fs.writeFileSync(projectPath(id), JSON.stringify(record, null, 2), "utf8");
  return record;
}

function deleteProject(id) {
  const file = projectPath(id);
  if (!file || !fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

module.exports = { listProjects, getProject, saveProject, deleteProject };
