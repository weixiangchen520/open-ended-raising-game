import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeForLog,
  summarizeAction,
  summarizeGameState,
  summarizeProvider
} from "../logger.js";
import { createInitialState } from "../src/game/data.js";

test("sanitizeForLog redacts sensitive fields recursively", () => {
  const sanitized = sanitizeForLog({
    apiKey: "sk-real",
    nested: {
      authorization: "Bearer secret",
      safe: "value"
    },
    token: "abc"
  });

  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.nested.authorization, "[REDACTED]");
  assert.equal(sanitized.nested.safe, "value");
  assert.equal(sanitized.token, "[REDACTED]");
});

test("log summaries avoid full game state and full custom text", () => {
  const state = createInitialState();
  const action = summarizeAction({
    type: "social",
    label: "主动交流",
    customText: "a".repeat(200),
    locationId: "greenhouse",
    npcId: "lin"
  });
  const stateSummary = summarizeGameState(state);

  assert.equal(action.customTextLength, 200);
  assert.ok(action.customTextPreview.length < 100);
  assert.equal(action.npcId, "lin");
  assert.equal(stateSummary.skillCount, 3);
  assert.equal(stateSummary.skillLevelTotal, 3);
  assert.equal(stateSummary.diaryCount, 1);
  assert.equal(stateSummary.worldFactCount, 1);
  assert.equal(stateSummary.confirmedWorldFactCount, 0);
  assert.equal(stateSummary.memoryCount, 1);
  assert.equal(stateSummary.memoryTopicCount, 1);
  assert.equal(stateSummary.staleMemoryTopicCount, 0);
  assert.equal(stateSummary.watchMemoryTopicCount, 0);
  assert.equal(stateSummary.reflectionCount, 1);
  assert.equal(stateSummary.npcReflectionCount, 0);
  assert.equal(stateSummary.npcBondEventCount, 0);
  assert.equal(stateSummary.continuityTraceCount, 0);
  assert.equal(stateSummary.latestContinuityScore, 0);
  assert.equal(stateSummary.chapterCount, 1);
  assert.equal(stateSummary.activeChapterTitle, "初到星港");
  assert.equal(stateSummary.planCount, 3);
  assert.equal(stateSummary.hero?.stats, undefined);
});

test("provider summary keeps host and model only", () => {
  const summary = summarizeProvider("https://coding.dashscope.aliyuncs.com/v1", "qwen3.7-plus");

  assert.equal(summary.baseHost, "coding.dashscope.aliyuncs.com");
  assert.equal(summary.model, "qwen3.7-plus");
});
