import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInitialState } from "../src/game/data.js";
import {
  addCommitmentFromChoice,
  applyOutcome,
  createAction,
  createLocalOutcome,
  serializeGame
} from "../src/game/engine.js";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = Number(process.env.CHROME_DEBUG_PORT || 9200 + Math.floor(Math.random() * 500));
const appUrl = process.env.APP_URL || "http://127.0.0.1:4177/";
const sectionId = process.env.SCREENSHOT_SECTION_ID || "npcs";
const requiredTexts = (process.env.SCREENSHOT_REQUIRED_TEXT || "林鸢透露了真正的牵挂|确认星港旧星图里被删掉的一段记录|追问牵挂|羁绊任务")
  .split("|")
  .map((text) => text.trim())
  .filter(Boolean);
const screenshotPath = resolve(
  process.env.SCREENSHOT_PATH || "screenshots/npc-hidden-goal-mobile-cdp.png"
);
const followQuestSteps = Number(process.env.SCREENSHOT_FOLLOW_QUEST_STEPS || 0);
const pressureQuest = process.env.SCREENSHOT_PRESSURE_QUEST === "1";
const repairQuest = process.env.SCREENSHOT_REPAIR_QUEST === "1";
const createCommitment = process.env.SCREENSHOT_CREATE_COMMITMENT === "1";
const screenshotLogin = process.env.STARHARBOR_SCREENSHOT_LOGIN || process.env.STARHARBOR_VERIFY_LOGIN || "";
const screenshotPassword = process.env.STARHARBOR_SCREENSHOT_PASSWORD || process.env.STARHARBOR_VERIFY_PASSWORD || "";
const profileDir = join(tmpdir(), `starharbor-shot-${Date.now()}`);

const state = createInitialState();
const action = createAction({
  presetId: "social",
  customText: "",
  locationId: "greenhouse",
  npcId: "lin"
});
let next = applyOutcome(state, action, createLocalOutcome(state, action));
for (let index = 0; index < followQuestSteps; index += 1) {
  const quest = [...(next.npcs.lin.questLines || [])].reverse().find((item) => item.status !== "completed");
  if (!quest) break;
  const followAction = createAction({
    presetId: quest.actionType,
    customText: quest.currentStep,
    locationId: quest.locationId,
    npcId: quest.npcId
  });
  next = applyOutcome(next, followAction, createLocalOutcome(next, followAction));
}
if (pressureQuest) {
  const quest = (next.npcs.lin.questLines || []).find((item) => item.actionType === "study") || next.npcs.lin.questLines?.[0];
  if (quest) {
    next.day = quest.dueDay || next.day;
    next.npcs.lin.questLines = [{
      ...quest,
      pressure: 78,
      dueDay: next.day
    }];
    const restAction = createAction({
      presetId: "rest",
      customText: "",
      locationId: "dorm",
      npcId: ""
    });
    next = applyOutcome(next, restAction, createLocalOutcome(next, restAction));
    if (repairQuest) {
      const pressureEvent = next.npcs.lin.bondEvents.at(-1);
      const repair = pressureEvent?.followUp;
      if (repair) {
        const repairAction = createAction({
          presetId: repair.actionType,
          customText: repair.intent,
          locationId: repair.locationId,
          npcId: repair.npcId
        });
        next = applyOutcome(next, repairAction, createLocalOutcome(next, repairAction));
      }
    }
  }
}
if (createCommitment) {
  next = addCommitmentFromChoice(next, {
    label: "继续确认",
    intent: "继续和林鸢确认旧星图记录里被删掉的线索"
  }, {
    sourceTitle: "旧灯下的发现：林鸢",
    actionType: "study",
    locationId: "observatory",
    npcId: "lin"
  });
}
const save = serializeGame(next);

await mkdir(resolve("screenshots"), { recursive: true });
await mkdir(profileDir, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--window-size=390,844",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  appUrl
], { stdio: "ignore" });

try {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
  const pageTarget = targets.find((target) => target.type === "page") || targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error("No page target from Chrome");
  }

  const client = await createCdpClient(pageTarget.webSocketDebuggerUrl);
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    await client.send("Page.navigate", { url: appUrl });
    await client.waitForLoad();
    let screenshotUserId = "anonymous";
    if (screenshotLogin && screenshotPassword) {
      const loginResult = await client.send("Runtime.evaluate", {
        expression: `(async () => {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: ${JSON.stringify(JSON.stringify({ login: screenshotLogin, password: screenshotPassword }))}
          });
          const payload = await response.json().catch(() => ({}));
          return { ok: response.ok, status: response.status, user: payload.user || null };
        })()`,
        returnByValue: true,
        awaitPromise: true
      });
      if (!loginResult.result.value?.ok) {
        throw new Error(`Screenshot login failed: HTTP ${loginResult.result.value?.status}`);
      }
      screenshotUserId = loginResult.result.value?.user?.id || screenshotUserId;
    }
    await client.send("Runtime.evaluate", {
      expression: `localStorage.setItem(${JSON.stringify(`starharbor-diary-save-v1:${screenshotUserId}`)}, ${JSON.stringify(save)}); true;`,
      awaitPromise: true
    });
    await client.send("Page.reload", { ignoreCache: true });
    await client.waitForLoad();

    const metricsResult = await client.send("Runtime.evaluate", {
      expression: `(async () => {
        const sectionId = ${JSON.stringify(sectionId)};
        const requiredTexts = ${JSON.stringify(requiredTexts)};
        const section = document.querySelector('#' + sectionId);
        if (section) {
          location.hash = sectionId;
          const top = section.getBoundingClientRect().top + window.pageYOffset - 76;
          window.scrollTo(0, top);
          document.documentElement.scrollTop = top;
          document.body.scrollTop = top;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        const text = section?.innerText || '';
        return {
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scrollY: window.scrollY,
          docScrollTop: document.documentElement.scrollTop,
          sectionTop: section?.getBoundingClientRect().top ?? null,
          sectionDocumentTop: section ? section.getBoundingClientRect().top + window.pageYOffset : null,
          hasRequiredText: requiredTexts.every((requiredText) => text.includes(requiredText)),
          requiredTexts,
          sample: text.slice(0, 500)
        };
      })()`,
      returnByValue: true,
      awaitPromise: true
    });

    await delay(250);
    await client.send("Runtime.evaluate", {
      expression: `document.querySelectorAll('.bottom-nav').forEach((element) => { element.style.display = 'none'; }); true;`,
      awaitPromise: true
    });
    const metrics = metricsResult.result.value;
    const captureY = Math.max(0, Math.round((metrics.sectionDocumentTop || 0) - 12));
    const capture = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true,
      clip: {
        x: 0,
        y: captureY,
        width: 390,
        height: 844,
        scale: 1
      }
    });
    await writeFile(screenshotPath, Buffer.from(capture.data, "base64"));

    if (!metrics.hasRequiredText || metrics.scrollWidth > metrics.width) {
      throw new Error(`Screenshot verification failed: ${JSON.stringify(metrics)}`);
    }

    console.log(JSON.stringify({ screenshotPath, metrics }, null, 2));
  } finally {
    client.close();
  }
} finally {
  chrome.kill();
  await delay(300);
  const resolvedProfile = resolve(profileDir);
  if (resolvedProfile.startsWith(resolve(tmpdir()))) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function fetchJson(url, attempts = 50) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw lastError;
}

function createCdpClient(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  const events = [];
  let id = 0;

  ws.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolveCommand, rejectCommand } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) {
        rejectCommand(new Error(data.error.message || JSON.stringify(data.error)));
      } else {
        resolveCommand(data.result || {});
      }
      return;
    }
    if (data.method) {
      events.push(data);
    }
  });

  return new Promise((resolveClient, rejectClient) => {
    ws.addEventListener("open", () => {
      resolveClient({
        close() {
          ws.close();
        },
        send(method, params = {}) {
          const commandId = ++id;
          ws.send(JSON.stringify({ id: commandId, method, params }));
          return new Promise((resolveCommand, rejectCommand) => {
            const timeout = setTimeout(() => {
              pending.delete(commandId);
              rejectCommand(new Error(`Timeout waiting for ${method}`));
            }, 20_000);
            pending.set(commandId, {
              resolveCommand(result) {
                clearTimeout(timeout);
                resolveCommand(result);
              },
              rejectCommand(error) {
                clearTimeout(timeout);
                rejectCommand(error);
              }
            });
          });
        },
        async waitForLoad() {
          const startedAt = Date.now();
          while (Date.now() - startedAt < 12_000) {
            if (events.some((event) => event.method === "Page.loadEventFired")) {
              events.length = 0;
              await delay(300);
              return;
            }
            await delay(100);
          }
        }
      });
    }, { once: true });
    ws.addEventListener("error", rejectClient, { once: true });
  });
}
