#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const targetUrl = new URL(process.env.STARHARBOR_URL || process.argv[2] || "http://127.0.0.1:4177");
const appRoot = resolve(process.env.STARHARBOR_APP_ROOT || process.cwd());
const timeoutMs = Number(process.env.STARHARBOR_VERIFY_TIMEOUT_MS || 45000);
const allowLocal = process.argv.includes("--allow-local");
const verifyLogin = process.env.STARHARBOR_VERIFY_LOGIN || "";
const verifyPassword = process.env.STARHARBOR_VERIFY_PASSWORD || "";

const { createInitialState } = await import(pathToFileURL(resolve(appRoot, "src/game/data.js")).href);
const { createAction } = await import(pathToFileURL(resolve(appRoot, "src/game/engine.js")).href);

const state = createInitialState();
const action = createAction({
  presetId: "social",
  customText: "deployment smoke test",
  locationId: "greenhouse",
  npcId: "lin"
});

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const cookie = await loginForCookie();
  const response = await fetch(new URL("/api/director", targetUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify({ state, action }),
    signal: controller.signal
  });
  const payload = await response.json();
  const result = {
    ok: response.ok && (allowLocal || (payload.provider !== "local" && !payload.warning)),
    status: response.status,
    provider: payload.provider,
    fallback: payload.provider === "local" || Boolean(payload.warning),
    warning: payload.warning ? String(payload.warning).slice(0, 160) : "",
    title: payload.outcome?.title || "",
    mood: payload.outcome?.mood || "",
    statKeys: Object.keys(payload.outcome?.statDeltas || {})
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = response.ok ? 2 : 1;
  }
} finally {
  clearTimeout(timeout);
}

async function loginForCookie() {
  if (!verifyLogin || !verifyPassword) return "";
  const response = await fetch(new URL("/api/login", targetUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      login: verifyLogin,
      password: verifyPassword
    }),
    signal: controller.signal
  });
  if (!response.ok) {
    throw new Error(`Login failed before director verification: HTTP ${response.status}`);
  }
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}
