export const STAT_KEYS = [
  "focus",
  "creativity",
  "fitness",
  "empathy",
  "courage",
  "discipline",
  "stress",
  "energy"
];

export const STAT_META = {
  focus: { label: "专注", tone: "teal" },
  creativity: { label: "创造", tone: "coral" },
  fitness: { label: "体能", tone: "moss" },
  empathy: { label: "共情", tone: "violet" },
  courage: { label: "勇气", tone: "amber" },
  discipline: { label: "自律", tone: "steel" },
  stress: { label: "压力", tone: "red", inverse: true },
  energy: { label: "精力", tone: "green" }
};

export const TIME_SLOTS = ["早晨", "午后", "夜晚"];

export const MOOD_LABELS = {
  calm: "平静",
  bright: "明亮",
  tense: "紧绷",
  strange: "微妙",
  warm: "温暖"
};

export const LOCATIONS = [
  {
    id: "observatory",
    name: "观测塔",
    shortName: "塔",
    tags: ["study", "explore"],
    description: "能看到星港全貌，适合研究、记录和独处。"
  },
  {
    id: "workshop",
    name: "旧工坊",
    shortName: "工",
    tags: ["create", "study"],
    description: "堆着零件、木料和半成品，适合把想法做出来。"
  },
  {
    id: "greenhouse",
    name: "温室",
    shortName: "温",
    tags: ["social", "rest"],
    description: "潮湿安静，植物会让人慢下来，也容易遇见愿意聊天的人。"
  },
  {
    id: "dock",
    name: "旧码头",
    shortName: "码",
    tags: ["train", "explore"],
    description: "风大，路灯少，适合训练胆量和体能。"
  },
  {
    id: "dorm",
    name: "宿舍",
    shortName: "宿",
    tags: ["rest", "social"],
    description: "恢复精力、整理日记，也会听到同学们的闲谈。"
  }
];

export const NPCS = [
  {
    id: "lin",
    name: "林鸢",
    role: "天文社记录员",
    affinity: 42,
    trust: 34,
    description: "说话轻，但观察非常敏锐。她喜欢认真听完一个人的想法。",
    hiddenGoal: "确认星港旧星图里被删掉的一段记录",
    concern: "害怕自己的发现只是过度解读。"
  },
  {
    id: "mo",
    name: "莫衡",
    role: "工坊管理员",
    affinity: 36,
    trust: 30,
    description: "务实，嘴硬，看到别人真的动手会悄悄帮一把。",
    hiddenGoal: "修好旧工坊里一台不该被公开的导航仪",
    concern: "不愿承认自己仍在等待某个人回来。"
  },
  {
    id: "qiao",
    name: "乔白",
    role: "码头巡夜人",
    affinity: 30,
    trust: 28,
    description: "爱开玩笑，擅长把紧张的事说得像一次散步。",
    hiddenGoal: "弄清旧码头夜里灯塔异常的源头",
    concern: "担心玩笑掩盖不了真正的危险。"
  }
];

export const ACTION_PRESETS = [
  {
    id: "study",
    label: "研读资料",
    verb: "学习",
    description: "提升专注和自律，消耗精力。"
  },
  {
    id: "create",
    label: "制作作品",
    verb: "创作",
    description: "提升创造力，可能产生新目标。"
  },
  {
    id: "train",
    label: "训练身体",
    verb: "训练",
    description: "提升体能和勇气，缓解一部分压力。"
  },
  {
    id: "social",
    label: "主动交流",
    verb: "社交",
    description: "提升共情，改变 NPC 关系。"
  },
  {
    id: "explore",
    label: "探索传闻",
    verb: "探索",
    description: "提升勇气，触发意外事件。"
  },
  {
    id: "rest",
    label: "整理休息",
    verb: "休息",
    description: "恢复精力，降低压力。"
  }
];

export function createInitialState() {
  return {
    version: 1,
    day: 1,
    slot: 0,
    timeSlots: TIME_SLOTS,
    currentLocationId: "observatory",
    hero: {
      name: "星野",
      mood: "calm",
      traits: ["新生", "好奇", "慢热"],
      stats: {
        focus: 46,
        creativity: 42,
        fitness: 38,
        empathy: 44,
        courage: 35,
        discipline: 40,
        stress: 22,
        energy: 72
      },
      goals: [
        {
          id: "goal-opening",
          text: "在星港学院找到一个愿意长期投入的方向",
          progress: 10,
          dueDay: 7,
          done: false
        }
      ],
      skills: [
        {
          id: "skill-star-map-reading",
          name: "星图判读",
          actionType: "study",
          level: 1,
          progress: 18,
          totalXp: 18,
          description: "把星图、档案和观测记录转成可行动的线索。",
          tags: ["研读", "星图", "线索"],
          evidence: ["第一次抵达星港时，星野意识到旧记录可能藏着长期方向。"],
          updatedDay: 1,
          status: "练习中",
          nextMilestone: "再完成一次相关行动，形成更稳定的判读方法。"
        },
        {
          id: "skill-social-attunement",
          name: "共情沟通",
          actionType: "social",
          level: 1,
          progress: 12,
          totalXp: 12,
          description: "听懂同伴真正担心的事，并把关系推进到下一步。",
          tags: ["社交", "关系", "同伴"],
          evidence: ["星野还在学习怎样不急着给出答案，而是先听清对方在意什么。"],
          updatedDay: 1,
          status: "练习中",
          nextMilestone: "和一位同伴完成一次有回应的交流。"
        },
        {
          id: "skill-rumor-tracking",
          name: "传闻追踪",
          actionType: "explore",
          level: 1,
          progress: 10,
          totalXp: 10,
          description: "在地点、传闻和异常现象之间建立可验证连接。",
          tags: ["探索", "传闻", "地点"],
          evidence: ["旧码头让星野感觉到星港的异常并不只是背景噪音。"],
          updatedDay: 1,
          status: "练习中",
          nextMilestone: "把一个地点线索追到可验证的证据。"
        }
      ]
    },
    npcs: Object.fromEntries(
      NPCS.map((npc) => [
        npc.id,
        {
          ...npc,
          memories: [],
          reflections: [],
          bondEvents: [],
          questLines: [],
          relationshipStage: "初识",
          stance: "观望",
          hiddenGoalRevealed: false
        }
      ])
    ),
    locations: Object.fromEntries(
      LOCATIONS.map((location) => [
        location.id,
        {
          ...location,
          visits: 0
        }
      ])
    ),
    diary: [
      {
        id: "entry-opening",
        day: 1,
        slot: 0,
        title: "抵达星港",
        text: "你拖着行李经过旧码头，第一次看到学院灯塔在雾里亮起。",
        mood: "calm",
        actionLabel: "开局"
      }
    ],
    memories: [
      {
        id: "memory-opening",
        day: 1,
        owner: "hero",
        text: "星野记得自己想在这里找到一个真正愿意投入的方向。",
        weight: 3,
        actionType: "opening",
        actionLabel: "开局",
        locationId: "dock",
        locationName: "旧码头",
        npcId: "",
        npcName: "",
        tags: ["开局", "目标", "身份", "旧码头"],
        relatedMemoryIds: [],
        relatedMemoryLabels: []
      }
    ],
    memoryTopics: [
      {
        id: "topic-opening-direction",
        title: "长期方向",
        summary: "星野想在星港学院找到一个真正愿意长期投入的方向。",
        tags: ["目标", "身份", "开局"],
        memoryIds: ["memory-opening"],
        evidence: ["星野记得自己想在这里找到一个真正愿意投入的方向。"],
        strength: 18,
        createdDay: 1,
        updatedDay: 1,
        actionType: "opening",
        locationId: "dock",
        npcId: "",
        source: "opening",
        freshness: 100,
        maintenanceStatus: "active",
        maintenanceLabel: "可引用",
        maintenanceReason: "最新证据来自第 1 天，仍适合作为当前行动依据。",
        nextMaintenanceAction: "继续用新行动补充证据。",
        staleEvidenceCount: 0,
        ageDays: 0
      }
    ],
    worldFacts: [
      {
        id: "fact-opening-dock",
        day: 1,
        updatedDay: 1,
        title: "旧码头是最初线索",
        text: "旧码头是星野抵达星港时第一个留下长期方向感的地点。",
        locationId: "dock",
        locationName: "旧码头",
        npcId: "",
        npcName: "",
        actionType: "opening",
        tags: ["旧码头", "开局", "方向"],
        confidence: 42,
        status: "observed",
        evidence: ["抵达星港时，旧码头让星野第一次感到这里藏着长期方向。"],
        source: "opening"
      }
    ],
    reflections: [
      {
        id: "reflection-opening",
        day: 1,
        title: "第一条自我观察",
        text: "星野还不知道自己会成为什么样的人，但已经开始把选择和感受放在一起看。",
        focus: "identity",
        source: "opening"
      }
    ],
    plans: [
      {
        id: "plan-opening-study",
        day: 1,
        title: "把星港先看清楚",
        intent: "去观测塔研读学院资料，找出一个值得长期投入的方向",
        actionType: "study",
        locationId: "observatory",
        reason: "开局目标需要先建立对环境的理解。",
        source: "opening"
      },
      {
        id: "plan-opening-social",
        day: 1,
        title: "认识一个能认真交流的人",
        intent: "找一位同伴聊聊星港最近发生的事，听听他们在意什么",
        actionType: "social",
        locationId: "greenhouse",
        npcId: "lin",
        reason: "关系会让开放式行动获得更稳定的牵引。",
        source: "opening"
      },
      {
        id: "plan-opening-rest",
        day: 1,
        title: "给自己留一点余裕",
        intent: "回宿舍整理第一天的感受，把目标和疑问写进日记",
        actionType: "rest",
        locationId: "dorm",
        reason: "低压力和清晰记录能让后续选择更连贯。",
        source: "opening"
      }
    ],
    chapters: [
      {
        id: "chapter-opening",
        title: "初到星港",
        premise: "星野刚抵达星港学院，需要在环境、同伴和自身方向之间建立第一条稳定线索。",
        objective: "找到一个值得连续投入的方向，并让至少一位同伴成为可信的观察者。",
        currentBeat: "先把星港看清楚，再决定把精力投向哪里。",
        nextHook: "围绕观测塔资料、旧码头传闻或林鸢的观察开启一次能留下证据的行动。",
        constraint: "不要过早跳到结论；让记忆、承诺和关系逐步证明方向。",
        evidence: ["开局目标", "第一条自我观察"],
        actionType: "study",
        locationId: "observatory",
        npcId: "",
        status: "active",
        startedDay: 1,
        updatedDay: 1,
        completedDay: null,
        progress: 12,
        pressure: 0,
        source: "opening"
      }
    ],
    continuityTraces: [],
    commitments: [],
    flags: {
      completedDays: 0
    }
  };
}

export function findLocation(id) {
  return LOCATIONS.find((location) => location.id === id) || LOCATIONS[0];
}

export function findNpc(id) {
  return NPCS.find((npc) => npc.id === id) || null;
}

export function findPreset(id) {
  return ACTION_PRESETS.find((preset) => preset.id === id) || ACTION_PRESETS[0];
}
