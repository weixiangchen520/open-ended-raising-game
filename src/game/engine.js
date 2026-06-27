import {
  ACTION_PRESETS,
  LOCATIONS,
  NPCS,
  STAT_META,
  STAT_KEYS,
  TIME_SLOTS,
  findLocation,
  findNpc,
  findPreset
} from "./data.js";

const ACTION_EFFECTS = {
  study: { focus: 7, creativity: 1, fitness: -1, empathy: 0, courage: 0, discipline: 4, stress: 3, energy: -7 },
  create: { focus: 2, creativity: 7, fitness: 0, empathy: 1, courage: 1, discipline: 1, stress: 2, energy: -6 },
  train: { focus: 0, creativity: 0, fitness: 7, empathy: 0, courage: 4, discipline: 2, stress: -3, energy: -8 },
  social: { focus: 0, creativity: 1, fitness: 0, empathy: 7, courage: 1, discipline: 0, stress: -1, energy: -4 },
  explore: { focus: 2, creativity: 2, fitness: 1, empathy: 0, courage: 7, discipline: 0, stress: 3, energy: -7 },
  rest: { focus: -1, creativity: 1, fitness: 0, empathy: 1, courage: 0, discipline: -1, stress: -8, energy: 12 }
};

const KEYWORD_ACTIONS = [
  { pattern: /学|读|研究|复习|资料|档案/u, id: "study" },
  { pattern: /写|画|做|制作|设计|修|工坊/u, id: "create" },
  { pattern: /跑|练|训练|搬|体能|码头/u, id: "train" },
  { pattern: /聊|陪|帮|道歉|感谢|倾听/u, id: "social" },
  { pattern: /探|查|找|传闻|秘密|夜/u, id: "explore" },
  { pattern: /睡|休息|整理|洗澡|放空|冥想/u, id: "rest" }
];

const ACTION_TAG_LABELS = {
  study: "研读",
  create: "创作",
  train: "训练",
  social: "社交",
  explore: "探索",
  rest: "休息",
  opening: "开局"
};

const SKILL_DEFINITIONS = {
  study: {
    id: "skill-star-map-reading",
    name: "星图判读",
    description: "把星图、档案和观测记录转成可行动的线索。",
    tags: ["研读", "星图", "线索"]
  },
  create: {
    id: "skill-prototype-making",
    name: "原型制作",
    description: "把想法做成粗糙但能验证的作品。",
    tags: ["创作", "工坊", "作品"]
  },
  train: {
    id: "skill-body-rhythm",
    name: "体能节奏",
    description: "用训练和行动控制体力、勇气与压力。",
    tags: ["训练", "体能", "节奏"]
  },
  social: {
    id: "skill-social-attunement",
    name: "共情沟通",
    description: "听懂同伴真正担心的事，并把关系推进到下一步。",
    tags: ["社交", "关系", "同伴"]
  },
  explore: {
    id: "skill-rumor-tracking",
    name: "传闻追踪",
    description: "在地点、传闻和异常现象之间建立可验证连接。",
    tags: ["探索", "传闻", "地点"]
  },
  rest: {
    id: "skill-self-regulation",
    name: "自我调节",
    description: "通过整理、休息和复盘维持长期行动节奏。",
    tags: ["休息", "压力", "恢复"]
  }
};

const BOND_FOLLOW_UP_LOCATIONS = {
  study: "observatory",
  create: "workshop",
  train: "dock",
  social: "greenhouse",
  explore: "dock",
  rest: "dorm"
};

const MEMORY_KEYWORD_TAGS = [
  { pattern: /星图|观测|灯塔|记录|档案|资料/u, tag: "线索" },
  { pattern: /目标|方向|投入|计划/u, tag: "目标" },
  { pattern: /林鸢|莫衡|乔白|同伴|关系|信任|好感/u, tag: "关系" },
  { pattern: /压力|精力|休息|恢复/u, tag: "状态" },
  { pattern: /传闻|秘密|异常|旧码头|夜/u, tag: "传闻" },
  { pattern: /制作|工坊|作品|设计|修/u, tag: "创作" }
];

export function clamp(value, min = 0, max = 100) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function createAction({ presetId, customText, locationId, npcId }) {
  const inferredId = customText ? inferActionId(customText) : presetId;
  const preset = findPreset(inferredId || presetId);
  const location = findLocation(locationId);
  const npc = npcId ? findNpc(npcId) : null;

  return {
    id: cryptoId("action"),
    type: preset.id,
    label: customText?.trim() || preset.label,
    presetLabel: preset.label,
    customText: customText?.trim() || "",
    locationId: location.id,
    locationName: location.name,
    npcId: npc?.id || "",
    npcName: npc?.name || ""
  };
}

export function inferActionId(text) {
  const hit = KEYWORD_ACTIONS.find((item) => item.pattern.test(text));
  return hit?.id || "explore";
}

export function createLocalOutcome(state, action) {
  const type = action.type || inferActionId(action.customText || action.label || "");
  const preset = findPreset(type);
  const location = state.locations?.[action.locationId] || findLocation(action.locationId);
  const npc = action.npcId ? state.npcs?.[action.npcId] : null;
  const base = ACTION_EFFECTS[type] || ACTION_EFFECTS.explore;
  const seed = hash(`${state.day}:${state.slot}:${action.label}:${action.locationId}:${action.npcId}`);
  const variation = (seed % 3) - 1;
  const statDeltas = Object.fromEntries(
    STAT_KEYS.map((key) => {
      const value = base[key] || 0;
      const adjusted = key === "energy" || key === "stress" ? value : value + variation;
      return [key, clamp(adjusted, -12, 12)];
    })
  );

  const relationshipDeltas = npc
    ? [
        {
          npcId: npc.id,
          affinity: type === "social" ? 5 + Math.max(variation, 0) : type === "rest" ? 1 : 2,
          trust: type === "social" || type === "study" ? 3 : 1
        }
      ]
    : [];

  const title = buildTitle(type, location?.name, npc?.name, seed);
  const detail = action.customText
    ? `你没有照着惯例来，而是决定：${action.customText}`
    : `你把这段时间留给了${preset.verb}。`;
  const npcLine = npc
    ? `${npc.name}注意到了你的选择，态度比之前更愿意靠近一点。`
    : "没有人立刻评价这件事，但它还是悄悄改变了你今天的节奏。";

  return {
    title,
    narration: `${location?.name || "星港"}里，${detail}${npcLine}`,
    mood: pick(["calm", "bright", "tense", "strange", "warm"], seed),
    statDeltas,
    relationshipDeltas,
    memories: [
      {
        owner: "hero",
        text: `第 ${state.day} 天${TIME_SLOTS[state.slot]}，${action.label}让星野对${location?.name || "星港"}有了新的理解。`,
        weight: type === "explore" || type === "social" ? 3 : 2
      },
      ...(npc
        ? [
            {
              owner: `npc:${npc.id}`,
              text: `${npc.name}记得星野在${location?.name || "这里"}选择了${action.label}。`,
              weight: 2
            }
          ]
        : [])
    ],
    newGoal: maybeCreateGoal(type, state.day, seed),
    choices: buildChoices(type, location?.name)
  };
}

export function normalizeOutcome(raw, state) {
  const fallback = createEmptyOutcome();
  const outcome = raw && typeof raw === "object" ? raw : fallback;

  return {
    title: limitText(outcome.title || fallback.title, 40),
    narration: limitText(outcome.narration || fallback.narration, 520),
    mood: ["calm", "bright", "tense", "strange", "warm"].includes(outcome.mood) ? outcome.mood : "calm",
    statDeltas: normalizeStatDeltas(outcome.statDeltas),
    relationshipDeltas: normalizeRelationshipDeltas(outcome.relationshipDeltas, state),
    memories: normalizeMemories(outcome.memories),
    newGoal: normalizeGoal(outcome.newGoal, state),
    choices: normalizeChoices(outcome.choices)
  };
}

export function addCommitmentFromChoice(state, choice, context = {}) {
  const next = clone(state);
  const commitments = normalizeCommitments(next.commitments, next);
  const commitment = createCommitmentFromChoice(next, choice, context);
  const existingIndex = commitments.findIndex((item) =>
    item.status === "open" && normalizeCompareText(item.intent) === normalizeCompareText(commitment.intent)
  );

  if (existingIndex >= 0) {
    commitments[existingIndex] = {
      ...commitments[existingIndex],
      dueDay: Math.max(commitments[existingIndex].dueDay, commitment.dueDay),
      sourceTitle: commitment.sourceTitle,
      resolution: "重新确认了这个承诺。"
    };
  } else {
    commitments.push(commitment);
  }

  next.commitments = commitments.slice(-12);
  return next;
}

export function applyOutcome(state, action, rawOutcome) {
  const outcome = normalizeOutcome(rawOutcome, state);
  const retrievedContext = selectRelevantContext(state, action);
  const beforeNpc = action.npcId ? state.npcs?.[action.npcId] : null;
  const beforeNpcReflectionCount = beforeNpc?.reflections?.length || 0;
  const beforeNpcBondEventCount = beforeNpc?.bondEvents?.length || 0;
  const next = clone(state);
  const location = next.locations[action.locationId] || next.locations.observatory;

  next.currentLocationId = action.locationId;
  if (location) {
    location.visits = (location.visits || 0) + 1;
  }

  for (const key of STAT_KEYS) {
    next.hero.stats[key] = clamp((next.hero.stats[key] || 0) + (outcome.statDeltas[key] || 0));
  }
  next.hero.mood = outcome.mood;

  for (const delta of outcome.relationshipDeltas) {
    const npc = next.npcs[delta.npcId];
    if (!npc) continue;
    npc.affinity = clamp((npc.affinity || 0) + delta.affinity);
    npc.trust = clamp((npc.trust || 0) + delta.trust);
  }

  const memoryEntries = [];
  for (const memory of outcome.memories) {
    const entry = createMemoryEntry(memory, next, action);
    memoryEntries.push(linkMemoryEntry(entry, [...next.memories, ...memoryEntries]));
  }
  next.memories = [...next.memories, ...memoryEntries].slice(-80);

  for (const memory of memoryEntries) {
    if (memory.owner.startsWith("npc:")) {
      const npcId = memory.owner.slice(4);
      if (next.npcs[npcId]) {
        next.npcs[npcId].memories = [...(next.npcs[npcId].memories || []), memory.text].slice(-8);
      }
    }
  }
  const questLineProgress = advanceNpcQuestLines(next, action, outcome);
  const questLinePressure = pressureNpcQuestLines(next, action, questLineProgress.progressedQuestIds);
  updateNpcSocialModels(next, action, outcome);

  if (outcome.newGoal) {
    next.hero.goals = [
      ...next.hero.goals,
      {
        id: cryptoId("goal"),
        text: outcome.newGoal.text,
        progress: clamp(outcome.newGoal.progress),
        dueDay: Math.max(next.day + 1, Math.round(outcome.newGoal.dueDay)),
        done: false
      }
    ].slice(-8);
  }

  next.hero.goals = next.hero.goals.map((goal) => {
    if (goal.done) return goal;
    const progressGain = action.type === "rest" ? 2 : action.type === "social" ? 4 : 5;
    const progress = clamp((goal.progress || 0) + progressGain);
    return { ...goal, progress, done: progress >= 100 };
  });
  const commitmentProgress = advanceCommitments(next, action);
  const skillProgress = advanceSkills(next, action, outcome, memoryEntries);
  const worldFactUpdate = updateWorldFacts(next, action, outcome, memoryEntries);
  next.memoryTopics = updateMemoryTopics(next);

  const afterNpc = action.npcId ? next.npcs?.[action.npcId] : null;
  next.continuityTraces = [
    ...(Array.isArray(next.continuityTraces) ? next.continuityTraces : []),
    buildContinuityTrace(state, next, action, outcome, {
      retrievedContext,
      memoryWriteCount: memoryEntries.length + commitmentProgress.memoryWriteCount,
      memoryLinkCount: memoryEntries.reduce(
        (count, memory) => count + (memory.relatedMemoryIds?.length || 0),
        0
      ) + commitmentProgress.memoryLinkCount,
      newGoalCreated: Boolean(outcome.newGoal),
      progressedGoalCount: countProgressedGoals(state, next),
      npcReflectionCreated: Math.max(0, (afterNpc?.reflections?.length || 0) - beforeNpcReflectionCount),
      npcBondEventsCreated: Math.max(0, (afterNpc?.bondEvents?.length || 0) - beforeNpcBondEventCount),
      npcQuestLinesProgressed: questLineProgress.progressedCount,
      npcQuestLinesCompleted: questLineProgress.completedCount,
      npcQuestLinesPressured: questLinePressure.pressuredCount,
      npcQuestLinesStrained: questLinePressure.strainedCount,
      commitmentsFulfilled: commitmentProgress.fulfilledCount,
      commitmentsMissed: commitmentProgress.missedCount,
      skillsUpdated: skillProgress.updatedCount,
      skillLevelUps: skillProgress.levelUps,
      worldFactsUpdated: worldFactUpdate.updatedCount
    })
  ].slice(-40);

  next.diary = [
    ...next.diary,
    {
      id: cryptoId("entry"),
      day: next.day,
      slot: next.slot,
      title: outcome.title,
      text: outcome.narration,
      mood: outcome.mood,
      actionLabel: action.label,
      locationName: action.locationName,
      npcName: action.npcName,
      statDeltas: outcome.statDeltas
    }
  ].slice(-120);

  advanceTime(next);
  return next;
}

export function advanceTime(state) {
  if (state.slot >= TIME_SLOTS.length - 1) {
    state.day += 1;
    state.slot = 0;
    state.flags.completedDays = (state.flags.completedDays || 0) + 1;
    state.diary = [
      ...state.diary,
      {
        id: cryptoId("daily"),
        day: state.day - 1,
        slot: 3,
        title: `第 ${state.day - 1} 天收束`,
        text: buildDailySummary(state),
        mood: state.hero.mood,
        actionLabel: "日终回顾"
      }
    ].slice(-120);
    state.reflections = [
      ...(Array.isArray(state.reflections) ? state.reflections : []),
      buildDailyReflection(state, state.day - 1)
    ].slice(-24);
    state.chapters = advanceChapters(state, state.day - 1);
    state.plans = buildDailyPlans(state);
  } else {
    state.slot += 1;
  }
}

export function buildDailySummary(state) {
  const stress = state.hero.stats.stress;
  const energy = state.hero.stats.energy;
  const strongest = STAT_KEYS.filter((key) => !["stress", "energy"].includes(key)).sort(
    (a, b) => state.hero.stats[b] - state.hero.stats[a]
  )[0];
  const stressLine = stress > 70 ? "压力已经很高，明天需要留出恢复空间。" : "压力还在可控范围内。";
  const energyLine = energy < 30 ? "精力明显不足，继续硬撑会降低长期成长。" : "精力还能支撑新的尝试。";
  return `${stressLine}${energyLine}今天最突出的能力是${strongest}。`;
}

export function buildDailyReflection(state, day = state.day) {
  const stats = state.hero?.stats || {};
  const strongest = STAT_KEYS.filter((key) => !["stress", "energy"].includes(key)).sort(
    (a, b) => (stats[b] || 0) - (stats[a] || 0)
  )[0];
  const recentMemory = [...(state.memories || [])].reverse().find((memory) => memory.owner === "hero") ||
    [...(state.memories || [])].reverse()[0];
  const activeGoal = state.hero?.goals?.find((goal) => !goal.done);
  const pressureLine =
    (stats.stress || 0) > 70
      ? "压力已经开始影响判断，下一天需要给恢复留出真实位置。"
      : (stats.energy || 0) < 30
        ? "精力不足会让好奇心变钝，下一天最好先把节奏放稳。"
        : "状态还留有余裕，适合把今天的线索继续往前推。";
  const strongestLabel = STAT_META[strongest]?.label || strongest || "直觉";
  const memoryLine = recentMemory?.text ? `最值得保留的是：${recentMemory.text}` : "今天还没有形成足够清晰的记忆。";
  const goalLine = activeGoal ? `当前牵引力最强的目标是：${activeGoal.text}` : "当前没有明确目标，适合主动寻找新的长期牵引。";

  return {
    id: cryptoId("reflection"),
    day,
    title: `第 ${day} 天的内在回声`,
    text: `${memoryLine}${pressureLine}${goalLine}`,
    focus: strongestLabel,
    source: "daily"
  };
}

export function relationshipStageFor(npc) {
  const affinity = npc?.affinity || 0;
  const trust = npc?.trust || 0;
  const combined = affinity + trust;
  if (trust >= 70 && affinity >= 70) return "牵绊";
  if (trust >= 55 && combined >= 115) return "信赖";
  if (combined >= 82) return "熟悉";
  if (trust < 25 || affinity < 25) return "疏离";
  return "初识";
}

export function stanceFor(npc) {
  const affinity = npc?.affinity || 0;
  const trust = npc?.trust || 0;
  if (trust >= 65 && affinity >= 55) return "愿意托付";
  if (trust >= 50) return "谨慎支持";
  if (affinity >= 50) return "亲近好奇";
  if (trust < 28) return "保持距离";
  return "观望";
}

export function buildDailyPlans(state) {
  const stats = state.hero?.stats || {};
  const activeGoals = (state.hero?.goals || []).filter((goal) => !goal.done);
  const primaryGoal = activeGoals.sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];
  const latestReflection = [...(state.reflections || [])].reverse()[0];
  const activeChapter = getActiveChapter(state);
  const plans = [];
  const opportunities = buildActionOpportunities(state);

  if (primaryGoal) {
    const actionType = inferPlanAction(primaryGoal.text);
    plans.push({
      id: cryptoId("plan"),
      day: state.day,
      title: "推进最重要的目标",
      intent: `围绕「${primaryGoal.text}」安排一次具体行动`,
      actionType,
      locationId: locationForAction(actionType, state),
      reason: `当前进度 ${primaryGoal.progress || 0}%，期限是第 ${primaryGoal.dueDay} 天。`,
      source: "goal"
    });
  }

  if (activeChapter) {
    plans.push({
      id: cryptoId("plan"),
      day: state.day,
      title: `推进篇章：${activeChapter.title}`,
      intent: activeChapter.nextHook || activeChapter.objective,
      actionType: activeChapter.actionType || inferPlanAction(activeChapter.objective || activeChapter.title),
      locationId: activeChapter.locationId || locationForAction(activeChapter.actionType || "study", state),
      npcId: activeChapter.npcId || "",
      reason: `${activeChapter.currentBeat || activeChapter.premise} 进度 ${activeChapter.progress || 0}%。`,
      source: "chapter"
    });
  }

  const opportunityPlan = firstUniqueOpportunityPlan(opportunities, plans, state);
  if (opportunityPlan) plans.push(opportunityPlan);

  if ((stats.stress || 0) > 65 || (stats.energy || 0) < 36) {
    plans.push({
      id: cryptoId("plan"),
      day: state.day,
      title: "先稳住节奏",
      intent: "回宿舍整理日记并休息，把压力降到可控范围",
      actionType: "rest",
      locationId: "dorm",
      reason: "高压力或低精力会削弱长期成长收益。",
      source: "state"
    });
  } else {
    const actionType = inferPlanAction(latestReflection?.focus || "");
    plans.push({
      id: cryptoId("plan"),
      day: state.day,
      title: "沿着洞察继续追问",
      intent: latestReflection
        ? `围绕「${latestReflection.focus}」继续行动：${latestReflection.title}`
        : "把今天最在意的问题拆成一次可执行的小行动",
      actionType,
      locationId: locationForAction(actionType, state),
      reason: latestReflection?.text || "还没有足够反思时，先用一次小行动制造新线索。",
      source: "reflection"
    });
  }

  const quest = pickNpcQuestForPlan(state);
  if (quest) {
    plans.push({
      id: cryptoId("plan"),
      day: state.day,
      title: `推进羁绊任务：${quest.title}`,
      intent: quest.currentStep || quest.intent,
      actionType: quest.actionType || "social",
      locationId: quest.locationId || locationForAction(quest.actionType || "social", state),
      npcId: quest.npcId || "",
      reason: `${quest.npcName || "同伴"}的关系线已经展开，当前进度 ${quest.progress || 0}%，压力 ${quest.pressure || 0}%，期限是第 ${quest.dueDay || state.day} 天。`,
      source: "bond"
    });
  } else {
    const npc = pickNpcForPlan(state);
    plans.push({
      id: cryptoId("plan"),
      day: state.day,
      title: npc ? "让关系产生新信息" : "寻找新的外部线索",
      intent: npc ? `找${npc.name}聊聊最近的选择，确认彼此真正关心的事` : "去旧码头或观测塔追踪一条新的传闻",
      actionType: npc ? "social" : "explore",
      locationId: npc ? "greenhouse" : locationForAction("explore", state),
      npcId: npc?.id || "",
      reason: npc ? "同伴记忆能让后续事件更有连续性。" : "开放式养成需要持续引入外部变化。",
      source: npc ? "relationship" : "world"
    });
  }

  return ensurePlanCount(dedupePlans(plans), state).slice(0, 3);
}

export function buildActionOpportunities(state = {}) {
  const day = state.day || 1;
  const opportunities = [];

  for (const commitment of normalizeCommitments(state.commitments, state)
    .filter((item) => item.status === "open")) {
    const daysLeft = (commitment.dueDay || day) - day;
    opportunities.push({
      id: `opp-commitment-${commitment.id}`,
      title: `兑现承诺：${commitment.title}`,
      intent: commitment.intent,
      reason: daysLeft <= 0 ? "承诺已经到期，继续拖延会让信任变脆弱。" : `距离期限还有 ${daysLeft} 天。`,
      priority: clamp(88 - Math.max(0, daysLeft) * 8 + (commitment.pressure || 0) / 2, 1, 100),
      source: "commitment",
      actionType: commitment.actionType || "social",
      locationId: commitment.locationId || locationForAction(commitment.actionType || "social", state),
      npcId: commitment.npcId || "",
      tags: ["承诺", commitment.npcName, ACTION_TAG_LABELS[commitment.actionType]]
    });
  }

  for (const quest of getAllNpcQuestLines(state).filter((item) => item.status !== "completed")) {
    const daysLate = Math.max(0, day - (quest.dueDay || day));
    opportunities.push({
      id: `opp-quest-${quest.id}`,
      title: `${quest.status === "strained" || (quest.pressure || 0) >= 65 ? "修复" : "推进"}羁绊：${quest.title}`,
      intent: quest.status === "strained" || (quest.pressure || 0) >= 45
        ? `认真回应${quest.npcName || "同伴"}对「${quest.title}」被搁置的担心。`
        : quest.currentStep || quest.intent,
      reason: `进度 ${quest.progress || 0}% · 压力 ${quest.pressure || 0}% · 期限第 ${quest.dueDay || day} 天。`,
      priority: clamp(62 + (quest.pressure || 0) / 2 + daysLate * 12 + (quest.status === "strained" ? 18 : 0), 1, 100),
      source: "quest",
      actionType: quest.status === "strained" || (quest.pressure || 0) >= 45 ? "social" : quest.actionType || "social",
      locationId: quest.status === "strained" || (quest.pressure || 0) >= 45 ? "greenhouse" : quest.locationId || locationForAction(quest.actionType || "social", state),
      npcId: quest.npcId || "",
      tags: ["羁绊", quest.npcName, ACTION_TAG_LABELS[quest.actionType]]
    });
  }

  for (const topic of normalizeMemoryTopics(state.memoryTopics, state)
    .filter((item) => ["watch", "stale"].includes(item.maintenanceStatus))) {
    opportunities.push({
      id: `opp-topic-${topic.id}`,
      title: topic.maintenanceStatus === "stale" ? `复核记忆：${topic.title}` : `刷新记忆：${topic.title}`,
      intent: topic.nextMaintenanceAction || `用一次行动确认「${topic.title}」是否仍然成立。`,
      reason: topic.maintenanceReason || "这组记忆需要新的证据。",
      priority: topic.maintenanceStatus === "stale" ? 74 : 56,
      source: "memory",
      actionType: topic.actionType && topic.actionType !== "opening" ? topic.actionType : "explore",
      locationId: topic.locationId || locationForAction(topic.actionType || "explore", state),
      npcId: topic.npcId || "",
      tags: ["记忆", topic.maintenanceLabel, ...(topic.tags || [])]
    });
  }

  for (const fact of normalizeWorldFacts(state.worldFacts, state)
    .filter((item) => item.status !== "confirmed" && (item.confidence || 0) < 70)) {
    opportunities.push({
      id: `opp-fact-${fact.id}`,
      title: `确认发现：${fact.title}`,
      intent: `围绕「${fact.title}」补一条新证据：${fact.text}`,
      reason: `当前置信度 ${fact.confidence || 0}，还适合继续验证。`,
      priority: clamp(54 + (70 - (fact.confidence || 0)) / 2, 1, 100),
      source: "worldFact",
      actionType: fact.actionType || "explore",
      locationId: fact.locationId || locationForAction(fact.actionType || "explore", state),
      npcId: fact.npcId || "",
      tags: ["发现", ...(fact.tags || [])]
    });
  }

  for (const skill of normalizeSkills(state.hero?.skills, state)
    .filter((item) => (item.progress || 0) >= 65 && (item.level || 1) < 5)) {
    opportunities.push({
      id: `opp-skill-${skill.id}`,
      title: `突破能力：${skill.name}`,
      intent: skill.nextMilestone || `安排一次行动让「${skill.name}」进入下一阶段。`,
      reason: `等级 ${skill.level || 1} · 进度 ${skill.progress || 0}%，接近突破。`,
      priority: clamp(50 + (skill.progress || 0) / 2 + (skill.level || 1) * 3, 1, 100),
      source: "skill",
      actionType: skill.actionType || "study",
      locationId: locationForAction(skill.actionType || "study", state),
      npcId: "",
      tags: ["能力", skill.name, ...(skill.tags || [])]
    });
  }

  const activeChapter = getActiveChapter(state);
  if (activeChapter && (activeChapter.pressure || 0) >= 55) {
    opportunities.push({
      id: `opp-chapter-${activeChapter.id}`,
      title: `稳住篇章：${activeChapter.title}`,
      intent: activeChapter.nextHook || activeChapter.objective,
      reason: `篇章压力 ${activeChapter.pressure || 0}%，需要用行动维持方向。`,
      priority: clamp(52 + (activeChapter.pressure || 0) / 2, 1, 100),
      source: "chapter",
      actionType: activeChapter.actionType || inferPlanAction(activeChapter.objective || activeChapter.title),
      locationId: activeChapter.locationId || locationForAction(activeChapter.actionType || "study", state),
      npcId: activeChapter.npcId || "",
      tags: ["篇章", activeChapter.title]
    });
  }

  return dedupeOpportunities(opportunities)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, 8);
}

export function buildExperienceDiagnostics(state = {}) {
  const day = state.day || 1;
  const traces = (Array.isArray(state.continuityTraces) ? state.continuityTraces : []).slice(-6);
  const memories = (Array.isArray(state.memories) ? state.memories : []).slice(-14);
  const diary = (Array.isArray(state.diary) ? state.diary : []).slice(-10);
  const commitments = normalizeCommitments(state.commitments, state);
  const openCommitments = commitments.filter((commitment) => commitment.status === "open");
  const activeQuests = getAllNpcQuestLines(state).filter((quest) => quest.status !== "completed");
  const topics = normalizeMemoryTopics(state.memoryTopics, state);
  const worldFacts = normalizeWorldFacts(state.worldFacts, state);
  const skills = normalizeSkills(state.hero?.skills, state);
  const opportunities = buildActionOpportunities(state);

  const continuityAverage = averageScores(traces.map((trace) => trace.score), diary.length > 1 ? 48 : 34);
  const continuityValue = clamp(Math.round(continuityAverage + Math.min(10, traces.length * 2)), 1, 100);

  const recentActionTypes = memories
    .map((memory) => memory.actionType)
    .filter((type) => type && type !== "opening");
  const recentPlaces = memories
    .map((memory) => memory.locationId || memory.locationName)
    .filter(Boolean);
  const recentNpcs = memories
    .map((memory) => memory.npcId || memory.npcName)
    .filter(Boolean);
  const diversityBase = recentActionTypes.length
    ? (new Set(recentActionTypes).size / Math.min(5, recentActionTypes.length)) * 70
    : 30;
  const diversityValue = clamp(
    Math.round(diversityBase + Math.min(15, new Set(recentPlaces).size * 4) + Math.min(15, new Set(recentNpcs).size * 5)),
    1,
    100
  );

  const staleTopics = topics.filter((topic) => topic.maintenanceStatus === "stale");
  const watchTopics = topics.filter((topic) => topic.maintenanceStatus === "watch");
  const unresolvedFacts = worldFacts.filter((fact) => fact.status !== "confirmed" && (fact.confidence || 0) < 70);
  const urgentQuests = activeQuests.filter((quest) => (quest.pressure || 0) >= 65 || (quest.dueDay || day) <= day + 1);
  const loopLoad =
    openCommitments.length * 12 +
    activeQuests.length * 8 +
    urgentQuests.length * 10 +
    staleTopics.length * 10 +
    watchTopics.length * 5 +
    unresolvedFacts.length * 5;
  const openLoopValue = clamp(Math.round(100 - loopLoad + Math.min(18, opportunities.length * 3)), 1, 100);

  const memoryFreshness = averageScores(topics.map((topic) => topic.freshness), topics.length ? 50 : 42);
  const memoryValue = clamp(
    Math.round(memoryFreshness - staleTopics.length * 8 - watchTopics.length * 3 + Math.min(10, topics.length * 2)),
    1,
    100
  );

  const skillMomentum = averageScores(
    skills.map((skill) => (skill.level || 1) * 14 + (skill.progress || 0) * 0.45),
    34
  );
  const recentSkillUpdates = skills.filter((skill) => day - (skill.updatedDay || day) <= 2).length;
  const growthValue = clamp(Math.round(skillMomentum + Math.min(12, recentSkillUpdates * 4)), 1, 100);

  const confirmedFacts = worldFacts.filter((fact) => fact.status === "confirmed");
  const knowledgeValue = clamp(
    Math.round(
      averageScores(worldFacts.map((fact) => fact.confidence), worldFacts.length ? 42 : 30) +
        confirmedFacts.length * 5 -
        unresolvedFacts.length * 2
    ),
    1,
    100
  );

  const metrics = [
    diagnosticMetric(
      "continuity",
      "连续性",
      continuityValue,
      traces.length
        ? `最近 ${traces.length} 次行动平均连续性 ${Math.round(continuityAverage)}。`
        : "还缺少行动 trace，后续行动会开始记录上下文使用。",
      continuityValue
    ),
    diagnosticMetric(
      "diversity",
      "行动多样性",
      diversityValue,
      `最近行动覆盖 ${new Set(recentActionTypes).size || 0} 类动作、${new Set(recentPlaces).size || 0} 个地点。`,
      diversityValue
    ),
    diagnosticMetric(
      "openLoops",
      "开放循环",
      openLoopValue,
      `待处理承诺 ${openCommitments.length}、羁绊 ${activeQuests.length}、复核主题 ${staleTopics.length + watchTopics.length}、待确认发现 ${unresolvedFacts.length}。`,
      openLoopValue
    ),
    diagnosticMetric(
      "memoryHealth",
      "记忆健康",
      memoryValue,
      topics.length
        ? `记忆主题平均新鲜度 ${Math.round(memoryFreshness)}，其中 ${staleTopics.length} 个需要复核。`
        : "还没有足够的主题化记忆。",
      memoryValue
    ),
    diagnosticMetric(
      "growth",
      "成长势能",
      growthValue,
      `能力库 ${skills.length} 项，最近两天更新 ${recentSkillUpdates} 项。`,
      growthValue
    ),
    diagnosticMetric(
      "worldKnowledge",
      "世界知识",
      knowledgeValue,
      `结构化发现 ${worldFacts.length} 条，已确认 ${confirmedFacts.length} 条，待验证 ${unresolvedFacts.length} 条。`,
      knowledgeValue
    )
  ];

  const score = clamp(
    Math.round(
      metrics.reduce((total, metric) => total + metric.value, 0) / Math.max(1, metrics.length)
    ),
    1,
    100
  );
  const warnings = [
    continuityValue < 45 ? "最近行动和旧上下文连接偏弱，下一步适合引用一个承诺、记忆主题或世界发现。" : "",
    diversityValue < 45 ? "行动类型过于集中，开放式养成会变成单线刷数值。" : "",
    openLoopValue < 45 ? "开放循环负载较高，继续扩张前应先兑现或复核一批线索。" : "",
    memoryValue < 45 ? "记忆主题开始老化，导演层可能误用过期证据。" : "",
    knowledgeValue < 45 ? "世界知识还缺少高置信发现，探索结果需要更多复验。" : ""
  ].filter(Boolean);
  const recommendations = [
    opportunities[0] ? `优先处理：${opportunities[0].title}` : "",
    staleTopics[0] ? `复核记忆：${staleTopics[0].title}` : "",
    unresolvedFacts[0] ? `验证发现：${unresolvedFacts[0].title}` : "",
    growthValue < 55 && skills[0] ? `安排一次能力突破：${skills[0].name}` : "",
    diversityValue < 55 ? "选择一个最近较少使用的地点或行动类型。" : ""
  ].filter(Boolean).slice(0, 3);

  return {
    score,
    label: diagnosticScoreLabel(score),
    summary: diagnosticSummary(score, warnings.length),
    metrics,
    warnings,
    recommendations,
    sourceCounts: {
      traces: traces.length,
      memories: memories.length,
      opportunities: opportunities.length,
      commitments: openCommitments.length,
      quests: activeQuests.length,
      topics: topics.length,
      worldFacts: worldFacts.length,
      skills: skills.length
    }
  };
}

function diagnosticMetric(id, label, value, detail, scoreForTone) {
  const numericValue = clamp(Math.round(value), 1, 100);
  return {
    id,
    label,
    value: numericValue,
    tone: diagnosticTone(scoreForTone ?? numericValue),
    detail: limitText(detail, 140)
  };
}

function diagnosticTone(value) {
  if (value >= 72) return "good";
  if (value >= 50) return "watch";
  return "risk";
}

function diagnosticScoreLabel(score) {
  if (score >= 72) return "稳定推进";
  if (score >= 50) return "需要看护";
  return "容易散线";
}

function diagnosticSummary(score, warningCount) {
  if (score >= 72) return "长期状态仍在形成正反馈，可以继续扩张新线索。";
  if (score >= 50) return warningCount ? "体验可以继续推进，但有几条线索需要收束。" : "系统状态健康，适合用一两次行动建立更强证据。";
  return "当前体验容易变成碎片化行动，建议先处理最重的开放循环。";
}

function averageScores(values = [], fallback = 0) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) return fallback;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function planFromOpportunity(opportunity, state) {
  return {
    id: cryptoId("plan"),
    day: state.day,
    title: opportunity.title,
    intent: opportunity.intent,
    actionType: opportunity.actionType,
    locationId: opportunity.locationId,
    npcId: opportunity.npcId || "",
    reason: `${opportunity.reason} 优先级 ${opportunity.priority || 0}。`,
    source: `opportunity:${opportunity.source || "state"}`
  };
}

function firstUniqueOpportunityPlan(opportunities = [], existingPlans = [], state = {}) {
  const seen = new Set(existingPlans.map((plan) => `${plan.actionType}:${plan.locationId}:${plan.npcId || ""}`));
  for (const opportunity of opportunities) {
    const key = `${opportunity.actionType}:${opportunity.locationId}:${opportunity.npcId || ""}`;
    if (seen.has(key)) continue;
    return planFromOpportunity(opportunity, state);
  }
  return null;
}

function dedupeOpportunities(opportunities = []) {
  const seen = new Set();
  return opportunities.filter((opportunity) => {
    const key = `${opportunity.source}:${opportunity.actionType}:${opportunity.locationId}:${opportunity.npcId || ""}:${opportunity.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectRelevantContext(state, action) {
  const actionText = [
    action.type,
    action.label,
    action.customText,
    action.locationName,
    action.npcName
  ].filter(Boolean).join(" ");
  const location = findLocation(action.locationId);
  const npcId = action.npcId || "";
  const actionTags = buildActionTags(action);
  const actionCueTokens = cueTokens(`${actionText} ${[...actionTags].join(" ")}`);
  const directMemoryIds = new Set(
    (state.memories || [])
      .filter((memory) => {
        const tags = new Set(memory.tags || []);
        return (
          (memory.actionType && memory.actionType === action.type) ||
          (memory.locationId && memory.locationId === action.locationId) ||
          (npcId && memory.npcId === npcId) ||
          (npcId && memory.owner === `npc:${npcId}`) ||
          [...actionTags].some((tag) => tags.has(tag))
        );
      })
      .map((memory) => memory.id)
  );
  const neighborMemoryIds = new Set();
  for (const memory of state.memories || []) {
    if (directMemoryIds.has(memory.id)) {
      for (const relatedId of memory.relatedMemoryIds || []) {
        neighborMemoryIds.add(relatedId);
      }
    }
    if ((memory.relatedMemoryIds || []).some((relatedId) => directMemoryIds.has(relatedId))) {
      neighborMemoryIds.add(memory.id);
    }
  }

  const scoreText = (text = "", base = 0) => {
    let score = base;
    if (action.type && text.includes(action.type)) score += 2;
    if (action.label && text.includes(action.label)) score += 3;
    if (location?.name && text.includes(location.name)) score += 3;
    if (action.npcName && text.includes(action.npcName)) score += 3;
    for (const token of actionText.split(/\s+/).filter((item) => item.length >= 2)) {
      if (text.includes(token)) score += 1;
    }
    score += scoreCueOverlap(actionCueTokens, cueTokens(text)).score;
    return score;
  };

  const contextMatch = (item, text = "") => {
    const reasons = [];
    const overlap = scoreCueOverlap(actionCueTokens, cueTokens(text));
    const sharedTags = (item.tags || []).filter((tag) => actionTags.has(tag));
    if (item.actionType && item.actionType === action.type) reasons.push("行动类型");
    if (item.locationId && item.locationId === action.locationId) reasons.push("地点");
    if (npcId && (item.npcId === npcId || item.owner === `npc:${npcId}`)) reasons.push("同伴");
    if (sharedTags.length) reasons.push(`标签:${sharedTags.slice(0, 2).join("/")}`);
    if (item.id && directMemoryIds.has(item.id)) reasons.push("直接记忆");
    if (item.id && neighborMemoryIds.has(item.id)) reasons.push("关联记忆");
    if (overlap.terms.length) reasons.push("文本线索");
    return {
      matchReasons: reasons.slice(0, 4),
      matchedTerms: overlap.terms
    };
  };

  const scoreMemoryFacets = (memory) => {
    let score = 0;
    if (memory.actionType && memory.actionType === action.type) score += 4;
    if (memory.locationId && memory.locationId === action.locationId) score += 5;
    if (npcId && memory.npcId === npcId) score += 6;
    if (npcId && memory.owner === `npc:${npcId}`) score += 4;
    for (const tag of memory.tags || []) {
      if (actionTags.has(tag)) score += 3;
    }
    if (directMemoryIds.has(memory.id)) score += 2;
    if (neighborMemoryIds.has(memory.id)) score += 3;
    return score;
  };

  const memories = (state.memories || [])
    .map((memory) => ({
      ...memory,
      ...contextMatch(memory, `${memory.text || ""} ${(memory.tags || []).join(" ")} ${memory.locationName || ""} ${memory.npcName || ""}`),
      score:
        scoreText(memory.text, memory.weight || 1) +
        scoreMemoryFacets(memory) +
        Math.max(0, 6 - Math.abs((state.day || 1) - (memory.day || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const memoryTopics = normalizeMemoryTopics(state.memoryTopics, state)
    .map((topic) => ({
      ...topic,
      ...contextMatch(topic, `${topic.title} ${topic.summary} ${(topic.tags || []).join(" ")} ${(topic.evidence || []).join(" ")}`),
      score:
        scoreText(`${topic.title} ${topic.summary} ${(topic.tags || []).join(" ")} ${(topic.evidence || []).join(" ")}`, 2) +
        (topic.actionType === action.type ? 5 : 0) +
        (topic.locationId === action.locationId ? 4 : 0) +
        (topic.npcId && topic.npcId === npcId ? 5 : 0) +
        Math.min(8, Math.round((topic.strength || 0) / 12)) +
        Math.min(6, Math.round((topic.freshness || 50) / 18)) -
        memoryTopicMaintenancePenalty(topic) +
        Math.max(0, 6 - Math.abs((state.day || 1) - (topic.updatedDay || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const skills = normalizeSkills(state.hero?.skills, state)
    .map((skill) => ({
      ...skill,
      ...contextMatch(skill, `${skill.name} ${skill.description} ${(skill.tags || []).join(" ")} ${(skill.evidence || []).join(" ")}`),
      score:
        scoreText(`${skill.name} ${skill.description} ${(skill.tags || []).join(" ")} ${(skill.evidence || []).join(" ")}`, 2) +
        (skill.actionType === action.type ? 10 : 0) +
        Math.min(8, (skill.level || 1) * 2) +
        Math.min(6, Math.round((skill.progress || 0) / 18)) +
        Math.max(0, 5 - Math.abs((state.day || 1) - (skill.updatedDay || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const worldFacts = normalizeWorldFacts(state.worldFacts, state)
    .map((fact) => ({
      ...fact,
      ...contextMatch(fact, `${fact.title} ${fact.text} ${(fact.tags || []).join(" ")} ${(fact.evidence || []).join(" ")}`),
      score:
        scoreText(`${fact.title} ${fact.text} ${(fact.tags || []).join(" ")} ${(fact.evidence || []).join(" ")}`, 2) +
        (fact.actionType === action.type ? 5 : 0) +
        (fact.locationId === action.locationId ? 6 : 0) +
        (fact.npcId && fact.npcId === npcId ? 5 : 0) +
        Math.min(6, Math.round((fact.confidence || 0) / 16)) +
        Math.max(0, 6 - Math.abs((state.day || 1) - (fact.updatedDay || fact.day || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const reflections = (state.reflections || [])
    .map((reflection) => ({
      ...reflection,
      ...contextMatch(reflection, `${reflection.title} ${reflection.text} ${reflection.focus}`),
      score:
        scoreText(`${reflection.title} ${reflection.text} ${reflection.focus}`, 2) +
        Math.max(0, 5 - Math.abs((state.day || 1) - (reflection.day || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const selectedNpc = action.npcId ? state.npcs?.[action.npcId] : null;
  const npcReflections = selectedNpc ? (selectedNpc.reflections || []).slice(-4).reverse() : [];
  const npcBondEvents = selectedNpc ? (selectedNpc.bondEvents || []).slice(-3).reverse() : [];
  const npcQuestLines = selectedNpc
    ? (selectedNpc.questLines || [])
        .filter((quest) => quest.status !== "completed")
        .slice(-4)
        .reverse()
    : [];

  const plans = (state.plans || [])
    .filter((plan) => plan.day === state.day || plan.source === "opening")
    .map((plan) => ({
      ...plan,
      ...contextMatch(plan, `${plan.title} ${plan.intent} ${plan.reason}`),
      score:
        scoreText(`${plan.title} ${plan.intent} ${plan.reason}`, 1) +
        (plan.actionType === action.type ? 4 : 0) +
        (plan.locationId === action.locationId ? 3 : 0) +
        (plan.npcId && plan.npcId === npcId ? 3 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const opportunities = buildActionOpportunities(state)
    .map((opportunity) => ({
      ...opportunity,
      ...contextMatch(opportunity, `${opportunity.title} ${opportunity.intent} ${opportunity.reason} ${(opportunity.tags || []).join(" ")}`),
      score:
        scoreText(`${opportunity.title} ${opportunity.intent} ${opportunity.reason}`, 2) +
        (opportunity.actionType === action.type ? 6 : 0) +
        (opportunity.locationId === action.locationId ? 4 : 0) +
        (opportunity.npcId && opportunity.npcId === npcId ? 5 : 0) +
        Math.min(10, Math.round((opportunity.priority || 0) / 10))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const commitments = normalizeCommitments(state.commitments, state)
    .filter((commitment) => commitment.status === "open")
    .map((commitment) => ({
      ...commitment,
      ...contextMatch(commitment, `${commitment.title} ${commitment.intent} ${commitment.sourceTitle}`),
      score:
        scoreText(`${commitment.title} ${commitment.intent} ${commitment.sourceTitle}`, 2) +
        (commitment.actionType === action.type ? 5 : 0) +
        (commitment.locationId === action.locationId ? 4 : 0) +
        (commitment.npcId && commitment.npcId === npcId ? 5 : 0) +
        Math.max(0, 5 - Math.max(0, (commitment.dueDay || state.day || 1) - (state.day || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const chapters = normalizeChapters(state.chapters, state)
    .map((chapter) => ({
      ...chapter,
      ...contextMatch(chapter, `${chapter.title} ${chapter.premise} ${chapter.objective} ${chapter.currentBeat} ${chapter.nextHook}`),
      score:
        scoreText(`${chapter.title} ${chapter.premise} ${chapter.objective} ${chapter.currentBeat} ${chapter.nextHook}`, 2) +
        (chapter.status === "active" ? 8 : 0) +
        (chapter.actionType === action.type ? 5 : 0) +
        (chapter.locationId === action.locationId ? 4 : 0) +
        (chapter.npcId && chapter.npcId === npcId ? 5 : 0) +
        Math.max(0, 6 - Math.abs((state.day || 1) - (chapter.updatedDay || chapter.startedDay || 1)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return {
    chapters,
    plans,
    opportunities,
    skills,
    worldFacts,
    memoryTopics,
    memories,
    reflections,
    npcReflections,
    npcBondEvents,
    npcQuestLines,
    commitments,
    activeGoals: (state.hero?.goals || []).filter((goal) => !goal.done).slice(0, 4)
  };
}

const CUE_STOP_TERMS = new Set([
  "行动",
  "继续",
  "一次",
  "今天",
  "当前",
  "这里",
  "这个",
  "那个",
  "可以",
  "需要",
  "选择",
  "进行",
  "完成",
  "玩家",
  "星野",
  "新的",
  "主动",
  "相关",
  "第"
]);

function cueTokens(text = "") {
  const value = String(text || "").toLowerCase();
  const tokens = new Set();

  for (const segment of value.split(/[^\p{L}\p{N}_-]+/u)) {
    const token = segment.trim();
    if (token.length >= 2 && !CUE_STOP_TERMS.has(token)) tokens.add(token);
  }

  const cjkRuns = value.match(/[\p{Script=Han}]{2,}/gu) || [];
  for (const run of cjkRuns) {
    if (run.length <= 12 && !CUE_STOP_TERMS.has(run)) tokens.add(run);
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index += 1) {
        const gram = run.slice(index, index + size);
        if (!CUE_STOP_TERMS.has(gram)) tokens.add(gram);
      }
    }
  }

  return [...tokens].slice(0, 96);
}

function scoreCueOverlap(queryTokens = [], candidateTokens = []) {
  if (!queryTokens.length || !candidateTokens.length) {
    return { score: 0, terms: [] };
  }
  const candidateSet = new Set(candidateTokens);
  const terms = [];
  let score = 0;
  for (const token of queryTokens) {
    if (!candidateSet.has(token)) continue;
    const weight = token.length >= 4 ? 3 : token.length === 3 ? 2 : 1;
    score += weight;
    terms.push(token);
  }
  const rankedTerms = terms
    .sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-Hans-CN"))
    .slice(0, 5);
  return {
    score: Math.min(18, score),
    terms: rankedTerms
  };
}

export function deriveWarnings(state) {
  const warnings = [];
  if (state.hero.stats.energy < 28) warnings.push("精力偏低：建议安排休息或低强度社交。");
  if (state.hero.stats.stress > 72) warnings.push("压力偏高：继续高压行动可能让收益变差。");
  if (state.hero.goals.some((goal) => !goal.done && goal.dueDay <= state.day + 1)) {
    warnings.push("有目标临近期限：可以安排一次相关行动推进。");
  }
  if ((state.commitments || []).some((commitment) => commitment.status === "open" && commitment.dueDay <= state.day + 1)) {
    warnings.push("有承诺临近期限：最好把回响里的后续线索兑现掉。");
  }
  if (getActiveChapter(state)?.pressure >= 70) {
    warnings.push("当前篇章压力偏高：继续拖延会让长期线索变得更难收束。");
  }
  return warnings;
}

export function serializeGame(state) {
  return JSON.stringify(state, null, 2);
}

export function importGame(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || parsed.version !== 1 || !parsed.hero || !parsed.npcs || !parsed.diary) {
    throw new Error("存档格式不正确");
  }
  const memories = normalizeStoredMemories(parsed.memories);
  return {
    ...parsed,
    hero: {
      ...parsed.hero,
      skills: normalizeSkills(parsed.hero?.skills, parsed)
    },
    memories,
    worldFacts: normalizeWorldFacts(parsed.worldFacts, { ...parsed, memories }),
    memoryTopics: normalizeMemoryTopics(parsed.memoryTopics, { ...parsed, memories }),
    reflections: Array.isArray(parsed.reflections) ? parsed.reflections : [],
    plans: Array.isArray(parsed.plans) ? parsed.plans : buildDailyPlans(parsed),
    chapters: normalizeChapters(parsed.chapters, parsed),
    continuityTraces: normalizeContinuityTraces(parsed.continuityTraces),
    commitments: normalizeCommitments(parsed.commitments, parsed),
    npcs: normalizeNpcState(parsed.npcs),
    flags: parsed.flags || { completedDays: 0 }
  };
}

function normalizeStatDeltas(deltas = {}) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, clamp(Number(deltas[key] || 0), -12, 12)])
  );
}

function normalizeRelationshipDeltas(deltas = [], state) {
  const knownNpcIds = new Set(Object.keys(state.npcs || {}));
  return (Array.isArray(deltas) ? deltas : [])
    .filter((delta) => knownNpcIds.has(delta.npcId))
    .slice(0, 4)
    .map((delta) => ({
      npcId: delta.npcId,
      affinity: clamp(delta.affinity || 0, -10, 10),
      trust: clamp(delta.trust || 0, -10, 10)
    }));
}

function createMemoryEntry(memory, state, action) {
  return {
    id: cryptoId("memory"),
    day: state.day,
    owner: memory.owner,
    text: memory.text,
    weight: memory.weight,
    actionType: action.type || "",
    actionLabel: action.label || "",
    locationId: action.locationId || "",
    locationName: action.locationName || "",
    npcId: action.npcId || "",
    npcName: action.npcName || "",
    tags: buildMemoryTags(memory, action),
    relatedMemoryIds: [],
    relatedMemoryLabels: []
  };
}

function linkMemoryEntry(entry, existingMemories = []) {
  const related = existingMemories
    .map((memory) => ({
      memory,
      score: scoreMemoryRelation(entry, memory)
    }))
    .filter((item) => item.memory.id && item.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    ...entry,
    relatedMemoryIds: related.map((item) => item.memory.id),
    relatedMemoryLabels: related.map((item) => memoryLinkLabel(item.memory))
  };
}

function scoreMemoryRelation(entry, memory) {
  if (!memory || memory.id === entry.id) return 0;
  const entryTags = new Set(entry.tags || []);
  const sharedTags = (memory.tags || []).filter((tag) => entryTags.has(tag));
  let score = sharedTags.length * 2;
  if (entry.locationId && entry.locationId === memory.locationId) score += 3;
  if (entry.npcId && entry.npcId === memory.npcId) score += 4;
  if (entry.owner && entry.owner === memory.owner) score += 2;
  if (entry.actionType && entry.actionType === memory.actionType) score += 2;
  score += Math.max(0, 4 - Math.abs((entry.day || 1) - (memory.day || 1)));
  return score;
}

function memoryLinkLabel(memory) {
  const owner = memory.owner === "hero"
    ? "星野"
    : memory.owner?.startsWith("npc:")
      ? memory.npcName || memory.owner.slice(4)
      : memory.npcName || memory.owner || "记忆";
  const place = memory.locationName ? ` · ${memory.locationName}` : "";
  return limitText(`第 ${memory.day || 1} 天 · ${owner}${place}`, 48);
}

function buildActionTags(action = {}) {
  return new Set(normalizeTags([
    action.type,
    ACTION_TAG_LABELS[action.type],
    action.presetLabel,
    action.locationName,
    action.npcName,
    action.npcId ? `npc:${action.npcId}` : "",
    ...keywordTagsFor(`${action.label || ""} ${action.customText || ""} ${action.locationName || ""} ${action.npcName || ""}`)
  ]));
}

function buildMemoryTags(memory, action) {
  const ownerTag = memory.owner?.startsWith("npc:") ? "NPC" : "主角";
  return normalizeTags([
    ...(memory.tags || []),
    ownerTag,
    action.type,
    ACTION_TAG_LABELS[action.type],
    action.locationName,
    action.npcName,
    action.npcId ? `npc:${action.npcId}` : "",
    ...keywordTagsFor(`${memory.text || ""} ${action.label || ""} ${action.customText || ""}`)
  ]).slice(0, 10);
}

function keywordTagsFor(text = "") {
  return MEMORY_KEYWORD_TAGS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.tag);
}

function normalizeStoredMemories(memories = []) {
  return (Array.isArray(memories) ? memories : []).slice(-80).map((memory) => {
    const actionType = limitText(memory.actionType || "", 24);
    const locationName = limitText(memory.locationName || "", 40);
    const npcName = limitText(memory.npcName || "", 40);
    const fallbackTags = normalizeTags([
      memory.owner?.startsWith("npc:") ? "NPC" : "主角",
      ACTION_TAG_LABELS[actionType],
      locationName,
      npcName,
      ...keywordTagsFor(memory.text || "")
    ]);

    return {
      id: limitText(memory.id || cryptoId("memory"), 80),
      day: clamp(memory.day || 1, 1, 999),
      owner: limitText(memory.owner || "hero", 40),
      text: limitText(memory.text || "这件事被记了下来。", 180),
      weight: clamp(memory.weight || 1, 1, 5),
      actionType,
      actionLabel: limitText(memory.actionLabel || "", 40),
      locationId: limitText(memory.locationId || "", 40),
      locationName,
      npcId: limitText(memory.npcId || "", 40),
      npcName,
      tags: normalizeTags(memory.tags?.length ? memory.tags : fallbackTags).slice(0, 10),
      relatedMemoryIds: normalizeMemoryIdList(memory.relatedMemoryIds),
      relatedMemoryLabels: normalizeTraceAnchorList(memory.relatedMemoryLabels)
    };
  });
}

function normalizeWorldFacts(facts = [], state = {}) {
  const rawItems = Array.isArray(facts) && facts.length ? facts : buildWorldFactsFromState(state);
  return (Array.isArray(rawItems) ? rawItems : []).slice(-24).map((rawFact) => {
    const fact = rawFact && typeof rawFact === "object" ? rawFact : {};
    const actionType = isKnownActionType(fact.actionType) ? fact.actionType : "";
    const locationId = isKnownLocationId(fact.locationId) ? fact.locationId : "";
    const status = ["observed", "confirmed", "contested"].includes(fact.status) ? fact.status : "observed";
    const day = clamp(fact.day || fact.createdDay || state.day || 1, 1, 999);
    return {
      id: limitText(fact.id || cryptoId("fact"), 80),
      key: limitText(fact.key || fact.id || cryptoId("fact-key"), 100),
      day,
      updatedDay: clamp(fact.updatedDay || day, day, 999),
      title: limitText(fact.title || "世界发现", 64),
      text: limitText(fact.text || "一次行动留下了可追踪的世界知识。", 180),
      locationId,
      locationName: limitText(fact.locationName || (locationId ? findLocation(locationId).name : ""), 40),
      npcId: limitText(fact.npcId || "", 40),
      npcName: limitText(fact.npcName || "", 40),
      actionType,
      tags: normalizeTags(fact.tags || []).slice(0, 8),
      confidence: clamp(fact.confidence || 24, 1, 100),
      status,
      evidence: normalizeTraceAnchorList(fact.evidence).slice(0, 4),
      source: limitText(fact.source || "action", 32)
    };
  });
}

function buildWorldFactsFromState(state = {}) {
  return (state.memories || [])
    .filter((memory) => memory.locationId || memory.npcId || memory.actionType)
    .slice(-8)
    .map((memory) => {
      const actionType = isKnownActionType(memory.actionType) ? memory.actionType : "explore";
      const locationId = isKnownLocationId(memory.locationId) ? memory.locationId : "";
      const key = worldFactKey({
        type: actionType,
        locationId,
        npcId: memory.npcId || ""
      });
      return {
        id: cryptoId("fact"),
        key,
        day: memory.day || state.day || 1,
        updatedDay: memory.day || state.day || 1,
        title: worldFactTitle({ ...memory, type: actionType }),
        text: limitText(memory.text || "这条记忆被整理成世界发现。", 180),
        locationId,
        locationName: memory.locationName || (locationId ? findLocation(locationId).name : ""),
        npcId: memory.npcId || "",
        npcName: memory.npcName || "",
        actionType,
        tags: normalizeTags([
          memory.locationName,
          memory.npcName,
          ACTION_TAG_LABELS[actionType],
          ...(memory.tags || [])
        ]).slice(0, 8),
        confidence: clamp((memory.weight || 1) * 12 + (memory.relatedMemoryIds?.length || 0) * 3 + 18, 1, 100),
        status: "observed",
        evidence: [limitText(memory.text || "", 72)].filter(Boolean),
        source: "memory"
      };
    });
}

function updateWorldFacts(state, action, outcome, memoryEntries = []) {
  const facts = normalizeWorldFacts(state.worldFacts, state);
  const candidate = buildWorldFactFromAction(state, action, outcome, memoryEntries);
  if (!candidate) {
    state.worldFacts = facts;
    return { updatedCount: 0 };
  }

  const index = facts.findIndex((fact) => fact.key === candidate.key);
  if (index >= 0) {
    const existing = facts[index];
    const confidence = clamp((existing.confidence || 0) + 14 + memoryEntries.length * 4, 1, 100);
    const evidence = [...candidate.evidence, ...(existing.evidence || [])]
      .filter(Boolean)
      .filter((item, itemIndex, list) => list.indexOf(item) === itemIndex)
      .slice(0, 4);
    facts[index] = {
      ...existing,
      ...candidate,
      id: existing.id,
      day: existing.day,
      confidence,
      status: confidence >= 70 ? "confirmed" : "observed",
      evidence
    };
  } else {
    facts.push(candidate);
  }

  state.worldFacts = facts
    .sort((a, b) => (b.updatedDay || b.day || 1) - (a.updatedDay || a.day || 1) || (b.confidence || 0) - (a.confidence || 0))
    .slice(-24);
  return { updatedCount: 1 };
}

function buildWorldFactFromAction(state = {}, action = {}, outcome = {}, memoryEntries = []) {
  const actionType = isKnownActionType(action.type) ? action.type : inferActionId(action.label || "");
  const locationId = isKnownLocationId(action.locationId) ? action.locationId : state.currentLocationId || "";
  const locationName = action.locationName || (locationId ? findLocation(locationId).name : "");
  const npcId = action.npcId || "";
  const latestMemory = [...memoryEntries].reverse().find((memory) => memory.owner === "hero") || memoryEntries.at(-1);
  const evidence = [outcome.title, latestMemory?.text, outcome.narration]
    .filter(Boolean)
    .map((item) => limitText(item, 72));
  if (!evidence.length && !locationId && !npcId) return null;
  const tags = normalizeTags([
    locationName,
    action.npcName,
    ACTION_TAG_LABELS[actionType],
    ...(latestMemory?.tags || [])
  ]).slice(0, 8);
  const confidence = clamp(34 + memoryEntries.length * 10 + (outcome.relationshipDeltas?.length || 0) * 5 + (action.customText ? 6 : 0), 1, 100);
  return {
    id: cryptoId("fact"),
    key: worldFactKey({ ...action, type: actionType, locationId, npcId }),
    day: state.day || 1,
    updatedDay: state.day || 1,
    title: worldFactTitle({ ...action, type: actionType, locationName }),
    text: limitText(latestMemory?.text || outcome.narration || outcome.title || "这次行动确认了一条世界线索。", 180),
    locationId,
    locationName,
    npcId,
    npcName: action.npcName || "",
    actionType,
    tags,
    confidence,
    status: confidence >= 70 ? "confirmed" : "observed",
    evidence,
    source: "action"
  };
}

function worldFactKey(action = {}) {
  const actionType = isKnownActionType(action.type) ? action.type : inferActionId(action.label || "");
  return [
    action.locationId || "anywhere",
    action.npcId || "world",
    actionType || "explore"
  ].join(":");
}

function worldFactTitle(action = {}) {
  if (action.npcName) return `${action.npcName}相关发现`;
  if (action.locationName) return `${action.locationName}线索`;
  const label = ACTION_TAG_LABELS[action.type] || action.type || "探索";
  return `${label}发现`;
}

function normalizeSkills(skills = [], state = {}) {
  const rawItems = Array.isArray(skills) && skills.length ? skills : buildDefaultSkills(state);
  return (Array.isArray(rawItems) ? rawItems : []).slice(-12).map((rawSkill) => {
    const skill = rawSkill && typeof rawSkill === "object" ? rawSkill : {};
    const actionType = isKnownActionType(skill.actionType) ? skill.actionType : inferActionId(`${skill.name || ""} ${skill.description || ""}`);
    const definition = SKILL_DEFINITIONS[actionType] || SKILL_DEFINITIONS.explore;
    const level = clamp(skill.level || 1, 1, 5);
    const progress = level >= 5 ? 100 : clamp(skill.progress || 0, 0, 99);
    const totalXp = clamp(skill.totalXp || (level - 1) * 100 + progress, 0, 9999);
    return {
      id: limitText(skill.id || definition.id || cryptoId("skill"), 80),
      name: limitText(skill.name || definition.name || "新能力", 40),
      actionType,
      level,
      progress,
      totalXp,
      description: limitText(skill.description || definition.description || "通过重复行动形成的可复用能力。", 140),
      tags: normalizeTags(skill.tags?.length ? skill.tags : definition.tags).slice(0, 8),
      evidence: normalizeTraceAnchorList(skill.evidence).slice(0, 4),
      updatedDay: clamp(skill.updatedDay || state.day || 1, 1, 999),
      status: limitText(skill.status || skillStatusLabel(level, progress), 24),
      nextMilestone: limitText(skill.nextMilestone || nextSkillMilestone(definition, level, progress), 120)
    };
  });
}

function buildDefaultSkills(state = {}) {
  const day = state.day || 1;
  return ["study", "social", "explore"].map((actionType) => {
    const definition = SKILL_DEFINITIONS[actionType];
    return {
      id: definition.id,
      name: definition.name,
      actionType,
      level: 1,
      progress: actionType === "study" ? 18 : actionType === "social" ? 12 : 10,
      totalXp: actionType === "study" ? 18 : actionType === "social" ? 12 : 10,
      description: definition.description,
      tags: definition.tags,
      evidence: [],
      updatedDay: day,
      status: "练习中",
      nextMilestone: nextSkillMilestone(definition, 1, 10)
    };
  });
}

function advanceSkills(state, action, outcome, memoryEntries = []) {
  const skills = normalizeSkills(state.hero?.skills, state);
  const actionType = isKnownActionType(action.type) ? action.type : inferActionId(action.label || "");
  const definition = SKILL_DEFINITIONS[actionType] || SKILL_DEFINITIONS.explore;
  let updatedCount = 0;
  let levelUps = 0;
  const index = skills.findIndex((skill) => skill.actionType === actionType || skill.id === definition.id);
  const baseSkill = index >= 0 ? skills[index] : {
    id: definition.id,
    name: definition.name,
    actionType,
    level: 1,
    progress: 0,
    totalXp: 0,
    description: definition.description,
    tags: definition.tags,
    evidence: [],
    updatedDay: state.day || 1,
    status: "练习中",
    nextMilestone: nextSkillMilestone(definition, 1, 0)
  };

  const gain = skillProgressGain(action, outcome, memoryEntries);
  let level = baseSkill.level || 1;
  let progress = (baseSkill.progress || 0) + gain;
  while (progress >= 100 && level < 5) {
    level += 1;
    progress -= 100;
    levelUps += 1;
  }
  if (level >= 5) progress = 100;

  const evidence = [
    outcome.title,
    memoryEntries.at(-1)?.text,
    ...(baseSkill.evidence || [])
  ].filter(Boolean)
    .map((item) => limitText(item, 72))
    .filter((item, itemIndex, list) => list.indexOf(item) === itemIndex)
    .slice(0, 4);

  const nextSkill = {
    ...baseSkill,
    id: baseSkill.id || definition.id,
    name: baseSkill.name || definition.name,
    actionType,
    level,
    progress: clamp(progress, 0, level >= 5 ? 100 : 99),
    totalXp: clamp((baseSkill.totalXp || 0) + gain, 0, 9999),
    description: baseSkill.description || definition.description,
    tags: normalizeTags([...(baseSkill.tags || []), ...(definition.tags || []), action.locationName, action.npcName]).slice(0, 8),
    evidence,
    updatedDay: state.day || 1,
    status: skillStatusLabel(level, progress),
    nextMilestone: nextSkillMilestone(definition, level, progress)
  };

  if (index >= 0) {
    skills[index] = nextSkill;
  } else {
    skills.push(nextSkill);
  }
  updatedCount = 1;
  state.hero.skills = skills
    .sort((a, b) => (b.level || 1) - (a.level || 1) || (b.progress || 0) - (a.progress || 0))
    .slice(0, 12);
  return { updatedCount, levelUps };
}

function skillProgressGain(action = {}, outcome = {}, memoryEntries = []) {
  const positiveStats = Object.values(outcome.statDeltas || {}).filter((value) => value > 0)
    .reduce((total, value) => total + value, 0);
  return clamp(
    9 +
      Math.min(8, positiveStats) +
      memoryEntries.length * 4 +
      (action.customText ? 4 : 0) +
      (outcome.newGoal ? 3 : 0),
    6,
    32
  );
}

function skillStatusLabel(level = 1, progress = 0) {
  if (level >= 5) return "熟练";
  if (progress >= 75) return "突破中";
  if (level >= 3) return "稳定";
  return "练习中";
}

function nextSkillMilestone(definition = {}, level = 1, progress = 0) {
  if (level >= 5) return `${definition.name || "这项能力"}已经可以稳定支撑复杂行动。`;
  const needed = Math.max(1, 100 - clamp(progress, 0, 99));
  return `还需要约 ${needed} 点经验，${definition.name || "这项能力"}会进入下一阶段。`;
}

function normalizeMemoryTopics(topics = [], state = {}) {
  const rawItems = Array.isArray(topics) && topics.length ? topics : buildMemoryTopics(state);
  const memoryById = new Map((state.memories || []).map((memory) => [memory.id, memory]));
  return (Array.isArray(rawItems) ? rawItems : []).slice(-12).map((rawTopic) => {
    const topic = rawTopic && typeof rawTopic === "object" ? rawTopic : {};
    const actionType = isKnownActionType(topic.actionType) ? topic.actionType : "";
    const locationId = isKnownLocationId(topic.locationId) ? topic.locationId : "";
    const memoryIds = normalizeMemoryIdList(topic.memoryIds).slice(0, 8);
    const normalized = {
      id: limitText(topic.id || cryptoId("topic"), 80),
      key: limitText(topic.key || topic.id || cryptoId("topic-key"), 80),
      title: limitText(topic.title || "记忆主题", 48),
      summary: limitText(topic.summary || "相关记忆已经被整理成一个主题。", 180),
      tags: normalizeTags(topic.tags || []).slice(0, 8),
      memoryIds,
      evidence: normalizeTraceAnchorList(topic.evidence).slice(0, 4),
      count: clamp(topic.count || topic.memoryIds?.length || 0, 0, 80),
      strength: clamp(topic.strength || 1, 1, 100),
      createdDay: clamp(topic.createdDay || 1, 1, 999),
      updatedDay: clamp(topic.updatedDay || topic.createdDay || 1, 1, 999),
      actionType,
      locationId,
      npcId: limitText(topic.npcId || "", 40),
      source: limitText(topic.source || "memory", 32)
    };
    const relatedMemories = memoryIds.map((id) => memoryById.get(id)).filter(Boolean);
    return {
      ...normalized,
      ...assessMemoryTopicMaintenance(normalized, state, relatedMemories)
    };
  });
}

function updateMemoryTopics(state) {
  return buildMemoryTopics(state, normalizeMemoryTopics(state.memoryTopics, state));
}

function buildMemoryTopics(state = {}, previousTopics = []) {
  const previousByKey = new Map((previousTopics || []).map((topic) => [topic.key, topic]));
  const groups = new Map();
  for (const memory of state.memories || []) {
    const key = topicKeyForMemory(memory);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(memory);
  }

  return [...groups.entries()]
    .map(([key, memories]) => topicFromMemories(key, memories, previousByKey.get(key), state))
    .sort((a, b) => b.strength - a.strength || b.updatedDay - a.updatedDay)
    .slice(0, 12);
}

function topicKeyForMemory(memory = {}) {
  if ((memory.tags || []).includes("承诺")) return "commitments";
  if (memory.npcId || memory.owner?.startsWith("npc:")) return `npc:${memory.npcId || memory.owner.slice(4)}`;
  if (memory.locationId) return `location:${memory.locationId}`;
  if (memory.actionType && memory.actionType !== "opening") return `action:${memory.actionType}`;
  const tag = (memory.tags || []).find((item) => item && !item.startsWith("npc:") && !/^[a-z0-9_-]+$/i.test(item));
  return tag ? `tag:${tag}` : "general";
}

function topicFromMemories(key, memories = [], previousTopic = null, state = {}) {
  const sorted = [...memories].sort((a, b) => (a.day || 1) - (b.day || 1));
  const latest = sorted.at(-1) || {};
  const title = topicTitleForMemoryGroup(key, sorted);
  const tags = topTopicTags(sorted);
  const evidence = sorted
    .slice(-4)
    .map((memory) => memory.text)
    .filter(Boolean)
    .map((text) => limitText(text, 72));
  const strength = clamp(
    sorted.reduce((total, memory) => total + (memory.weight || 1) * 8 + (memory.relatedMemoryIds?.length || 0) * 2, 0) +
      sorted.length * 4,
    1,
    100
  );

  const topic = {
    id: previousTopic?.id || cryptoId("topic"),
    key,
    title,
    summary: `围绕「${title}」已经积累 ${sorted.length} 条记忆，最新证据是：${limitText(latest.text || "暂无", 72)}`,
    tags,
    memoryIds: sorted.slice(-8).map((memory) => memory.id).filter(Boolean),
    evidence,
    count: sorted.length,
    strength,
    createdDay: sorted[0]?.day || previousTopic?.createdDay || 1,
    updatedDay: latest.day || previousTopic?.updatedDay || 1,
    actionType: latest.actionType || previousTopic?.actionType || "",
    locationId: latest.locationId || previousTopic?.locationId || "",
    npcId: latest.npcId || previousTopic?.npcId || "",
    source: "memory"
  };
  return {
    ...topic,
    ...assessMemoryTopicMaintenance(topic, state, sorted)
  };
}

function assessMemoryTopicMaintenance(topic = {}, state = {}, memories = []) {
  const currentDay = clamp(state.day || topic.updatedDay || topic.createdDay || 1, 1, 999);
  const updatedDay = clamp(topic.updatedDay || topic.createdDay || currentDay, 1, 999);
  const ageDays = Math.max(0, currentDay - updatedDay);
  const staleEvidenceCount = (Array.isArray(memories) && memories.length ? memories : [])
    .filter((memory) => currentDay - (memory.day || updatedDay) >= 6).length;
  const revisionSignalCount = (Array.isArray(memories) ? memories : []).filter(isRevisionMemory).length;
  let freshness = clamp(
    100 - ageDays * 12 - Math.max(0, staleEvidenceCount - 1) * 5 + Math.min(12, (topic.count || 0) * 2),
    1,
    100
  );
  let maintenanceStatus = "active";
  let maintenanceLabel = "可引用";
  let maintenanceReason = `最新证据来自第 ${updatedDay} 天，仍适合作为当前行动依据。`;
  let nextMaintenanceAction = "继续用新行动补充证据。";

  if (revisionSignalCount > 0) {
    maintenanceStatus = "revised";
    maintenanceLabel = "已改写";
    freshness = clamp(Math.max(freshness, 64), 1, 100);
    maintenanceReason = `包含 ${revisionSignalCount} 条兑现、错过、修复或结算证据，引用时应优先采用最新证据。`;
    nextMaintenanceAction = "对照最新证据解释主题，不要复述旧状态。";
  } else if (ageDays >= 7 || freshness <= 35) {
    maintenanceStatus = "stale";
    maintenanceLabel = "需复核";
    maintenanceReason = `已有 ${ageDays} 天没有新证据，导演层应先寻找更新证据再使用。`;
    nextMaintenanceAction = "安排一次相关行动来确认这条记忆是否仍然成立。";
  } else if (ageDays >= 4 || staleEvidenceCount >= 3) {
    maintenanceStatus = "watch";
    maintenanceLabel = "观察中";
    maintenanceReason = `已有 ${ageDays} 天没有新证据，引用时需要结合最近行动判断。`;
    nextMaintenanceAction = "用下一次相关行动刷新或修正主题。";
  }

  return {
    freshness,
    maintenanceStatus,
    maintenanceLabel,
    maintenanceReason: limitText(maintenanceReason, 120),
    nextMaintenanceAction: limitText(nextMaintenanceAction, 120),
    staleEvidenceCount: clamp(staleEvidenceCount, 0, 80),
    ageDays: clamp(ageDays, 0, 999)
  };
}

function isRevisionMemory(memory = {}) {
  const text = `${memory.text || ""} ${(memory.tags || []).join(" ")}`;
  return /兑现|错过|完成|修复|结算|压力|改变|不再|新的信任|失约|搁置/u.test(text);
}

function memoryTopicMaintenancePenalty(topic = {}) {
  if (topic.maintenanceStatus === "stale") return 9;
  if (topic.maintenanceStatus === "watch") return 4;
  return 0;
}

function topicTitleForMemoryGroup(key, memories = []) {
  const latest = memories.at(-1) || {};
  if (key === "commitments") return "承诺与兑现";
  if (key.startsWith("npc:")) return `${latest.npcName || "同伴"}的关系记忆`;
  if (key.startsWith("location:")) return `${latest.locationName || "地点"}线索`;
  if (key.startsWith("action:")) return `${ACTION_TAG_LABELS[latest.actionType] || latest.actionType || "行动"}主题`;
  if (key.startsWith("tag:")) return key.slice(4);
  return "综合记忆";
}

function topTopicTags(memories = []) {
  const counts = new Map();
  for (const memory of memories) {
    for (const tag of memory.tags || []) {
      if (!tag || tag.startsWith("npc:")) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, 8)
    .map(([tag]) => tag);
}

function normalizeCommitments(commitments = [], state = {}) {
  return (Array.isArray(commitments) ? commitments : []).slice(-12).map((rawCommitment) => {
    const commitment = rawCommitment && typeof rawCommitment === "object" ? rawCommitment : {};
    const actionType = isKnownActionType(commitment.actionType) ? commitment.actionType : inferActionId(commitment.intent || commitment.title || "");
    const locationId = isKnownLocationId(commitment.locationId)
      ? commitment.locationId
      : locationForAction(actionType, state);
    const status = ["open", "fulfilled", "missed"].includes(commitment.status) ? commitment.status : "open";
    const day = clamp(commitment.day || state.day || 1, 1, 999);
    const dueDay = clamp(commitment.dueDay || day + 3, day, 999);
    return {
      id: limitText(commitment.id || cryptoId("commitment"), 80),
      day,
      dueDay,
      title: limitText(commitment.title || "新的承诺", 48),
      intent: limitText(commitment.intent || commitment.title || "继续跟进这条线索。", 160),
      sourceTitle: limitText(commitment.sourceTitle || "", 60),
      actionType,
      locationId,
      npcId: limitText(commitment.npcId || "", 40),
      npcName: limitText(commitment.npcName || "", 40),
      status,
      progress: status === "fulfilled" ? 100 : clamp(commitment.progress || 0),
      pressure: clamp(commitment.pressure || 0),
      fulfilledDay: commitment.fulfilledDay ? clamp(commitment.fulfilledDay, 1, 999) : null,
      missedDay: commitment.missedDay ? clamp(commitment.missedDay, 1, 999) : null,
      resolution: limitText(commitment.resolution || "", 120)
    };
  });
}

function normalizeChapters(chapters = [], state = {}) {
  const rawItems = Array.isArray(chapters) && chapters.length ? chapters : [createOpeningChapter(state)];
  const normalized = rawItems.slice(-6).map((rawChapter) => {
    const chapter = rawChapter && typeof rawChapter === "object" ? rawChapter : {};
    const actionType = isKnownActionType(chapter.actionType)
      ? chapter.actionType
      : inferPlanAction(`${chapter.title || ""} ${chapter.objective || ""} ${chapter.nextHook || ""}`);
    const locationId = isKnownLocationId(chapter.locationId)
      ? chapter.locationId
      : locationForAction(actionType, state);
    const status = chapter.status === "completed" ? "completed" : "active";
    const startedDay = clamp(chapter.startedDay || chapter.day || state.day || 1, 1, 999);
    return {
      id: limitText(chapter.id || cryptoId("chapter"), 80),
      title: limitText(chapter.title || "新的篇章", 48),
      premise: limitText(chapter.premise || "一段新的长期线索正在形成。", 160),
      objective: limitText(chapter.objective || "把当前最重要的线索推进到可验证的下一步。", 160),
      currentBeat: limitText(chapter.currentBeat || chapter.objective || "先确认当下最值得投入的方向。", 160),
      nextHook: limitText(chapter.nextHook || chapter.objective || "用一次具体行动推进这段篇章。", 160),
      constraint: limitText(chapter.constraint || "保持节奏，让选择由记忆和关系共同证明。", 140),
      evidence: normalizeTraceAnchorList(chapter.evidence).slice(-5),
      actionType,
      locationId,
      npcId: limitText(chapter.npcId || "", 40),
      status,
      startedDay,
      updatedDay: clamp(chapter.updatedDay || startedDay, startedDay, 999),
      completedDay: chapter.completedDay ? clamp(chapter.completedDay, startedDay, 999) : null,
      progress: status === "completed" ? 100 : clamp(chapter.progress || 0),
      pressure: clamp(chapter.pressure || 0),
      source: limitText(chapter.source || "system", 32)
    };
  });

  if (!normalized.some((chapter) => chapter.status === "active")) {
    normalized.push(createChapterFromState(state, normalized.at(-1)));
  }
  return normalized.slice(-6);
}

function createOpeningChapter(state = {}) {
  return {
    id: cryptoId("chapter"),
    title: "初到星港",
    premise: "星野刚抵达星港学院，需要在环境、同伴和自身方向之间建立第一条稳定线索。",
    objective: "找到一个值得连续投入的方向，并让至少一位同伴成为可信的观察者。",
    currentBeat: "先把星港看清楚，再决定把精力投向哪里。",
    nextHook: "围绕观测塔资料、旧码头传闻或同伴观察开启一次能留下证据的行动。",
    constraint: "不要过早跳到结论；让记忆、承诺和关系逐步证明方向。",
    evidence: ["开局目标", "第一条自我观察"],
    actionType: "study",
    locationId: "observatory",
    npcId: "",
    status: "active",
    startedDay: state.day || 1,
    updatedDay: state.day || 1,
    completedDay: null,
    progress: 12,
    pressure: 0,
    source: "opening"
  };
}

function advanceChapters(state, completedDay = state.day) {
  const chapters = normalizeChapters(state.chapters, state);
  let activeIndex = chapters.findIndex((chapter) => chapter.status === "active");
  if (activeIndex < 0) {
    chapters.push(createChapterFromState(state, chapters.at(-1)));
    activeIndex = chapters.length - 1;
  }

  const active = chapters[activeIndex];
  const updated = {
    ...active,
    ...buildChapterUpdate(state, active, completedDay)
  };
  const hasEnoughTime = completedDay - (updated.startedDay || completedDay) >= 2;
  const shouldComplete = updated.progress >= 100 || (hasEnoughTime && updated.progress >= 72);

  if (shouldComplete) {
    const completed = {
      ...updated,
      status: "completed",
      progress: 100,
      pressure: Math.max(0, Math.round((updated.pressure || 0) * 0.45)),
      completedDay,
      currentBeat: `已收束：${updated.currentBeat}`,
      nextHook: "从这段篇章留下的证据中开启下一段长期线索。"
    };
    chapters[activeIndex] = completed;
    chapters.push(createChapterFromState(state, completed));
  } else {
    chapters[activeIndex] = updated;
  }

  return normalizeChapters(chapters, state);
}

function buildChapterUpdate(state, chapter, completedDay) {
  const seed = pickChapterSeed(state);
  return {
    objective: seed.objective || chapter.objective,
    currentBeat: seed.currentBeat || chapter.currentBeat,
    nextHook: seed.nextHook || chapter.nextHook,
    constraint: seed.constraint || chapter.constraint,
    evidence: mergeChapterEvidence(chapter.evidence, state, seed),
    actionType: seed.actionType || chapter.actionType,
    locationId: seed.locationId || chapter.locationId,
    npcId: seed.npcId || chapter.npcId || "",
    updatedDay: completedDay,
    progress: clamp((chapter.progress || 0) + chapterProgressGain(state)),
    pressure: chapterPressure(state, chapter)
  };
}

function createChapterFromState(state, previousChapter = null) {
  const seed = pickChapterSeed(state);
  return {
    id: cryptoId("chapter"),
    title: seed.title || (previousChapter ? "下一段星港线索" : "初到星港"),
    premise: seed.premise || "上一段经历已经留下证据，新的长期线索正在浮现。",
    objective: seed.objective || "把当前最重要的线索推进到可验证的下一步。",
    currentBeat: seed.currentBeat || "先确认这段篇章真正关心的冲突。",
    nextHook: seed.nextHook || "选择一次能留下证据的行动，开启新的篇章推进。",
    constraint: seed.constraint || "保留探索空间，但不要脱离已经建立的记忆、承诺和关系。",
    evidence: mergeChapterEvidence([], state, seed),
    actionType: seed.actionType || "study",
    locationId: seed.locationId || locationForAction(seed.actionType || "study", state),
    npcId: seed.npcId || "",
    status: "active",
    startedDay: state.day || 1,
    updatedDay: state.day || 1,
    completedDay: null,
    progress: 8,
    pressure: seed.pressure || 0,
    source: seed.source || "chapter"
  };
}

function pickChapterSeed(state) {
  const openCommitment = normalizeCommitments(state.commitments, state)
    .filter((commitment) => commitment.status === "open")
    .sort((a, b) => (a.dueDay || 999) - (b.dueDay || 999))[0];
  if (openCommitment) {
    return {
      title: `承诺线：${openCommitment.title}`,
      premise: `玩家已经把「${openCommitment.title}」变成承诺，后续行动会决定它是信任还是裂痕。`,
      objective: `在第 ${openCommitment.dueDay} 天前回应：${openCommitment.intent}`,
      currentBeat: `承诺仍在等待兑现：${openCommitment.intent}`,
      nextHook: openCommitment.intent,
      constraint: "如果继续拖延，这条线索会产生关系或自我叙事成本。",
      actionType: openCommitment.actionType,
      locationId: openCommitment.locationId,
      npcId: openCommitment.npcId || "",
      pressure: openCommitment.pressure || 0,
      source: "commitment"
    };
  }

  const quest = pickNpcQuestForPlan(state);
  if (quest) {
    return {
      title: `羁绊线：${quest.npcName || "同伴"}`,
      premise: `${quest.npcName || "同伴"}的关系任务已经展开，需要通过行动证明这段关系的方向。`,
      objective: quest.intent,
      currentBeat: quest.currentStep || quest.intent,
      nextHook: quest.currentStep || quest.intent,
      constraint: quest.risk || "推进时要照顾对方的顾虑，不要只追求进度。",
      actionType: quest.actionType || "social",
      locationId: quest.locationId || locationForAction(quest.actionType || "social", state),
      npcId: quest.npcId || "",
      pressure: quest.pressure || 0,
      source: "bond"
    };
  }

  const activeGoal = (state.hero?.goals || []).filter((goal) => !goal.done)
    .sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];
  if (activeGoal) {
    const actionType = inferPlanAction(activeGoal.text);
    return {
      title: "目标线：自我方向",
      premise: "星野的长期目标已经开始成形，需要用连续行动把它从愿望变成证据。",
      objective: activeGoal.text,
      currentBeat: `当前目标进度 ${activeGoal.progress || 0}%，期限是第 ${activeGoal.dueDay} 天。`,
      nextHook: `围绕「${activeGoal.text}」安排一次具体行动`,
      constraint: "目标推进要兼顾压力和精力，不要把成长变成透支。",
      actionType,
      locationId: locationForAction(actionType, state),
      npcId: "",
      pressure: activeGoal.dueDay <= (state.day || 1) + 1 ? 55 : 15,
      source: "goal"
    };
  }

  const reflection = [...(state.reflections || [])].reverse()[0];
  if (reflection) {
    const actionType = inferPlanAction(reflection.focus || reflection.text || "");
    return {
      title: `洞察线：${reflection.focus || "新的自我观察"}`,
      premise: reflection.text || "今日洞察正在形成下一段行动的主题。",
      objective: `验证「${reflection.focus || reflection.title}」是否能成为长期方向。`,
      currentBeat: reflection.title || "把今日洞察转化成行动。",
      nextHook: `围绕「${reflection.focus || reflection.title}」继续行动`,
      constraint: "不要重复同一段内心独白；用外部行动验证它。",
      actionType,
      locationId: locationForAction(actionType, state),
      npcId: "",
      pressure: 0,
      source: "reflection"
    };
  }

  return {
    title: "星港线：新的外部变化",
    premise: "星港仍有未被观察到的变化，适合用一次行动打开新的长期线索。",
    objective: "找到一个能进入记忆、关系或目标系统的外部事件。",
    currentBeat: "先制造一条足够具体的线索。",
    nextHook: "去旧码头或观测塔追踪一条新的传闻",
    constraint: "开放式探索仍需要留下可追踪的证据。",
    actionType: "explore",
    locationId: locationForAction("explore", state),
    npcId: "",
    pressure: 0,
    source: "world"
  };
}

function chapterProgressGain(state) {
  const trace = state.continuityTraces?.at(-1);
  const signals = trace?.signals || {};
  return clamp(
    14 +
      Math.min(8, signals.memoryWrites || 0) +
      Math.min(6, signals.retrievedMemories || 0) +
      Math.min(8, (signals.npcQuestLinesProgressed || 0) * 4) +
      Math.min(8, (signals.commitmentsFulfilled || 0) * 8) +
      Math.min(6, signals.progressedGoals || 0),
    8,
    34
  );
}

function chapterPressure(state, chapter) {
  const stats = state.hero?.stats || {};
  const dueCommitment = normalizeCommitments(state.commitments, state)
    .some((commitment) => commitment.status === "open" && commitment.dueDay <= (state.day || 1) + 1);
  const urgentQuest = getAllNpcQuestLines(state)
    .some((quest) => quest.status !== "completed" && ((quest.pressure || 0) >= 65 || quest.dueDay <= (state.day || 1) + 1));
  const pressureDelta =
    (stats.stress || 0) > 70 || dueCommitment || urgentQuest
      ? 18
      : (stats.energy || 0) < 32
        ? 10
        : -8;
  return clamp((chapter.pressure || 0) + pressureDelta);
}

function mergeChapterEvidence(existing = [], state, seed = {}) {
  const evidence = [
    ...existing,
    seed.currentBeat,
    seed.nextHook,
    state.reflections?.at(-1)?.title,
    state.memories?.at(-1)?.text,
    state.continuityTraces?.at(-1)?.summary
  ].filter(Boolean);
  const seen = new Set();
  return evidence
    .map((item) => limitText(item, 72))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(-5);
}

function getActiveChapter(state = {}) {
  return normalizeChapters(state.chapters, state).find((chapter) => chapter.status === "active") || null;
}

function createCommitmentFromChoice(state, choice = {}, context = {}) {
  const intent = limitText(choice.intent || choice.label || "继续跟进这条线索。", 160);
  const actionType = isKnownActionType(context.actionType) ? context.actionType : inferActionId(`${choice.label || ""} ${intent}`);
  const locationId = isKnownLocationId(context.locationId) ? context.locationId : locationForAction(actionType, state);
  const npc = context.npcId ? state.npcs?.[context.npcId] : null;
  return {
    id: cryptoId("commitment"),
    day: clamp(state.day || 1, 1, 999),
    dueDay: clamp((state.day || 1) + 3, (state.day || 1) + 1, 999),
    title: limitText(choice.label || "后续承诺", 48),
    intent,
    sourceTitle: limitText(context.sourceTitle || "", 60),
    actionType,
    locationId,
    npcId: context.npcId || "",
    npcName: npc?.name || "",
    status: "open",
    progress: 0,
    pressure: 0,
    fulfilledDay: null,
    missedDay: null,
    resolution: "从回响中记录下来的后续承诺。"
  };
}

function advanceCommitments(state, action) {
  let fulfilledCount = 0;
  let missedCount = 0;
  let memoryWriteCount = 0;
  let memoryLinkCount = 0;
  state.commitments = normalizeCommitments(state.commitments, state).map((commitment) => {
    if (commitment.status !== "open") return commitment;
    const matchScore = scoreCommitmentMatch(commitment, action);
    if (matchScore >= 52) {
      fulfilledCount += 1;
      const effect = applyCommitmentEffect(state, commitment, action, "fulfilled");
      memoryWriteCount += effect.memoryWriteCount;
      memoryLinkCount += effect.memoryLinkCount;
      return {
        ...commitment,
        status: "fulfilled",
        progress: 100,
        pressure: 0,
        fulfilledDay: state.day,
        resolution: `已通过「${action.label}」兑现。`
      };
    }

    if ((state.day || 1) > (commitment.dueDay || state.day || 1)) {
      missedCount += 1;
      const effect = applyCommitmentEffect(state, commitment, action, "missed");
      memoryWriteCount += effect.memoryWriteCount;
      memoryLinkCount += effect.memoryLinkCount;
      return {
        ...commitment,
        status: "missed",
        pressure: 100,
        missedDay: state.day,
        resolution: `第 ${commitment.dueDay} 天前没有回应，承诺被记为错过。`
      };
    }

    const daysLeft = Math.max(0, (commitment.dueDay || state.day || 1) - (state.day || 1));
    return {
      ...commitment,
      progress: Math.max(commitment.progress || 0, matchScore >= 30 ? 45 : 0),
      pressure: daysLeft === 0 ? 65 : daysLeft === 1 ? 35 : commitment.pressure || 0
    };
  }).slice(-12);

  return { fulfilledCount, missedCount, memoryWriteCount, memoryLinkCount };
}

function applyCommitmentEffect(state, commitment, action, status) {
  const npc = commitment.npcId ? state.npcs?.[commitment.npcId] : null;
  if (npc) {
    const trustDelta = status === "fulfilled" ? 2 : -2;
    const affinityDelta = status === "fulfilled" ? 1 : -1;
    npc.trust = clamp((npc.trust || 0) + trustDelta);
    npc.affinity = clamp((npc.affinity || 0) + affinityDelta);
    npc.relationshipStage = relationshipStageFor(npc);
    npc.stance = stanceFor(npc);
  }
  return recordCommitmentMemory(state, commitment, action, status, npc);
}

function recordCommitmentMemory(state, commitment, action, status, npc) {
  const location = commitment.locationId ? state.locations?.[commitment.locationId] : null;
  const commitmentAction = {
    ...action,
    type: commitment.actionType || action.type || "",
    locationId: commitment.locationId || action.locationId || "",
    locationName: location?.name || action.locationName || "",
    npcId: commitment.npcId || action.npcId || "",
    npcName: commitment.npcName || npc?.name || action.npcName || ""
  };
  const npcLabel = commitmentAction.npcName || "对方";
  const owner = npc ? `npc:${npc.id}` : "hero";
  const text = status === "fulfilled"
    ? `${npc ? npcLabel : "星野"}记得星野兑现了「${commitment.title}」：${commitment.intent}`
    : `${npc ? npcLabel : "星野"}记得星野错过了「${commitment.title}」，这让后续信任变得更脆弱。`;
  const entry = linkMemoryEntry(
    createMemoryEntry({
      owner,
      text,
      weight: status === "fulfilled" ? 3 : 4,
      tags: ["承诺", status === "fulfilled" ? "兑现" : "错过"]
    }, state, commitmentAction),
    state.memories || []
  );

  state.memories = [...(state.memories || []), entry].slice(-80);
  if (npc) {
    npc.memories = [...(npc.memories || []), entry.text].slice(-8);
  }

  return {
    memoryWriteCount: 1,
    memoryLinkCount: entry.relatedMemoryIds?.length || 0
  };
}

function scoreCommitmentMatch(commitment, action) {
  const actionText = normalizeCompareText(`${action.label || ""} ${action.customText || ""} ${action.presetLabel || ""}`);
  const commitmentIntent = normalizeCompareText(commitment.intent || "");
  const commitmentText = normalizeCompareText(`${commitment.title || ""} ${commitment.intent || ""}`);
  let score = 0;
  if (commitment.actionType && commitment.actionType === action.type) score += 24;
  if (commitment.locationId && commitment.locationId === action.locationId) score += 12;
  if (commitment.npcId && commitment.npcId === action.npcId) score += 18;
  if (commitmentIntent && actionText && (actionText.includes(commitmentIntent) || commitmentIntent.includes(actionText))) {
    score += 58;
  }
  if (actionText && commitmentText && (actionText.includes(commitmentText) || commitmentText.includes(actionText))) {
    score += 54;
  }
  for (const token of textTokens(commitmentText)) {
    if (actionText.includes(token)) score += 8;
  }
  return score;
}

function normalizeCompareText(text = "") {
  return String(text).replace(/\s+/g, "").trim();
}

function textTokens(text = "") {
  const tokens = new Set();
  for (const token of String(text).split(/[，。！？；：、,.!?;:\s「」《》（）()]+/u)) {
    const value = token.trim();
    if (value.length >= 2) tokens.add(value);
  }
  if (!tokens.size && text.length >= 6) {
    for (let index = 0; index < text.length - 3; index += 4) {
      tokens.add(text.slice(index, index + 4));
    }
  }
  return [...tokens].slice(0, 6);
}

function normalizeMemoryIdList(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 6).map((item) => limitText(item, 96));
}

function normalizeTags(tags = []) {
  const seen = new Set();
  const normalized = [];
  for (const rawTag of Array.isArray(tags) ? tags : []) {
    const tag = limitText(String(rawTag || "").replace(/\s+/g, " ").trim(), 18);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

function updateNpcSocialModels(state, action, outcome) {
  const previous = Object.fromEntries(
    Object.entries(state.npcs || {}).map(([id, npc]) => [
      id,
      {
        stage: npc.relationshipStage || relationshipStageFor(npc),
        hiddenGoalRevealed: Boolean(npc.hiddenGoalRevealed)
      }
    ])
  );

  for (const npc of Object.values(state.npcs || {})) {
    npc.relationshipStage = relationshipStageFor(npc);
    npc.stance = stanceFor(npc);
  }

  if (!action.npcId || !state.npcs[action.npcId]) return;
  const npc = state.npcs[action.npcId];
  const relationshipDelta = outcome.relationshipDeltas.find((delta) => delta.npcId === action.npcId);
  const previousStage = previous[action.npcId]?.stage || "初识";
  const stageChanged = previousStage !== npc.relationshipStage;
  const shouldRevealHiddenGoal = !previous[action.npcId]?.hiddenGoalRevealed && shouldRevealNpcHiddenGoal(npc);

  if (shouldRevealHiddenGoal) {
    npc.hiddenGoalRevealed = true;
  }

  const bondEvents = [];
  if (stageChanged) {
    bondEvents.push(createBondEvent(npc, previousStage, action, "stage", state.day));
  }
  if (shouldRevealHiddenGoal) {
    bondEvents.push(createBondEvent(npc, previousStage, action, "hidden-goal", state.day));
  }
  if (bondEvents.length) {
    npc.bondEvents = [...(Array.isArray(npc.bondEvents) ? npc.bondEvents : []), ...bondEvents].slice(-10);
    npc.questLines = upsertQuestLinesFromBondEvents(npc.questLines, bondEvents, npc, state.day);
  }

  const title = relationshipDelta && (relationshipDelta.trust > 0 || relationshipDelta.affinity > 0)
    ? "关系向前挪了一步"
    : "保留一点观察";
  const text = relationshipDelta
    ? `${npc.name}把这次「${action.label}」记成了${npc.stance}的证据：好感 ${formatDelta(relationshipDelta.affinity)}，信任 ${formatDelta(relationshipDelta.trust)}。${shouldRevealHiddenGoal ? ` ${npc.name}也第一次提到：${npc.hiddenGoal}。` : ""}`
    : `${npc.name}注意到星野这次选择了「${action.label}」，但还没有急着改变判断。`;

  npc.reflections = [
    ...(Array.isArray(npc.reflections) ? npc.reflections : []),
    {
      id: cryptoId("npc-reflection"),
      day: state.day,
      title,
      text,
      stage: npc.relationshipStage,
      stance: npc.stance,
      hiddenGoalRevealed: Boolean(npc.hiddenGoalRevealed),
      source: action.id
    }
  ].slice(-12);
}

function normalizeNpcState(npcs = {}) {
  return Object.fromEntries(
    Object.entries(npcs).map(([id, npc]) => {
      const base = findNpc(id);
      const normalized = {
        ...npc,
        memories: Array.isArray(npc.memories) ? npc.memories : [],
        reflections: Array.isArray(npc.reflections) ? npc.reflections : []
      };
      normalized.hiddenGoal = npc.hiddenGoal || base?.hiddenGoal || "";
      normalized.concern = npc.concern || base?.concern || "";
      normalized.hiddenGoalRevealed = Boolean(npc.hiddenGoalRevealed);
      normalized.relationshipStage = npc.relationshipStage || relationshipStageFor(normalized);
      normalized.stance = npc.stance || stanceFor(normalized);
      normalized.bondEvents = normalizeBondEvents(npc.bondEvents, normalized);
      normalized.questLines = normalizeNpcQuestLines(npc.questLines, normalized);
      return [id, normalized];
    })
  );
}

function normalizeNpcQuestLines(questLines = [], npc = {}) {
  return (Array.isArray(questLines) ? questLines : []).slice(-8).map((rawQuest) => {
    const quest = rawQuest && typeof rawQuest === "object" ? rawQuest : {};
    const actionType = isKnownActionType(quest.actionType) ? quest.actionType : "social";
    const locationId = isKnownLocationId(quest.locationId) ? quest.locationId : locationForBondAction(actionType);
    const progress = clamp(quest.progress || 0);
    const pressure = clamp(quest.pressure || 0);
    const status = quest.status === "completed" || progress >= 100
      ? "completed"
      : quest.status === "strained" || pressure >= 80
        ? "strained"
        : "active";
    const steps = normalizeQuestSteps(quest.steps, progress);
    const createdDay = clamp(quest.createdDay || 1, 1, 999);
    const updatedDay = clamp(quest.updatedDay || quest.createdDay || 1, 1, 999);
    const normalized = {
      id: limitText(quest.id || cryptoId("quest"), 80),
      sourceEventId: limitText(quest.sourceEventId || "", 80),
      npcId: limitText(quest.npcId || npc.id || "", 40),
      npcName: limitText(quest.npcName || npc.name || "", 40),
      title: limitText(quest.title || `${npc.name || "同伴"}的羁绊任务`, 80),
      intent: limitText(quest.intent || quest.currentStep || "继续推进这段关系线。", 160),
      currentStep: limitText(quest.currentStep || quest.intent || "继续推进这段关系线。", 160),
      nextLabel: limitText(quest.nextLabel || "推进羁绊任务", 24),
      actionType,
      locationId,
      progress,
      pressure,
      status,
      risk: limitText(quest.risk || "如果忽略太久，对方会把这件事重新藏回心里。", 120),
      reward: limitText(quest.reward || "关系信任与专属线索。", 120),
      warning: limitText(quest.warning || "", 120),
      createdDay,
      updatedDay,
      dueDay: clamp(quest.dueDay || createdDay + 4, createdDay + 1, 999),
      lastProgressDay: clamp(quest.lastProgressDay || quest.updatedDay || createdDay, 1, 999),
      missedCount: clamp(quest.missedCount || 0, 0, 99),
      completedDay: status === "completed" ? clamp(quest.completedDay || updatedDay || createdDay, 1, 999) : null,
      steps,
      completion: null
    };
    normalized.completion = normalizeQuestCompletion(quest.completion, normalized, npc);
    return normalized;
  });
}

function normalizeQuestCompletion(completion, quest = {}, npc = {}) {
  if (quest.status !== "completed" && !completion) return null;
  const candidate = completion && typeof completion === "object" ? completion : {};
  return {
    id: limitText(candidate.id || cryptoId("quest-done"), 80),
    day: clamp(candidate.day || quest.completedDay || quest.updatedDay || 1, 1, 999),
    title: limitText(candidate.title || `${quest.title || npc.name || "羁绊任务"}完成`, 80),
    text: limitText(candidate.text || `${npc.name || quest.npcName || "同伴"}把这条关系线记成了新的信任。`, 180),
    reward: limitText(candidate.reward || quest.reward || "关系信任与专属线索。", 120)
  };
}

function normalizeQuestSteps(steps = [], progress = 0) {
  const fallbackSteps = [
    { id: "open", label: "确认对方愿意继续谈", threshold: 35 },
    { id: "follow", label: "一起验证关键线索", threshold: 70 },
    { id: "resolve", label: "给出可被记住的回应", threshold: 100 }
  ];
  return (Array.isArray(steps) && steps.length ? steps : fallbackSteps).slice(0, 4).map((step, index) => {
    const threshold = clamp(step.threshold || fallbackSteps[index]?.threshold || 100, 1, 100);
    return {
      id: limitText(step.id || `step-${index + 1}`, 40),
      label: limitText(step.label || fallbackSteps[index]?.label || "继续推进", 60),
      threshold,
      done: Boolean(step.done || progress >= threshold)
    };
  });
}

function upsertQuestLinesFromBondEvents(questLines = [], bondEvents = [], npc = {}, day = 1) {
  const existing = Array.isArray(questLines) ? questLines : [];
  const existingEventIds = new Set(existing.map((quest) => quest.sourceEventId).filter(Boolean));
  const created = bondEvents
    .filter((event) => event?.followUp && !existingEventIds.has(event.id))
    .map((event) => createNpcQuestLine(npc, event, day));
  return [...existing, ...created].slice(-8);
}

function createNpcQuestLine(npc = {}, event = {}, day = 1) {
  const followUp = normalizeBondFollowUp(event.followUp, npc, event.type);
  const isHiddenGoal = event.type === "hidden-goal";
  const title = isHiddenGoal
    ? `${npc.name || "同伴"}的牵挂：${npc.hiddenGoal || event.title || "未解开的事"}`
    : `${npc.name || "同伴"}的关系确认`;
  const steps = isHiddenGoal
    ? [
        { id: "ask", label: "确认对方愿意继续谈", threshold: 35 },
        { id: "verify", label: "一起验证关键线索", threshold: 70 },
        { id: "answer", label: "给出不伤害对方的结论", threshold: 100 }
      ]
    : [
        { id: "notice", label: "承认关系已经变化", threshold: 35 },
        { id: "boundary", label: "确认彼此靠近的边界", threshold: 70 },
        { id: "promise", label: "留下下一次同行的理由", threshold: 100 }
      ];
  return {
    id: cryptoId("quest"),
    sourceEventId: event.id || "",
    npcId: npc.id || followUp.npcId || "",
    npcName: npc.name || "",
    title: limitText(title, 80),
    intent: followUp.intent,
    currentStep: followUp.intent,
    nextLabel: followUp.label,
    actionType: followUp.actionType,
    locationId: followUp.locationId,
    progress: 0,
    status: "active",
    pressure: 0,
    risk: isHiddenGoal
      ? `逼问太急会让${npc.name || "对方"}重新怀疑自己。`
      : "只靠一次热络很容易退回普通熟人。",
    reward: isHiddenGoal
      ? "专属线索、信任提升和后续分支。"
      : "更稳定的关系阶段和后续同行机会。",
    warning: "",
    createdDay: day,
    updatedDay: day,
    dueDay: day + 4,
    lastProgressDay: day,
    missedCount: 0,
    completedDay: null,
    steps,
    completion: null
  };
}

function normalizeBondEvents(events = [], npc = {}) {
  return (Array.isArray(events) ? events : []).slice(-10).map((rawEvent) => {
    const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
    const type = limitText(event.type || "stage", 24);
    return {
      id: limitText(event.id || cryptoId("bond"), 80),
      day: clamp(event.day || 1, 1, 999),
      title: limitText(event.title || `${npc.name || "同伴"}留下了一次羁绊节点`, 80),
      text: limitText(event.text || "这次关系变化被记了下来。", 180),
      stage: limitText(event.stage || npc.relationshipStage || "初识", 24),
      type,
      followUp: normalizeBondFollowUp(event.followUp, npc, type)
    };
  });
}

function normalizeBondFollowUp(followUp, npc = {}, eventType = "stage") {
  const fallback = createBondFollowUp(npc, { label: "羁绊事件" }, eventType);
  const candidate = followUp && typeof followUp === "object" ? followUp : {};
  const actionType = isKnownActionType(candidate.actionType) ? candidate.actionType : fallback.actionType;
  const locationId = isKnownLocationId(candidate.locationId) ? candidate.locationId : fallback.locationId;
  return {
    label: limitText(candidate.label || fallback.label, 24),
    intent: limitText(candidate.intent || fallback.intent, 140),
    actionType,
    locationId,
    npcId: limitText(candidate.npcId || fallback.npcId || npc.id || "", 40),
    reason: limitText(candidate.reason || fallback.reason, 120)
  };
}

function advanceNpcQuestLines(state, action, outcome) {
  const npc = action.npcId ? state.npcs?.[action.npcId] : null;
  if (!npc || !Array.isArray(npc.questLines) || !npc.questLines.length) {
    return { progressedCount: 0, completedCount: 0, progressedQuestIds: new Set() };
  }

  let progressedCount = 0;
  let completedCount = 0;
  const progressedQuestIds = new Set();
  const completionEvents = [];
  npc.questLines = npc.questLines.map((quest) => {
    if (quest.status === "completed") return quest;
    const repair = isQuestRepairAction(quest, action);
    const matchScore = scoreQuestLineMatch(quest, action);
    if (matchScore < 42) return quest;

    const relationshipDelta = outcome.relationshipDeltas.find((delta) => delta.npcId === npc.id);
    const relationshipGain = Math.max(0, relationshipDelta?.affinity || 0) + Math.max(0, relationshipDelta?.trust || 0);
    const progressGain = repair
      ? clamp(8 + Math.round(relationshipGain / 2), 6, 14)
      : clamp(Math.round(matchScore / 3) + relationshipGain, 18, 48);
    const progress = clamp((quest.progress || 0) + progressGain);
    const completed = progress >= 100;
    progressedCount += 1;
    progressedQuestIds.add(quest.id);
    if (completed && quest.status !== "completed") {
      completedCount += 1;
      npc.affinity = clamp((npc.affinity || 0) + 1);
      npc.trust = clamp((npc.trust || 0) + 2);
    }
    const nextQuest = {
      ...quest,
      progress,
      status: completed ? "completed" : "active",
      pressure: completed ? 0 : clamp((quest.pressure || 0) - (repair ? 55 : 25)),
      warning: "",
      updatedDay: state.day,
      dueDay: completed ? quest.dueDay : Math.max(quest.dueDay || state.day + 4, state.day + 4),
      lastProgressDay: state.day,
      completedDay: completed ? state.day : quest.completedDay || null,
      currentStep: completed ? nextQuestStepText(quest, progress) : repair ? quest.intent : nextQuestStepText(quest, progress),
      steps: normalizeQuestSteps(quest.steps, progress),
      completion: quest.completion || null
    };
    if (completed && !quest.completion) {
      nextQuest.completion = createQuestCompletion(npc, nextQuest, action, state.day);
      completionEvents.push(createQuestCompletionBondEvent(npc, nextQuest, action, state.day));
    }
    return nextQuest;
  });

  if (completionEvents.length) {
    npc.bondEvents = [...(Array.isArray(npc.bondEvents) ? npc.bondEvents : []), ...completionEvents].slice(-10);
  }

  return { progressedCount, completedCount, progressedQuestIds };
}

function pressureNpcQuestLines(state, action, progressedQuestIds = new Set()) {
  let pressuredCount = 0;
  let strainedCount = 0;
  const pressureEventsByNpc = new Map();

  for (const npc of Object.values(state.npcs || {})) {
    if (!Array.isArray(npc.questLines) || !npc.questLines.length) continue;
    npc.questLines = npc.questLines.map((quest) => {
      if (quest.status === "completed" || progressedQuestIds.has(quest.id)) return quest;
      if ((state.day || 1) < (quest.dueDay || (quest.createdDay || 1) + 4)) return quest;

      const previousPressure = quest.pressure || 0;
      const sameNpc = action.npcId && action.npcId === quest.npcId;
      const pressureGain = sameNpc ? 8 : 14;
      const pressure = clamp(previousPressure + pressureGain);
      const strained = pressure >= 80;
      const crossedWarning = previousPressure < 45 && pressure >= 45;
      const crossedStrained = quest.status !== "strained" && strained;
      pressuredCount += 1;
      if (crossedStrained) {
        strainedCount += 1;
        npc.trust = clamp((npc.trust || 0) - 1);
      }

      const nextQuest = {
        ...quest,
        pressure,
        status: strained ? "strained" : "active",
        missedCount: clamp((quest.missedCount || 0) + 1, 0, 99),
        warning: questPressureWarning(quest, pressure, strained),
        currentStep: strained
          ? `先修复${quest.npcName || "同伴"}对这件事被搁置的担心，再继续：${quest.intent}`
          : quest.currentStep
      };

      if (crossedWarning || crossedStrained) {
        const event = createQuestPressureBondEvent(npc, nextQuest, state.day, crossedStrained ? "quest-strained" : "quest-pressure");
        pressureEventsByNpc.set(npc.id, [...(pressureEventsByNpc.get(npc.id) || []), event]);
      }
      return nextQuest;
    });
  }

  for (const npc of Object.values(state.npcs || {})) {
    const events = pressureEventsByNpc.get(npc.id);
    if (events?.length) {
      npc.bondEvents = [...(Array.isArray(npc.bondEvents) ? npc.bondEvents : []), ...events].slice(-10);
    }
  }

  return { pressuredCount, strainedCount };
}

function questPressureWarning(quest = {}, pressure = 0, strained = false) {
  if (strained) return `${quest.npcName || "同伴"}开始怀疑这件事是否真的会被认真对待。`;
  if (pressure >= 45) return `${quest.npcName || "同伴"}已经等了一阵子，最好尽快回应这条关系线。`;
  return "";
}

function createQuestCompletion(npc = {}, quest = {}, action = {}, day = 1) {
  return {
    id: cryptoId("quest-done"),
    day,
    title: `${quest.title || "羁绊任务"}完成`,
    text: `${npc.name || "同伴"}和星野把「${action.label}」记成了这段关系线的答案。`,
    reward: quest.reward || "关系信任与专属线索。"
  };
}

function createQuestPressureBondEvent(npc = {}, quest = {}, day = 1, type = "quest-pressure") {
  const strained = type === "quest-strained";
  return {
    id: cryptoId("bond"),
    day,
    title: strained ? `${npc.name || "同伴"}的羁绊任务变得紧张` : `${npc.name || "同伴"}开始在意被搁置的羁绊任务`,
    text: strained
      ? `${npc.name || "同伴"}对「${quest.title || "这条关系线"}」的等待已经变成压力，继续推进前需要先修复信任。`
      : `${npc.name || "同伴"}还没有放下「${quest.title || "这条关系线"}」，但拖延正在让它变得敏感。`,
    stage: npc.relationshipStage || "初识",
    type,
    followUp: {
      label: strained ? "修复羁绊" : "回应牵挂",
      intent: limitText(`找${npc.name || "这位同伴"}认真回应「${quest.title || "这条关系线"}」被搁置的担心，再继续推进。`, 140),
      actionType: "social",
      locationId: locationForBondAction("social"),
      npcId: npc.id || quest.npcId || "",
      reason: "把被忽视的关系任务转成修复行动。"
    }
  };
}

function createQuestCompletionBondEvent(npc = {}, quest = {}, action = {}, day = 1) {
  return {
    id: cryptoId("bond"),
    day,
    title: `${npc.name || "同伴"}完成了羁绊任务`,
    text: `${npc.name || "同伴"}把「${quest.title || action.label}」收束成新的信任：${quest.reward || "关系信任与专属线索。"}`,
    stage: npc.relationshipStage || "初识",
    type: "quest-complete",
    followUp: {
      label: "沉淀羁绊",
      intent: limitText(`和${npc.name || "这位同伴"}整理「${quest.title || action.label}」的结果，决定下一条长期线索。`, 140),
      actionType: "social",
      locationId: locationForBondAction("social"),
      npcId: npc.id || quest.npcId || "",
      reason: "把完成的关系任务沉淀成下一轮长期动机。"
    }
  };
}

function scoreQuestLineMatch(quest = {}, action = {}) {
  let score = 0;
  if (quest.npcId && quest.npcId === action.npcId) score += 32;
  if (quest.actionType && quest.actionType === action.type) score += 28;
  if (quest.locationId && quest.locationId === action.locationId) score += 24;
  if (isQuestRepairAction(quest, action)) score += 44;
  const text = `${action.label || ""} ${action.customText || ""}`;
  for (const token of questKeywords(quest)) {
    if (token && text.includes(token)) score += 8;
  }
  return score;
}

function isQuestRepairAction(quest = {}, action = {}) {
  if (!quest.npcId || quest.npcId !== action.npcId) return false;
  if ((quest.pressure || 0) < 45 && quest.status !== "strained") return false;
  const text = `${action.label || ""} ${action.customText || ""}`;
  return /修复|回应|搁置|担心|道歉|认真|信任|等待/u.test(text);
}

function questKeywords(quest = {}) {
  return normalizeTags([
    quest.npcName,
    quest.title,
    quest.intent,
    quest.currentStep
  ].flatMap((text) => String(text || "").split(/[：，。、“”「」\s]+/u)))
    .filter((token) => token.length >= 2)
    .slice(0, 6);
}

function nextQuestStepText(quest = {}, progress = 0) {
  const nextStep = normalizeQuestSteps(quest.steps, progress).find((step) => !step.done);
  if (!nextStep) return `${quest.npcName || "同伴"}已经把这件事真正放进你们的关系里。`;
  return `${nextStep.label}：${quest.intent || "继续推进这段关系线。"}`;
}

function buildContinuityTrace(beforeState, afterState, action, outcome, details) {
  const retrieved = details.retrievedContext || {};
  const relationshipDeltas = (outcome.relationshipDeltas || []).filter(
    (delta) => delta.affinity || delta.trust
  );
  const signals = {
    retrievedChapters: retrieved.chapters?.length || 0,
    retrievedPlans: retrieved.plans?.length || 0,
    retrievedOpportunities: retrieved.opportunities?.length || 0,
    retrievedSkills: retrieved.skills?.length || 0,
    retrievedWorldFacts: retrieved.worldFacts?.length || 0,
    retrievedMemoryTopics: retrieved.memoryTopics?.length || 0,
    retrievedMemories: retrieved.memories?.length || 0,
    retrievedReflections: retrieved.reflections?.length || 0,
    retrievedNpcReflections: retrieved.npcReflections?.length || 0,
    retrievedNpcBondEvents: retrieved.npcBondEvents?.length || 0,
    retrievedNpcQuestLines: retrieved.npcQuestLines?.length || 0,
    retrievedCommitments: retrieved.commitments?.length || 0,
    memoryWrites: details.memoryWriteCount || 0,
    skillsUpdated: details.skillsUpdated || 0,
    skillLevelUps: details.skillLevelUps || 0,
    worldFactsUpdated: details.worldFactsUpdated || 0,
    memoryLinksCreated: details.memoryLinkCount || 0,
    progressedGoals: details.progressedGoalCount || 0,
    newGoalCreated: Boolean(details.newGoalCreated),
    relationshipDeltaCount: relationshipDeltas.length,
    relationshipDeltaTotal: relationshipDeltas.reduce(
      (total, delta) => total + Math.abs(delta.affinity || 0) + Math.abs(delta.trust || 0),
      0
    ),
    npcReflectionCreated: details.npcReflectionCreated || 0,
    npcBondEventsCreated: details.npcBondEventsCreated || 0,
    npcQuestLinesProgressed: details.npcQuestLinesProgressed || 0,
    npcQuestLinesCompleted: details.npcQuestLinesCompleted || 0,
    npcQuestLinesPressured: details.npcQuestLinesPressured || 0,
    npcQuestLinesStrained: details.npcQuestLinesStrained || 0,
    commitmentsFulfilled: details.commitmentsFulfilled || 0,
    commitmentsMissed: details.commitmentsMissed || 0
  };

  const score = clamp(
    (signals.retrievedPlans ? 10 : 0) +
      Math.min(10, signals.retrievedChapters * 6) +
      Math.min(10, signals.retrievedOpportunities * 5) +
      Math.min(10, signals.retrievedSkills * 5) +
      Math.min(10, signals.retrievedWorldFacts * 5) +
      Math.min(10, signals.retrievedMemoryTopics * 5) +
      Math.min(18, signals.retrievedMemories * 4) +
      Math.min(12, signals.retrievedReflections * 4) +
      Math.min(12, signals.retrievedNpcReflections * 6) +
      Math.min(12, signals.retrievedNpcBondEvents * 6) +
      Math.min(12, signals.retrievedNpcQuestLines * 6) +
      Math.min(10, signals.retrievedCommitments * 5) +
      Math.min(10, signals.skillsUpdated * 6) +
      Math.min(8, signals.skillLevelUps * 8) +
      Math.min(10, signals.worldFactsUpdated * 6) +
      Math.min(14, signals.memoryWrites * 5) +
      Math.min(10, signals.memoryLinksCreated * 2) +
      Math.min(12, signals.progressedGoals * 6) +
      (signals.newGoalCreated ? 10 : 0) +
      Math.min(14, signals.relationshipDeltaTotal * 2) +
      Math.min(12, signals.npcReflectionCreated * 8) +
      Math.min(14, signals.npcBondEventsCreated * 7) +
      Math.min(14, signals.npcQuestLinesProgressed * 7) +
      Math.min(8, signals.npcQuestLinesCompleted * 8) +
      Math.min(8, signals.npcQuestLinesPressured * 4) +
      Math.min(8, signals.npcQuestLinesStrained * 8) +
      Math.min(10, signals.commitmentsFulfilled * 10) +
      Math.min(6, signals.commitmentsMissed * 6),
    0,
    100
  );

  return {
    id: cryptoId("trace"),
    day: beforeState.day,
    slot: beforeState.slot,
    actionLabel: action.label,
    locationName: action.locationName,
    npcName: action.npcName || "",
    score,
    summary: buildContinuitySummary(signals),
    signals,
    anchors: {
      chapters: (retrieved.chapters || []).slice(0, 2).map((chapter) => limitText(chapter.title, 36)),
      plans: (retrieved.plans || []).slice(0, 2).map((plan) => limitText(plan.title, 36)),
      opportunities: (retrieved.opportunities || []).slice(0, 2).map((opportunity) => limitText(opportunity.title, 36)),
      skills: (retrieved.skills || []).slice(0, 2).map((skill) => limitText(skill.name, 36)),
      worldFacts: (retrieved.worldFacts || []).slice(0, 2).map((fact) => limitText(fact.title, 36)),
      memoryTopics: (retrieved.memoryTopics || []).slice(0, 2).map((topic) => limitText(topic.title, 36)),
      memories: (retrieved.memories || [])
        .slice(0, 2)
        .map((memory) => `${memory.owner || "memory"} / 第 ${memory.day || afterState.day} 天`),
      reflections: (retrieved.reflections || []).slice(0, 2).map((reflection) => limitText(reflection.title, 36)),
      npcReflections: (retrieved.npcReflections || [])
        .slice(0, 2)
        .map((reflection) => limitText(reflection.title, 36)),
      npcBondEvents: (retrieved.npcBondEvents || []).slice(0, 2).map((event) => limitText(event.title, 36)),
      npcQuestLines: (retrieved.npcQuestLines || []).slice(0, 2).map((quest) => limitText(quest.title, 36)),
      commitments: (retrieved.commitments || []).slice(0, 2).map((commitment) => limitText(commitment.title, 36))
    }
  };
}

function buildContinuitySummary(signals) {
  const contextCount =
    signals.retrievedChapters +
    signals.retrievedPlans +
    signals.retrievedOpportunities +
    signals.retrievedSkills +
    signals.retrievedWorldFacts +
    signals.retrievedMemoryTopics +
    signals.retrievedMemories +
    signals.retrievedReflections +
    signals.retrievedNpcReflections +
    signals.retrievedNpcBondEvents +
    signals.retrievedNpcQuestLines +
    signals.retrievedCommitments;
  const parts = [];

  if (contextCount) parts.push(`检索 ${contextCount} 条上下文`);
  if (signals.retrievedChapters) parts.push(`命中 ${signals.retrievedChapters} 个篇章`);
  if (signals.retrievedOpportunities) parts.push(`命中 ${signals.retrievedOpportunities} 个行动机会`);
  if (signals.retrievedSkills) parts.push(`命中 ${signals.retrievedSkills} 项能力`);
  if (signals.skillsUpdated) parts.push(`推进 ${signals.skillsUpdated} 项能力`);
  if (signals.skillLevelUps) parts.push(`突破 ${signals.skillLevelUps} 项能力`);
  if (signals.retrievedWorldFacts) parts.push(`命中 ${signals.retrievedWorldFacts} 条世界发现`);
  if (signals.retrievedMemoryTopics) parts.push(`命中 ${signals.retrievedMemoryTopics} 个记忆主题`);
  if (signals.worldFactsUpdated) parts.push(`更新 ${signals.worldFactsUpdated} 条世界发现`);
  if (signals.memoryWrites) parts.push(`写入 ${signals.memoryWrites} 条记忆`);
  if (signals.memoryLinksCreated) parts.push(`连接 ${signals.memoryLinksCreated} 条旧记忆`);
  if (signals.progressedGoals) parts.push(`推进 ${signals.progressedGoals} 个目标`);
  if (signals.newGoalCreated) parts.push("生成新目标");
  if (signals.relationshipDeltaCount) parts.push(`更新 ${signals.relationshipDeltaCount} 段关系`);
  if (signals.npcReflectionCreated) parts.push("形成 NPC 反思");
  if (signals.npcBondEventsCreated) parts.push(`触发 ${signals.npcBondEventsCreated} 个羁绊事件`);
  if (signals.npcQuestLinesProgressed) parts.push(`推进 ${signals.npcQuestLinesProgressed} 条羁绊任务`);
  if (signals.npcQuestLinesCompleted) parts.push(`完成 ${signals.npcQuestLinesCompleted} 条羁绊任务`);
  if (signals.npcQuestLinesPressured) parts.push(`累积 ${signals.npcQuestLinesPressured} 条羁绊压力`);
  if (signals.npcQuestLinesStrained) parts.push(`拉紧 ${signals.npcQuestLinesStrained} 条羁绊任务`);
  if (signals.commitmentsFulfilled) parts.push(`兑现 ${signals.commitmentsFulfilled} 个承诺`);
  if (signals.commitmentsMissed) parts.push(`错过 ${signals.commitmentsMissed} 个承诺`);

  return parts.length ? parts.join("，") : "这次行动主要更新了时间和状态。";
}

function countProgressedGoals(beforeState, afterState) {
  return (afterState.hero?.goals || []).filter((goal) => {
    const previous = (beforeState.hero?.goals || []).find((item) => item.id === goal.id);
    return previous && !previous.done && (goal.progress || 0) > (previous.progress || 0);
  }).length;
}

function normalizeContinuityTraces(traces = []) {
  return (Array.isArray(traces) ? traces : []).slice(-40).map((trace) => ({
    id: limitText(trace.id || cryptoId("trace"), 80),
    day: clamp(trace.day || 1, 1, 999),
    slot: clamp(trace.slot || 0, 0, 3),
    actionLabel: limitText(trace.actionLabel || "行动", 40),
    locationName: limitText(trace.locationName || "", 40),
    npcName: limitText(trace.npcName || "", 40),
    score: clamp(trace.score || 0),
    summary: limitText(trace.summary || "这次行动留下了一条连续性记录。", 160),
    signals: {
      retrievedChapters: clamp(trace.signals?.retrievedChapters || 0, 0, 20),
      retrievedPlans: clamp(trace.signals?.retrievedPlans || 0, 0, 20),
      retrievedOpportunities: clamp(trace.signals?.retrievedOpportunities || 0, 0, 20),
      retrievedSkills: clamp(trace.signals?.retrievedSkills || 0, 0, 20),
      retrievedWorldFacts: clamp(trace.signals?.retrievedWorldFacts || 0, 0, 20),
      retrievedMemoryTopics: clamp(trace.signals?.retrievedMemoryTopics || 0, 0, 20),
      retrievedMemories: clamp(trace.signals?.retrievedMemories || 0, 0, 20),
      retrievedReflections: clamp(trace.signals?.retrievedReflections || 0, 0, 20),
      retrievedNpcReflections: clamp(trace.signals?.retrievedNpcReflections || 0, 0, 20),
      retrievedNpcBondEvents: clamp(trace.signals?.retrievedNpcBondEvents || 0, 0, 20),
      retrievedNpcQuestLines: clamp(trace.signals?.retrievedNpcQuestLines || 0, 0, 20),
      retrievedCommitments: clamp(trace.signals?.retrievedCommitments || 0, 0, 20),
      memoryWrites: clamp(trace.signals?.memoryWrites || 0, 0, 20),
      skillsUpdated: clamp(trace.signals?.skillsUpdated || 0, 0, 20),
      skillLevelUps: clamp(trace.signals?.skillLevelUps || 0, 0, 20),
      worldFactsUpdated: clamp(trace.signals?.worldFactsUpdated || 0, 0, 20),
      memoryLinksCreated: clamp(trace.signals?.memoryLinksCreated || 0, 0, 40),
      progressedGoals: clamp(trace.signals?.progressedGoals || 0, 0, 20),
      newGoalCreated: Boolean(trace.signals?.newGoalCreated),
      relationshipDeltaCount: clamp(trace.signals?.relationshipDeltaCount || 0, 0, 20),
      relationshipDeltaTotal: clamp(trace.signals?.relationshipDeltaTotal || 0, 0, 40),
      npcReflectionCreated: clamp(trace.signals?.npcReflectionCreated || 0, 0, 20),
      npcBondEventsCreated: clamp(trace.signals?.npcBondEventsCreated || 0, 0, 20),
      npcQuestLinesProgressed: clamp(trace.signals?.npcQuestLinesProgressed || 0, 0, 20),
      npcQuestLinesCompleted: clamp(trace.signals?.npcQuestLinesCompleted || 0, 0, 20),
      npcQuestLinesPressured: clamp(trace.signals?.npcQuestLinesPressured || 0, 0, 20),
      npcQuestLinesStrained: clamp(trace.signals?.npcQuestLinesStrained || 0, 0, 20),
      commitmentsFulfilled: clamp(trace.signals?.commitmentsFulfilled || 0, 0, 20),
      commitmentsMissed: clamp(trace.signals?.commitmentsMissed || 0, 0, 20)
    },
    anchors: {
      chapters: normalizeTraceAnchorList(trace.anchors?.chapters),
      plans: normalizeTraceAnchorList(trace.anchors?.plans),
      opportunities: normalizeTraceAnchorList(trace.anchors?.opportunities),
      skills: normalizeTraceAnchorList(trace.anchors?.skills),
      worldFacts: normalizeTraceAnchorList(trace.anchors?.worldFacts),
      memoryTopics: normalizeTraceAnchorList(trace.anchors?.memoryTopics),
      memories: normalizeTraceAnchorList(trace.anchors?.memories),
      reflections: normalizeTraceAnchorList(trace.anchors?.reflections),
      npcReflections: normalizeTraceAnchorList(trace.anchors?.npcReflections),
      npcBondEvents: normalizeTraceAnchorList(trace.anchors?.npcBondEvents),
      npcQuestLines: normalizeTraceAnchorList(trace.anchors?.npcQuestLines),
      commitments: normalizeTraceAnchorList(trace.anchors?.commitments)
    }
  }));
}

function normalizeTraceAnchorList(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 3).map((item) => limitText(item, 48));
}

function formatDelta(value = 0) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function shouldRevealNpcHiddenGoal(npc) {
  return Boolean(npc.hiddenGoal) && (
    ["熟悉", "信赖", "牵绊"].includes(npc.relationshipStage) ||
    (npc.trust || 0) >= 36
  );
}

function createBondEvent(npc, previousStage, action, type, day) {
  const hiddenGoalText = npc.hiddenGoal ? `「${npc.hiddenGoal}」` : "一个还没说出口的牵挂";
  if (type === "hidden-goal") {
    return {
      id: cryptoId("bond"),
      day,
      title: `${npc.name}透露了真正的牵挂`,
      text: `${npc.name}在这次「${action.label}」后愿意把${hiddenGoalText}放到你们之间。`,
      stage: npc.relationshipStage,
      type,
      followUp: createBondFollowUp(npc, action, type)
    };
  }
  return {
    id: cryptoId("bond"),
    day,
    title: `${npc.name}关系推进：${previousStage} → ${npc.relationshipStage}`,
    text: `${npc.name}开始用“${npc.stance}”的方式回应星野，后续行动会更容易牵动对方的真实顾虑。`,
    stage: npc.relationshipStage,
    type,
    followUp: createBondFollowUp(npc, action, type)
  };
}

function createBondFollowUp(npc = {}, action = {}, type = "stage") {
  if (type === "hidden-goal") {
    const actionType = inferBondActionType(`${npc.hiddenGoal || ""} ${npc.concern || ""} ${action.label || ""}`);
    return {
      label: "追问牵挂",
      intent: limitText(
        `继续和${npc.name || "这位同伴"}确认「${npc.hiddenGoal || "那件牵挂"}」背后的线索，同时照顾对方的顾虑：${npc.concern || "别逼得太急。"}`,
        140
      ),
      actionType,
      locationId: locationForBondAction(actionType),
      npcId: npc.id || "",
      reason: "把刚解锁的牵挂转成下一次可执行行动。"
    };
  }

  return {
    label: "稳住关系",
    intent: limitText(`找${npc.name || "这位同伴"}聊聊这次关系变化，确认彼此愿意继续靠近的边界。`, 140),
    actionType: "social",
    locationId: locationForBondAction("social"),
    npcId: npc.id || "",
    reason: "把关系阶段变化转成后续社交行动。"
  };
}

function inferBondActionType(text = "") {
  if (/星图|观测|记录|档案|资料|确认/u.test(text)) return "study";
  if (/修|导航仪|工坊|零件|制作|作品/u.test(text)) return "create";
  if (/训练|体能|巡夜|危险/u.test(text)) return "train";
  if (/聊|关系|信任|牵挂|顾虑/u.test(text)) return "social";
  return inferActionId(text);
}

function locationForBondAction(actionType) {
  return BOND_FOLLOW_UP_LOCATIONS[actionType] || LOCATIONS.find((location) => location.tags.includes(actionType))?.id || LOCATIONS[0].id;
}

function isKnownActionType(actionType) {
  return ACTION_PRESETS.some((preset) => preset.id === actionType);
}

function isKnownLocationId(locationId) {
  return LOCATIONS.some((location) => location.id === locationId);
}

function normalizeMemories(memories = []) {
  return (Array.isArray(memories) ? memories : []).slice(0, 4).map((memory) => ({
    owner: limitText(memory.owner || "hero", 40),
    text: limitText(memory.text || "这件事被记了下来。", 160),
    weight: clamp(memory.weight || 1, 1, 5),
    tags: normalizeTags(memory.tags || []).slice(0, 6)
  }));
}

function normalizeGoal(goal, state) {
  if (!goal || typeof goal !== "object") return null;
  return {
    text: limitText(goal.text || "继续追踪这个方向", 80),
    progress: clamp(goal.progress || 0),
    dueDay: clamp(goal.dueDay || state.day + 5, state.day + 1, 120)
  };
}

function normalizeChoices(choices = []) {
  const normalized = (Array.isArray(choices) ? choices : []).slice(0, 4).map((choice) => ({
    label: limitText(choice.label || "继续观察", 24),
    intent: limitText(choice.intent || "看看后续会发生什么", 80)
  }));
  return normalized.length >= 2
    ? normalized
    : [
        { label: "顺势推进", intent: "沿着刚刚的线索继续行动" },
        { label: "换个方向", intent: "暂时放下这件事，去别处看看" }
      ];
}

function createEmptyOutcome() {
  return {
    title: "平稳的一刻",
    narration: "这段时间没有掀起很大的波澜，但你仍然向前走了一小步。",
    mood: "calm",
    statDeltas: Object.fromEntries(STAT_KEYS.map((key) => [key, 0])),
    relationshipDeltas: [],
    memories: [],
    newGoal: null,
    choices: [
      { label: "继续", intent: "保持当前方向" },
      { label: "调整", intent: "换一种节奏" }
    ]
  };
}

function buildTitle(type, locationName, npcName, seed) {
  const nouns = {
    study: ["页边的星图", "旧资料的注脚", "安静的推演"],
    create: ["还没冷却的零件", "桌面的草稿", "一次小发明"],
    train: ["风里的步伐", "码头边的呼吸", "肌肉记住的路"],
    social: ["一句认真回答", "被接住的话", "并肩走过的廊道"],
    explore: ["雾后的线索", "传闻的边缘", "旧灯下的发现"],
    rest: ["被整理好的夜晚", "慢下来的心跳", "窗边的热茶"]
  };
  const base = pick(nouns[type] || nouns.explore, seed);
  return npcName ? `${base}：${npcName}` : `${base}：${locationName}`;
}

function maybeCreateGoal(type, day, seed) {
  if (!["create", "explore", "social"].includes(type) || seed % 4 !== 0) {
    return null;
  }
  const text = {
    create: "完成一个能代表自己的小作品",
    explore: "查清星港最近流传的旧码头传闻",
    social: "和一位同伴建立更稳定的信任"
  }[type];
  return { text, progress: 5, dueDay: day + 6 };
}

function inferPlanAction(text = "") {
  if (/休息|压力|精力|恢复|日记/u.test(text)) return "rest";
  if (/关系|同伴|信任|聊|交流|共情/u.test(text)) return "social";
  if (/作品|制作|创造|原型|工坊/u.test(text)) return "create";
  if (/训练|体能|勇气|码头/u.test(text)) return "train";
  if (/传闻|探索|线索|秘密|追踪/u.test(text)) return "explore";
  return "study";
}

function locationForAction(actionType, state) {
  const current = findLocation(state.currentLocationId);
  if (current.tags?.includes(actionType)) return current.id;
  return LOCATIONS.find((location) => location.tags.includes(actionType))?.id || LOCATIONS[0].id;
}

function pickNpcForPlan(state) {
  const npcs = Object.values(state.npcs || {});
  return npcs.sort((a, b) => (b.trust || 0) + (b.affinity || 0) - ((a.trust || 0) + (a.affinity || 0)))[0] || null;
}

function getAllNpcQuestLines(state) {
  return Object.values(state.npcs || {})
    .flatMap((npc) => (npc.questLines || []).map((quest) => ({
      ...quest,
      npcName: quest.npcName || npc.name
    })));
}

function pickNpcQuestForPlan(state) {
  return getAllNpcQuestLines(state)
    .map((quest) => ({
      ...quest,
      urgency:
        (quest.progress || 0) +
        (quest.pressure || 0) +
        Math.max(0, (state.day || 1) - (quest.dueDay || state.day || 1)) * 12 +
        (quest.createdDay ? Math.max(0, (state.day || 1) - quest.createdDay) * 4 : 0)
    }))
    .filter((quest) => quest.status !== "completed")
    .sort((a, b) => b.urgency - a.urgency)[0] || null;
}

function dedupePlans(plans) {
  const seen = new Set();
  return plans.filter((plan) => {
    const key = `${plan.actionType}:${plan.locationId}:${plan.npcId || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensurePlanCount(plans, state) {
  const fallbackPlans = [
    {
      title: "制造一个新线索",
      intent: "去旧码头或观测塔追踪一条今天还没有解释的传闻",
      actionType: "explore",
      locationId: locationForAction("explore", state),
      reason: "开放式养成需要持续引入外部变化。",
      source: "fallback"
    },
    {
      title: "做出一个小作品",
      intent: "去旧工坊把最近的想法做成一个粗糙原型",
      actionType: "create",
      locationId: "workshop",
      reason: "作品能把模糊兴趣变成可观察的成长痕迹。",
      source: "fallback"
    },
    {
      title: "维持身体节奏",
      intent: "去旧码头做一次低强度训练，确认身体还跟得上计划",
      actionType: "train",
      locationId: "dock",
      reason: "体能和勇气会影响探索类行动的稳定收益。",
      source: "fallback"
    }
  ];
  const seen = new Set(plans.map((plan) => `${plan.actionType}:${plan.locationId}:${plan.npcId || ""}`));
  const next = [...plans];

  for (const fallback of fallbackPlans) {
    const key = `${fallback.actionType}:${fallback.locationId}:${fallback.npcId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      id: cryptoId("plan"),
      day: state.day,
      ...fallback
    });
    if (next.length >= 3) break;
  }

  return next;
}

function buildChoices(type, locationName) {
  const shared = [
    { label: "写进日记", intent: "把这次行动整理成更清晰的记忆" },
    { label: "换个地点", intent: "去别处寻找新的刺激" }
  ];
  const byType = {
    study: { label: "追问细节", intent: `继续在${locationName}研究资料里的矛盾` },
    create: { label: "改造作品", intent: "把刚才的想法做成更完整的原型" },
    train: { label: "加练一次", intent: "用更稳的节奏继续训练" },
    social: { label: "认真倾听", intent: "把谈话重点放在对方真正关心的事情上" },
    explore: { label: "跟进线索", intent: "顺着传闻查下去" },
    rest: { label: "早点睡", intent: "彻底恢复精力" }
  };
  return [byType[type] || byType.explore, ...shared];
}

function limitText(text, max) {
  return String(text).replace(/\s+/g, " ").trim().slice(0, max);
}

function pick(items, seed) {
  return items[Math.abs(seed) % items.length];
}

function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value += (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24);
  }
  return value >>> 0;
}

function cryptoId(prefix) {
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function clone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export const gameCatalog = {
  stats: STAT_KEYS,
  actions: ACTION_PRESETS,
  locations: LOCATIONS,
  npcs: NPCS
};
