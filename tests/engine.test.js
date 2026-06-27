import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/game/data.js";
import {
  addCommitmentFromChoice,
  buildActionOpportunities,
  buildExperienceDiagnostics,
  applyOutcome,
  buildDailyPlans,
  createAction,
  createLocalOutcome,
  inferActionId,
  importGame,
  selectRelevantContext,
  serializeGame
} from "../src/game/engine.js";

test("local outcome has the required game fields", () => {
  const state = createInitialState();
  const action = createAction({
    presetId: "study",
    customText: "",
    locationId: "observatory",
    npcId: "lin"
  });
  const outcome = createLocalOutcome(state, action);

  assert.equal(typeof outcome.title, "string");
  assert.equal(typeof outcome.narration, "string");
  assert.ok(outcome.statDeltas.focus > 0);
  assert.equal(outcome.relationshipDeltas[0].npcId, "lin");
  assert.ok(outcome.choices.length >= 2);
});

test("applying an outcome advances time and clamps stats", () => {
  const state = createInitialState();
  const action = createAction({
    presetId: "rest",
    customText: "",
    locationId: "dorm",
    npcId: ""
  });
  const outcome = {
    title: "测试",
    narration: "测试叙事",
    mood: "warm",
    statDeltas: {
      focus: 100,
      creativity: 0,
      fitness: 0,
      empathy: 0,
      courage: 0,
      discipline: 0,
      stress: -100,
      energy: 100
    },
    relationshipDeltas: [],
    memories: [{ owner: "hero", text: "测试记忆", weight: 2 }],
    newGoal: null,
    choices: [
      { label: "继续", intent: "继续" },
      { label: "停止", intent: "停止" }
    ]
  };

  const next = applyOutcome(state, action, outcome);

  assert.equal(next.slot, 1);
  assert.equal(next.hero.stats.focus, 58);
  assert.equal(next.hero.stats.stress, 10);
  assert.equal(next.hero.stats.energy, 84);
  assert.equal(next.memories.at(-1).text, "测试记忆");
  assert.equal(next.memories.at(-1).actionType, "rest");
  assert.equal(next.memories.at(-1).locationName, "宿舍");
  assert.ok(next.memories.at(-1).tags.includes("休息"));
  assert.ok(next.memories.at(-1).tags.includes("宿舍"));
  assert.ok(Array.isArray(next.memories.at(-1).relatedMemoryIds));
  assert.ok(next.worldFacts.some((fact) => fact.locationId === "dorm"));
  assert.ok(next.hero.skills.some((skill) => skill.actionType === "rest"));
  assert.ok(next.memoryTopics.some((topic) => topic.memoryIds.includes(next.memories.at(-1).id)));
  const topicForNewMemory = next.memoryTopics.find((topic) => topic.memoryIds.includes(next.memories.at(-1).id));
  assert.ok(topicForNewMemory.freshness > 0);
  assert.equal(topicForNewMemory.maintenanceStatus, "active");
  assert.equal(next.continuityTraces.length, 1);
  assert.equal(next.continuityTraces[0].signals.memoryWrites, 1);
  assert.equal(next.continuityTraces[0].signals.skillsUpdated, 1);
  assert.equal(next.continuityTraces[0].signals.worldFactsUpdated, 1);
  assert.ok(next.continuityTraces[0].signals.retrievedMemoryTopics >= 1);
  assert.ok(next.continuityTraces[0].signals.retrievedPlans >= 1);
});

test("night action moves to the next day and adds daily summary", () => {
  const state = createInitialState();
  state.slot = 2;
  const action = createAction({
    presetId: "social",
    customText: "",
    locationId: "greenhouse",
    npcId: "lin"
  });
  const next = applyOutcome(state, action, createLocalOutcome(state, action));

  assert.equal(next.day, 2);
  assert.equal(next.slot, 0);
  assert.equal(next.flags.completedDays, 1);
  assert.match(next.diary.at(-1).title, /收束/);
  assert.equal(next.reflections.at(-1).day, 1);
  assert.match(next.reflections.at(-1).title, /内在回声/);
  assert.ok(next.chapters.find((chapter) => chapter.status === "active"));
  assert.ok(next.chapters[0].progress > state.chapters[0].progress);
  assert.ok(next.chapters[0].evidence.length >= 1);
  assert.equal(next.plans.length, 3);
  assert.ok(next.plans.every((plan) => plan.day === 2));
  assert.ok(next.plans.some((plan) => plan.source === "chapter"));
  assert.equal(next.continuityTraces.at(-1).signals.retrievedChapters, 1);
  assert.ok(next.continuityTraces.at(-1).anchors.chapters.length >= 1);

  const activeChapter = next.chapters.find((chapter) => chapter.status === "active");
  const context = selectRelevantContext(next, createAction({
    presetId: activeChapter.actionType,
    customText: activeChapter.nextHook,
    locationId: activeChapter.locationId,
    npcId: activeChapter.npcId || ""
  }));
  assert.equal(context.chapters[0].id, activeChapter.id);
});

test("npc social model records relationship stage and reflection", () => {
  const state = createInitialState();
  const action = createAction({
    presetId: "social",
    customText: "",
    locationId: "greenhouse",
    npcId: "lin"
  });
  const next = applyOutcome(state, action, createLocalOutcome(state, action));
  const lin = next.npcs.lin;
  const context = selectRelevantContext(next, action);
  const linMemory = next.memories.find((memory) => memory.owner === "npc:lin");

  assert.equal(lin.relationshipStage, "熟悉");
  assert.equal(lin.stance, "观望");
  assert.equal(lin.hiddenGoalRevealed, true);
  assert.equal(lin.bondEvents.length, 2);
  assert.ok(lin.bondEvents.some((event) => event.type === "stage"));
  assert.ok(lin.bondEvents.some((event) => event.type === "hidden-goal"));
  const stageEvent = lin.bondEvents.find((event) => event.type === "stage");
  const hiddenGoalEvent = lin.bondEvents.find((event) => event.type === "hidden-goal");
  assert.equal(stageEvent.followUp.actionType, "social");
  assert.equal(stageEvent.followUp.locationId, "greenhouse");
  assert.equal(stageEvent.followUp.npcId, "lin");
  assert.equal(hiddenGoalEvent.followUp.label, "追问牵挂");
  assert.equal(hiddenGoalEvent.followUp.actionType, "study");
  assert.equal(hiddenGoalEvent.followUp.locationId, "observatory");
  assert.equal(hiddenGoalEvent.followUp.npcId, "lin");
  assert.match(hiddenGoalEvent.followUp.intent, /旧星图/);
  assert.equal(lin.questLines.length, 2);
  const hiddenGoalQuest = lin.questLines.find((quest) => quest.sourceEventId === hiddenGoalEvent.id);
  assert.equal(hiddenGoalQuest.title, "林鸢的牵挂：确认星港旧星图里被删掉的一段记录");
  assert.equal(hiddenGoalQuest.actionType, "study");
  assert.equal(hiddenGoalQuest.locationId, "observatory");
  assert.equal(hiddenGoalQuest.progress, 0);
  assert.equal(lin.reflections.length, 1);
  assert.match(lin.reflections[0].text, /林鸢/);
  assert.equal(lin.reflections[0].hiddenGoalRevealed, true);
  assert.equal(context.npcReflections[0].id, lin.reflections[0].id);
  assert.equal(context.npcBondEvents.length, 2);
  assert.equal(context.npcBondEvents[0].type, "hidden-goal");
  assert.equal(context.npcQuestLines[0].id, hiddenGoalQuest.id);
  assert.equal(linMemory.locationId, "greenhouse");
  assert.equal(linMemory.npcId, "lin");
  assert.ok(linMemory.tags.includes("社交"));
  assert.ok(linMemory.tags.includes("温室"));
  assert.ok(linMemory.tags.includes("林鸢"));
  assert.ok(linMemory.relatedMemoryIds.length >= 1);
  assert.ok(linMemory.relatedMemoryLabels.some((label) => label.includes("星野")));
  assert.ok(context.memories.some((memory) => memory.tags?.includes("社交")));
  assert.ok(context.memories.some((memory) => memory.relatedMemoryIds?.length));
  assert.equal(next.continuityTraces.length, 1);
  assert.equal(next.continuityTraces[0].signals.relationshipDeltaCount, 1);
  assert.ok(next.continuityTraces[0].signals.memoryLinksCreated >= 1);
  assert.equal(next.continuityTraces[0].signals.npcReflectionCreated, 1);
  assert.equal(next.continuityTraces[0].signals.npcBondEventsCreated, 2);
  assert.equal(next.continuityTraces[0].signals.npcQuestLinesProgressed, 0);
  assert.match(next.continuityTraces[0].summary, /羁绊事件/);
  assert.match(next.continuityTraces[0].summary, /旧记忆/);
});

test("npc quest lines progress when the player follows a bond hook", () => {
  const state = createInitialState();
  const socialAction = createAction({
    presetId: "social",
    customText: "",
    locationId: "greenhouse",
    npcId: "lin"
  });
  const withQuest = applyOutcome(state, socialAction, createLocalOutcome(state, socialAction));
  const quest = withQuest.npcs.lin.questLines.find((item) => item.actionType === "study");
  const followUpAction = createAction({
    presetId: quest.actionType,
    customText: quest.currentStep,
    locationId: quest.locationId,
    npcId: quest.npcId
  });
  const next = applyOutcome(withQuest, followUpAction, createLocalOutcome(withQuest, followUpAction));
  const progressedQuest = next.npcs.lin.questLines.find((item) => item.id === quest.id);
  const context = selectRelevantContext(withQuest, followUpAction);

  assert.ok(progressedQuest.progress > 0);
  assert.equal(progressedQuest.status, "active");
  assert.ok(progressedQuest.steps.some((step) => step.done));
  assert.equal(context.npcQuestLines[0].id, quest.id);
  assert.equal(next.continuityTraces.at(-1).signals.retrievedNpcQuestLines, 2);
  assert.equal(next.continuityTraces.at(-1).signals.npcQuestLinesProgressed, 1);
  assert.match(next.continuityTraces.at(-1).summary, /羁绊任务/);
});

test("npc quest completion creates a visible settlement event", () => {
  const state = createInitialState();
  const socialAction = createAction({
    presetId: "social",
    customText: "",
    locationId: "greenhouse",
    npcId: "lin"
  });
  let current = applyOutcome(state, socialAction, createLocalOutcome(state, socialAction));
  const questId = current.npcs.lin.questLines.find((item) => item.actionType === "study").id;

  for (let index = 0; index < 4; index += 1) {
    const quest = current.npcs.lin.questLines.find((item) => item.id === questId);
    if (quest.status === "completed") break;
    const action = createAction({
      presetId: quest.actionType,
      customText: quest.currentStep,
      locationId: quest.locationId,
      npcId: quest.npcId
    });
    current = applyOutcome(current, action, createLocalOutcome(current, action));
  }

  const completedQuest = current.npcs.lin.questLines.find((item) => item.id === questId);
  const completionEvent = current.npcs.lin.bondEvents.find((event) => event.type === "quest-complete");

  assert.equal(completedQuest.status, "completed");
  assert.equal(completedQuest.progress, 100);
  assert.ok(completedQuest.completion.text.includes("关系线"));
  assert.equal(completionEvent.followUp.label, "沉淀羁绊");
  assert.match(completionEvent.text, /新的信任/);
  assert.equal(current.continuityTraces.at(-1).signals.npcQuestLinesCompleted, 1);
  assert.match(current.continuityTraces.at(-1).summary, /完成 1 条羁绊任务/);
});

test("overdue npc quest lines accumulate pressure and repair hooks", () => {
  const state = createInitialState();
  const socialAction = createAction({
    presetId: "social",
    customText: "",
    locationId: "greenhouse",
    npcId: "lin"
  });
  const withQuest = applyOutcome(state, socialAction, createLocalOutcome(state, socialAction));
  const quest = withQuest.npcs.lin.questLines.find((item) => item.actionType === "study");
  withQuest.day = quest.dueDay;
  withQuest.npcs.lin.questLines = [
    {
      ...quest,
      pressure: 78,
      dueDay: withQuest.day
    }
  ];
  const previousTrust = withQuest.npcs.lin.trust;
  const restAction = createAction({
    presetId: "rest",
    customText: "",
    locationId: "dorm",
    npcId: ""
  });
  const next = applyOutcome(withQuest, restAction, createLocalOutcome(withQuest, restAction));
  const pressuredQuest = next.npcs.lin.questLines[0];
  const pressureEvent = next.npcs.lin.bondEvents.at(-1);

  assert.equal(pressuredQuest.status, "strained");
  assert.ok(pressuredQuest.pressure >= 80);
  assert.match(pressuredQuest.warning, /怀疑/);
  assert.equal(next.npcs.lin.trust, previousTrust - 1);
  assert.equal(pressureEvent.type, "quest-strained");
  assert.equal(pressureEvent.followUp.label, "修复羁绊");
  assert.equal(next.continuityTraces.at(-1).signals.npcQuestLinesPressured, 1);
  assert.equal(next.continuityTraces.at(-1).signals.npcQuestLinesStrained, 1);
  assert.match(next.continuityTraces.at(-1).summary, /羁绊压力/);

  const repairAction = createAction({
    presetId: pressureEvent.followUp.actionType,
    customText: pressureEvent.followUp.intent,
    locationId: pressureEvent.followUp.locationId,
    npcId: pressureEvent.followUp.npcId
  });
  const repaired = applyOutcome(next, repairAction, createLocalOutcome(next, repairAction));
  const repairedQuest = repaired.npcs.lin.questLines[0];

  assert.equal(repairedQuest.status, "active");
  assert.ok(repairedQuest.pressure < pressuredQuest.pressure);
  assert.equal(repairedQuest.warning, "");
  assert.ok(repairedQuest.dueDay >= repaired.day + 3);
  assert.equal(repaired.continuityTraces.at(-1).signals.npcQuestLinesProgressed, 1);
  assert.equal(repaired.continuityTraces.at(-1).signals.npcQuestLinesPressured, 0);
});

test("outcome choices can become commitments and be fulfilled by matching actions", () => {
  const state = createInitialState();
  const withCommitment = addCommitmentFromChoice(state, {
    label: "继续确认",
    intent: "继续和林鸢确认旧星图记录里被删掉的线索"
  }, {
    sourceTitle: "旧灯下的发现：林鸢",
    actionType: "study",
    locationId: "observatory",
    npcId: "lin"
  });
  const commitment = withCommitment.commitments[0];
  const context = selectRelevantContext(withCommitment, createAction({
    presetId: commitment.actionType,
    customText: commitment.intent,
    locationId: commitment.locationId,
    npcId: commitment.npcId
  }));

  assert.equal(commitment.status, "open");
  assert.equal(commitment.npcId, "lin");
  assert.equal(context.commitments[0].id, commitment.id);

  const previousTrust = withCommitment.npcs.lin.trust;
  const previousMemoryCount = withCommitment.memories.length;
  const action = createAction({
    presetId: commitment.actionType,
    customText: commitment.intent,
    locationId: commitment.locationId,
    npcId: commitment.npcId
  });
  const fulfilled = applyOutcome(withCommitment, action, createLocalOutcome(withCommitment, action));

  assert.equal(fulfilled.commitments[0].status, "fulfilled");
  assert.equal(fulfilled.commitments[0].progress, 100);
  assert.ok(fulfilled.npcs.lin.trust > previousTrust);
  assert.ok(fulfilled.memories.length > previousMemoryCount);
  assert.ok(fulfilled.memories.at(-1).tags.includes("承诺"));
  assert.match(fulfilled.memories.at(-1).text, /兑现/);
  assert.equal(fulfilled.continuityTraces.at(-1).signals.retrievedCommitments, 1);
  assert.equal(fulfilled.continuityTraces.at(-1).signals.commitmentsFulfilled, 1);
  assert.ok(fulfilled.continuityTraces.at(-1).signals.memoryWrites >= 3);
});

test("missed commitments weaken npc trust and leave memory", () => {
  const state = createInitialState();
  const withCommitment = addCommitmentFromChoice(state, {
    label: "继续确认",
    intent: "继续和林鸢确认旧星图记录里被删掉的线索"
  }, {
    sourceTitle: "旧灯下的发现：林鸢",
    actionType: "study",
    locationId: "observatory",
    npcId: "lin"
  });
  const commitment = withCommitment.commitments[0];
  const previousTrust = withCommitment.npcs.lin.trust;
  withCommitment.day = commitment.dueDay + 1;

  const action = createAction({
    presetId: "rest",
    customText: "整理宿舍，先把今天的体力恢复过来",
    locationId: "dorm",
    npcId: ""
  });
  const missed = applyOutcome(withCommitment, action, createLocalOutcome(withCommitment, action));

  assert.equal(missed.commitments[0].status, "missed");
  assert.ok(missed.npcs.lin.trust < previousTrust);
  assert.ok(missed.memories.at(-1).tags.includes("承诺"));
  assert.match(missed.memories.at(-1).text, /错过/);
  assert.equal(missed.continuityTraces.at(-1).signals.commitmentsMissed, 1);
  assert.ok(missed.continuityTraces.at(-1).signals.memoryWrites >= 2);
});

test("save serialization can be imported", () => {
  const state = createInitialState();
  const imported = importGame(serializeGame(state));

  assert.equal(imported.version, 1);
  assert.equal(imported.hero.name, "星野");
  assert.ok(Array.isArray(imported.hero.skills));
  assert.ok(imported.hero.skills.length >= 1);
  assert.equal(typeof imported.hero.skills[0].level, "number");
  assert.ok(Array.isArray(imported.memories[0].tags));
  assert.ok(Array.isArray(imported.memories[0].relatedMemoryIds));
  assert.ok(Array.isArray(imported.worldFacts));
  assert.ok(imported.worldFacts.length >= 1);
  assert.equal(typeof imported.worldFacts[0].confidence, "number");
  assert.ok(Array.isArray(imported.memoryTopics));
  assert.ok(imported.memoryTopics.length >= 1);
  assert.ok(imported.memoryTopics[0].freshness > 0);
  assert.equal(typeof imported.memoryTopics[0].maintenanceStatus, "string");
  assert.ok(Array.isArray(imported.reflections));
  assert.ok(Array.isArray(imported.plans));
  assert.ok(Array.isArray(imported.chapters));
  assert.ok(imported.chapters.some((chapter) => chapter.status === "active"));
  assert.ok(Array.isArray(imported.commitments));
  assert.throws(() => importGame("{}"), /存档格式/);
});

test("old saves without reflections or plans are migrated", () => {
  const state = createInitialState();
  delete state.reflections;
  delete state.plans;
  delete state.chapters;
  delete state.continuityTraces;
  delete state.commitments;
  delete state.hero.skills;
  delete state.memories[0].tags;
  delete state.memories[0].relatedMemoryIds;
  delete state.memories[0].relatedMemoryLabels;
  delete state.memories[0].actionType;
  delete state.memories[0].locationName;
  delete state.worldFacts;
  delete state.memoryTopics;
  delete state.npcs.lin.reflections;
  delete state.npcs.lin.bondEvents;
  delete state.npcs.lin.questLines;
  delete state.npcs.lin.hiddenGoal;
  delete state.npcs.lin.concern;
  delete state.npcs.lin.hiddenGoalRevealed;
  delete state.npcs.lin.relationshipStage;
  delete state.npcs.lin.stance;
  const imported = importGame(serializeGame(state));

  assert.deepEqual(imported.reflections, []);
  assert.ok(imported.memories[0].tags.includes("目标"));
  assert.ok(imported.memories[0].tags.includes("主角"));
  assert.deepEqual(imported.memories[0].relatedMemoryIds, []);
  assert.ok(imported.worldFacts.length >= 1);
  assert.equal(imported.worldFacts[0].status, "observed");
  assert.ok(imported.memoryTopics.length >= 1);
  assert.ok(imported.memoryTopics[0].freshness > 0);
  assert.equal(typeof imported.memoryTopics[0].maintenanceReason, "string");
  assert.equal(imported.plans.length, 3);
  assert.equal(imported.chapters.length, 1);
  assert.equal(imported.chapters[0].status, "active");
  assert.deepEqual(imported.continuityTraces, []);
  assert.deepEqual(imported.commitments, []);
  assert.ok(imported.hero.skills.length >= 3);
  assert.equal(imported.hero.skills[0].status, "练习中");
  assert.deepEqual(imported.npcs.lin.reflections, []);
  assert.deepEqual(imported.npcs.lin.bondEvents, []);
  assert.deepEqual(imported.npcs.lin.questLines, []);
  assert.equal(imported.npcs.lin.hiddenGoal, "确认星港旧星图里被删掉的一段记录");
  assert.equal(imported.npcs.lin.concern, "害怕自己的发现只是过度解读。");
  assert.equal(imported.npcs.lin.hiddenGoalRevealed, false);
  assert.equal(imported.npcs.lin.relationshipStage, "初识");
  assert.equal(imported.npcs.lin.stance, "观望");
});

test("legacy bond events receive follow-up defaults", () => {
  const state = createInitialState();
  state.npcs.lin.bondEvents = [
    {
      id: "bond-legacy",
      day: 1,
      title: "旧羁绊",
      text: "旧版本只保存了羁绊文本。",
      stage: "初识",
      type: "stage"
    }
  ];

  const imported = importGame(serializeGame(state));
  const event = imported.npcs.lin.bondEvents[0];

  assert.equal(event.followUp.label, "稳住关系");
  assert.equal(event.followUp.actionType, "social");
  assert.equal(event.followUp.locationId, "greenhouse");
  assert.equal(event.followUp.npcId, "lin");
});

test("legacy npc quest lines are normalized", () => {
  const state = createInitialState();
  state.npcs.lin.questLines = [
    {
      id: "quest-legacy",
      npcId: "lin",
      title: "旧任务",
      intent: "继续确认旧星图",
      actionType: "study",
      locationId: "observatory",
      progress: 42,
      steps: [{ id: "ask", label: "确认", threshold: 35 }]
    }
  ];

  const imported = importGame(serializeGame(state));
  const quest = imported.npcs.lin.questLines[0];

  assert.equal(quest.id, "quest-legacy");
  assert.equal(quest.status, "active");
  assert.equal(quest.progress, 42);
  assert.equal(quest.pressure, 0);
  assert.equal(quest.dueDay, 5);
  assert.equal(quest.steps[0].done, true);
  assert.equal(quest.nextLabel, "推进羁绊任务");
});

test("completed legacy npc quest lines receive settlement defaults", () => {
  const state = createInitialState();
  state.npcs.lin.questLines = [
    {
      id: "quest-completed-legacy",
      npcId: "lin",
      title: "旧完成任务",
      intent: "继续确认旧星图",
      actionType: "study",
      locationId: "observatory",
      progress: 100,
      status: "completed",
      updatedDay: 2
    }
  ];

  const imported = importGame(serializeGame(state));
  const quest = imported.npcs.lin.questLines[0];

  assert.equal(quest.status, "completed");
  assert.equal(quest.completedDay, 2);
  assert.ok(quest.completion.text.includes("新的信任"));
  assert.equal(quest.completion.reward, "关系信任与专属线索。");
});

test("free text actions infer a useful action category", () => {
  assert.equal(inferActionId("邀请林鸢一起去温室聊天"), "social");
  assert.equal(inferActionId("去旧码头训练体能"), "train");
  assert.equal(inferActionId("整理房间然后早点休息"), "rest");
});

test("daily plans and relevant context guide the next action", () => {
  const state = createInitialState();
  const plans = buildDailyPlans(state);
  const action = createAction({
    presetId: "study",
    customText: plans[0].intent,
    locationId: plans[0].locationId,
    npcId: plans[0].npcId || ""
  });
  const context = selectRelevantContext({ ...state, plans }, action);

  assert.equal(plans.length, 3);
  assert.equal(context.plans[0].id, plans[0].id);
  assert.ok(context.memories.length >= 1);
  assert.ok(context.reflections.length >= 1);
});

test("relevant context uses Chinese cue overlap for partial memory matches", () => {
  const state = createInitialState();
  state.memories = [
    ...state.memories,
    {
      id: "memory-star-map-deleted",
      day: 1,
      owner: "hero",
      text: "林鸢提到旧星图记录里有一段被删掉的观测编号。",
      weight: 4,
      actionType: "",
      actionLabel: "",
      locationId: "",
      locationName: "",
      npcId: "",
      npcName: "",
      tags: [],
      relatedMemoryIds: [],
      relatedMemoryLabels: []
    }
  ];
  delete state.memoryTopics;
  const action = createAction({
    presetId: "create",
    customText: "确认被删掉的星图编号",
    locationId: "workshop",
    npcId: ""
  });
  const context = selectRelevantContext(state, action);

  assert.equal(context.memories[0].id, "memory-star-map-deleted");
  assert.ok(context.memories[0].matchReasons.includes("文本线索"));
  assert.ok(context.memories[0].matchedTerms.some((term) => ["星图", "删掉", "编号"].includes(term)));
  assert.ok(context.memoryTopics.some((topic) => topic.matchReasons.includes("文本线索")));
});

test("memory topics expose maintenance state for old evidence", () => {
  const state = createInitialState();
  state.day = 10;
  state.memories = [
    {
      id: "memory-old-dock",
      day: 1,
      owner: "hero",
      text: "旧码头曾经是确认长期方向的主要线索。",
      weight: 2,
      actionType: "explore",
      actionLabel: "探索",
      locationId: "dock",
      locationName: "旧码头",
      npcId: "",
      npcName: "",
      tags: ["旧码头", "目标"],
      relatedMemoryIds: [],
      relatedMemoryLabels: []
    }
  ];
  delete state.memoryTopics;
  const action = createAction({
    presetId: "explore",
    customText: "重新确认旧码头的长期方向",
    locationId: "dock",
    npcId: ""
  });
  const context = selectRelevantContext(state, action);
  const topic = context.memoryTopics.find((item) => item.memoryIds.includes("memory-old-dock"));

  assert.equal(topic.maintenanceStatus, "stale");
  assert.ok(topic.freshness <= 35);
  assert.match(topic.maintenanceReason, /没有新证据/);
  assert.ok(topic.score < 30);
});

test("world facts are retrieved for matching actions", () => {
  const state = createInitialState();
  state.worldFacts = [
    {
      id: "fact-star-map",
      key: "workshop:world:create",
      day: 2,
      updatedDay: 2,
      title: "旧星图缺页",
      text: "工坊里能找到被删掉的旧星图编号线索。",
      locationId: "workshop",
      locationName: "旧工坊",
      npcId: "",
      npcName: "",
      actionType: "create",
      tags: ["星图", "工坊", "线索"],
      confidence: 66,
      status: "observed",
      evidence: ["林鸢提到旧星图记录里有被删掉的观测编号。"],
      source: "test"
    }
  ];
  const action = createAction({
    presetId: "create",
    customText: "在旧工坊确认旧星图编号",
    locationId: "workshop",
    npcId: ""
  });
  const context = selectRelevantContext(state, action);

  assert.equal(context.worldFacts[0].id, "fact-star-map");
  assert.ok(context.worldFacts[0].matchReasons.includes("地点"));
  assert.ok(context.worldFacts[0].matchReasons.includes("文本线索"));
});

test("skills are retrieved for matching actions", () => {
  const state = createInitialState();
  state.hero.skills = [
    {
      id: "skill-star-map-reading",
      name: "星图判读",
      actionType: "study",
      level: 2,
      progress: 64,
      totalXp: 164,
      description: "把星图、档案和观测记录转成可行动的线索。",
      tags: ["研读", "星图", "线索"],
      evidence: ["星野已经多次从旧星图里读出观测编号。"],
      updatedDay: 2,
      status: "稳定",
      nextMilestone: "继续研读旧星图。"
    }
  ];
  const action = createAction({
    presetId: "study",
    customText: "研读旧星图里的观测编号",
    locationId: "observatory",
    npcId: ""
  });
  const context = selectRelevantContext(state, action);

  assert.equal(context.skills[0].id, "skill-star-map-reading");
  assert.ok(context.skills[0].matchReasons.includes("行动类型"));
  assert.ok(context.skills[0].matchReasons.includes("文本线索"));
});

test("action opportunities prioritize open loops and feed plans", () => {
  const state = createInitialState();
  state.hero.skills = [
    {
      id: "skill-star-map-reading",
      name: "星图判读",
      actionType: "study",
      level: 1,
      progress: 82,
      totalXp: 82,
      description: "把星图、档案和观测记录转成可行动的线索。",
      tags: ["研读", "星图", "线索"],
      evidence: ["星野已经多次从旧星图里读出观测编号。"],
      updatedDay: 2,
      status: "突破中",
      nextMilestone: "继续研读旧星图。"
    }
  ];
  state.worldFacts = [
    {
      id: "fact-star-map",
      key: "workshop:world:create",
      day: 2,
      updatedDay: 2,
      title: "旧星图缺页",
      text: "工坊里能找到被删掉的旧星图编号线索。",
      locationId: "workshop",
      locationName: "旧工坊",
      npcId: "",
      npcName: "",
      actionType: "create",
      tags: ["星图", "工坊", "线索"],
      confidence: 48,
      status: "observed",
      evidence: ["林鸢提到旧星图记录里有被删掉的观测编号。"],
      source: "test"
    }
  ];

  const opportunities = buildActionOpportunities(state);
  const plans = buildDailyPlans(state);
  const action = createAction({
    presetId: opportunities[0].actionType,
    customText: opportunities[0].intent,
    locationId: opportunities[0].locationId,
    npcId: opportunities[0].npcId || ""
  });
  const context = selectRelevantContext({ ...state, plans }, action);

  assert.ok(opportunities.some((opportunity) => opportunity.source === "skill"));
  assert.ok(opportunities.some((opportunity) => opportunity.source === "worldFact"));
  assert.ok(plans.some((plan) => plan.source.startsWith("opportunity:")));
  assert.ok(context.opportunities.length >= 1);
  assert.ok(context.opportunities[0].matchReasons.length >= 1);
});

test("experience diagnostics summarize long-horizon play health", () => {
  const state = createInitialState();
  const diagnostics = buildExperienceDiagnostics(state);

  assert.equal(typeof diagnostics.score, "number");
  assert.ok(diagnostics.score >= 1);
  assert.ok(diagnostics.score <= 100);
  assert.ok(diagnostics.metrics.some((metric) => metric.id === "continuity"));
  assert.ok(diagnostics.metrics.some((metric) => metric.id === "diversity"));
  assert.ok(diagnostics.metrics.some((metric) => metric.id === "openLoops"));
  assert.ok(diagnostics.metrics.some((metric) => metric.id === "memoryHealth"));
  assert.ok(diagnostics.sourceCounts.skills >= 1);
});

test("experience diagnostics warn about stale memory and overloaded loops", () => {
  const state = createInitialState();
  state.day = 12;
  state.commitments = Array.from({ length: 5 }, (_, index) => ({
    id: `commitment-${index}`,
    day: 4,
    dueDay: 7 + index,
    title: `待兑现线索 ${index + 1}`,
    intent: "回到温室确认之前答应过的细节。",
    actionType: "social",
    locationId: "greenhouse",
    npcId: "lin",
    status: "open",
    progress: 0,
    pressure: 40
  }));
  state.memoryTopics = Array.from({ length: 3 }, (_, index) => ({
    id: `topic-stale-${index}`,
    key: `topic-stale-${index}`,
    title: `过期记忆 ${index + 1}`,
    summary: "这条记忆已经很久没有新证据。",
    tags: ["记忆", "复核"],
    memoryIds: ["memory-opening"],
    evidence: ["旧证据"],
    strength: 40,
    createdDay: 1,
    updatedDay: 1,
    actionType: "explore",
    locationId: "dock",
    npcId: "",
    source: "test"
  }));
  state.worldFacts = Array.from({ length: 5 }, (_, index) => ({
    id: `fact-low-${index}`,
    key: `dock:world:explore:${index}`,
    day: 2,
    updatedDay: 2,
    title: `低置信发现 ${index + 1}`,
    text: "还需要再次观察才能确认。",
    locationId: "dock",
    locationName: "旧码头",
    npcId: "",
    npcName: "",
    actionType: "explore",
    tags: ["发现"],
    confidence: 25,
    status: "observed",
    evidence: ["模糊线索"],
    source: "test"
  }));

  const diagnostics = buildExperienceDiagnostics(state);
  const openLoops = diagnostics.metrics.find((metric) => metric.id === "openLoops");
  const memoryHealth = diagnostics.metrics.find((metric) => metric.id === "memoryHealth");

  assert.ok(openLoops.value < 50);
  assert.ok(memoryHealth.value < 70);
  assert.ok(diagnostics.warnings.length >= 1);
  assert.ok(diagnostics.recommendations.length >= 1);
});
