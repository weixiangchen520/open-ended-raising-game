import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ACTION_PRESETS,
  LOCATIONS,
  MOOD_LABELS,
  createInitialState,
  STAT_KEYS,
  STAT_META,
  TIME_SLOTS
} from "./game/data.js";
import {
  addCommitmentFromChoice,
  applyOutcome,
  buildActionOpportunities,
  buildExperienceDiagnostics,
  createAction,
  createLocalOutcome,
  deriveWarnings,
  inferActionId,
  importGame,
  normalizeOutcome,
  selectRelevantContext,
  serializeGame
} from "./game/engine.js";
import "./styles.css";

const STORAGE_KEY = "starharbor-diary-save-v1";
const CLIENT_SESSION_KEY = "starharbor-client-session-v1";

const toneColors = {
  teal: "#69e4dd",
  coral: "#ff7b67",
  moss: "#8bd56f",
  violet: "#b08cff",
  amber: "#f0b15a",
  steel: "#8eb5cf",
  red: "#ff6978",
  green: "#79e09f"
};

const APP_TABS = [
  { id: "home", label: "首页", hash: "plans", icon: "home" },
  { id: "action", label: "行动", hash: "actions", icon: "action" },
  { id: "bond", label: "羁绊", hash: "bond-quests", icon: "bond" },
  { id: "memory", label: "记忆", hash: "memory", icon: "memory" },
  { id: "me", label: "我的", hash: "profile", icon: "me" }
];

const SECTION_TAB_MAP = {
  plans: "home",
  opportunities: "home",
  diagnostics: "home",
  chapters: "home",
  actions: "action",
  map: "action",
  outcome: "action",
  event: "action",
  "context-preview": "action",
  "bond-quests": "bond",
  npcs: "bond",
  commitments: "bond",
  continuity: "memory",
  reflection: "memory",
  reflections: "memory",
  "world-facts": "memory",
  "memory-topics": "memory",
  memory: "memory",
  profile: "me",
  stats: "me",
  skills: "me",
  goals: "me",
  diary: "me"
};

function hashIdFromLocation() {
  return String(window.location.hash || "").replace(/^#/, "").trim();
}

function tabIdFromHash(hash) {
  const hashId = String(hash || "").replace(/^#/, "").trim();
  const directTab = APP_TABS.find((tab) => tab.id === hashId || tab.hash === hashId);
  return directTab?.id || SECTION_TAB_MAP[hashId] || "home";
}

function hashForTab(tabId) {
  return APP_TABS.find((tab) => tab.id === tabId)?.hash || APP_TABS[0].hash;
}

function replaceHashForTab(tabId) {
  const hash = hashForTab(tabId);
  if (window.location.hash === `#${hash}`) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
}

function App() {
  const [auth, setAuth] = useState({ status: "checking", user: null, message: "" });
  const [state, setState] = useState(createInitial);
  const [activeTab, setActiveTab] = useState(() => tabIdFromHash(window.location.hash));
  const [selection, setSelection] = useState(() => ({
    locationId: state.currentLocationId || "observatory",
    npcId: "",
    presetId: "study",
    customText: ""
  }));
  const [meta, setMeta] = useState({
    provider: "local",
    status: "选择地点、同伴和行动，然后推进时间。",
    lastOutcome: null,
    statDeltas: {},
    isBusy: false
  });
  const [busy, setBusy] = useState(false);
  const importInputRef = useRef(null);
  const appContentRef = useRef(null);
  const pendingSectionRef = useRef(hashIdFromLocation());

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    function handleHashChange() {
      pendingSectionRef.current = hashIdFromLocation();
      setActiveTab(tabIdFromHash(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    scrollActiveTabContent(pendingSectionRef.current || hashForTab(activeTab), "auto");
    pendingSectionRef.current = "";
  }, [activeTab]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    clientLog("app.loaded", {
      accountId: auth.user.id,
      day: state.day,
      slot: state.slot,
      locationId: state.currentLocationId
    });
  }, [auth.status, auth.user?.id]);

  async function restoreSession() {
    try {
      const session = await requestSession();
      if (!session.authenticated) {
        setAuth({ status: "unauthenticated", user: null, message: "" });
        return;
      }
      await enterAuthenticatedSession(session.user);
    } catch (error) {
      setAuth({ status: "unauthenticated", user: null, message: `会话检查失败：${error.message}` });
    }
  }

  async function login(credentials) {
    setAuth({ status: "checking", user: null, message: "正在登录..." });
    try {
      const session = await requestLogin(credentials);
      await enterAuthenticatedSession(session.user);
    } catch (error) {
      setAuth({ status: "unauthenticated", user: null, message: error.message });
    }
  }

  async function enterAuthenticatedSession(user) {
    const nextState = await loadStateForUser(user);
    setState(nextState);
    setSelection({
      locationId: nextState.currentLocationId || "observatory",
      npcId: "",
      presetId: "study",
      customText: ""
    });
    setMeta({
      provider: "local",
      status: "已登录，选择地点、同伴和行动，然后推进时间。",
      lastOutcome: null,
      statDeltas: {},
      isBusy: false
    });
    setAuth({ status: "authenticated", user, message: "" });
  }

  async function logout() {
    await requestLogout().catch(() => {});
    setAuth({ status: "unauthenticated", user: null, message: "" });
    const fresh = createInitial();
    setState(fresh);
    setSelection({ locationId: fresh.currentLocationId, npcId: "", presetId: "study", customText: "" });
    setMeta({ provider: "local", status: "已退出登录。", lastOutcome: null, statDeltas: {}, isBusy: false });
  }

  async function performAction() {
    if (busy) return;
    setBusy(true);
    setMeta((current) => ({ ...current, status: "导演层正在生成事件...", isBusy: true }));

    const action = createAction(selection);
    clientLog("action.submit", {
      type: action.type,
      locationId: action.locationId,
      npcId: action.npcId || "none",
      customTextLength: action.customText.length,
      day: state.day,
      slot: state.slot
    });

    try {
      const result = await requestDirectorOutcome(state, action);
      const nextState = applyOutcome(state, action, result.outcome);
      setState(nextState);
      setSelection((current) => ({
        ...current,
        locationId: nextState.currentLocationId,
        customText: ""
      }));
      setMeta({
        provider: result.provider,
        warning: result.warning,
        status: result.warning || `完成：${result.outcome.title}`,
        lastOutcome: result.outcome,
        statDeltas: result.outcome.statDeltas,
        isBusy: false
      });
      await persistGameSave(nextState, auth.user);
      clientLog("action.result", {
        provider: result.provider,
        warning: Boolean(result.warning),
        title: result.outcome.title,
        mood: result.outcome.mood,
        day: nextState.day,
        slot: nextState.slot,
        continuityScore: nextState.continuityTraces?.at(-1)?.score || 0
      });
    } catch (error) {
      setMeta((current) => ({ ...current, status: `行动失败：${error.message}`, isBusy: false }));
      clientLog("action.failure", { message: error.message }, "error");
    } finally {
      setBusy(false);
    }
  }

  function updateSelection(patch, eventName, details) {
    setSelection((current) => ({ ...current, ...patch }));
    if (eventName) clientLog(eventName, details);
  }

  function selectTab(tabId, sourceEvent = "ui.tab_selected") {
    const nextTab = APP_TABS.some((tab) => tab.id === tabId) ? tabId : "home";
    setActiveTab(nextTab);
    replaceHashForTab(nextTab);
    pendingSectionRef.current = hashForTab(nextTab);
    scrollActiveTabContent(hashForTab(nextTab), "smooth");
    if (sourceEvent) clientLog(sourceEvent, { tabId: nextTab });
  }

  function scrollActiveTabContent(sectionId, behavior = "smooth") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = appContentRef.current;
        if (!container) return;
        const target = sectionId ? document.getElementById(sectionId) : null;
        if (target && container.contains(target)) {
          target.scrollIntoView({ behavior, block: "start" });
          return;
        }
        container.scrollTo({ top: 0, behavior });
      });
    });
  }

  function exportSave() {
    const blob = new Blob([serializeGame(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `starharbor-day-${state.day}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMeta((current) => ({ ...current, status: "存档已导出。" }));
    clientLog("save.exported", { day: state.day, slot: state.slot, diaryCount: state.diary.length });
  }

  async function importSave(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = importGame(await file.text());
      setState(imported);
      setSelection((current) => ({
        ...current,
        locationId: imported.currentLocationId || "observatory",
        customText: ""
      }));
      setMeta({ provider: "import", status: "存档已导入。", lastOutcome: null, statDeltas: {}, isBusy: false });
      await persistGameSave(imported, auth.user);
      clientLog("save.imported", { day: imported.day, slot: imported.slot });
    } catch (error) {
      setMeta((current) => ({ ...current, status: `导入失败：${error.message}` }));
      clientLog("save.import_failed", { message: error.message }, "warn");
    } finally {
      event.target.value = "";
    }
  }

  function resetSave() {
    if (!window.confirm("确定要重开吗？当前浏览器存档会被覆盖。")) return;
    const next = createInitial();
    setState(next);
    setSelection({ locationId: next.currentLocationId, npcId: "", presetId: "study", customText: "" });
    setMeta({ provider: "local", status: "新的一局已经开始。", lastOutcome: null, statDeltas: {}, isBusy: false });
    persistGameSave(next, auth.user).catch((error) => {
      clientLog("save.persist_failed", { message: error.message }, "warn");
    });
    clientLog("save.reset");
  }

  function usePromptSeed(text, source, details = {}, patch = {}) {
    const nextText = text.trim();
    if (!nextText) return;
    setSelection((current) => ({ ...current, ...patch, customText: nextText }));
    setMeta((current) => ({ ...current, status: "已填入下一次自由行动，可以直接执行或继续修改。" }));
    selectTab("action", "");
    pendingSectionRef.current = "actions";
    scrollActiveTabContent("actions", "smooth");
    clientLog(source, { ...details, textLength: nextText.length });
  }

  function useQuestSeed(quest, source) {
    const seed = questActionSeed(quest, state.currentLocationId);
    usePromptSeed(seed.intent, source, { questId: quest.id, npcId: quest.npcId, status: quest.status }, seed.patch);
  }

  function chooseOutcome(choice) {
    const intent = choice.intent || choice.label;
    const actionType = inferActionId(intent);
    const committed = addCommitmentFromChoice(state, choice, {
      sourceTitle: meta.lastOutcome?.title || "",
      actionType,
      locationId: selection.locationId || state.currentLocationId,
      npcId: selection.npcId || ""
    });
    setState(committed);
    persistGameSave(committed, auth.user).catch((error) => {
      clientLog("save.persist_failed", { message: error.message }, "warn");
    });
    usePromptSeed(intent, "ui.outcome_choice_selected", { label: choice.label, commitment: true }, {
      presetId: actionType,
      locationId: selection.locationId || state.currentLocationId,
      npcId: selection.npcId || ""
    });
  }

  function useCommitment(commitment) {
    usePromptSeed(commitment.intent, "ui.commitment_used", { commitmentId: commitment.id, status: commitment.status }, {
      presetId: commitment.actionType || inferActionId(commitment.intent),
      locationId: commitment.locationId || state.currentLocationId,
      npcId: commitment.npcId || ""
    });
  }

  function useChapter(chapter) {
    usePromptSeed(chapter.nextHook || chapter.objective, "ui.chapter_used", { chapterId: chapter.id, status: chapter.status }, {
      presetId: chapter.actionType || inferActionId(chapter.nextHook || chapter.objective),
      locationId: chapter.locationId || state.currentLocationId,
      npcId: chapter.npcId || ""
    });
  }

  if (auth.status === "checking") {
    return <LoadingScreen message={auth.message || "正在检查登录状态..."} />;
  }

  if (auth.status !== "authenticated") {
    return <LoginScreen message={auth.message} onLogin={login} />;
  }

  const actionContext = selectRelevantContext(state, createAction(selection));
  const actionOpportunities = buildActionOpportunities(state);
  const experienceDiagnostics = buildExperienceDiagnostics(state);

  function renderActiveTab() {
    if (activeTab === "action") {
      return (
        <>
          <TimeTrack slot={state.slot} />
          <MapPanel state={state} selection={selection} onSelect={updateSelection} />
          <ActionsPanel
            state={state}
            selection={selection}
            meta={meta}
            context={actionContext}
            busy={busy}
            onSelect={updateSelection}
            onPerform={performAction}
          />
          <OutcomePanel
            meta={meta}
            onChoose={chooseOutcome}
          />
        </>
      );
    }

    if (activeTab === "bond") {
      return (
        <>
          <BondQuestsPanel
            state={state}
            onUseQuestLine={(quest) => useQuestSeed(quest, "ui.quest_journal_used")}
          />
          <NpcsPanel
            state={state}
            selection={selection}
            onSelect={updateSelection}
            onUseQuestLine={(quest) => useQuestSeed(quest, "ui.npc_quest_used")}
            onUseBondEvent={(event, npc) => {
              const followUp = event.followUp || {};
              usePromptSeed(
                followUp.intent || event.text,
                "ui.bond_follow_up_used",
                { bondEventId: event.id, npcId: npc.id, type: event.type },
                {
                  presetId: followUp.actionType || "social",
                  locationId: followUp.locationId || state.currentLocationId,
                  npcId: followUp.npcId || npc.id
                }
              );
            }}
          />
          <CommitmentsPanel commitments={state.commitments || []} onUse={useCommitment} />
        </>
      );
    }

    if (activeTab === "memory") {
      return (
        <>
          <ContinuityPanel traces={state.continuityTraces || []} />
          <ReflectionPanel
            reflections={state.reflections || []}
            onUse={(reflection) =>
              usePromptSeed(
                `围绕「${reflection.focus || "洞察"}」继续行动：${reflection.title}`,
                "ui.reflection_used",
                { reflectionId: reflection.id, day: reflection.day }
              )
            }
          />
          <WorldFactsPanel facts={state.worldFacts || []} />
          <MemoryTopicsPanel topics={state.memoryTopics || []} />
          <MemoryPanel memories={state.memories} />
        </>
      );
    }

    if (activeTab === "me") {
      return (
        <>
          <ProfilePanel state={state} />
          <StatsPanel state={state} statDeltas={meta.statDeltas || {}} />
          <SkillsPanel skills={state.hero.skills || []} />
          <GoalsPanel goals={state.hero.goals} />
          <DiaryPanel
            diary={state.diary}
            onExport={exportSave}
            onImport={() => importInputRef.current?.click()}
            onReset={resetSave}
          />
        </>
      );
    }

    return (
      <>
        <TimeTrack slot={state.slot} />
        <PlansPanel
          plans={state.plans || []}
          onUse={(plan) =>
            usePromptSeed(
              plan.intent,
              "ui.plan_selected",
              { planId: plan.id, source: plan.source, actionType: plan.actionType },
              {
                presetId: plan.actionType || "study",
                locationId: plan.locationId || state.currentLocationId,
                npcId: plan.npcId || ""
              }
            )
          }
        />
        <OpportunitiesPanel
          opportunities={actionOpportunities}
          onUse={(opportunity) =>
            usePromptSeed(
              opportunity.intent,
              "ui.opportunity_used",
              { opportunityId: opportunity.id, source: opportunity.source, priority: opportunity.priority },
              {
                presetId: opportunity.actionType || "explore",
                locationId: opportunity.locationId || state.currentLocationId,
                npcId: opportunity.npcId || ""
              }
            )
          }
        />
        <DiagnosticsPanel diagnostics={experienceDiagnostics} />
        <ChaptersPanel chapters={state.chapters || []} onUse={useChapter} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <TopBar provider={meta.provider} user={auth.user} onLogout={logout} />
      <main ref={appContentRef} className="app-content" aria-live="polite">
        {renderActiveTab()}
      </main>

      <input ref={importInputRef} onChange={importSave} type="file" accept="application/json" hidden />
      <BottomNav activeTab={activeTab} onSelect={selectTab} />
    </div>
  );
}

function LoadingScreen({ message }) {
  return (
    <div className="app-shell auth-shell">
      <section className="auth-panel">
        <div className="loading-mark" aria-hidden="true" />
        <h1>星港日记</h1>
        <p>{message}</p>
      </section>
    </div>
  );
}

function LoginScreen({ message, onLogin }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onLogin({ login, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell auth-shell">
      <section className="auth-panel" aria-labelledby="login-title">
        <div>
          <span className="auth-kicker">Starharbor Diary</span>
          <h1 id="login-title">登录角色数据</h1>
          <p>每个账号使用独立存档和独立导演上下文，切换账号不会串档。</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            账号或邮箱
            <input
              autoComplete="username"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="输入账号"
              required
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              required
            />
          </label>
          {message ? <p className="auth-error">{message}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>
      </section>
    </div>
  );
}

function TopBar({ provider, user, onLogout }) {
  return (
    <header className="topbar">
      <div className="phone-time">8:05</div>
      <div className="online-pill">在线</div>
      <div className="flex items-center justify-end gap-2">
        {user ? <span className="account-chip">{user.displayName || user.login}</span> : null}
        {user ? (
          <button className="logout-button" type="button" onClick={onLogout}>
            退出
          </button>
        ) : null}
        <span className="pill hidden sm:inline-flex">{provider || "local"}</span>
      </div>
    </header>
  );
}

function ProfilePanel({ state }) {
  const activeGoals = state.hero.goals.filter((goal) => !goal.done).length;
  const reflectionCount = state.reflections?.length || 0;
  return (
    <section id="profile" className="profile-panel" aria-labelledby="hero-title">
      <div className="hero-tools" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="grid justify-items-center pt-24 text-center">
        <div className="hero-avatar">{state.hero.name.slice(0, 1) || "星"}</div>
        <h1 id="hero-title" className="hero-name">
          {state.hero.name}
        </h1>
        <p className="mt-0 text-sm text-star-muted">{state.hero.traits.join(" · ")}</p>
        <div className="mood-badge">{MOOD_LABELS[state.hero.mood] || state.hero.mood}</div>
      </div>
      <div className="profile-metrics">
        <Metric value={state.day} label="天数" />
        <Metric value={activeGoals} label="目标" />
        <Metric value={reflectionCount} label="洞察" />
      </div>
    </section>
  );
}

function Metric({ value, label }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TimeTrack({ slot }) {
  return (
    <div className="time-track" aria-label="今日时间进度">
      {TIME_SLOTS.map((name, index) => (
        <span
          key={name}
          className={`time-step ${index < slot ? "is-past" : ""} ${index === slot ? "is-current" : ""}`}
        >
          <span className="time-dot" aria-hidden="true" />
          <span>{name}</span>
        </span>
      ))}
    </div>
  );
}

function Panel({ id, title, copy, children, className = "" }) {
  return (
    <section id={id} className={`glass-panel ${className}`} aria-labelledby={`${id}-title`}>
      <div className="mb-3.5 flex items-start justify-between gap-3 max-[520px]:flex-col">
        <h2 id={`${id}-title`} className="whitespace-nowrap text-[1.05rem] font-black text-white">
          {title}
        </h2>
        {copy ? <p className="m-0 min-w-0 text-sm leading-relaxed text-star-muted">{copy}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ChaptersPanel({ chapters, onUse }) {
  const normalized = Array.isArray(chapters) ? chapters : [];
  const active = normalized.find((chapter) => chapter.status === "active") || normalized.at(-1);
  const completed = [...normalized]
    .filter((chapter) => chapter.status === "completed")
    .reverse()
    .slice(0, 2);

  return (
    <Panel id="chapters" title="篇章" copy="把多日行动收束成叙事单元，避免开放式游玩漂走。">
      {active ? (
        <article className={`chapter-card ${active.pressure >= 70 ? "is-urgent" : ""}`}>
          <header>
            <div>
              <span>{chapterSourceLabel(active.source)} · 第 {active.startedDay} 天开始</span>
              <strong>{active.title}</strong>
            </div>
            <button className="tiny-action" type="button" onClick={() => onUse(active)}>
              推进
            </button>
          </header>
          <p>{active.currentBeat || active.premise}</p>
          <div className="chapter-bars">
            <ProgressLine label="进度" value={active.progress || 0} />
            <ProgressLine label="压力" value={active.pressure || 0} tone={active.pressure >= 70 ? "warm" : "cool"} />
          </div>
          <div className="chapter-next">
            <strong>下一步</strong>
            <span>{active.nextHook || active.objective}</span>
          </div>
          {active.constraint ? <small>{active.constraint}</small> : null}
          {active.evidence?.length ? (
            <div className="chapter-evidence">
              {active.evidence.slice(-4).map((item) => (
                <span key={item}>{shortText(item, 34)}</span>
              ))}
            </div>
          ) : null}
        </article>
      ) : (
        <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
          完成一天后，系统会把行动收束成新的篇章。
        </div>
      )}
      {completed.length ? (
        <div className="chapter-history">
          {completed.map((chapter) => (
            <div key={chapter.id}>
              <strong>{chapter.title}</strong>
              <span>第 {chapter.startedDay}-{chapter.completedDay || chapter.updatedDay} 天 · {chapter.evidence?.[0] || "已收束"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function ProgressLine({ label, value, tone = "cool" }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`chapter-progress is-${tone}`}>
      <div>
        <span>{label}</span>
        <b>{percent}%</b>
      </div>
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}

function chapterSourceLabel(source) {
  return {
    opening: "开局",
    chapter: "篇章",
    commitment: "承诺",
    bond: "羁绊",
    goal: "目标",
    reflection: "洞察",
    world: "世界"
  }[source] || "篇章";
}

function PlansPanel({ plans, onUse }) {
  const todayPlans = plans.slice(0, 3);
  return (
    <Panel id="plans" title="今日计划" copy="由目标、状态和洞察生成；可以直接采用，也可以改写。">
      <div className="grid gap-2.5">
        {todayPlans.length ? (
          todayPlans.map((plan) => (
            <button key={plan.id} className="plan-card" type="button" onClick={() => onUse(plan)}>
              <div className="flex items-start justify-between gap-3">
                <strong>{plan.title}</strong>
                <span className="plan-chip">{planSourceLabel(plan.source)}</span>
              </div>
              <p>{plan.intent}</p>
              <small>{plan.reason}</small>
            </button>
          ))
        ) : (
          <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
            当前还没有计划。完成一次行动后，系统会根据新记忆继续推演。
          </div>
        )}
      </div>
    </Panel>
  );
}

function OpportunitiesPanel({ opportunities, onUse }) {
  const items = [...(opportunities || [])].slice(0, 2);
  return (
    <Panel id="opportunities" title="行动机会" copy="把承诺、羁绊、技能、世界发现和记忆维护整理成当前最值得处理的行动入口。">
      <div className="grid gap-2.5">
        {items.length ? items.map((opportunity) => (
          <button key={opportunity.id} className="opportunity-card" type="button" onClick={() => onUse(opportunity)}>
            <header>
              <div>
                <strong>{opportunity.title}</strong>
                <span>{opportunitySourceLabel(opportunity.source)} · 优先级 {opportunity.priority || 0}</span>
              </div>
              <b>{opportunity.priority || 0}</b>
            </header>
            <p>{opportunity.intent}</p>
            <small>{opportunity.reason}</small>
            {visibleMemoryTags(opportunity.tags).length ? (
              <div className="memory-tags">
                {visibleMemoryTags(opportunity.tags).slice(0, 5).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </button>
        )) : (
          <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
            当前没有特别紧迫的机会，可以按今日计划行动。
          </div>
        )}
      </div>
    </Panel>
  );
}

function DiagnosticsPanel({ diagnostics }) {
  const metrics = diagnostics?.metrics || [];
  const warnings = diagnostics?.warnings || [];
  const recommendations = diagnostics?.recommendations || [];

  return (
    <Panel id="diagnostics" title="体验诊断" copy="把长线开放式养成拆成连续性、行动多样性、开放循环、记忆健康、成长势能和世界知识。">
      <div className="diagnostic-summary">
        <div>
          <span>健康分</span>
          <strong>{diagnostics?.score || 0}</strong>
        </div>
        <p>{diagnostics?.summary}</p>
        <b>{diagnostics?.label}</b>
      </div>
      <div className="diagnostic-grid">
        {metrics.map((metric) => (
          <article key={metric.id} className={`diagnostic-card is-${metric.tone}`}>
            <header>
              <strong>{metric.label}</strong>
              <span>{metric.value}</span>
            </header>
            <MiniMeter label={metric.label} value={metric.value} color={diagnosticToneColor(metric.tone)} />
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>
      {warnings.length || recommendations.length ? (
        <div className="diagnostic-notes">
          {warnings.length ? (
            <div className="diagnostic-list is-warning">
              <strong>需要看护</strong>
              {warnings.slice(0, 2).map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
          {recommendations.length ? (
            <div className="diagnostic-list">
              <strong>下一步建议</strong>
              {recommendations.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function diagnosticToneColor(tone) {
  if (tone === "good") return toneColors.green;
  if (tone === "risk") return toneColors.red;
  return toneColors.amber;
}

function opportunitySourceLabel(source) {
  return {
    commitment: "承诺",
    quest: "羁绊",
    memory: "记忆",
    worldFact: "发现",
    skill: "能力",
    chapter: "篇章"
  }[source] || "机会";
}

function planSourceLabel(source) {
  return {
    goal: "目标",
    state: "状态",
    reflection: "洞察",
    relationship: "关系",
    bond: "羁绊",
    chapter: "篇章",
    world: "世界",
    "opportunity:commitment": "机会",
    "opportunity:quest": "机会",
    "opportunity:memory": "机会",
    "opportunity:worldFact": "机会",
    "opportunity:skill": "机会",
    "opportunity:chapter": "机会",
    fallback: "备选",
    opening: "开局"
  }[source] || "计划";
}

function BondQuestsPanel({ state, onUseQuestLine }) {
  const [filter, setFilter] = useState("all");
  const allQuests = Object.values(state.npcs || {})
    .flatMap((npc) => (npc.questLines || []).map((quest) => ({
      ...quest,
      npcName: quest.npcName || npc.name
    })))
    .sort((a, b) => questSortScore(b, state.day) - questSortScore(a, state.day));
  const filters = [
    { id: "all", label: "全部", count: allQuests.length },
    { id: "urgent", label: "紧张", count: allQuests.filter(isQuestUrgent).length },
    { id: "active", label: "进行中", count: allQuests.filter((quest) => questMatchesFilter(quest, "active")).length },
    { id: "completed", label: "完成", count: allQuests.filter((quest) => questMatchesFilter(quest, "completed")).length }
  ];
  const quests = allQuests.filter((quest) => questMatchesFilter(quest, filter)).slice(0, 6);

  return (
    <Panel id="bond-quests" title="羁绊任务" copy="所有同伴关系线的任务日志；可按紧张、进行中和完成筛选。">
      {allQuests.length ? (
        <div className="quest-filter-tabs" role="tablist" aria-label="羁绊任务筛选">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? "is-active" : ""}
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              <b>{item.count}</b>
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-2.5">
        {quests.length ? quests.map((quest) => (
          <article key={quest.id} className={`quest-journal-card ${quest.status === "completed" ? "is-completed" : ""} ${quest.status === "strained" ? "is-strained" : ""}`}>
            <header className="flex items-start justify-between gap-3">
              <div>
                <strong>{quest.title}</strong>
                <span>{quest.npcName || "同伴"} · {questStatusLabel(quest)}</span>
              </div>
              <button className="tiny-action" type="button" onClick={() => onUseQuestLine(quest)}>
                {questActionLabel(quest)}
              </button>
            </header>
            <div className="quest-journal-meter">
              <Meter
                value={quest.progress}
                color={quest.status === "completed" ? toneColors.green : quest.status === "strained" ? toneColors.red : toneColors.amber}
                label="羁绊任务进度"
              />
            </div>
            <div className="quest-journal-meta">
              <span>进度 {quest.progress}%</span>
              <span>压力 {quest.pressure || 0}%</span>
              <span>期限 第 {quest.dueDay || state.day} 天</span>
            </div>
            <p>{quest.completion?.text || quest.warning || quest.currentStep || quest.intent}</p>
          </article>
        )) : (
          <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
            {allQuests.length ? questFilterEmptyCopy(filter) : "还没有展开的羁绊任务。推进同伴关系后，这里会出现长期关系线。"}
          </div>
        )}
      </div>
    </Panel>
  );
}

function isQuestUrgent(quest) {
  return quest.status === "strained" || (quest.pressure || 0) >= 45;
}

function questMatchesFilter(quest, filter) {
  if (filter === "urgent") return isQuestUrgent(quest);
  if (filter === "active") return quest.status !== "completed" && !isQuestUrgent(quest);
  if (filter === "completed") return quest.status === "completed";
  return true;
}

function questFilterEmptyCopy(filter) {
  if (filter === "urgent") return "当前没有紧张任务。继续回应同伴，关系线会保持稳定。";
  if (filter === "active") return "当前没有进行中的羁绊任务。可以先沉淀已完成结果，或继续推进同伴关系。";
  if (filter === "completed") return "还没有完成的羁绊任务。完成长期步骤后，结算会出现在这里。";
  return "还没有展开的羁绊任务。推进同伴关系后，这里会出现长期关系线。";
}

function questSortScore(quest, day) {
  if (quest.status === "strained") return 500 + (quest.pressure || 0);
  if (quest.status === "completed") return 100 + (quest.completedDay || 0);
  return 220 + (quest.pressure || 0) + Math.max(0, (day || 1) - (quest.dueDay || day || 1)) * 12 + (quest.progress || 0);
}

function questStatusLabel(quest) {
  if (quest.status === "completed") return "已完成";
  if (quest.status === "strained") return "紧张";
  if ((quest.pressure || 0) >= 45) return "需要回应";
  return "进行中";
}

function questActionLabel(quest) {
  if (quest.status === "completed") return "沉淀";
  if (quest.status === "strained" || (quest.pressure || 0) >= 45) return "修复";
  return quest.nextLabel || "推进";
}

function questActionSeed(quest, fallbackLocationId) {
  if (quest.status === "completed") {
    return {
      intent: `和${quest.npcName || "这位同伴"}整理「${quest.title}」的结果，决定下一条长期线索。`,
      patch: {
        presetId: "social",
        locationId: "greenhouse",
        npcId: quest.npcId || ""
      }
    };
  }
  if (quest.status === "strained" || (quest.pressure || 0) >= 45) {
    return {
      intent: `找${quest.npcName || "这位同伴"}认真回应「${quest.title}」被搁置的担心，再继续推进。`,
      patch: {
        presetId: "social",
        locationId: "greenhouse",
        npcId: quest.npcId || ""
      }
    };
  }
  return {
    intent: quest.currentStep || quest.intent,
    patch: {
      presetId: quest.actionType || "social",
      locationId: quest.locationId || fallbackLocationId,
      npcId: quest.npcId || ""
    }
  };
}

function StatsPanel({ state, statDeltas }) {
  const warnings = deriveWarnings(state);
  return (
    <Panel id="stats" title="成长状态" copy="本日能力和压力概览。">
      <div className="grid gap-3">
        {STAT_KEYS.map((key) => {
          const meta = STAT_META[key];
          const value = state.hero.stats[key] ?? 0;
          const delta = Number(statDeltas[key] || 0);
          return (
            <div
              key={key}
              className={`grid min-h-8 grid-cols-[48px_1fr_56px] items-center gap-3 rounded-xl ${
                delta > 0 ? "bg-emerald-300/10" : delta < 0 ? "bg-rose-300/10" : ""
              }`}
            >
              <span className="text-sm font-black text-white">{meta.label}</span>
              <Meter value={value} color={toneColors[meta.tone] || toneColors.teal} label={meta.label} />
              <span className="flex items-center justify-end gap-1 text-sm font-black text-white">
                {value}
                {delta ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${delta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {warnings.length ? (
        <div className="mt-3 grid gap-2">
          {warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-amber-300/20 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
              {warning}
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function Meter({ value, color, label }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white/10" aria-label={`${label} ${value}`}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

function SkillsPanel({ skills }) {
  const items = [...(skills || [])]
    .sort((a, b) => (b.level || 1) - (a.level || 1) || (b.progress || 0) - (a.progress || 0))
    .slice(0, 6);

  return (
    <Panel id="skills" title="能力库" copy="重复行动会沉淀成可复用能力，后续行动会优先引用匹配能力。">
      <div className="grid gap-2.5">
        {items.length ? items.map((skill) => (
          <article key={skill.id} className="skill-card">
            <header>
              <div>
                <strong>{skill.name}</strong>
                <span>{skill.status || "练习中"} · {skill.description}</span>
              </div>
              <b>等级 {skill.level || 1}</b>
            </header>
            <MiniMeter label="进度" value={skill.progress || 0} color={skill.level >= 3 ? toneColors.green : toneColors.violet} />
            <p>{skill.nextMilestone}</p>
            {visibleMemoryTags(skill.tags).length ? (
              <div className="memory-tags">
                {visibleMemoryTags(skill.tags).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            {skill.evidence?.length ? (
              <div className="skill-evidence">
                {skill.evidence.slice(0, 2).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
          </article>
        )) : (
          <div className="rounded-2xl bg-white/10 p-3 text-star-muted">
            还没有形成稳定能力。
          </div>
        )}
      </div>
    </Panel>
  );
}

function MapPanel({ state, selection, onSelect }) {
  const selected = state.locations[selection.locationId] || LOCATIONS[0];
  return (
    <Panel id="map" title="星港地图" copy={selected.description}>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <img className="block aspect-[16/10] h-full w-full object-cover opacity-85 brightness-75 saturate-90" src="/assets/starharbor-map.svg" alt="星港学院地图" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
        {LOCATIONS.map((location) => (
          <ChoiceButton
            key={location.id}
            selected={selection.locationId === location.id}
            onClick={() => onSelect({ locationId: location.id }, "ui.location_selected", { locationId: location.id })}
            title={`${location.name} · ${state.locations[location.id]?.visits || 0}`}
            copy={location.description}
          />
        ))}
      </div>
    </Panel>
  );
}

function ActionsPanel({ state, selection, meta, context, busy, onSelect, onPerform }) {
  const location = state.locations[selection.locationId] || LOCATIONS[0];
  const action = ACTION_PRESETS.find((item) => item.id === selection.presetId) || ACTION_PRESETS[0];
  const npc = selection.npcId ? state.npcs[selection.npcId] : null;
  const actionLabel = selection.customText.trim() || action.label;

  return (
    <Panel id="actions" title="行动" copy="固定行动给稳定收益，自由行动由导演层解释。">
      <div className="grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
        {ACTION_PRESETS.map((preset) => (
          <ChoiceButton
            key={preset.id}
            selected={selection.presetId === preset.id}
            onClick={() => onSelect({ presetId: preset.id }, "ui.action_selected", { presetId: preset.id })}
            title={preset.label}
            copy={preset.description}
          />
        ))}
      </div>

      <label className="mt-3 grid gap-2 text-sm font-black text-star-muted">
        自由行动
        <textarea
          className="field-input"
          rows={4}
          value={selection.customText}
          onChange={(event) => onSelect({ customText: event.target.value })}
          placeholder="例如：邀请林鸢一起去观测塔核对昨晚的星图"
        />
      </label>

      <div className="action-preview">
        <div>
          <strong>下一段时间</strong>
          <p>{location.name} / {npc ? npc.name : "独自行动"} / {actionLabel}</p>
        </div>
        <span>{meta.isBusy ? "生成中" : "就绪"}</span>
      </div>

      <ActionContextPreview context={context} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="button-primary" disabled={busy} type="button" onClick={onPerform}>
          {busy ? "生成中..." : "执行行动"}
        </button>
        <button className="button-ghost" type="button" onClick={() => onSelect({ customText: "" }, "ui.custom_action_cleared")}>
          清空输入
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-star-muted">{meta.status || meta.warning || ""}</p>
    </Panel>
  );
}

function ActionContextPreview({ context }) {
  const groups = buildActionContextGroups(context);
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div id="context-preview" className="context-preview">
      <div className="context-preview-head">
        <div>
          <strong>行动依据</strong>
          <span>导演层会优先带入的上下文</span>
        </div>
        <b>{total}</b>
      </div>
      <div className="context-preview-grid">
        {groups.length ? (
          groups.map((group) => (
            <article key={group.id} className="context-source-card">
              <header>
                <span>{group.label}</span>
                <b>{group.count}</b>
              </header>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))
        ) : (
          <div className="context-empty">这次行动还没有直接命中的长期上下文。</div>
        )}
      </div>
    </div>
  );
}

function buildActionContextGroups(context = {}) {
  return [
    {
      id: "chapters",
      label: "篇章",
      count: context.chapters?.length || 0,
      items: (context.chapters || []).slice(0, 2).map((chapter) =>
        contextItemLabel(chapter, chapter.title || chapter.objective)
      )
    },
    {
      id: "plans",
      label: "计划",
      count: context.plans?.length || 0,
      items: (context.plans || []).slice(0, 2).map((plan) =>
        contextItemLabel(plan, plan.title || plan.intent)
      )
    },
    {
      id: "opportunities",
      label: "机会",
      count: context.opportunities?.length || 0,
      items: (context.opportunities || []).slice(0, 2).map((opportunity) =>
        contextItemLabel(opportunity, `${opportunity.title}：${opportunity.reason}`)
      )
    },
    {
      id: "skills",
      label: "能力",
      count: context.skills?.length || 0,
      items: (context.skills || []).slice(0, 2).map((skill) =>
        contextItemLabel(skill, `${skill.name} Lv.${skill.level}：${skill.description}`)
      )
    },
    {
      id: "worldFacts",
      label: "发现",
      count: context.worldFacts?.length || 0,
      items: (context.worldFacts || []).slice(0, 2).map((fact) =>
        contextItemLabel(fact, `${fact.title}：${fact.text}`)
      )
    },
    {
      id: "memories",
      label: "记忆",
      count: context.memories?.length || 0,
      items: (context.memories || []).slice(0, 2).map((memory) =>
        contextItemLabel(memory, `${memoryOwnerLabel(memory)}：${memory.text}`)
      )
    },
    {
      id: "memoryTopics",
      label: "主题",
      count: context.memoryTopics?.length || 0,
      items: (context.memoryTopics || []).slice(0, 2).map((topic) =>
        contextItemLabel(topic, `${topic.title}：${topic.summary}`)
      )
    },
    {
      id: "reflections",
      label: "洞察",
      count: (context.reflections?.length || 0) + (context.npcReflections?.length || 0),
      items: [...(context.reflections || []), ...(context.npcReflections || [])]
        .slice(0, 2)
        .map((reflection) => contextItemLabel(reflection, reflection.title || reflection.text))
    },
    {
      id: "bonds",
      label: "羁绊",
      count: (context.npcBondEvents?.length || 0) + (context.npcQuestLines?.length || 0),
      items: [...(context.npcBondEvents || []), ...(context.npcQuestLines || [])]
        .slice(0, 2)
        .map((item) => item.title || item.currentStep || item.intent)
    },
    {
      id: "commitments",
      label: "承诺",
      count: context.commitments?.length || 0,
      items: (context.commitments || []).slice(0, 2).map((commitment) =>
        contextItemLabel(commitment, commitment.intent)
      )
    },
    {
      id: "goals",
      label: "目标",
      count: context.activeGoals?.length || 0,
      items: (context.activeGoals || []).slice(0, 2).map((goal) => goal.text)
    }
  ]
    .filter((group) => group.count > 0 && group.items.length)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => shortText(item, 58))
    }));
}

function contextItemLabel(item, label) {
  const reasons = [...(item.matchReasons || [])];
  const terms = (item.matchedTerms || [])
    .filter((term) => !["线索", "行动", "计划", "记忆", "篇章", "目标"].includes(term))
    .slice(0, 3);
  if (terms.length) reasons.push(`线索:${terms.join("/")}`);
  return reasons.length
    ? `${label} · 命中 ${reasons.slice(0, 3).join("、")}`
    : label;
}

function OutcomePanel({ meta, onChoose }) {
  if (meta.isBusy) {
    return (
      <Panel id="event" title="回响" copy="最近一次行动的叙事结果和后续线索。">
        <div className="outcome-box">
          <span className="loading-mark" aria-hidden="true" />
          <div>
            <strong>导演层正在推演</strong>
            <p>地点、同伴和行动会合成这段时间的回响。</p>
          </div>
        </div>
      </Panel>
    );
  }

  if (!meta.lastOutcome) {
    return (
      <Panel id="event" title="回响" copy="最近一次行动的叙事结果和后续线索。">
        <div className="outcome-box">
          <div>
            <strong>还没有新的回响</strong>
            <p>执行一次行动后，这里会显示叙事结果、状态变化和后续线索。</p>
          </div>
        </div>
      </Panel>
    );
  }

  const deltas = Object.entries(meta.lastOutcome.statDeltas || {}).filter(([, value]) => value);
  return (
    <Panel id="event" title="回响" copy="最近一次行动的叙事结果和后续线索。">
      <article className="rounded-2xl border border-white/10 bg-black/30 p-3.5">
        <div className="flex items-center gap-2">
          <span className="event-dot" aria-hidden="true" />
          <strong className="text-white">{meta.lastOutcome.title}</strong>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-star-muted">{meta.lastOutcome.narration}</p>
        {deltas.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {deltas.map(([key, value]) => (
              <span key={key} className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-violet-100">
                {STAT_META[key]?.label || key} {value > 0 ? "+" : ""}
                {value}
              </span>
            ))}
          </div>
        ) : null}
        {meta.lastOutcome.choices?.length ? (
          <div className="mt-3 grid gap-2">
            {meta.lastOutcome.choices.slice(0, 3).map((choice) => (
              <button
                key={`${choice.label}-${choice.intent}`}
                className="choice-seed"
                type="button"
                onClick={() => onChoose(choice)}
              >
                <strong>{choice.label}</strong>
                <span>{choice.intent}</span>
              </button>
            ))}
          </div>
        ) : null}
      </article>
    </Panel>
  );
}

function CommitmentsPanel({ commitments, onUse }) {
  const items = [...(commitments || [])]
    .sort((a, b) => commitmentSortScore(b) - commitmentSortScore(a))
    .slice(0, 6);

  return (
    <Panel id="commitments" title="承诺" copy="从回响里选择的后续线索会成为承诺；兑现或错过都会进入连续性记录。">
      <div className="grid gap-2.5">
        {items.length ? items.map((commitment) => (
          <article key={commitment.id} className={`commitment-card is-${commitment.status}`}>
            <header>
              <div>
                <strong>{commitment.title}</strong>
                <span>{commitmentStatusLabel(commitment)} · 期限 第 {commitment.dueDay} 天</span>
              </div>
              {commitment.status === "open" ? (
                <button className="tiny-action" type="button" onClick={() => onUse(commitment)}>
                  兑现
                </button>
              ) : null}
            </header>
            <p>{commitment.intent}</p>
            <div className="commitment-meta">
              <span>{commitment.actionType || "行动"}</span>
              {commitment.npcName ? <span>{commitment.npcName}</span> : null}
              {commitment.sourceTitle ? <span>{commitment.sourceTitle}</span> : null}
            </div>
            {commitment.resolution ? <small>{commitment.resolution}</small> : null}
          </article>
        )) : (
          <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
            还没有承诺。执行行动后，从“回响”的后续线索里选择一项即可记录。
          </div>
        )}
      </div>
    </Panel>
  );
}

function commitmentSortScore(commitment) {
  if (commitment.status === "open") return 300 - (commitment.dueDay || 0);
  if (commitment.status === "fulfilled") return 120 + (commitment.fulfilledDay || 0);
  return 80 + (commitment.missedDay || 0);
}

function commitmentStatusLabel(commitment) {
  if (commitment.status === "fulfilled") return "已兑现";
  if (commitment.status === "missed") return "错过";
  return (commitment.pressure || 0) >= 60 ? "临近期限" : "待兑现";
}

function ContinuityPanel({ traces }) {
  const recent = [...traces].reverse().slice(0, 3);
  return (
    <Panel id="continuity" title="连续性" copy="每次行动留下的证据条，用来观察它是否引用过去并推动长期状态。">
      <div className="grid gap-2.5">
        {recent.length ? (
          recent.map((trace) => {
            const chips = buildTraceChips(trace.signals);
            return (
              <article key={trace.id} className="trace-card">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{trace.actionLabel}</strong>
                    <span>
                      第 {trace.day} 天 · {trace.locationName}
                      {trace.npcName ? ` · ${trace.npcName}` : ""}
                    </span>
                  </div>
                  <div className="trace-score">
                    <b>{trace.score}</b>
                    <span>连续性</span>
                  </div>
                </header>
                <p>{trace.summary}</p>
                {chips.length ? (
                  <div className="trace-chips">
                    {chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                ) : null}
                {trace.anchors?.chapters?.length || trace.anchors?.plans?.length || trace.anchors?.opportunities?.length || trace.anchors?.skills?.length || trace.anchors?.worldFacts?.length || trace.anchors?.memoryTopics?.length || trace.anchors?.reflections?.length || trace.anchors?.npcBondEvents?.length || trace.anchors?.npcQuestLines?.length || trace.anchors?.commitments?.length ? (
                  <div className="trace-anchors">
                    {[...(trace.anchors.chapters || []), ...(trace.anchors.plans || []), ...(trace.anchors.opportunities || []), ...(trace.anchors.skills || []), ...(trace.anchors.worldFacts || []), ...(trace.anchors.memoryTopics || []), ...(trace.anchors.reflections || []), ...(trace.anchors.npcBondEvents || []), ...(trace.anchors.npcQuestLines || []), ...(trace.anchors.commitments || [])]
                      .slice(0, 3)
                      .map((anchor) => (
                        <span key={anchor}>{anchor}</span>
                      ))}
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
            执行行动后，这里会显示它引用了哪些上下文、写入了什么状态。
          </div>
        )}
      </div>
    </Panel>
  );
}

function buildTraceChips(signals = {}) {
  return [
    signals.retrievedChapters ? `篇章 ${signals.retrievedChapters}` : "",
    signals.retrievedPlans ? `计划 ${signals.retrievedPlans}` : "",
    signals.retrievedOpportunities ? `机会 ${signals.retrievedOpportunities}` : "",
    signals.retrievedSkills ? `能力 ${signals.retrievedSkills}` : "",
    signals.retrievedWorldFacts ? `发现 ${signals.retrievedWorldFacts}` : "",
    signals.retrievedMemoryTopics ? `主题 ${signals.retrievedMemoryTopics}` : "",
    signals.retrievedMemories ? `记忆 ${signals.retrievedMemories}` : "",
    signals.retrievedReflections ? `洞察 ${signals.retrievedReflections}` : "",
    signals.retrievedNpcReflections ? `NPC 反思 ${signals.retrievedNpcReflections}` : "",
    signals.retrievedCommitments ? `承诺 ${signals.retrievedCommitments}` : "",
    signals.skillsUpdated ? `成长 ${signals.skillsUpdated}` : "",
    signals.skillLevelUps ? `突破 ${signals.skillLevelUps}` : "",
    signals.worldFactsUpdated ? `世界 ${signals.worldFactsUpdated}` : "",
    signals.memoryWrites ? `写入 ${signals.memoryWrites}` : "",
    signals.memoryLinksCreated ? `关联 ${signals.memoryLinksCreated}` : "",
    signals.progressedGoals ? `目标 ${signals.progressedGoals}` : "",
    signals.relationshipDeltaCount ? `关系 ${signals.relationshipDeltaCount}` : "",
    signals.npcBondEventsCreated ? `羁绊 ${signals.npcBondEventsCreated}` : "",
    signals.npcQuestLinesProgressed ? `任务 ${signals.npcQuestLinesProgressed}` : "",
    signals.npcQuestLinesCompleted ? `完成 ${signals.npcQuestLinesCompleted}` : "",
    signals.npcQuestLinesPressured ? `压力 ${signals.npcQuestLinesPressured}` : "",
    signals.npcQuestLinesStrained ? `紧张 ${signals.npcQuestLinesStrained}` : "",
    signals.commitmentsFulfilled ? `兑现 ${signals.commitmentsFulfilled}` : "",
    signals.commitmentsMissed ? `错过 ${signals.commitmentsMissed}` : "",
    signals.newGoalCreated ? "新目标" : ""
  ].filter(Boolean);
}

function ReflectionPanel({ reflections, onUse }) {
  const recent = [...reflections].reverse().slice(0, 4);
  return (
    <Panel id="reflection" title="洞察" copy="每日收束后形成的高层记忆，会进入下一次导演层上下文。">
      <div className="grid gap-2.5">
        {recent.length ? (
          recent.map((reflection) => (
            <article key={reflection.id} className="reflection-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>{reflection.title}</strong>
                  <span>第 {reflection.day} 天 · {reflection.focus}</span>
                </div>
                <button className="tiny-action" type="button" onClick={() => onUse(reflection)}>
                  追问
                </button>
              </div>
              <p>{reflection.text}</p>
            </article>
          ))
        ) : (
          <div className="rounded-2xl bg-white/10 p-3 text-sm text-star-muted">
            完成一天后，这里会出现角色对经历的自我总结。
          </div>
        )}
      </div>
    </Panel>
  );
}

function NpcsPanel({ state, selection, onSelect, onUseQuestLine, onUseBondEvent }) {
  return (
    <Panel id="npcs" title="同伴" copy="选择一名同伴，行动会影响关系、记忆和他们对你的判断。">
      <div className="grid gap-2.5">
        <ChoiceButton
          selected={selection.npcId === ""}
          onClick={() => onSelect({ npcId: "" }, "ui.npc_selected", { npcId: "none" })}
          title="独自行动"
          copy="不指定同伴，让事件更多聚焦主角自身。"
        />
        {Object.values(state.npcs).map((npc) => {
          const latestBondEvent = npc.bondEvents?.at(-1);
          const activeQuestLine = [...(npc.questLines || [])].reverse().find((quest) => quest.status !== "completed");
          const completedQuestLine = [...(npc.questLines || [])].reverse().find((quest) => quest.status === "completed");
          const completionFollowUpEvent = latestBondEvent?.type === "quest-complete" ? latestBondEvent : null;
          const pressureFollowUpEvent =
            ["quest-pressure", "quest-strained"].includes(latestBondEvent?.type) &&
            activeQuestLine &&
            (activeQuestLine.status === "strained" || (activeQuestLine.pressure || 0) >= 45)
              ? latestBondEvent
              : null;
          return (
            <div key={npc.id} className="npc-card-wrap">
              <button
                type="button"
                aria-pressed={selection.npcId === npc.id}
                className={`choice-card text-left ${selection.npcId === npc.id ? "is-selected" : ""}`}
                onClick={() => onSelect({ npcId: npc.id }, "ui.npc_selected", { npcId: npc.id })}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <strong>{npc.name}</strong>
                  <span className="relationship-chip">{npc.relationshipStage || "初识"}</span>
                </div>
                <span>{npc.role} · {npc.description}</span>
                <span className="mt-2 inline-flex text-xs font-black text-cyan-100">
                  立场：{npc.stance || "观望"}
                </span>
                {npc.reflections?.length ? (
                  <div className="npc-reflection">
                    {npc.reflections.at(-1).text}
                  </div>
                ) : null}
                <div className={`npc-secret ${npc.hiddenGoalRevealed ? "" : "is-locked"}`}>
                  <strong>{npc.hiddenGoalRevealed ? "透露的牵挂" : "未透露的牵挂"}</strong>
                  <span>{npc.hiddenGoalRevealed ? npc.hiddenGoal : "关系更近后，对方会逐渐说出真正挂心的事。"}</span>
                </div>
                {latestBondEvent ? (
                  <div className="npc-bond-event">
                    <strong>{latestBondEvent.title}</strong>
                    <span>{latestBondEvent.text}</span>
                    {latestBondEvent.followUp?.intent ? (
                      <span className="npc-next-step">下一步：{latestBondEvent.followUp.intent}</span>
                    ) : null}
                  </div>
                ) : null}
                {completedQuestLine ? <NpcQuestLineBlock quest={completedQuestLine} /> : null}
                {activeQuestLine ? <NpcQuestLineBlock quest={activeQuestLine} /> : null}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniMeter label="好感" value={npc.affinity} color={toneColors.coral} />
                  <MiniMeter label="信任" value={npc.trust} color={toneColors.teal} />
                </div>
              </button>
              {completionFollowUpEvent?.followUp ? (
                <button className="bond-follow-up" type="button" onClick={() => onUseBondEvent(completionFollowUpEvent, npc)}>
                  <strong>{completionFollowUpEvent.followUp.label || "沉淀羁绊"}</strong>
                  <span>{completionFollowUpEvent.followUp.intent}</span>
                </button>
              ) : pressureFollowUpEvent?.followUp ? (
                <button className="bond-follow-up" type="button" onClick={() => onUseBondEvent(pressureFollowUpEvent, npc)}>
                  <strong>{pressureFollowUpEvent.followUp.label || "修复羁绊"}</strong>
                  <span>{pressureFollowUpEvent.followUp.intent}</span>
                </button>
              ) : activeQuestLine ? (
                <button className="bond-follow-up" type="button" onClick={() => onUseQuestLine(activeQuestLine)}>
                  <strong>{activeQuestLine.nextLabel || "推进羁绊任务"}</strong>
                  <span>{activeQuestLine.currentStep || activeQuestLine.intent}</span>
                </button>
              ) : latestBondEvent?.followUp ? (
                <button className="bond-follow-up" type="button" onClick={() => onUseBondEvent(latestBondEvent, npc)}>
                  <strong>{latestBondEvent.followUp.label || "跟进羁绊"}</strong>
                  <span>{latestBondEvent.followUp.intent}</span>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function NpcQuestLineBlock({ quest }) {
  const completed = quest.status === "completed";
  const strained = quest.status === "strained";
  return (
    <div className={`npc-quest-line ${completed ? "is-completed" : ""} ${strained ? "is-strained" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <strong>{completed ? "羁绊完成" : strained ? "羁绊紧张" : "羁绊任务"}</strong>
        <span>{completed ? "完成" : `${quest.progress}%`}</span>
      </div>
      <span>{quest.title}</span>
      <div className="mt-2">
        <Meter
          value={quest.progress}
          color={completed ? toneColors.green : strained ? toneColors.red : toneColors.amber}
          label="羁绊任务进度"
        />
      </div>
      {quest.completion ? (
        <>
          <small>{quest.completion.text}</small>
          <small>结算：{quest.completion.reward}</small>
        </>
      ) : (
        <>
          <small>期限：第 {quest.dueDay} 天 · 压力 {quest.pressure || 0}%</small>
          <small>{quest.currentStep}</small>
          {quest.warning ? <small>提醒：{quest.warning}</small> : null}
          <small>风险：{quest.risk}</small>
          <small>奖励：{quest.reward}</small>
        </>
      )}
    </div>
  );
}

function MiniMeter({ label, value, color }) {
  return (
    <div className="grid gap-1 text-xs font-black text-star-muted">
      <span>{label} {value}</span>
      <Meter value={value} color={color} label={label} />
    </div>
  );
}

function GoalsPanel({ goals }) {
  return (
    <Panel id="goals" title="目标" copy="目标会随着行动推进，也可能由事件生成。">
      <div className="grid gap-2.5">
        {goals.length ? goals.map((goal) => (
          <article key={goal.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <strong className="block text-white">{goal.done ? `完成：${goal.text}` : goal.text}</strong>
            <span className="mt-1 block text-sm text-star-muted">期限：第 {goal.dueDay} 天</span>
            <div className="mt-2">
              <MiniMeter label="进度" value={goal.progress} color={goal.done ? toneColors.green : toneColors.amber} />
            </div>
          </article>
        )) : <div className="rounded-2xl bg-white/10 p-3 text-star-muted">暂时没有目标。</div>}
      </div>
    </Panel>
  );
}

function DiaryPanel({ diary, onExport, onImport, onReset }) {
  return (
    <Panel id="diary" title="日记">
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="button-ghost" type="button" onClick={onExport}>导出</button>
        <button className="button-ghost" type="button" onClick={onImport}>导入</button>
        <button className="button-ghost" type="button" onClick={onReset}>重开</button>
      </div>
      <div className="grid max-h-[560px] gap-2.5 overflow-auto pr-1">
        {[...diary].reverse().slice(0, 18).map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <header className="mb-1.5 flex justify-between gap-2">
              <h3 className="m-0 text-sm font-black text-white">{entry.title}</h3>
              <time className="shrink-0 text-xs font-black text-star-muted">
                第 {entry.day} 天 · {entry.slot >= 3 ? "夜末" : TIME_SLOTS[entry.slot]}
              </time>
            </header>
            <p className="m-0 text-sm leading-relaxed text-star-muted">{entry.text}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function WorldFactsPanel({ facts }) {
  const items = [...(facts || [])]
    .sort((a, b) => (b.updatedDay || b.day || 0) - (a.updatedDay || a.day || 0) || (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 6);

  return (
    <Panel id="world-facts" title="世界发现" copy="把行动中确认过的地点、人物和规则整理成可复用的世界知识。">
      <div className="grid gap-2.5">
        {items.length ? items.map((fact) => (
          <article key={fact.id} className={`world-fact-card is-${fact.status || "observed"}`}>
            <header>
              <div>
                <strong>{fact.title}</strong>
                <span>第 {fact.day}-{fact.updatedDay} 天 · {worldFactStatusLabel(fact.status)}</span>
              </div>
              <b>{fact.confidence || 0}</b>
            </header>
            <p>{fact.text}</p>
            <MiniMeter label="置信度" value={fact.confidence || 0} color={fact.status === "confirmed" ? toneColors.green : toneColors.steel} />
            {visibleMemoryTags(fact.tags).length ? (
              <div className="memory-tags">
                {visibleMemoryTags(fact.tags).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            {fact.evidence?.length ? (
              <div className="fact-evidence">
                {fact.evidence.slice(0, 2).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
          </article>
        )) : (
          <div className="rounded-2xl bg-white/10 p-3 text-star-muted">
            还没有沉淀出稳定的世界发现。
          </div>
        )}
      </div>
    </Panel>
  );
}

function worldFactStatusLabel(status) {
  if (status === "confirmed") return "已确认";
  if (status === "contested") return "有争议";
  return "观察到";
}

function MemoryTopicsPanel({ topics }) {
  const items = [...(topics || [])]
    .sort((a, b) => (b.strength || 0) - (a.strength || 0) || (b.updatedDay || 0) - (a.updatedDay || 0))
    .slice(0, 6);

  return (
    <Panel id="memory-topics" title="记忆主题" copy="把零散记忆整理成可维护的长期证据簇。">
      <div className="grid gap-2.5">
        {items.length ? items.map((topic) => (
          <article key={topic.id} className="memory-topic-card">
            <header>
              <div>
                <strong>{topic.title}</strong>
                <span>第 {topic.createdDay}-{topic.updatedDay} 天 · {topic.count || topic.memoryIds?.length || 0} 条证据</span>
              </div>
              <b>{topic.strength || 0}</b>
            </header>
            <p>{topic.summary}</p>
            <MiniMeter label="强度" value={topic.strength || 0} color={toneColors.teal} />
            <div className={`topic-maintenance is-${topic.maintenanceStatus || "active"}`}>
              <strong>{topic.maintenanceLabel || "可引用"}</strong>
              <span>{topic.maintenanceReason || "这组记忆仍可作为当前行动依据。"}</span>
            </div>
            <MiniMeter
              label="新鲜度"
              value={topic.freshness || 0}
              color={memoryTopicFreshnessColor(topic)}
            />
            {visibleMemoryTags(topic.tags).length ? (
              <div className="memory-tags">
                {visibleMemoryTags(topic.tags).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            {topic.evidence?.length ? (
              <div className="topic-evidence">
                {topic.evidence.slice(-2).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
          </article>
        )) : (
          <div className="rounded-2xl bg-white/10 p-3 text-star-muted">
            记忆还没有积累出稳定主题。
          </div>
        )}
      </div>
    </Panel>
  );
}

function memoryTopicFreshnessColor(topic = {}) {
  if (topic.maintenanceStatus === "stale") return toneColors.red;
  if (topic.maintenanceStatus === "watch") return toneColors.amber;
  if (topic.maintenanceStatus === "revised") return toneColors.violet;
  return toneColors.teal;
}

function MemoryPanel({ memories }) {
  return (
    <Panel id="memory" title="记忆" copy="近期记忆会进入导演层上下文。">
      <div className="grid gap-2.5">
        {[...memories].reverse().slice(0, 10).map((memory) => (
          <article key={memory.id} className="memory-card">
            <strong className="mb-1 block text-white">第 {memory.day} 天 · {memoryOwnerLabel(memory)}</strong>
            <div>{memory.text}</div>
            {visibleMemoryTags(memory.tags).length ? (
              <div className="memory-tags">
                {visibleMemoryTags(memory.tags).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            {memory.relatedMemoryLabels?.length ? (
              <div className="memory-links">
                <strong>关联记忆</strong>
                {memory.relatedMemoryLabels.slice(0, 2).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function memoryOwnerLabel(memory) {
  if (memory.owner === "hero") return "星野";
  if (memory.owner?.startsWith("npc:")) return memory.npcName || memory.owner.slice(4);
  return memory.owner || "记忆";
}

function visibleMemoryTags(tags = []) {
  return tags
    .filter((tag) => tag && !tag.startsWith("npc:") && !/^[a-z0-9_-]+$/i.test(tag))
    .slice(0, 5);
}

function shortText(text = "", max = 80) {
  const value = String(text).replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function ChoiceButton({ selected, title, copy, onClick }) {
  return (
    <button type="button" aria-pressed={selected} className={`choice-card ${selected ? "is-selected" : ""}`} onClick={onClick}>
      <strong>{title}</strong>
      <span>{copy}</span>
    </button>
  );
}

function BottomNav({ activeTab, onSelect }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {APP_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? "is-active" : ""}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <span className={`nav-icon nav-icon-${tab.icon}`} aria-hidden="true" />
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

async function requestDirectorOutcome(state, action) {
  try {
    const response = await fetch("/api/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, action })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Session expired");
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return {
      provider: payload.provider || "unknown",
      warning: payload.warning || "",
      outcome: normalizeOutcome(payload.outcome, state)
    };
  } catch (error) {
    if (/Session expired|HTTP 401/.test(error.message)) {
      throw error;
    }
    return {
      provider: "browser-local",
      warning: `导演接口不可用，已使用浏览器本地模拟：${error.message}`,
      outcome: normalizeOutcome(createLocalOutcome(state, action), state)
    };
  }
}

async function requestSession() {
  const response = await fetch("/api/session");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function requestLogin(credentials) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(payload.error || `Login failed: HTTP ${response.status}`);
  }
  return payload;
}

async function requestLogout() {
  await fetch("/api/logout", { method: "POST" });
}

async function loadStateForUser(user) {
  const localState = loadLocalState(user?.id);
  try {
    const response = await fetch("/api/save");
    if (response.status === 401) throw new Error("Session expired");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.found && payload.save) {
      const imported = importGame(payload.save);
      localStorage.setItem(storageKeyForUser(user?.id), serializeGame(imported));
      return imported;
    }
    if (localState) {
      await persistGameSave(localState, user);
      return localState;
    }
  } catch (error) {
    clientLog("save.load_failed", { message: error.message }, "warn");
    if (localState) return localState;
  }
  return createInitial();
}

async function persistGameSave(state, user) {
  const save = serializeGame(state);
  localStorage.setItem(storageKeyForUser(user?.id), save);
  const response = await fetch("/api/save", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ save })
  });
  if (!response.ok) {
    throw new Error(`Save failed: HTTP ${response.status}`);
  }
}

function loadLocalState(userId) {
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    return raw ? importGame(raw) : null;
  } catch {
    return null;
  }
}

function createInitial() {
  return createInitialState();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function storageKeyForUser(userId) {
  return `${STORAGE_KEY}:${userId || "anonymous"}`;
}

function clientLog(event, details = {}, level = "info") {
  const payload = {
    level,
    event,
    sessionId: getClientSessionId(),
    page: window.location.pathname,
    details
  };
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/log", blob);
      return;
    }
  } catch {
    // Logging must never break gameplay.
  }

  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
}

function getClientSessionId() {
  let sessionId = sessionStorage.getItem(CLIENT_SESSION_KEY);
  if (!sessionId) {
    sessionId =
      globalThis.crypto?.randomUUID?.() ||
      `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(CLIENT_SESSION_KEY, sessionId);
  }
  return sessionId;
}

createRoot(document.querySelector("#root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
