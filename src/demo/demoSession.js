import { reactive } from "vue";
import {
  DEMO_SCHEMA_VERSION,
  DEMO_SESSION_ID,
  buildCharactersArtifact,
  buildSceneImagesArtifact,
  buildScenesArtifact,
  buildStoryArtifact,
  buildStoryReqArtifact,
  buildVideoClipsArtifact,
  cloneDemoValue,
  createBaseSession,
} from "./demoData";

const SESSION_STORAGE_KEY = "visiontale_demo_session_v1";
const SESSION_ID_KEY = "visiontale_session_id";

function isObjectLike(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeAssetUrl(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (!value.includes("/demo/dental-fear/")) {
    return value;
  }
  if (!value.endsWith(".svg")) {
    return value;
  }
  return value.slice(0, -4) + ".png";
}

function deepNormalizeAssetUrls(input) {
  if (Array.isArray(input)) {
    return input.map((item) => deepNormalizeAssetUrls(item));
  }

  if (isObjectLike(input)) {
    const out = {};
    Object.keys(input).forEach((key) => {
      out[key] = deepNormalizeAssetUrls(input[key]);
    });
    return out;
  }

  return normalizeAssetUrl(input);
}

function now() {
  return Date.now();
}

function storage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    };
  }

  return window.localStorage;
}

function ensureSessionId() {
  storage().setItem(SESSION_ID_KEY, DEMO_SESSION_ID);
  return DEMO_SESSION_ID;
}

function loadStoredSession() {
  ensureSessionId();
  const raw = storage().getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return {
      ...createBaseSession(),
      schemaVersion: DEMO_SCHEMA_VERSION,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const version = Number(parsed?.schemaVersion || 1);
    const migrated = deepNormalizeAssetUrls(parsed);
    if (version !== DEMO_SCHEMA_VERSION) {
      return {
        ...createBaseSession(),
        schemaVersion: DEMO_SCHEMA_VERSION,
      };
    }
    return {
      ...createBaseSession(),
      ...migrated,
      sessionId: DEMO_SESSION_ID,
      schemaVersion: DEMO_SCHEMA_VERSION,
      artifacts: migrated?.artifacts || {},
    };
  } catch {
    return {
      ...createBaseSession(),
      schemaVersion: DEMO_SCHEMA_VERSION,
    };
  }
}

function replaceReactive(target, source) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function snapshotSession() {
  return cloneDemoValue(demoSession);
}

function persistSession() {
  ensureSessionId();
  storage().setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshotSession()));
}

function writeArtifact(namespace, value) {
  demoSession.artifacts ||= {};
  demoSession.artifacts[namespace] = value;
}

function removeArtifact(namespace) {
  if (demoSession.artifacts && namespace in demoSession.artifacts) {
    delete demoSession.artifacts[namespace];
  }
}

function setStage(stage) {
  demoSession.stage = stage;
}

function clearArtifacts(namespaces) {
  namespaces.forEach(removeArtifact);
}

function createTask(type) {
  return {
    taskId: `${type.toLowerCase()}-${now()}`,
    type,
    status: "PENDING",
    progress: 0,
    stage: "PENDING",
    createdAt: now(),
    updatedAt: now(),
  };
}

function emitTask(task, onUpdate) {
  task.updatedAt = now();
  if (onUpdate) {
    onUpdate({ ...task });
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function runTask(type, steps, finalize, onUpdate) {
  ensureSessionId();
  const task = createTask(type);
  emitTask(task, onUpdate);
  await delay(180);
  task.status = "RUNNING";
  emitTask(task, onUpdate);

  for (const step of steps) {
    task.stage = step.stage;
    task.progress = step.progress;
    emitTask(task, onUpdate);
    await delay(step.delay ?? 640);
    if (step.action) {
      step.action();
      persistSession();
    }
  }

  if (finalize) {
    finalize();
    persistSession();
  }

  task.stage = "DONE";
  task.progress = 100;
  task.status = "DONE";
  emitTask(task, onUpdate);
  return { ...task };
}

export const demoSession = reactive(loadStoredSession());

export function getSession() {
  ensureSessionId();
  return demoSession;
}

export function resetSession() {
  ensureSessionId();
  replaceReactive(demoSession, {
    ...createBaseSession(),
    schemaVersion: DEMO_SCHEMA_VERSION,
  });
  persistSession();
  return demoSession;
}

export function saveStoryMoral(nextMoral) {
  const current = demoSession.artifacts?.story || buildStoryArtifact();
  writeArtifact("story", {
    ...current,
    moral: String(nextMoral || "").trim(),
  });
  persistSession();
}

export async function runDialogDemo(onUpdate) {
  clearArtifacts(["storyReq", "characters", "story", "scenes", "sceneImages", "videoClips"]);
  setStage("DIALOG_PREPARING");
  persistSession();

  return runTask(
    "DIALOG_DEMO",
    [
      { stage: "LISTENING", progress: 18, delay: 480 },
      { stage: "UNDERSTANDING", progress: 52, delay: 760 },
      {
        stage: "STRUCTURING",
        progress: 86,
        delay: 620,
        action: () => {
          writeArtifact("storyReq", buildStoryReqArtifact(now()));
          setStage("STORY_REQ_DONE");
        },
      },
    ],
    null,
    onUpdate
  );
}

export async function runCharacterDemo(onUpdate) {
  clearArtifacts(["characters", "sceneImages", "videoClips"]);
  setStage("CHARACTERS_PREPARING");
  persistSession();

  return runTask(
    "CHARACTER_DEMO",
    [
      { stage: "PLAN_CHARACTERS", progress: 14, delay: 520 },
      { stage: "RENDER_CHILD", progress: 34, delay: 520 },
      { stage: "RENDER_FAMILY", progress: 58, delay: 580 },
      {
        stage: "RENDER_HELPERS",
        progress: 84,
        delay: 700,
        action: () => {
          writeArtifact("characters", buildCharactersArtifact(now()));
          setStage("CHARACTERS_READY");
        },
      },
    ],
    null,
    onUpdate
  );
}

export async function runStoryDemo(onUpdate) {
  clearArtifacts(["story", "scenes", "sceneImages", "videoClips"]);
  setStage("STORY_PREPARING");
  persistSession();

  return runTask(
    "STORY_DEMO",
    [
      { stage: "LOAD_STORY_TEMPLATE", progress: 20, delay: 480 },
      {
        stage: "WRITE_STORY",
        progress: 72,
        delay: 900,
        action: () => {
          writeArtifact("story", buildStoryArtifact());
          setStage("STORY_READY");
        },
      },
    ],
    null,
    onUpdate
  );
}

export async function runSplitDemo(onUpdate) {
  clearArtifacts(["scenes", "sceneImages", "videoClips"]);
  setStage("SPLIT_PREPARING");
  persistSession();

  return runTask(
    "SPLIT_DEMO",
    [
      { stage: "LOAD_SCENE_TEMPLATE", progress: 24, delay: 540 },
      {
        stage: "BIND_CHARACTERS",
        progress: 76,
        delay: 880,
        action: () => {
          writeArtifact("scenes", buildScenesArtifact());
          setStage("SPLIT_READY");
        },
      },
    ],
    null,
    onUpdate
  );
}

export async function runImageDemo(onUpdate) {
  clearArtifacts(["sceneImages", "videoClips"]);
  setStage("IMAGES_PREPARING");
  persistSession();

  const prepared = buildSceneImagesArtifact(now());
  const progressiveItems = [];

  const steps = prepared.items.map((item, index) => ({
    stage: `RENDER_SCENE_${item.order}`,
    progress: Math.round(((index + 1) / prepared.items.length) * 90),
    delay: 560,
    action: () => {
      progressiveItems.push(item);
      writeArtifact("sceneImages", {
        ...prepared,
        items: progressiveItems.slice(),
        updatedAt: now(),
      });
      setStage(`IMAGES_SCENE_${item.order}_READY`);
    },
  }));

  return runTask("IMAGE_DEMO", steps, null, onUpdate);
}

export async function runVideoDemo(onUpdate) {
  clearArtifacts(["videoClips"]);
  setStage("VIDEO_PREPARING");
  persistSession();

  return runTask(
    "VIDEO_DEMO",
    [
      { stage: "PLAN_VIDEO", progress: 18, delay: 420 },
      { stage: "ASSEMBLE_CLIPS", progress: 58, delay: 900 },
      {
        stage: "EXPORT_VIDEO",
        progress: 88,
        delay: 720,
        action: () => {
          writeArtifact("videoClips", buildVideoClipsArtifact(now()));
          setStage("VIDEO_READY");
        },
      },
    ],
    null,
    onUpdate
  );
}
