import { useState, useCallback, useRef, useEffect } from "react";

// ─── 기본 데이터 ───────────────────────────────────────────────────────────────

const PHASE_CATEGORIES = [
  {
    id: "management",
    label: "Management",
    color: "#FF6B35",
    phases: [
      { id: "pd", label: "PD", color: "#FF6B35" },
      { id: "director", label: "Director", color: "#FF8C5A" },
      { id: "supervisor", label: "Supervisor", color: "#FFB085" },
    ],
  },
  {
    id: "preproduction",
    label: "PreProduction",
    color: "#A78BFA",
    phases: [
      { id: "design", label: "Design", color: "#A78BFA" },
      { id: "storyboard_reel", label: "StoryBoard Reel", color: "#C4B5FD" },
    ],
  },
  {
    id: "mainproduction",
    label: "MainProduction",
    color: "#34D399",
    phases: [
      { id: "modeling", label: "Modeling", color: "#34D399" },
      { id: "texture_shading", label: "Texture / Shading", color: "#6EE7B7" },
      { id: "rigging", label: "Rigging", color: "#059669" },
      { id: "animation_main", label: "Animation", color: "#6B9ECC" },
      { id: "lighting_render", label: "Lighting & Render", color: "#F59E0B" },
      { id: "simulation", label: "Simulation", color: "#FCD34D" },
      { id: "fx", label: "FX", color: "#F472B6" },
      { id: "composition", label: "Composition", color: "#FB7185" },
    ],
  },
];

// flat lookup
const ALL_PHASES = PHASE_CATEGORIES.flatMap(c => c.phases.map(p => ({ ...p, categoryId: c.id, categoryLabel: c.label, categoryColor: c.color })));

const getPhase = (id) => ALL_PHASES.find(p => p.id === id);

const ROLE_CATEGORIES = [
  {
    id: "management", label: "Management", color: "#FF6B35",
    roles: [
      { id: "pd", label: "PD", unit: "일", defaultRate: 600000 },
      { id: "director", label: "Director", unit: "일", defaultRate: 500000 },
      { id: "supervisor", label: "Supervisor", unit: "일", defaultRate: 450000 },
    ],
  },
  {
    id: "preproduction", label: "PreProduction", color: "#A78BFA",
    roles: [
      { id: "storyboard_artist", label: "StoryBoard Artist", unit: "일", defaultRate: 350000 },
      { id: "designer", label: "Designer", unit: "일", defaultRate: 350000 },
    ],
  },
  {
    id: "mainproduction", label: "MainProduction", color: "#34D399",
    roles: [
      { id: "modeler", label: "Modeler", unit: "일", defaultRate: 400000 },
      { id: "texture_shading", label: "Texture/Shading Artist", unit: "일", defaultRate: 380000 },
      { id: "rigger", label: "Rigger", unit: "일", defaultRate: 380000 },
      { id: "animator", label: "Animator", unit: "일", defaultRate: 420000 },
      { id: "lighting_render", label: "Lighting & Render Artist", unit: "일", defaultRate: 400000 },
      { id: "simulator", label: "Simulator", unit: "일", defaultRate: 400000 },
      { id: "fx_artist", label: "FX Artist", unit: "일", defaultRate: 420000 },
      { id: "compositor", label: "Compositor", unit: "일", defaultRate: 380000 },
    ],
  },
  {
    id: "postproduction", label: "PostProduction", color: "#6B9ECC",
    roles: [
      { id: "editor", label: "Edit", unit: "일", defaultRate: 300000 },
      { id: "colorist", label: "Color Grading", unit: "일", defaultRate: 350000 },
      { id: "sound", label: "Sound (Dub, Music, SFX, Mix)", unit: "일", defaultRate: 400000 },
    ],
  },
  {
    id: "overhead", label: "Overhead & Misc.", color: "#F59E0B",
    roles: [
      { id: "software_hardware", label: "Software / Hardware", unit: "식", defaultRate: 0 },
      { id: "render_farm", label: "Render Farm", unit: "식", defaultRate: 0 },
      { id: "office", label: "Office Maintenance", unit: "식", defaultRate: 0 },
      { id: "contingency", label: "Contingency (5%)", unit: "식", defaultRate: 0, isContingency: true },
    ],
  },
];

const ALL_ROLES = ROLE_CATEGORIES.flatMap(c => c.roles.map(r => ({ ...r, categoryId: c.id, categoryLabel: c.label, categoryColor: c.color })));
const getRole = (id) => ALL_ROLES.find(r => r.id === id);

// 스케줄 phaseId → 견적 roleId 매핑
// 같은 카테고리 내 이름이 대응되는 항목끼리 연결
const PHASE_ROLE_MAP = {
  // Management
  pd:               "pd",
  director:         "director",
  supervisor:       "supervisor",
  // PreProduction
  storyboard_reel:  "storyboard_artist",
  design:           "designer",
  // MainProduction
  modeling:         "modeler",
  texture_shading:  "texture_shading",
  rigging:          "rigger",
  animation_main:   "animator",
  lighting_render:  "lighting_render",
  simulation:       "simulator",
  fx:               "fx_artist",
  composition:      "compositor",
};

// 스케줄 phases → 견적 items qty(일수) 동기화
function syncQuoteFromSchedule(schedulePhases, quoteItems) {
  return quoteItems.map(item => {
    // isContingency나 Overhead 항목, 단위가 '일'이 아닌 항목은 스킵
    const role = getRole(item.roleId);
    if (!role || role.isContingency || item.unit !== "일") return item;

    // 이 roleId에 대응하는 phaseId를 역방향 탐색
    const linkedPhaseId = Object.entries(PHASE_ROLE_MAP).find(([, rid]) => rid === item.roleId)?.[0];
    if (!linkedPhaseId) return item;

    const phase = schedulePhases.find(p => p.phaseId === linkedPhaseId);
    if (!phase?.startDate || !phase?.endDate) return item;

    const days = daysBetween(phase.startDate, phase.endDate);
    if (days > 0) return { ...item, qty: days };
    return item;
  });
}

const VIDEO_TYPES = [
  "광고/상업 영상",
  "유튜브/SNS 콘텐츠",
  "Game Cinematic",
  "모션그래픽",
  "2D 애니메이션",
  "3D 애니메이션",
];

const formatNum = (n) => new Intl.NumberFormat("ko-KR").format(n);

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

function Tag({ children, color, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 99,
      background: color + "22", border: `1px solid ${color}55`,
      color, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
    }}>
      {children}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: "none", border: "none", cursor: "pointer",
          color, lineHeight: 1, padding: 0, fontSize: 13,
        }}>×</button>
      )}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 16, padding: "24px 28px",
      backdropFilter: "blur(8px)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>}
      <input {...props} style={{
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10, padding: "10px 14px", color: "#F9FAFB",
        fontSize: 14, fontFamily: "inherit", outline: "none",
        transition: "border-color 0.2s",
        ...props.style,
      }}
        onFocus={e => e.target.style.borderColor = "#FF6B35"}
        onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>}
      <select {...props} style={{
        background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10, padding: "10px 14px", color: "#F9FAFB",
        fontSize: 14, fontFamily: "inherit", outline: "none",
        cursor: "pointer",
        ...props.style,
      }}>
        {children}
      </select>
    </label>
  );
}

// ─── 탭: 프로젝트 기본 정보 ────────────────────────────────────────────────────

function ProjectInfoTab({ project, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <h3 style={{ margin: "0 0 18px", color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>📁 프로젝트 정보</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Input label="프로젝트명" value={project.name} onChange={e => onChange("name", e.target.value)} placeholder="예: OO브랜드 론칭 영상" style={{ gridColumn: "1 / -1" }} />
          <Input label="클라이언트" value={project.client} onChange={e => onChange("client", e.target.value)} placeholder="클라이언트명" />
          <Input label="담당 PD" value={project.manager} onChange={e => onChange("manager", e.target.value)} placeholder="담당자 이름" />
          <Input label="의뢰일" type="date" value={project.startDate} onChange={e => onChange("startDate", e.target.value)} />
          <Input label="납품 기한" type="date" value={project.deadline} onChange={e => onChange("deadline", e.target.value)} />
          <Select label="영상 유형" value={project.videoType} onChange={e => onChange("videoType", e.target.value)} style={{ gridColumn: "1 / -1" }}>
            <option value="">선택하세요</option>
            {VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>프로젝트 설명</span>
            <textarea value={project.description} onChange={e => onChange("description", e.target.value)}
              rows={3} placeholder="프로젝트 개요 및 요구사항을 입력하세요"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", color: "#F9FAFB", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
          </label>
        </div>
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 18px", color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>🎬 영상 사양</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <Input label="총 길이 (초)" type="number" value={project.duration} onChange={e => onChange("duration", e.target.value)} placeholder="60" />
          <Select label="해상도" value={project.resolution} onChange={e => onChange("resolution", e.target.value)}>
            <option value="1920x1080">FHD (1920×1080)</option>
            <option value="3840x2160">4K (3840×2160)</option>
            <option value="1280x720">HD (1280×720)</option>
            <option value="1080x1080">인스타 (1080×1080)</option>
            <option value="1080x1920">쇼츠/릴스 (1080×1920)</option>
          </Select>
          <Select label="납품 포맷" value={project.format} onChange={e => onChange("format", e.target.value)}>
            <option value="mp4_h264">MP4 (H.264)</option>
            <option value="mp4_h265">MP4 (H.265)</option>
            <option value="mov_prores">MOV (ProRes)</option>
            <option value="gif">GIF</option>
          </Select>
          <Select label="FPS" value={project.fps} onChange={e => onChange("fps", e.target.value)}>
            <option value="24">24 fps</option>
            <option value="30">30 fps</option>
            <option value="60">60 fps</option>
          </Select>
          <Input label="수정 횟수 포함" type="number" value={project.revisions} onChange={e => onChange("revisions", e.target.value)} placeholder="3" />
          <Input label="음악 포함" value={project.music} onChange={e => onChange("music", e.target.value)} placeholder="라이선스 음악 / BGM 제작" />
          <Input label="자막 포함" value={project.subtitle} onChange={e => onChange("subtitle", e.target.value)} placeholder="한국어 / 영어 / 없음" />
        </div>
      </Card>
    </div>
  );
}

// ─── 간트 차트 ─────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / DAY_MS);
}

function GanttChart({ phases, ganttStart, ganttEnd, onUpdate }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  const totalDays = daysBetween(ganttStart, ganttEnd) || 1;

  // Build month header ticks
  const months = [];
  let cur = new Date(ganttStart);
  const end = new Date(ganttEnd);
  while (cur <= end) {
    months.push(new Date(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const pxPerDay = (w) => w / totalDays;

  const handleMouseDown = (e, phaseId, type) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const phase = phases.find(p => p.id === phaseId);
    const origStart = phase.startDate;
    const origEnd = phase.endDate;

    dragRef.current = { phaseId, type, startX, origStart, origEnd, rect, totalDays, containerWidth: rect.width };

    const onMove = (ev) => {
      const { phaseId, type, startX, origStart, origEnd, containerWidth } = dragRef.current;
      const dx = ev.clientX - startX;
      const daysDelta = Math.round((dx / containerWidth) * totalDays);

      if (type === "move") {
        const newStart = addDays(origStart, daysDelta);
        const dur = daysBetween(origStart, origEnd);
        const newEnd = addDays(newStart, dur);
        onUpdate(phaseId, newStart, newEnd);
      } else if (type === "resize-right") {
        const newEnd = addDays(origEnd, daysDelta);
        if (newEnd > origStart) onUpdate(phaseId, origStart, newEnd);
      } else if (type === "resize-left") {
        const newStart = addDays(origStart, daysDelta);
        if (newStart < origEnd) onUpdate(phaseId, newStart, origEnd);
      }
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Group rows by category
  const rows = [];
  PHASE_CATEGORIES.forEach(cat => {
    const catPhases = phases.filter(p => {
      const ph = getPhase(p.phaseId);
      return ph?.categoryId === cat.id;
    });
    if (catPhases.length === 0) return;
    rows.push({ type: "category", cat });
    catPhases.forEach(p => rows.push({ type: "phase", p, cat }));
  });

  if (rows.length === 0) return null;

  const ROW_H = 36;
  const LABEL_W = 160;

  return (
    <div ref={containerRef} style={{ overflowX: "auto", borderRadius: 12, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ minWidth: 700 }}>
        {/* Header: month labels */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ width: LABEL_W, flexShrink: 0, padding: "6px 12px", fontSize: 11, color: "#6B7280" }} />
          <div style={{ flex: 1, position: "relative", height: 28 }}>
            {months.map((m, i) => {
              const dayOffset = daysBetween(ganttStart, m.toISOString().slice(0, 10));
              const leftPct = Math.max(0, (dayOffset / totalDays) * 100);
              return (
                <div key={i} style={{
                  position: "absolute", left: `${leftPct}%`,
                  fontSize: 10, color: "#9CA3AF", fontWeight: 600,
                  top: 8, paddingLeft: 4, borderLeft: "1px solid rgba(255,255,255,0.08)",
                  whiteSpace: "nowrap",
                }}>
                  {m.toLocaleDateString("ko-KR", { month: "short", year: "2-digit" })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        {rows.map((row, ri) => {
          if (row.type === "category") {
            return (
              <div key={`cat-${row.cat.id}`} style={{
                display: "flex", alignItems: "center", height: 26,
                background: `${row.cat.color}18`,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 12px", fontSize: 10, fontWeight: 800, color: row.cat.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {row.cat.label}
                </div>
                <div style={{ flex: 1 }} />
              </div>
            );
          }

          const { p, cat } = row;
          const phase = getPhase(p.phaseId);
          if (!p.startDate || !p.endDate) {
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 12px 0 20px", fontSize: 12, color: "#6B7280" }}>{phase?.label}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 8px" }}>
                  <span style={{ fontSize: 11, color: "#4B5563" }}>— 날짜 미설정</span>
                </div>
              </div>
            );
          }

          const leftPct = Math.max(0, (daysBetween(ganttStart, p.startDate) / totalDays) * 100);
          const widthPct = Math.max(0.5, (daysBetween(p.startDate, p.endDate) / totalDays) * 100);
          const dur = daysBetween(p.startDate, p.endDate);

          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: "1px solid rgba(255,255,255,0.04)", position: "relative" }}>
              <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 8px 0 20px", fontSize: 12, color: "#D1D5DB", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {phase?.label}
              </div>
              <div style={{ flex: 1, position: "relative", height: "100%" }}>
                {/* grid lines */}
                {months.map((m, i) => {
                  const dayOffset = daysBetween(ganttStart, m.toISOString().slice(0, 10));
                  const leftPct2 = Math.max(0, (dayOffset / totalDays) * 100);
                  return <div key={i} style={{ position: "absolute", left: `${leftPct2}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.04)" }} />;
                })}

                {/* Bar */}
                <div
                  onMouseDown={e => handleMouseDown(e, p.id, "move")}
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: "50%", transform: "translateY(-50%)",
                    height: 22, borderRadius: 6,
                    background: `linear-gradient(90deg, ${phase?.color || "#888"}, ${phase?.color || "#888"}bb)`,
                    cursor: "grab",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "rgba(0,0,0,0.75)", fontWeight: 700,
                    userSelect: "none", minWidth: 4,
                    boxShadow: `0 2px 8px ${phase?.color || "#888"}44`,
                    overflow: "hidden",
                  }}
                  title={`${p.startDate} ~ ${p.endDate} (${dur}일)`}
                >
                  {/* left resize handle */}
                  <div onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, p.id, "resize-left"); }}
                    style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(0,0,0,0.15)", borderRadius: "6px 0 0 6px" }} />
                  {widthPct > 6 && <span style={{ pointerEvents: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 12px" }}>{dur}d</span>}
                  {/* right resize handle */}
                  <div onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, p.id, "resize-right"); }}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(0,0,0,0.15)", borderRadius: "0 6px 6px 0" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 탭: 스케줄 ────────────────────────────────────────────────────────────────

function ScheduleTab({ schedule, onChange, projectStart, projectDeadline }) {
  const defaultStart = projectStart || new Date().toISOString().slice(0, 10);
  const defaultEnd = projectDeadline || addDays(defaultStart, 60);

  const [ganttStart, setGanttStart] = useState(defaultStart);
  const [ganttEnd, setGanttEnd] = useState(defaultEnd);

  // sync gantt range if project dates change
  useEffect(() => {
    if (projectStart) setGanttStart(projectStart);
    if (projectDeadline) setGanttEnd(projectDeadline);
  }, [projectStart, projectDeadline]);

  const updatePhase = (id, field, value) => {
    onChange("phases", schedule.phases.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const updatePhaseDates = (id, startDate, endDate) => {
    onChange("phases", schedule.phases.map(p => p.id === id ? { ...p, startDate, endDate } : p));
  };

  const removePhase = (id) => onChange("phases", schedule.phases.filter(p => p.id !== id));

  const addPhaseFromCat = (catId, phaseId) => {
    onChange("phases", [...schedule.phases, {
      id: Date.now(), phaseId, startDate: ganttStart, endDate: addDays(ganttStart, 14), assignee: "",
    }]);
  };

  const phasesWithDates = schedule.phases.filter(p => p.startDate && p.endDate);
  const totalDays = phasesWithDates.length > 0
    ? daysBetween(
        phasesWithDates.reduce((a, p) => p.startDate < a ? p.startDate : a, phasesWithDates[0].startDate),
        phasesWithDates.reduce((a, p) => p.endDate > a ? p.endDate : a, phasesWithDates[0].endDate)
      )
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* 간트 차트 범위 설정 */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ margin: 0, color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            📊 Gantt Chart
            {totalDays !== null && <span style={{ marginLeft: 10, fontSize: 12, color: "#9CA3AF", fontWeight: 400, textTransform: "none" }}>총 {totalDays}일</span>}
          </h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9CA3AF" }}>
              시작
              <input type="date" value={ganttStart} onChange={e => setGanttStart(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 8px", color: "#F9FAFB", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9CA3AF" }}>
              종료
              <input type="date" value={ganttEnd} onChange={e => setGanttEnd(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 8px", color: "#F9FAFB", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </label>
          </div>
        </div>

        {schedule.phases.length === 0 ? (
          <div style={{ textAlign: "center", color: "#4B5563", padding: "32px 0", fontSize: 13 }}>아래에서 단계를 추가하면 차트가 표시됩니다</div>
        ) : (
          <GanttChart
            phases={schedule.phases}
            ganttStart={ganttStart}
            ganttEnd={ganttEnd}
            onUpdate={updatePhaseDates}
          />
        )}
      </Card>

      {/* 카테고리별 단계 테이블 */}
      {PHASE_CATEGORIES.map(cat => {
        const catPhases = schedule.phases.filter(p => getPhase(p.phaseId)?.categoryId === cat.id);
        const addablePhases = cat.phases.filter(ph => !schedule.phases.find(p => p.phaseId === ph.id));

        return (
          <Card key={cat.id} style={{ borderColor: `${cat.color}33` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 4, height: 18, borderRadius: 2, background: cat.color }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: cat.color, letterSpacing: "0.05em" }}>{cat.label}</h3>
              </div>
              {addablePhases.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {addablePhases.map(ph => (
                    <button key={ph.id} onClick={() => addPhaseFromCat(cat.id, ph.id)} style={{
                      background: `${ph.color}22`, border: `1px solid ${ph.color}55`,
                      borderRadius: 6, padding: "4px 10px", color: ph.color,
                      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>+ {ph.label}</button>
                  ))}
                </div>
              )}
            </div>

            {catPhases.length === 0 ? (
              <div style={{ color: "#4B5563", fontSize: 12, padding: "8px 0" }}>위 버튼으로 단계를 추가하세요</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr 1fr auto", gap: 8, padding: "0 4px" }}>
                  {["단계", "시작일", "종료일", "담당자", ""].map((h, i) => (
                    <span key={i} style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
                  ))}
                </div>
                {catPhases.map(p => {
                  const ph = getPhase(p.phaseId);
                  const dur = p.startDate && p.endDate ? daysBetween(p.startDate, p.endDate) : null;
                  return (
                    <div key={p.id} style={{
                      display: "grid", gridTemplateColumns: "130px 1fr 1fr 1fr auto",
                      gap: 8, alignItems: "center",
                      padding: "8px 10px", borderRadius: 10,
                      background: `${ph?.color || "#888"}0d`,
                      border: `1px solid ${ph?.color || "#888"}22`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: ph?.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#F9FAFB", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ph?.label}</span>
                      </div>
                      <input type="date" value={p.startDate} onChange={e => updatePhase(p.id, "startDate", e.target.value)}
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 8px", color: "#F9FAFB", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="date" value={p.endDate} onChange={e => updatePhase(p.id, "endDate", e.target.value)}
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 8px", color: "#F9FAFB", fontSize: 12, fontFamily: "inherit", outline: "none", flex: 1 }} />
                        {dur !== null && <span style={{ fontSize: 10, color: "#6B7280", whiteSpace: "nowrap" }}>{dur}일</span>}
                      </div>
                      <input value={p.assignee} onChange={e => updatePhase(p.id, "assignee", e.target.value)} placeholder="담당자"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 8px", color: "#F9FAFB", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                      <button onClick={() => removePhase(p.id)} style={{
                        background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: 6, padding: "5px 9px", color: "#EF4444", cursor: "pointer", fontFamily: "inherit", fontSize: 11,
                      }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      <Card>
        <h3 style={{ margin: "0 0 12px", color: "#FF6B35", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>📝 일정 메모</h3>
        <textarea value={schedule.note} onChange={e => onChange("note", e.target.value)}
          rows={3} placeholder="특이사항, 리뷰 일정, 클라이언트 피드백 일정 등"
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", color: "#F9FAFB", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      </Card>
    </div>
  );
}

// ─── 탭: 견적 ──────────────────────────────────────────────────────────────────

function QuoteTab({ quote, onChange }) {
  const addItem = (roleId) => {
    const role = getRole(roleId);
    if (!role) return;
    onChange("items", [...quote.items, {
      id: Date.now(), roleId: role.id, label: role.label,
      qty: 1, unit: role.unit, rate: role.defaultRate, categoryId: role.categoryId,
    }]);
  };

  const updateItem = (id, field, value) => {
    onChange("items", quote.items.map(item => {
      if (item.id !== id) return item;
      if (field === "roleId") {
        const role = getRole(value);
        return { ...item, roleId: value, label: role?.label || item.label, unit: role?.unit || item.unit, rate: role?.defaultRate ?? item.rate, categoryId: role?.categoryId || item.categoryId };
      }
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (id) => onChange("items", quote.items.filter(i => i.id !== id));

  // production subtotal (excluding overhead) for contingency calc
  const productionSubtotal = quote.items
    .filter(i => getRole(i.roleId)?.categoryId !== "overhead" || !getRole(i.roleId)?.isContingency)
    .reduce((acc, i) => {
      if (getRole(i.roleId)?.isContingency) return acc;
      return acc + (Number(i.qty) * Number(i.rate));
    }, 0);

  const subtotal = quote.items.reduce((acc, i) => {
    const role = getRole(i.roleId);
    const amt = role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate);
    return acc + amt;
  }, 0);

  const discountAmt = subtotal * (Number(quote.discountPct) / 100);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (quote.includeVat ? 0.1 : 0);
  const total = afterDiscount + vatAmt;

  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 8px", color: "#F9FAFB", fontSize: 12, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* 카테고리별 견적 */}
      {ROLE_CATEGORIES.map(cat => {
        const catItems = quote.items.filter(i => i.categoryId === cat.id);
        const catSubtotal = catItems.reduce((acc, i) => {
          const role = getRole(i.roleId);
          return acc + (role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate));
        }, 0);
        const addableRoles = cat.roles.filter(r => !quote.items.find(i => i.roleId === r.id));

        return (
          <Card key={cat.id} style={{ borderColor: `${cat.color}33`, padding: "18px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: cat.color }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: cat.color, letterSpacing: "0.05em" }}>{cat.label}</span>
                {catSubtotal > 0 && <span style={{ fontSize: 11, color: "#6B7280" }}>₩{formatNum(Math.round(catSubtotal))}</span>}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {addableRoles.map(r => (
                  <button key={r.id} onClick={() => addItem(r.id)} style={{
                    background: `${cat.color}18`, border: `1px solid ${cat.color}44`,
                    borderRadius: 6, padding: "3px 9px", color: cat.color,
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>+ {r.label}</button>
                ))}
              </div>
            </div>

            {catItems.length === 0 ? (
              <div style={{ fontSize: 12, color: "#4B5563", padding: "4px 0" }}>위 버튼으로 항목을 추가하세요</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 110px 90px auto", gap: 6, marginBottom: 6, padding: "0 2px" }}>
                  {["항목", "수량", "단위", "단가 (₩)", "소계", ""].map((h, i) => (
                    <span key={i} style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {catItems.map(item => {
                    const role = getRole(item.roleId);
                    const isContingency = role?.isContingency;
                    const lineTotal = isContingency ? productionSubtotal * 0.05 : Number(item.qty) * Number(item.rate);
                    return (
                      <div key={item.id} style={{
                        display: "grid", gridTemplateColumns: "1fr 70px 60px 110px 90px auto",
                        gap: 6, alignItems: "center",
                        padding: "7px 8px", borderRadius: 8,
                        background: `${cat.color}0a`,
                        border: `1px solid ${cat.color}18`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 1, background: cat.color, flexShrink: 0 }} />
                          <input value={item.label} onChange={e => updateItem(item.id, "label", e.target.value)}
                            style={{ ...inputStyle, flex: 1 }} />
                          {(() => {
                            const linkedPhaseId = Object.entries(PHASE_ROLE_MAP).find(([, rid]) => rid === item.roleId)?.[0];
                            return linkedPhaseId ? (
                              <span title="스케줄과 연동됨" style={{ fontSize: 9, color: "#34D399", border: "1px solid #34D39955", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0 }}>⟳ 연동</span>
                            ) : null;
                          })()}
                        </div>
                        {isContingency ? (
                          <>
                            <div style={{ fontSize: 11, color: "#6B7280", textAlign: "center" }}>—</div>
                            <div style={{ fontSize: 11, color: "#6B7280", textAlign: "center" }}>—</div>
                            <div style={{ fontSize: 11, color: "#6B7280", textAlign: "center" }}>5% auto</div>
                          </>
                        ) : (
                          <>
                            <input type="number" value={item.qty} onChange={e => updateItem(item.id, "qty", e.target.value)}
                              style={{ ...inputStyle, textAlign: "center" }} />
                            <input value={item.unit} onChange={e => updateItem(item.id, "unit", e.target.value)}
                              style={{ ...inputStyle, textAlign: "center" }} />
                            <input type="number" value={item.rate} onChange={e => updateItem(item.id, "rate", e.target.value)}
                              style={{ ...inputStyle, textAlign: "right" }} />
                          </>
                        )}
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#F9FAFB", textAlign: "right" }}>
                          ₩{formatNum(Math.round(lineTotal))}
                        </div>
                        <button onClick={() => removeItem(item.id)} style={{
                          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                          borderRadius: 6, padding: "4px 8px", color: "#EF4444", cursor: "pointer", fontFamily: "inherit", fontSize: 11,
                        }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        );
      })}

      {/* 견적 합계 */}
      <Card>
        <h3 style={{ margin: "0 0 16px", color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>🧮 견적 합계</h3>

        {/* 카테고리별 소계 바 */}
        {quote.items.length > 0 && subtotal > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", gap: 1, marginBottom: 10 }}>
              {ROLE_CATEGORIES.map(cat => {
                const amt = quote.items.filter(i => i.categoryId === cat.id).reduce((acc, i) => {
                  const role = getRole(i.roleId);
                  return acc + (role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate));
                }, 0);
                const pct = (amt / subtotal) * 100;
                if (pct === 0) return null;
                return <div key={cat.id} style={{ width: `${pct}%`, background: cat.color, minWidth: 2 }} title={`${cat.label}: ${pct.toFixed(1)}%`} />;
              })}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {ROLE_CATEGORIES.map(cat => {
                const amt = quote.items.filter(i => i.categoryId === cat.id).reduce((acc, i) => {
                  const role = getRole(i.roleId);
                  return acc + (role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate));
                }, 0);
                if (amt === 0) return null;
                return (
                  <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }} />
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{cat.label}</span>
                    <span style={{ fontSize: 11, color: "#F9FAFB", fontWeight: 600 }}>₩{formatNum(Math.round(amt))}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
          <Input label="할인율 (%)" type="number" value={quote.discountPct} onChange={e => onChange("discountPct", e.target.value)} placeholder="0" />
          <label style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 24 }}>
            <input type="checkbox" checked={quote.includeVat} onChange={e => onChange("includeVat", e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#FF6B35", cursor: "pointer" }} />
            <span style={{ color: "#F9FAFB", fontSize: 14 }}>부가세 (10%) 포함</span>
          </label>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
          {[
            { label: "소계", value: subtotal, dimmed: false },
            Number(quote.discountPct) > 0 && { label: `할인 (${quote.discountPct}%)`, value: -discountAmt, dimmed: true },
            quote.includeVat && { label: "부가세 (10%)", value: vatAmt, dimmed: true },
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, color: row.dimmed ? "#9CA3AF" : "#F9FAFB" }}>
              <span style={{ fontSize: 14 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{row.value < 0 ? "-" : ""}₩{formatNum(Math.abs(Math.round(row.value)))}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#FF6B35" }}>총 견적금액</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#FF6B35" }}>₩{formatNum(Math.round(total))}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── 탭: 요약 ──────────────────────────────────────────────────────────────────

function SummaryTab({ project, schedule, quote }) {
  const productionSubtotal = quote.items
    .filter(i => !getRole(i.roleId)?.isContingency)
    .reduce((acc, i) => acc + (Number(i.qty) * Number(i.rate)), 0);

  const subtotal = quote.items.reduce((acc, i) => {
    const role = getRole(i.roleId);
    return acc + (role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate));
  }, 0);

  const discountAmt = subtotal * (Number(quote.discountPct) / 100);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (quote.includeVat ? 0.1 : 0);
  const grandTotal = afterDiscount + vatAmt;

  const firstPhase = schedule.phases.filter(p => p.startDate).sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0];
  const lastPhase = schedule.phases.filter(p => p.endDate).sort((a, b) => new Date(b.endDate) - new Date(a.endDate))[0];
  const totalDays = firstPhase && lastPhase
    ? daysBetween(firstPhase.startDate, lastPhase.endDate)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 상단 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "총 견적금액", value: `₩${formatNum(Math.round(grandTotal))}`, sub: "부가세 포함", color: "#FF6B35" },
          { label: "총 제작 기간", value: totalDays ? `${totalDays}일` : "-", sub: firstPhase ? `${firstPhase.startDate} ~ ${lastPhase?.endDate}` : "일정 미입력", color: "#6B9ECC" },
          { label: "납품 기한", value: project.deadline || "-", sub: project.videoType || "유형 미설정", color: "#34D399" },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: `${kpi.color}11`, border: `1px solid ${kpi.color}33`,
            borderRadius: 16, padding: "20px 22px",
          }}>
            <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{kpi.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: kpi.color, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* 프로젝트 정보 */}
      <Card>
        <h3 style={{ margin: "0 0 16px", color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>📋 프로젝트 개요</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["프로젝트명", project.name || "-"],
            ["클라이언트", project.client || "-"],
            ["담당 PD", project.manager || "-"],
            ["영상 유형", project.videoType || "-"],
            ["영상 길이", project.duration ? `${project.duration}초` : "-"],
            ["FPS", project.fps ? `${project.fps} fps` : "-"],
            ["해상도", project.resolution || "-"],
            ["수정 횟수", project.revisions ? `${project.revisions}회` : "-"],
            ["납품 포맷", project.format || "-"],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 13, color: "#6B7280", minWidth: 80 }}>{k}</span>
              <span style={{ fontSize: 13, color: "#F9FAFB", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 일정 요약 */}
      {schedule.phases.length > 0 && (
        <Card>
          <h3 style={{ margin: "0 0 16px", color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>📅 일정 요약</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {schedule.phases.map(p => {
              const phase = getPhase(p.phaseId);
              const days = p.startDate && p.endDate ? daysBetween(p.startDate, p.endDate) : null;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                  <Tag color={phase?.color || "#888"}>{phase?.icon} {phase?.label}</Tag>
                  <span style={{ fontSize: 13, color: "#9CA3AF" }}>{p.startDate || "?"} ~ {p.endDate || "?"}</span>
                  {days !== null && <span style={{ fontSize: 12, color: "#6B7280" }}>({days}일)</span>}
                  {p.assignee && <span style={{ fontSize: 12, color: "#6B9ECC" }}>👤 {p.assignee}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 견적 요약 */}
      {quote.items.length > 0 && (
        <Card>
          <h3 style={{ margin: "0 0 16px", color: "#FF6B35", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>💰 견적 요약</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {ROLE_CATEGORIES.map(cat => {
              const catItems = quote.items.filter(i => i.categoryId === cat.id);
              if (catItems.length === 0) return null;
              const catTotal = catItems.reduce((acc, i) => {
                const role = getRole(i.roleId);
                return acc + (role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate));
              }, 0);
              return (
                <div key={cat.id}>
                  <div style={{ fontSize: 11, color: cat.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, marginTop: 8 }}>{cat.label}</div>
                  {catItems.map(item => {
                    const role = getRole(item.roleId);
                    const amt = role?.isContingency ? productionSubtotal * 0.05 : Number(item.qty) * Number(item.rate);
                    return (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <span style={{ color: "#D1D5DB" }}>{item.label}{!role?.isContingency && ` (${item.qty}${item.unit})`}</span>
                        <span style={{ color: "#F9FAFB", fontWeight: 600 }}>₩{formatNum(Math.round(amt))}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "2px solid #FF6B35" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#FF6B35" }}>총 견적금액</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: "#FF6B35" }}>₩{formatNum(Math.round(grandTotal))}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── 메인 앱 ──────────────────────────────────────────────────────────────────

const DEFAULT_PROJECT = {
  name: "", client: "", manager: "", startDate: "", deadline: "",
  videoType: "", description: "", duration: "", resolution: "1920x1080",
  format: "mp4_h264", revisions: "3", music: "", subtitle: "", fps: "24",
};

const DEFAULT_SCHEDULE = { phases: [], note: "" };

const DEFAULT_QUOTE = {
  items: [], discountPct: 0, includeVat: true,
  musicCost: 0, stockCost: 0, miscCost: 0, miscNote: "",
};

const TABS = [
  { id: "info", label: "프로젝트 정보", icon: "📁" },
  { id: "schedule", label: "스케줄", icon: "📅" },
  { id: "quote", label: "견적", icon: "💰" },
  { id: "summary", label: "요약", icon: "📊" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("info");
  const [project, setProject] = useState(DEFAULT_PROJECT);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [projects, setProjects] = useState([]);
  const [showSaved, setShowSaved] = useState(false);

  const updateProject = useCallback((field, value) => setProject(p => ({ ...p, [field]: value })), []);
  const updateSchedule = useCallback((field, value) => {
    setSchedule(p => {
      const next = { ...p, [field]: value };
      if (field === "phases") {
        setQuote(q => ({ ...q, items: syncQuoteFromSchedule(value, q.items) }));
      }
      return next;
    });
  }, []);
  const updateQuote = useCallback((field, value) => setQuote(p => ({ ...p, [field]: value })), []);

  const saveProject = () => {
    const entry = { id: Date.now(), project, schedule, quote, savedAt: new Date().toLocaleString("ko-KR") };
    setProjects(prev => [entry, ...prev]);
    alert(`"${project.name || "무제 프로젝트"}" 저장 완료!`);
  };

  const loadProject = (entry) => {
    setProject(entry.project);
    setSchedule(entry.schedule);
    setQuote(entry.quote);
    setShowSaved(false);
    setActiveTab("info");
  };

  const newProject = () => {
    if (window.confirm("새 프로젝트를 시작하면 현재 내용이 초기화됩니다.")) {
      setProject(DEFAULT_PROJECT);
      setSchedule(DEFAULT_SCHEDULE);
      setQuote(DEFAULT_QUOTE);
      setActiveTab("info");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d1a",
      color: "#F9FAFB",
      fontFamily: "'IBM Plex Sans KR', 'Noto Sans KR', sans-serif",
    }}>
      {/* 배경 효과 */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 70% 40% at 50% -10%, rgba(255,107,53,0.12) 0%, transparent 70%)",
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF6B35", boxShadow: "0 0 10px #FF6B35" }} />
              <span style={{ fontSize: 12, color: "#FF6B35", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>Animation Studio</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              제작 스케줄 &<br />
              <span style={{ color: "#FF6B35" }}>견적 관리 툴</span>
            </h1>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => setShowSaved(s => !s)} style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "8px 16px", color: "#9CA3AF", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>
              📂 저장된 프로젝트 ({projects.length})
            </button>
            <button onClick={saveProject} style={{
              background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)",
              borderRadius: 8, padding: "8px 16px", color: "#34D399", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>💾 저장</button>
            <button onClick={newProject} style={{
              background: "#FF6B35", border: "none",
              borderRadius: 8, padding: "8px 16px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>+ 새 프로젝트</button>
          </div>
        </div>

        {/* 저장된 프로젝트 패널 */}
        {showSaved && (
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 14px", color: "#FF6B35", fontSize: 14, fontWeight: 700 }}>저장된 프로젝트</h3>
            {projects.length === 0 ? (
              <p style={{ color: "#6B7280", fontSize: 13 }}>아직 저장된 프로젝트가 없습니다.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {projects.map(entry => (
                  <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.project.name || "무제 프로젝트"}</div>
                      <div style={{ fontSize: 12, color: "#6B7280" }}>{entry.project.client && `${entry.project.client} · `}{entry.savedAt}</div>
                    </div>
                    <button onClick={() => loadProject(entry)} style={{ background: "#FF6B35", border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>불러오기</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 현재 프로젝트 표시 */}
        {project.name && (
          <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>현재 프로젝트:</span>
            <Tag color="#FF6B35">{project.name}</Tag>
            {project.client && <Tag color="#9CA3AF">{project.client}</Tag>}
            {project.videoType && <Tag color="#6B9ECC">{project.videoType}</Tag>}
            {project.deadline && <Tag color="#34D399">납품 {project.deadline}</Tag>}
          </div>
        )}

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 9, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all 0.2s",
              background: activeTab === tab.id ? "#FF6B35" : "transparent",
              color: activeTab === tab.id ? "#fff" : "#6B7280",
            }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {activeTab === "info" && <ProjectInfoTab project={project} onChange={updateProject} />}
        {activeTab === "schedule" && <ScheduleTab schedule={schedule} onChange={updateSchedule} projectStart={project.startDate} projectDeadline={project.deadline} />}
        {activeTab === "quote" && <QuoteTab quote={quote} onChange={updateQuote} />}
        {activeTab === "summary" && <SummaryTab project={project} schedule={schedule} quote={quote} />}

        {/* 하단 네비게이션 */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <button onClick={() => {
            const idx = TABS.findIndex(t => t.id === activeTab);
            if (idx > 0) setActiveTab(TABS[idx - 1].id);
          }} disabled={activeTab === TABS[0].id} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "10px 20px", color: "#9CA3AF", fontSize: 13, cursor: "pointer",
            fontFamily: "inherit", opacity: activeTab === TABS[0].id ? 0.3 : 1,
          }}>← 이전</button>
          <button onClick={() => {
            const idx = TABS.findIndex(t => t.id === activeTab);
            if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].id);
          }} disabled={activeTab === TABS[TABS.length - 1].id} style={{
            background: "#FF6B35", border: "none",
            borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", opacity: activeTab === TABS[TABS.length - 1].id ? 0.3 : 1,
          }}>다음 →</button>
        </div>
      </div>
    </div>
  );
}
