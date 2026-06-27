import { createServer } from "node:http";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative as pathRelative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSessionToken,
  findAccount,
  loadAccounts,
  loginFingerprint,
  parseCookies,
  publicAccount,
  verifyPassword
} from "./auth.js";
import {
  createLogger,
  createRequestId,
  summarizeAction,
  summarizeGameState,
  summarizeProvider,
  summarizeRequest
} from "./logger.js";
import { buildActionOpportunities, buildExperienceDiagnostics, createLocalOutcome, importGame, normalizeOutcome, selectRelevantContext, serializeGame } from "./src/game/engine.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(__dirname, "dist");
const publicDir = resolve(__dirname, "public");
const port = Number(process.env.PORT || 4177);
const llmTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 28000);
const accountFile = process.env.STARHARBOR_ACCOUNTS_FILE ||
  (process.platform === "win32" ? resolve(__dirname, "config/accounts.local.json") : "/etc/starharbor/accounts.json");
const saveDir = process.env.STARHARBOR_SAVE_DIR ||
  (process.platform === "win32" ? resolve(__dirname, "data/saves") : "/var/lib/starharbor/saves");
const sessionCookieName = "starharbor_session";
const sessionTtlMs = Number(process.env.STARHARBOR_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const sessions = new Map();
const logger = createLogger();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    logger.info("http.request", {
      requestId,
      ...summarizeRequest(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/login") {
      await handleLogin(req, res, { requestId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      await handleLogout(req, res, { requestId });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      await handleSession(req, res, { requestId });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/save") {
      await handleGetSave(req, res, { requestId });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/save") {
      await handlePutSave(req, res, { requestId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/director") {
      await handleDirector(req, res, { requestId, startedAt });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/log") {
      await handleClientLog(req, res, { requestId });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    logger.error("http.unhandled_error", {
      requestId,
      ...summarizeRequest(req),
      error
    });
    sendJson(res, 500, { error: "Unexpected server error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`Starharbor Diary running at http://localhost:${port}`);
  logger.info("server.started", {
    port,
    logFile: logger.file,
    accountFile,
    saveDir,
    llm: summarizeProvider(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", process.env.OPENAI_MODEL || "")
  });
});

async function handleLogin(req, res, context) {
  const body = await readJsonBody(req);
  const login = String(body.login || "").trim();
  const password = String(body.password || "");

  if (!login || !password) {
    sendJson(res, 400, { error: "Missing login or password" });
    return;
  }

  const accounts = await loadConfiguredAccounts();
  if (!accounts.length) {
    logger.warn("auth.unavailable", {
      requestId: context.requestId,
      accountFile
    });
    sendJson(res, 503, { error: "Login is not configured" });
    return;
  }

  const account = findAccount(accounts, login);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    logger.warn("auth.login_failed", {
      requestId: context.requestId,
      loginFingerprint: loginFingerprint(login)
    });
    sendJson(res, 401, { error: "Invalid login or password" });
    return;
  }

  const token = createSessionToken();
  const session = {
    token,
    account: publicAccount(account),
    expiresAt: Date.now() + sessionTtlMs
  };
  sessions.set(token, session);
  setSessionCookie(res, token);
  logger.info("auth.login", {
    requestId: context.requestId,
    accountId: session.account.id
  });
  sendJson(res, 200, { authenticated: true, user: session.account });
}

async function handleLogout(req, res, context) {
  const token = parseCookies(req.headers.cookie || "")[sessionCookieName];
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  logger.info("auth.logout", {
    requestId: context.requestId,
    hadSession: Boolean(token)
  });
  sendJson(res, 200, { ok: true });
}

async function handleSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 200, { authenticated: false, user: null });
    return;
  }
  sendJson(res, 200, { authenticated: true, user: session.account });
}

async function handleGetSave(req, res, context) {
  const session = requireSession(req, res, context);
  if (!session) return;

  const filePath = savePathForAccount(session.account.id);
  try {
    const save = await readFile(filePath, "utf8");
    sendJson(res, 200, { found: true, save });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 200, { found: false, save: "" });
      return;
    }
    throw error;
  }
}

async function handlePutSave(req, res, context) {
  const session = requireSession(req, res, context);
  if (!session) return;

  const body = await readJsonBody(req);
  const rawSave = typeof body.save === "string" ? body.save : JSON.stringify(body.state || {});
  let normalizedSave;
  try {
    normalizedSave = serializeGame(importGame(rawSave));
  } catch (error) {
    logger.warn("save.invalid_payload", {
      requestId: context.requestId,
      accountId: session.account.id,
      error
    });
    sendJson(res, 400, { error: "Invalid save payload" });
    return;
  }
  const filePath = savePathForAccount(session.account.id);
  await mkdir(saveDir, { recursive: true });
  await writeFile(filePath, normalizedSave, "utf8");
  logger.info("save.persisted", {
    requestId: context.requestId,
    accountId: session.account.id,
    bytes: normalizedSave.length
  });
  sendJson(res, 200, { ok: true });
}

async function handleDirector(req, res, context) {
  const session = requireSession(req, res, context);
  if (!session) return;

  const body = await readJsonBody(req);
  const { state, action } = body;

  if (!state || !action) {
    logger.warn("director.invalid_request", {
      requestId: context.requestId,
      hasState: Boolean(state),
      hasAction: Boolean(action)
    });
    sendJson(res, 400, { error: "Missing state or action" });
    return;
  }

  const localOutcome = () => normalizeOutcome(createLocalOutcome(state, action), state);
  const actionSummary = summarizeAction(action);
  const stateSummary = summarizeGameState(state);

  logger.info("director.request", {
    requestId: context.requestId,
    accountId: session.account.id,
    action: actionSummary,
    state: stateSummary
  });

  if (!process.env.OPENAI_API_KEY) {
    const outcome = localOutcome();
    logger.info("director.local", {
      requestId: context.requestId,
      reason: "api_key_missing",
      provider: "local",
      durationMs: Date.now() - context.startedAt,
      outcome: summarizeOutcome(outcome)
    });
    sendJson(res, 200, { provider: "local", outcome });
    return;
  }

  try {
    const outcome = await callCompatibleLLM(state, action, {
      requestId: context.requestId,
      action: actionSummary,
      state: stateSummary
    });
    const normalized = normalizeOutcome(outcome, state);
    logger.info("director.remote_complete", {
      requestId: context.requestId,
      provider: process.env.OPENAI_MODEL || "openai",
      durationMs: Date.now() - context.startedAt,
      outcome: summarizeOutcome(normalized)
    });
    sendJson(res, 200, { provider: process.env.OPENAI_MODEL || "openai", outcome: normalized });
  } catch (error) {
    const outcome = localOutcome();
    logger.warn("director.fallback", {
      requestId: context.requestId,
      provider: "local",
      reason: "remote_call_failed",
      durationMs: Date.now() - context.startedAt,
      error,
      outcome: summarizeOutcome(outcome)
    });
    sendJson(res, 200, {
      provider: "local",
      warning: `OpenAI call failed: ${error.message}`,
      outcome
    });
  }
}

async function handleClientLog(req, res, context) {
  const body = await readJsonBody(req);
  const level = ["debug", "info", "warn", "error"].includes(body.level) ? body.level : "info";
  const event = body.event || "client.event";
  const details = body.details || {};
  const session = getSessionFromRequest(req);

  logger[level]("client.event", {
    requestId: context.requestId,
    accountId: session?.account?.id || "",
    clientEvent: event,
    clientSessionId: body.sessionId || "",
    page: body.page || "",
    details
  });

  sendJson(res, 200, { ok: true });
}

async function loadConfiguredAccounts() {
  try {
    return await loadAccounts(accountFile);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function requireSession(req, res, context = {}) {
  const session = getSessionFromRequest(req);
  if (session) return session;
  logger.warn("auth.required", {
    requestId: context.requestId,
    path: req.url || ""
  });
  sendJson(res, 401, { error: "Authentication required" });
  return null;
}

function getSessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie || "")[sessionCookieName];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function setSessionCookie(res, token) {
  const maxAgeSeconds = Math.max(60, Math.floor(sessionTtlMs / 1000));
  res.setHeader("Set-Cookie", [
    `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
  ]);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", [
    `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  ]);
}

function savePathForAccount(accountId) {
  const fileName = `${String(accountId || "account").replace(/[^a-z0-9._-]+/gi, "-")}.json`;
  const filePath = resolve(saveDir, fileName);
  const relativePath = pathRelative(saveDir, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Invalid account save path");
  }
  return filePath;
}

async function callCompatibleLLM(state, action, context = {}) {
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const payload = {
    model,
    messages: buildDirectorMessages(state, action),
    temperature: 0.75,
    response_format: { type: "json_object" }
  };
  const startedAt = Date.now();

  logger.info("llm.call.start", {
    requestId: context.requestId,
    provider: summarizeProvider(baseUrl, model),
    action: context.action || summarizeAction(action),
    state: context.state || summarizeGameState(state),
    promptChars: JSON.stringify(payload.messages).length,
    responseFormat: "json_object"
  });

  try {
    let response = await fetchChatCompletion(baseUrl, payload, llmTimeoutMs);
    let bodyText = await response.text();

    if (!response.ok && shouldRetryWithoutResponseFormat(response.status, bodyText)) {
      logger.warn("llm.call.retry_without_response_format", {
        requestId: context.requestId,
        provider: summarizeProvider(baseUrl, model),
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        responsePreview: bodyText.slice(0, 240)
      });
      const retryPayload = { ...payload };
      delete retryPayload.response_format;
      response = await fetchChatCompletion(baseUrl, retryPayload, llmTimeoutMs);
      bodyText = await response.text();
    }

    const responseBody = parseJsonResponse(bodyText);
    if (!response.ok) {
      throw new Error(
        responseBody.error?.message ||
          responseBody.message ||
          `OpenAI-compatible HTTP ${response.status}`
      );
    }

    const content =
      responseBody.choices?.[0]?.message?.content ||
      responseBody.output_text ||
      collectOutputText(responseBody);

    if (!content) {
      throw new Error("No assistant content returned");
    }

    const parsed = parseDirectorJson(content);
    logger.info("llm.call.success", {
      requestId: context.requestId,
      provider: summarizeProvider(baseUrl, model),
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      outputChars: content.length,
      outcome: summarizeOutcome(parsed)
    });
    return parsed;
  } catch (error) {
    logger.error("llm.call.failure", {
      requestId: context.requestId,
      provider: summarizeProvider(baseUrl, model),
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  }
}

async function fetchChatCompletion(baseUrl, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildDirectorMessages(state, action) {
  return [
    {
      role: "system",
      content: [
        "You are the director layer for the Chinese open-ended raising game Starharbor Diary.",
        "Return only one JSON object. Do not wrap it in markdown.",
        "All player-facing strings must be Simplified Chinese.",
        "Do not overwrite the save file. Return only the result of the current action.",
        "Keep stat changes modest. Each numeric delta should usually be between -8 and 8.",
        "Use this exact JSON shape:",
        JSON.stringify(minimalOutcomeShape()),
        "Valid mood values: calm, bright, tense, strange, warm.",
        "Valid stat keys: focus, creativity, fitness, empathy, courage, discipline, stress, energy.",
        "relationshipDeltas must only use npc ids that exist in the supplied state.",
        "Use plans and relevantContext as the character's current intent and retrieved memory.",
        "chapters are long-horizon narrative cells with premise, objective, currentBeat, nextHook, constraint, progress, and pressure. Keep the current action inside the active chapter unless the state clearly justifies a transition.",
        "relevantContext items may include matchReasons and matchedTerms. Treat them as retrieval evidence for why the item was selected, not as new plot facts.",
        "opportunities are prioritized action affordances derived from commitments, quests, stale memories, skills, world facts, and chapter pressure. Use them to keep long-horizon play from becoming a greedy one-step reaction.",
        "experienceDiagnostics is a derived health check for continuity, action diversity, open loops, memory freshness, growth, and world knowledge. Use warnings as pacing guidance, not as new story facts.",
        "skills are reusable abilities learned through repeated actions. Use matching skills to make consequences feel earned, and mention level/progress only when it naturally matters.",
        "worldFacts are structured discoveries the player has learned about locations, NPCs, or world rules. Treat confirmed facts as established world knowledge and observed facts as evidence that may still need follow-up.",
        "commitments are player-selected follow-up promises. If the current action matches an open commitment, treat it as a meaningful fulfillment; if commitments are near due or missed, reflect the social or personal cost.",
        "Memory tags, actionType, location, and npc facets are retrieval cues. Use them to continue the most relevant past events instead of treating memories as a flat list.",
        "memoryTopics are consolidated topic documents built from related memories. Use them as compact evidence groups, then rely on individual memories for concrete details.",
        "memoryTopics include freshness and maintenanceStatus. If a topic is watch or stale, treat it as evidence that needs confirmation instead of a current fact. If it is revised, prefer the newest evidence inside that topic.",
        "Memory relatedMemoryIds/relatedMemoryLabels are lightweight graph edges; use linked memories as supporting context when extending a thread.",
        "NPC relationshipStage, stance, and npcReflections describe social continuity; preserve them in tone and consequences.",
        "NPC hiddenGoal is private motivation. Do not reveal it in narration unless hiddenGoalRevealed is true or a bond event justifies the reveal.",
        "NPC bondEvents are relationship milestones; use them as anchors for future social consequences.",
        "NPC bondEvents.followUp is a player-actionable relationship hook with intent, actionType, locationId, and npcId. When the current action matches it, continue that thread concretely.",
        "NPC questLines are relationship quest chains with progress, pressure, dueDay, currentStep, risk, reward, warning, and optional completion. If the current action matches an active questLine, make the consequence advance that relationship arc. If pressure or status strained is high, acknowledge the social cost of delay. If a questLine is completed, treat its completion as established relationship history.",
        "recentContinuityTraces show which prior actions actually used context, wrote memory, advanced goals, or changed relationships. Prefer consequences that continue those traces.",
        "Use recentReflections as high-level inner memory. Let it influence tone, choices, and consequences without repeating it verbatim."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({ state: summarizeStateForModel(state, action), action })
    }
  ];
}

function minimalOutcomeShape() {
  return {
    title: "string",
    narration: "string",
    mood: "calm",
    statDeltas: {
      focus: 0,
      creativity: 0,
      fitness: 0,
      empathy: 0,
      courage: 0,
      discipline: 0,
      stress: 0,
      energy: 0
    },
    relationshipDeltas: [{ npcId: "string", affinity: 0, trust: 0 }],
    memories: [{ owner: "hero", text: "string", weight: 2 }],
    newGoal: null,
    choices: [
      { label: "string", intent: "string" },
      { label: "string", intent: "string" }
    ]
  };
}

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function shouldRetryWithoutResponseFormat(status, bodyText) {
  return [400, 404, 422].includes(status) &&
    /response_format|json_object|unsupported|not support/i.test(bodyText);
}

function parseJsonResponse(bodyText) {
  try {
    return JSON.parse(bodyText);
  } catch {
    return { message: bodyText.slice(0, 300) };
  }
}

function parseDirectorJson(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Assistant content was not valid JSON");
  }
}

function summarizeOutcome(outcome = {}) {
  return {
    title: outcome.title || "",
    mood: outcome.mood || "",
    statDeltaKeys: outcome.statDeltas ? Object.keys(outcome.statDeltas).filter((key) => outcome.statDeltas[key]) : [],
    relationshipDeltaCount: outcome.relationshipDeltas?.length || 0,
    memoryCount: outcome.memories?.length || 0,
    hasNewGoal: Boolean(outcome.newGoal),
    choiceCount: outcome.choices?.length || 0
  };
}

function summarizeStateForModel(state, action) {
  return {
    day: state.day,
    slot: state.slot,
    slotName: state.timeSlots?.[state.slot],
    hero: state.hero,
    selectedLocation: state.currentLocationId,
    npcs: state.npcs,
    chapters: state.chapters?.slice(-4),
    plans: state.plans?.filter((plan) => plan.day === state.day).slice(0, 3),
    opportunities: buildActionOpportunities(state).slice(0, 6),
    experienceDiagnostics: buildExperienceDiagnostics(state),
    skills: state.hero?.skills?.slice(0, 8),
    worldFacts: state.worldFacts?.slice(-8),
    recentDiary: state.diary?.slice(-6),
    memoryTopics: state.memoryTopics?.slice(-8),
    recentMemories: state.memories?.slice(-8),
    recentReflections: state.reflections?.slice(-4),
    recentContinuityTraces: state.continuityTraces?.slice(-5),
    commitments: state.commitments?.slice(-8),
    relevantContext: action ? selectRelevantContext(state, action) : null,
    flags: state.flags
  };
}

function collectOutputText(payload) {
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}

async function serveStatic(pathname, res, headOnly) {
  const rootDir = await directoryExists(distDir) ? distDir : publicDir;
  const requested =
    pathname === "/"
      ? "index.html"
      : decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  let filePath = resolve(rootDir, requested);
  let relativePath = pathRelative(rootDir, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = mimeTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store"
    });
    if (!headOnly) {
      res.end(data);
    } else {
      res.end();
    }
  } catch {
    if (!extname(requested)) {
      filePath = resolve(rootDir, "index.html");
      relativePath = pathRelative(rootDir, filePath);
      if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
        try {
          const data = await readFile(filePath);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
          });
          res.end(headOnly ? undefined : data);
          return;
        } catch {
          // Fall through to 404.
        }
      }
    }
    sendText(res, 404, "Not found");
  }
}

async function directoryExists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on("error", rejectBody);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}
