const API_BASE = import.meta.env.VITE_API_BASE || "";
const API_TOKEN = import.meta.env.VITE_API_TOKEN || "";

const SESSION_KEY = "visiontale_session_id";
const LEGACY_DEMO_SESSION_KEY = "visiontale_demo_session_v1";

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function joinUrl(base, path) {
  if (!base) return path;
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = "/" + path.replace(/^\/+/, "");
  // 防止把 VITE_API_BASE 设成 ".../api" 时出现 "/api/api/..."
  if (cleanBase.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return cleanBase + cleanPath.slice(4);
  }
  return cleanBase + cleanPath;
}

function createSessionId() {
  return crypto.randomUUID();
}

export function ensureSessionId() {
  const current = String(window.localStorage.getItem(SESSION_KEY) || "").trim();
  if (current && !current.startsWith("visiontale-demo-")) {
    return current;
  }
  const next = createSessionId();
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

export function getSessionId() {
  return ensureSessionId();
}

export function resetSessionId() {
  const next = createSessionId();
  window.localStorage.setItem(SESSION_KEY, next);
  window.localStorage.removeItem(LEGACY_DEMO_SESSION_KEY);
  return next;
}

async function requestJson(path, { method = "GET", body, signal } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(API_TOKEN ? { "X-API-Token": API_TOKEN } : {}),
  };

  const response = await fetch(joinUrl(API_BASE, path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await response.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || data?.message || text || `HTTP_${response.status}`;
    const err = new Error(String(message));
    err.status = response.status;
    err.payload = data;
    throw err;
  }

  return data || {};
}

export function isNotFoundError(err) {
  return Number(err?.status) === 404;
}

export async function fetchSession(sessionId = getSessionId(), signal) {
  return requestJson(`/api/session/${encodeURIComponent(sessionId)}`, { method: "GET", signal });
}

export async function saveArtifact(namespace, artifact, sessionId = getSessionId(), signal) {
  return requestJson(
    `/api/session/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(namespace)}`,
    {
      method: "POST",
      body: artifact || {},
      signal,
    }
  );
}

export async function startTask(path, payload = {}, sessionId = getSessionId(), signal) {
  return requestJson(path, {
    method: "POST",
    body: {
      sessionId,
      ...payload,
    },
    signal,
  });
}

export async function pollTask(
  taskId,
  {
    onUpdate,
    timeoutMs = 3 * 60 * 1000,
    intervalMs = 1200,
    signal,
  } = {}
) {
  const startedAt = Date.now();
  const doneStatuses = new Set(["DONE", "SUCCEEDED", "DONE_WITH_ERRORS", "PARTIAL_SUCCESS", "PARTIAL_DONE"]);

  while (true) {
    if (signal?.aborted) {
      throw new Error("poll_aborted");
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("task_timeout");
    }

    const task = await requestJson(`/api/task/${encodeURIComponent(taskId)}`, { method: "GET", signal });
    if (onUpdate) onUpdate(task);

    const status = String(task?.status || "").toUpperCase();
    if (status === "FAILED") {
      throw new Error(String(task?.error || "task_failed"));
    }
    if (doneStatuses.has(status)) {
      return task;
    }
    await sleep(intervalMs);
  }
}

export async function runTaskFlow({
  startPath,
  payload = {},
  sessionId = getSessionId(),
  onUpdate,
  timeoutMs,
  intervalMs,
  signal,
}) {
  const started = await startTask(startPath, payload, sessionId, signal);
  const taskId = String(started?.taskId || "").trim();
  if (!taskId) throw new Error("missing_task_id");

  const task = await pollTask(taskId, {
    onUpdate,
    timeoutMs,
    intervalMs,
    signal,
  });
  const session = await fetchSession(sessionId, signal);
  return { taskId, task, session, sessionId };
}
