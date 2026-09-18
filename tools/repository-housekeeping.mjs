import process from "node:process";

const API_VERSION = "2022-11-28";
const RETENTION_HOURS = 24;
const PAGE_SIZE = 100;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Falta configurar " + name + ".");
  return value;
}

const repository = requiredEnvironment("GITHUB_REPOSITORY");
const token = requiredEnvironment("GITHUB_TOKEN");
const apiBase = (process.env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/$/, "");
const defaultBranch =
  process.env.DEUNA_HOUSEKEEPING_DEFAULT_BRANCH?.trim() || "master";
const eventName = process.env.GITHUB_EVENT_NAME?.trim() || "";
const ref = process.env.GITHUB_REF?.trim() || "";

if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error(
    "Repository housekeeping sólo puede ejecutarse dentro de GitHub Actions."
  );
}
if (!["push", "schedule", "workflow_dispatch"].includes(eventName)) {
  throw new Error(
    "Evento no autorizado para housekeeping: " +
      (eventName || "desconocido") +
      "."
  );
}
if (ref && ref !== "refs/heads/" + defaultBranch) {
  throw new Error(
    "Housekeeping bloqueado fuera de " + defaultBranch + ": " + ref + "."
  );
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: "Bearer " + token,
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": "deuna-games-repository-housekeeping",
};

async function request(path, options = {}) {
  const method = options.method ?? "GET";
  const response = await fetch(apiBase + path, {
    method,
    headers,
  });

  const allowed = options.allowed ?? [200];
  if (!allowed.includes(response.status)) {
    const body = await response.text();
    throw new Error(
      method +
        " " +
        path +
        " devolvió " +
        response.status +
        ": " +
        body.slice(0, 500)
    );
  }

  if (response.status === 204 || response.status === 404) {
    return { status: response.status, body: null };
  }

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function pagedArray(path) {
  const items = [];

  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const { body } = await request(
      path + separator + "per_page=" + PAGE_SIZE + "&page=" + page
    );

    if (!Array.isArray(body)) {
      throw new Error("Respuesta paginada inválida para " + path + ".");
    }

    items.push(...body);
    if (body.length < PAGE_SIZE) break;
  }

  return items;
}

async function allArtifacts() {
  const artifacts = [];

  for (let page = 1; ; page += 1) {
    const { body } = await request(
      "/repos/" +
        repository +
        "/actions/artifacts?per_page=" +
        PAGE_SIZE +
        "&page=" +
        page
    );
    const batch = body?.artifacts;

    if (!Array.isArray(batch)) {
      throw new Error("Respuesta inválida al enumerar artifacts de Actions.");
    }

    artifacts.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return artifacts;
}

function encodedRef(branch) {
  return branch
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function deleteMergedBranches() {
  const [branches, openPulls, closedPulls] = await Promise.all([
    pagedArray("/repos/" + repository + "/branches"),
    pagedArray("/repos/" + repository + "/pulls?state=open"),
    pagedArray("/repos/" + repository + "/pulls?state=closed"),
  ]);

  const openHeads = new Set(
    openPulls
      .filter((pull) => pull?.head?.repo?.full_name === repository)
      .map((pull) => pull.head.ref)
      .filter(Boolean)
  );
  const existing = new Map(
    branches.map((branch) => [branch.name, branch])
  );
  const mergedHeads = new Set(
    closedPulls
      .filter(
        (pull) =>
          pull?.merged_at &&
          pull?.head?.repo?.full_name === repository &&
          typeof pull.head.ref === "string"
      )
      .map((pull) => pull.head.ref)
  );

  const candidates = [...mergedHeads]
    .filter((branch) => branch !== defaultBranch)
    .filter((branch) => !openHeads.has(branch))
    .filter((branch) => existing.has(branch))
    .filter((branch) => existing.get(branch)?.protected !== true)
    .sort();

  let deleted = 0;
  let alreadyGone = 0;

  for (const branch of candidates) {
    const result = await request(
      "/repos/" +
        repository +
        "/git/refs/heads/" +
        encodedRef(branch),
      { method: "DELETE", allowed: [204, 404] }
    );

    if (result.status === 204) {
      deleted += 1;
      console.log("Rama mergeada eliminada: " + branch);
    } else {
      alreadyGone += 1;
    }
  }

  return {
    candidates: candidates.length,
    deleted,
    alreadyGone,
  };
}

async function deleteOldArtifacts() {
  const cutoff = Date.now() - RETENTION_HOURS * 60 * 60 * 1000;
  const artifacts = await allArtifacts();
  const candidates = artifacts
    .filter((artifact) => artifact?.expired !== true)
    .filter((artifact) => {
      const createdAt = Date.parse(artifact?.created_at ?? "");
      return Number.isFinite(createdAt) && createdAt < cutoff;
    })
    .sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at))
    );

  let deleted = 0;
  let alreadyGone = 0;
  let bytes = 0;

  for (const artifact of candidates) {
    const result = await request(
      "/repos/" + repository + "/actions/artifacts/" + artifact.id,
      { method: "DELETE", allowed: [204, 404] }
    );

    if (result.status === 204) {
      deleted += 1;
      bytes += Number(artifact.size_in_bytes) || 0;
      console.log(
        "Artifact eliminado: " +
          artifact.name +
          " (" +
          (artifact.size_in_bytes ?? 0) +
          " bytes)"
      );
    } else {
      alreadyGone += 1;
    }
  }

  return {
    candidates: candidates.length,
    deleted,
    alreadyGone,
    bytes,
  };
}

const branchResult = await deleteMergedBranches();
const artifactResult = await deleteOldArtifacts();

console.log(
  "Repository housekeeping: OK " +
    "(ramas candidatas=" +
    branchResult.candidates +
    ", eliminadas=" +
    branchResult.deleted +
    ", ya ausentes=" +
    branchResult.alreadyGone +
    "; artifacts candidatos=" +
    artifactResult.candidates +
    ", eliminados=" +
    artifactResult.deleted +
    ", ya ausentes=" +
    artifactResult.alreadyGone +
    ", bytes liberados=" +
    artifactResult.bytes +
    ")."
);
