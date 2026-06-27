import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_LOG_FILE = resolve(__dirname, "logs", "app.jsonl");
const SENSITIVE_KEY_PATTERN = /(api[-_]?key|authorization|bearer|token|secret|password|credential|cookie)/i;
const MAX_STRING_LENGTH = 600;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 5;

let sequence = 0;

export function createLogger(options = {}) {
  const logFile = options.logFile || process.env.LOG_FILE || DEFAULT_LOG_FILE;
  const consoleEnabled = options.consoleEnabled ?? process.env.LOG_CONSOLE !== "0";
  const fileEnabled = options.fileEnabled ?? process.env.LOG_FILE_ENABLED !== "0";

  return {
    file: logFile,
    debug(event, data = {}) {
      write("debug", event, data, { logFile, consoleEnabled, fileEnabled });
    },
    info(event, data = {}) {
      write("info", event, data, { logFile, consoleEnabled, fileEnabled });
    },
    warn(event, data = {}) {
      write("warn", event, data, { logFile, consoleEnabled, fileEnabled });
    },
    error(event, data = {}) {
      write("error", event, data, { logFile, consoleEnabled, fileEnabled });
    }
  };
}

export function createRequestId() {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  const random = Math.random().toString(36).slice(2, 8);
  return `req_${Date.now().toString(36)}_${sequence.toString(36)}_${random}`;
}

export function summarizeRequest(req) {
  return {
    method: req.method,
    path: req.url?.split("?")[0] || "",
    query: req.url?.includes("?") ? "present" : "none",
    ip: req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
    referer: req.headers.referer || req.headers.referrer || ""
  };
}

export function summarizeAction(action = {}) {
  return {
    type: action.type || "",
    label: truncate(action.label || "", 80),
    customTextLength: action.customText ? String(action.customText).length : 0,
    customTextPreview: truncate(action.customText || "", 80),
    locationId: action.locationId || "",
    npcId: action.npcId || ""
  };
}

export function summarizeGameState(state = {}) {
  return {
    day: state.day,
    slot: state.slot,
    locationId: state.currentLocationId,
    heroMood: state.hero?.mood,
    skillCount: state.hero?.skills?.length || 0,
    skillLevelTotal: (state.hero?.skills || []).reduce((total, skill) => total + (skill.level || 0), 0),
    diaryCount: state.diary?.length || 0,
    worldFactCount: state.worldFacts?.length || 0,
    confirmedWorldFactCount: (state.worldFacts || []).filter((fact) => fact.status === "confirmed").length,
    memoryCount: state.memories?.length || 0,
    memoryTopicCount: state.memoryTopics?.length || 0,
    staleMemoryTopicCount: (state.memoryTopics || []).filter((topic) => topic.maintenanceStatus === "stale").length,
    watchMemoryTopicCount: (state.memoryTopics || []).filter((topic) => topic.maintenanceStatus === "watch").length,
    reflectionCount: state.reflections?.length || 0,
    npcReflectionCount: Object.values(state.npcs || {}).reduce(
      (count, npc) => count + (npc.reflections?.length || 0),
      0
    ),
    npcBondEventCount: Object.values(state.npcs || {}).reduce(
      (count, npc) => count + (npc.bondEvents?.length || 0),
      0
    ),
    continuityTraceCount: state.continuityTraces?.length || 0,
    latestContinuityScore: state.continuityTraces?.at(-1)?.score || 0,
    chapterCount: state.chapters?.length || 0,
    activeChapterTitle: (state.chapters || []).find((chapter) => chapter.status === "active")?.title || "",
    commitmentCount: state.commitments?.length || 0,
    openCommitmentCount: (state.commitments || []).filter((commitment) => commitment.status === "open").length,
    planCount: state.plans?.length || 0,
    goalCount: state.hero?.goals?.length || 0
  };
}

export function summarizeProvider(baseUrl, model) {
  return {
    model: model || "",
    baseHost: safeHost(baseUrl)
  };
}

export function sanitizeForLog(value, depth = 0) {
  if (value == null) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message, 300),
      stack: truncate(value.stack || "", 900)
    };
  }

  if (typeof value === "string") return truncate(value, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeForLog(item, depth + 1));
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = sanitizeForLog(child, depth + 1);
    }
  }
  return output;
}

function write(level, event, data, options) {
  const entry = sanitizeForLog({
    ts: new Date().toISOString(),
    level,
    event,
    ...data
  });
  const line = `${JSON.stringify(entry)}\n`;

  if (options.consoleEnabled) {
    const stream = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    stream(line.trim());
  }

  if (options.fileEnabled) {
    appendLine(options.logFile, line);
  }
}

async function appendLine(logFile, line) {
  try {
    await mkdir(dirname(logFile), { recursive: true });
    await appendFile(logFile, line, "utf8");
  } catch (error) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "log.write_failed",
      error: { name: error.name, message: error.message }
    }));
  }
}

function truncate(value, max) {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function safeHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}
