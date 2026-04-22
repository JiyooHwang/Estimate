import { useState, useCallback, useRef, useEffect } from "react";

// ─── 인증 시스템 데이터 ────────────────────────────────────────────────────────

// 인메모리 유저 DB (실제 환경에서는 백엔드 연동 필요)
const USERS_DB_KEY = "locus_users_db";
const SESSION_KEY = "locus_session";

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  // 기본 관리자 계정
  const defaults = [
    { id: "admin", email: "admin@locus.com", password: "admin1234", role: "admin", approved: true, name: "Administrator", createdAt: new Date().toISOString() },
  ];
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(defaults));
  return defaults;
}

function saveUsers(users) {
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

// 역할: admin > senior > member
const ROLE_LABELS = { admin: "Admin", senior: "Senior", member: "Member" };
const ROLE_COLORS = { admin: "#FF6B35", senior: "#F59E0B", member: "#6B9ECC" };

function canEditRate(role) { return role === "admin" || role === "senior"; }

// ─── PDF 생성 헬퍼 ────────────────────────────────────────────────────────────

function downloadPDF(project, schedule, quote, currentUser) {
  const win = window.open("", "_blank");
  if (!win) { alert("팝업 차단을 해제하세요."); return; }

  const productionSubtotal = quote.items.filter(i => !ALL_ROLES.find(r => r.id === i.roleId)?.isContingency)
    .reduce((acc, i) => acc + (Number(i.qty) * Number(i.rate)), 0);
  const subtotal = quote.items.reduce((acc, i) => {
    const role = ALL_ROLES.find(r => r.id === i.roleId);
    return acc + (role?.isContingency ? productionSubtotal * 0.05 : Number(i.qty) * Number(i.rate));
  }, 0);
  const discountAmt = subtotal * (Number(quote.discountPct) / 100);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (quote.includeVat ? 0.1 : 0);
  const total = afterDiscount + vatAmt;
  const fmt = (n) => new Intl.NumberFormat("ko-KR").format(Math.round(n));
  const today = new Date().toLocaleDateString("ko-KR");

  const scheduleRows = schedule.phases.map(p => {
    const ph = ALL_PHASES.find(x => x.id === p.phaseId);
    const days = p.startDate && p.endDate ? Math.round((new Date(p.endDate) - new Date(p.startDate)) / 86400000) : "-";
    return `<tr><td>${ph?.categoryLabel || ""}</td><td>${ph?.label || p.phaseId}</td><td>${p.startDate || "-"}</td><td>${p.endDate || "-"}</td><td>${days !== "-" ? days + "일" : "-"}</td><td>${p.assignee || "-"}</td></tr>`;
  }).join("");

  const quoteRows = quote.items.map(item => {
    const role = ALL_ROLES.find(r => r.id === item.roleId);
    const amt = role?.isContingency ? productionSubtotal * 0.05 : Number(item.qty) * Number(item.rate);
    return `<tr><td>${role?.categoryLabel || ""}</td><td>${item.label}</td><td>${role?.isContingency ? "5% auto" : item.qty + item.unit}</td><td>${role?.isContingency ? "-" : "₩" + fmt(item.rate)}</td><td>₩${fmt(amt)}</td></tr>`;
  }).join("");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.name || "견적서"} - LOCUS</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Noto Sans KR',sans-serif; color:#111; background:#fff; padding:40px; font-size:13px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #C8102E; padding-bottom:20px; margin-bottom:28px; }
    .logo-area { display:flex; align-items:center; gap:12px; }
    .logo { width:80px; }
    .company { font-size:11px; color:#666; margin-top:4px; }
    .doc-title { text-align:right; }
    .doc-title h1 { font-size:22px; font-weight:900; color:#C8102E; }
    .doc-title .meta { font-size:11px; color:#666; margin-top:4px; }
    .section { margin-bottom:28px; }
    .section-title { font-size:13px; font-weight:700; color:#C8102E; text-transform:uppercase; letter-spacing:.08em; border-left:3px solid #C8102E; padding-left:8px; margin-bottom:12px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; }
    .info-row { display:flex; gap:8px; font-size:12px; }
    .info-label { color:#888; min-width:80px; }
    .info-value { font-weight:700; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { background:#FFFFFF; color:#fff; padding:8px 10px; text-align:left; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
    td { padding:7px 10px; border-bottom:1px solid #eee; }
    tr:nth-child(even) td { background:#f9f9f9; }
    .totals { margin-left:auto; width:280px; }
    .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; border-bottom:1px solid #eee; }
    .total-final { display:flex; justify-content:space-between; padding:10px 0; font-size:16px; font-weight:900; color:#C8102E; border-top:2px solid #C8102E; margin-top:4px; }
    .footer { margin-top:40px; border-top:1px solid #eee; padding-top:16px; font-size:11px; color:#aaa; display:flex; justify-content:space-between; }
    .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:700; background:#C8102E22; color:#C8102E; border:1px solid #C8102E55; }
    @media print { body { padding:20px; } }
  </style></head><body>
    <div class="header">
      <div class="logo-area">
        <div><div style="font-size:18px;font-weight:900;color:#C8102E;">LOCUS</div><div class="company">Animation Studio — Schedule & Quote</div></div>
      </div>
    <div class="doc-title">
      <h1>${project.name || "프로젝트명 미입력"}</h1>
      <div class="meta">Client: ${project.client || "-"} &nbsp;|&nbsp; Date: ${today} &nbsp;|&nbsp; By: ${currentUser?.email || "-"} <span class="badge">${ROLE_LABELS[currentUser?.role] || ""}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Project Overview</div>
    <div class="info-grid">
      ${[["Project", project.name],["Client", project.client],["PD", project.manager],["Type", project.videoType],["Duration", project.duration ? project.duration + "초" : "-"],["FPS", project.fps ? project.fps + " fps" : "-"],["Resolution", project.resolution],["Format", project.format],["Revisions", project.revisions ? project.revisions + "회" : "-"],["Deadline", project.deadline || "-"]].map(([k,v]) => `<div class="info-row"><span class="info-label">${k}</span><span class="info-value">${v || "-"}</span></div>`).join("")}
    </div>
  </div>

  ${schedule.phases.length > 0 ? `<div class="section">
    <div class="section-title">Production Schedule</div>
    <table><thead><tr><th>Category</th><th>Phase</th><th>Start</th><th>End</th><th>Days</th><th>Assignee</th></tr></thead>
    <tbody>${scheduleRows}</tbody></table>
  </div>` : ""}

  ${quote.items.length > 0 ? `<div class="section">
    <div class="section-title">Cost Breakdown</div>
    <table><thead><tr><th>Category</th><th>Item</th><th>Qty</th><th>Unit Rate</th><th>Amount</th></tr></thead>
    <tbody>${quoteRows}</tbody></table>
    <div style="margin-top:20px;">
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><span>₩${fmt(subtotal)}</span></div>
        ${Number(quote.discountPct) > 0 ? `<div class="total-row"><span>Discount (${quote.discountPct}%)</span><span>-₩${fmt(discountAmt)}</span></div>` : ""}
        ${quote.includeVat ? `<div class="total-row"><span>VAT (10%)</span><span>₩${fmt(vatAmt)}</span></div>` : ""}
        <div class="total-final"><span>TOTAL</span><span>₩${fmt(total)}</span></div>
      </div>
    </div>
  </div>` : ""}

  <div class="footer">
    <span>LOCUS Animation Studio &copy; ${new Date().getFullYear()}</span>
    <span>Generated by ${currentUser?.email || "unknown"} on ${today}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`);
  win.document.close();
}

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
      background: "#FFFFFF",
      border: "1px solid #E5E7EB",
      borderRadius: 16, padding: "24px 28px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>}
      <input {...props} style={{
        background: "#F8F9FA", border: "1px solid #E5E7EB",
        borderRadius: 10, padding: "10px 14px", color: "#1A1A2E",
        fontSize: 14, fontFamily: "inherit", outline: "none",
        transition: "border-color 0.2s",
        ...props.style,
      }}
        onFocus={e => e.target.style.borderColor = "#C8102E"}
        onBlur={e => e.target.style.borderColor = "#E5E7EB"}
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>}
      <select {...props} style={{
        background: "#F8F9FA", border: "1px solid #E5E7EB",
        borderRadius: 10, padding: "10px 14px", color: "#1A1A2E",
        fontSize: 14, fontFamily: "inherit", outline: "none",
        cursor: "pointer",
        ...props.style,
      }}>
        {children}
      </select>
    </label>
  );
}

// ─── 인증 화면 컴포넌트 ───────────────────────────────────────────────────────

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register | pending
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) { setError("이메일 또는 비밀번호가 올바르지 않습니다."); return; }
    if (!user.approved) { setError("관리자 승인 대기 중입니다. 관리자에게 문의하세요."); return; }
    saveSession(user);
    onLogin(user);
  };

  const handleRegister = () => {
    if (!email.includes("@") || password.length < 6) { setError("이메일과 6자 이상 비밀번호를 입력하세요."); return; }
    const users = loadUsers();
    if (users.find(u => u.email === email)) { setError("이미 등록된 이메일입니다."); return; }
    const newUser = { id: Date.now().toString(), email, password, role: "member", approved: false, name: email.split("@")[0], createdAt: new Date().toISOString() };
    saveUsers([...users, newUser]);
    setMode("pending");
    setError("");
  };

  const iStyle = { width: "100%", background: "#F8F9FA", border: "1px solid #D1D5DB", borderRadius: 10, padding: "12px 16px", color: "#1A1A2E", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const btnStyle = { width: "100%", background: "#C8102E", border: "none", borderRadius: 10, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.05em" };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(200,16,46,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: 380, background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 20, padding: "40px 36px", backdropFilter: "blur(12px)" }}>
        {/* 타이틀 */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C8102E", boxShadow: "0 0 10px #C8102E" }} />
            <span style={{ fontSize: 11, color: "#C8102E", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>Animation Studio</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1A1A2E", letterSpacing: "-0.02em" }}>Schedule & <span style={{ color: "#C8102E" }}>Quote Tool</span></div>
        </div>

        {mode === "pending" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <h2 style={{ color: "#1A1A2E", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>가입 신청 완료</h2>
            <p style={{ color: "#6B7280", fontSize: 13, lineHeight: 1.6 }}>관리자 승인 후 로그인 가능합니다.<br />관리자에게 승인을 요청하세요.</p>
            <button onClick={() => setMode("login")} style={{ ...btnStyle, marginTop: 24, background: "#EFEFEF" }}>로그인으로 돌아가기</button>
          </div>
        ) : (
          <>
            <h2 style={{ color: "#1A1A2E", fontSize: 20, fontWeight: 900, marginBottom: 24 }}>{mode === "login" ? "로그인" : "회원가입"}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <input type="email" placeholder="이메일" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} style={iStyle} />
              <input type="password" placeholder="비밀번호 (6자 이상)" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())} style={iStyle} />
            </div>
            {error && <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>{error}</div>}
            <button onClick={mode === "login" ? handleLogin : handleRegister} style={btnStyle}>
              {mode === "login" ? "로그인" : "가입 신청"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
                style={{ background: "none", border: "none", color: "#6B7280", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
              </button>
            </div>
            {mode === "login" && <div style={{ marginTop: 16, padding: "10px 12px", background: "#F4F5F7", borderRadius: 8, fontSize: 11, color: "#6B7280" }}>
              계정이 없으면 관리자에게 문의하거나 회원가입을 신청하세요.
            </div>}
          </>
        )}
      </div>
    </div>
  );
}

function AdminPanel({ currentUser, onClose }) {
  const [users, setUsers] = useState(loadUsers());
  const [tab, setTab] = useState("pending");
  const [pwEmail, setPwEmail] = useState("");
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwMsg, setPwMsg] = useState({ text: "", ok: false });

  const refresh = () => setUsers(loadUsers());

  const approve = (id) => {
    const updated = users.map(u => u.id === id ? { ...u, approved: true } : u);
    saveUsers(updated); refresh();
  };
  const reject = (id) => {
    if (!window.confirm("이 사용자를 삭제하시겠습니까?")) return;
    saveUsers(users.filter(u => u.id !== id)); refresh();
  };
  const changeRole = (id, role) => {
    saveUsers(users.map(u => u.id === id ? { ...u, role } : u)); refresh();
  };

  const handlePwChange = () => {
    const all = loadUsers();
    const target = all.find(u => u.email === pwEmail);
    if (!target) { setPwMsg({ text: "존재하지 않는 이메일입니다.", ok: false }); return; }
    if (target.password !== pwOld) { setPwMsg({ text: "현재 비밀번호가 올바르지 않습니다.", ok: false }); return; }
    if (pwNew.length < 6) { setPwMsg({ text: "새 비밀번호는 6자 이상이어야 합니다.", ok: false }); return; }
    if (pwNew !== pwNew2) { setPwMsg({ text: "새 비밀번호가 일치하지 않습니다.", ok: false }); return; }
    saveUsers(all.map(u => u.email === pwEmail ? { ...u, password: pwNew } : u));
    setPwMsg({ text: "비밀번호가 성공적으로 변경되었습니다.", ok: true });
    setPwOld(""); setPwNew(""); setPwNew2("");
    refresh();
  };

  const pending = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);

  const rowStyle = { display: "grid", gridTemplateColumns: "1fr 100px 120px auto", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#F4F5F7", marginBottom: 8 };
  const iStyle = { width: "100%", background: "#F8F9FA", border: "1px solid #D1D5DB", borderRadius: 8, padding: "9px 12px", color: "#1A1A2E", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: 640, maxHeight: "80vh", background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1A1A2E" }}>👑 Admin Panel</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 4, padding: "12px 24px 0", borderBottom: "1px solid #E5E7EB" }}>
          {[["pending", `승인 대기 (${pending.length})`], ["all", `전체 멤버 (${approved.length})`], ["pw", "비밀번호 변경"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: tab === id ? "#C8102E" : "transparent", color: tab === id ? "#fff" : "#6B7280" }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {tab === "pending" && (
            pending.length === 0 ? <p style={{ color: "#6B7280", fontSize: 13 }}>승인 대기 중인 사용자가 없습니다.</p> :
            pending.map(u => (
              <div key={u.id} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1A1A2E" }}>{u.email}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{new Date(u.createdAt).toLocaleString("ko-KR")}</div>
                </div>
                <select value="member" onChange={e => {}} style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit" }}>
                  <option value="member">Member</option>
                  <option value="senior">Senior</option>
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => approve(u.id)} style={{ background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 6, padding: "5px 12px", color: "#34D399", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>승인</button>
                  <button onClick={() => reject(u.id)} style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, padding: "5px 10px", color: "#EF4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>거절</button>
                </div>
              </div>
            ))
          )}
          {tab === "all" && (
            approved.map(u => (
              <div key={u.id} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1A1A2E" }}>{u.email}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>가입: {new Date(u.createdAt).toLocaleString("ko-KR")}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: ROLE_COLORS[u.role], background: ROLE_COLORS[u.role] + "22", border: `1px solid ${ROLE_COLORS[u.role]}55`, padding: "3px 10px", borderRadius: 99, textAlign: "center" }}>{ROLE_LABELS[u.role]}</span>
                {u.id !== "admin" ? (
                  <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                    style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit" }}>
                    <option value="member">Member</option>
                    <option value="senior">Senior</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : <div style={{ color: "#6B7280", fontSize: 11 }}>Super Admin</div>}
                {u.id !== "admin" && (
                  <button onClick={() => reject(u.id)} style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,46,0.25)", borderRadius: 6, padding: "5px 8px", color: "#EF4444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>
                )}
              </div>
            ))
          )}
          {tab === "pw" && (
            <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ color: "#6B7280", fontSize: 12, marginBottom: 4 }}>계정의 비밀번호를 변경합니다. 현재 비밀번호 확인 후 변경됩니다.</p>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>이메일</span>
                <select value={pwEmail} onChange={e => { setPwEmail(e.target.value); setPwMsg({ text: "", ok: false }); }}
                  style={{ ...iStyle }}>
                  <option value="">-- 계정 선택 --</option>
                  {approved.map(u => <option key={u.id} value={u.email}>{u.email} ({ROLE_LABELS[u.role]})</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>현재 비밀번호</span>
                <input type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} placeholder="현재 비밀번호" style={iStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>새 비밀번호</span>
                <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="6자 이상" style={iStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>새 비밀번호 확인</span>
                <input type="password" value={pwNew2} onChange={e => setPwNew2(e.target.value)} placeholder="새 비밀번호 재입력" style={iStyle}
                  onKeyDown={e => e.key === "Enter" && handlePwChange()} />
              </label>
              {pwMsg.text && (
                <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: pwMsg.ok ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)", color: pwMsg.ok ? "#34D399" : "#EF4444", border: `1px solid ${pwMsg.ok ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                  {pwMsg.ok ? "✓ " : "✗ "}{pwMsg.text}
                </div>
              )}
              <button onClick={handlePwChange} style={{ background: "#C8102E", border: "none", borderRadius: 8, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>
                비밀번호 변경
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
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
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>프로젝트 설명</span>
            <textarea value={project.description} onChange={e => onChange("description", e.target.value)}
              rows={3} placeholder="프로젝트 개요 및 요구사항을 입력하세요"
              style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", color: "#1A1A2E", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
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
    <div ref={containerRef} style={{ overflowX: "auto", borderRadius: 12, background: "#EAEDF0", border: "1px solid #EEEFF2" }}>
      <div style={{ minWidth: 700 }}>
        {/* Header: month labels */}
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ width: LABEL_W, flexShrink: 0, padding: "6px 12px", fontSize: 11, color: "#6B7280" }} />
          <div style={{ flex: 1, position: "relative", height: 28 }}>
            {months.map((m, i) => {
              const dayOffset = daysBetween(ganttStart, m.toISOString().slice(0, 10));
              const leftPct = Math.max(0, (dayOffset / totalDays) * 100);
              return (
                <div key={i} style={{
                  position: "absolute", left: `${leftPct}%`,
                  fontSize: 10, color: "#6B7280", fontWeight: 600,
                  top: 8, paddingLeft: 4, borderLeft: "1px solid #D1D5DB",
                  whiteSpace: "nowrap",
                }}>
                  {`${m.getFullYear().toString().slice(2)}/${String(m.getMonth() + 1).padStart(2, "0")}`}
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
                borderBottom: "1px solid #EEEFF2",
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
              <div key={p.id} style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: "1px solid #F3F4F6" }}>
                <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 12px 0 20px", fontSize: 12, color: "#6B7280" }}>{phase?.label}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 8px" }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>— 날짜 미설정</span>
                </div>
              </div>
            );
          }

          const leftPct = Math.max(0, (daysBetween(ganttStart, p.startDate) / totalDays) * 100);
          const widthPct = Math.max(0.5, (daysBetween(p.startDate, p.endDate) / totalDays) * 100);
          const dur = daysBetween(p.startDate, p.endDate);

          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: "1px solid #F3F4F6", position: "relative" }}>
              <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 8px 0 20px", fontSize: 12, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {phase?.label}
              </div>
              <div style={{ flex: 1, position: "relative", height: "100%" }}>
                {/* grid lines */}
                {months.map((m, i) => {
                  const dayOffset = daysBetween(ganttStart, m.toISOString().slice(0, 10));
                  const leftPct2 = Math.max(0, (dayOffset / totalDays) * 100);
                  return <div key={i} style={{ position: "absolute", left: `${leftPct2}%`, top: 0, bottom: 0, width: 1, background: "#FFFFFF" }} />;
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
            {totalDays !== null && <span style={{ marginLeft: 10, fontSize: 12, color: "#6B7280", fontWeight: 400, textTransform: "none" }}>총 {totalDays}일</span>}
          </h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280" }}>
              시작
              <input type="date" value={ganttStart} onChange={e => setGanttStart(e.target.value)} style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280" }}>
              종료
              <input type="date" value={ganttEnd} onChange={e => setGanttEnd(e.target.value)} style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </label>
          </div>
        </div>

        {schedule.phases.length === 0 ? (
          <div style={{ textAlign: "center", color: "#6B7280", padding: "32px 0", fontSize: 13 }}>아래에서 단계를 추가하면 차트가 표시됩니다</div>
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
              <div style={{ color: "#6B7280", fontSize: 12, padding: "8px 0" }}>위 버튼으로 단계를 추가하세요</div>
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
                        <span style={{ fontSize: 12, color: "#1A1A2E", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ph?.label}</span>
                      </div>
                      <input type="date" value={p.startDate} onChange={e => updatePhase(p.id, "startDate", e.target.value)}
                        style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 7, padding: "6px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="date" value={p.endDate} onChange={e => updatePhase(p.id, "endDate", e.target.value)}
                          style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 7, padding: "6px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit", outline: "none", flex: 1 }} />
                        {dur !== null && <span style={{ fontSize: 10, color: "#6B7280", whiteSpace: "nowrap" }}>{dur}일</span>}
                      </div>
                      <input value={p.assignee} onChange={e => updatePhase(p.id, "assignee", e.target.value)} placeholder="담당자"
                        style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 7, padding: "6px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
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
          style={{ width: "100%", background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", color: "#1A1A2E", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      </Card>
    </div>
  );
}

// ─── 탭: 견적 ──────────────────────────────────────────────────────────────────

function QuoteTab({ quote, onChange, userCanEditRate }) {
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

  const inputStyle = { background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 7, padding: "6px 8px", color: "#1A1A2E", fontSize: 12, fontFamily: "inherit", outline: "none" };

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
              <div style={{ fontSize: 12, color: "#6B7280", padding: "4px 0" }}>위 버튼으로 항목을 추가하세요</div>
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
                              disabled={!userCanEditRate}
                              title={!userCanEditRate ? "단가 수정은 Admin/Senior만 가능합니다" : ""}
                              style={{ ...inputStyle, textAlign: "right", opacity: userCanEditRate ? 1 : 0.45, cursor: userCanEditRate ? "text" : "not-allowed" }} />
                          </>
                        )}
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A2E", textAlign: "right" }}>
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
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{cat.label}</span>
                    <span style={{ fontSize: 11, color: "#1A1A2E", fontWeight: 600 }}>₩{formatNum(Math.round(amt))}</span>
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
            <span style={{ color: "#1A1A2E", fontSize: 14 }}>부가세 (10%) 포함</span>
          </label>
        </div>

        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16 }}>
          {[
            { label: "소계", value: subtotal, dimmed: false },
            Number(quote.discountPct) > 0 && { label: `할인 (${quote.discountPct}%)`, value: -discountAmt, dimmed: true },
            quote.includeVat && { label: "부가세 (10%)", value: vatAmt, dimmed: true },
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, color: row.dimmed ? "#9CA3AF" : "#1A1A2E" }}>
              <span style={{ fontSize: 14 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{row.value < 0 ? "-" : ""}₩{formatNum(Math.abs(Math.round(row.value)))}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid #D1D5DB", marginTop: 4 }}>
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
            <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{kpi.label}</div>
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
              <span style={{ fontSize: 13, color: "#1A1A2E", fontWeight: 600 }}>{v}</span>
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
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, background: "#F4F5F7" }}>
                  <Tag color={phase?.color || "#888"}>{phase?.icon} {phase?.label}</Tag>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{p.startDate || "?"} ~ {p.endDate || "?"}</span>
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
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #F3F4F6" }}>
                        <span style={{ color: "#374151" }}>{item.label}{!role?.isContingency && ` (${item.qty}${item.unit})`}</span>
                        <span style={{ color: "#1A1A2E", fontWeight: 600 }}>₩{formatNum(Math.round(amt))}</span>
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
  const [currentUser, setCurrentUser] = useState(() => loadSession());
  const [showAdmin, setShowAdmin] = useState(false);
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

  const handleLogin = (user) => setCurrentUser(user);
  const handleLogout = () => { saveSession(null); setCurrentUser(null); };

  const saveProject = () => {
    const entry = { id: Date.now(), project, schedule, quote, savedAt: new Date().toLocaleString("ko-KR"), savedBy: currentUser?.email };
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

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const userCanEditRate = canEditRate(currentUser.role);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7", color: "#1A1A2E", fontFamily: "'Noto Sans KR', 'IBM Plex Sans KR', sans-serif" }}>
      {showAdmin && <AdminPanel currentUser={currentUser} onClose={() => setShowAdmin(false)} />}

      {/* 배경 효과 */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 70% 40% at 50% -10%, rgba(200,16,46,0.06) 0%, transparent 70%)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>

        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", boxShadow: "0 0 8px #C8102E" }} />
                <span style={{ fontSize: 11, color: "#C8102E", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>Animation Studio</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#1A1A2E" }}>
                Schedule & <span style={{ color: "#C8102E" }}>Quote Tool</span>
              </h1>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            {/* 현재 유저 배지 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#EFF0F3", borderRadius: 8, border: "1px solid #E5E7EB" }}>
              <span style={{ fontSize: 11, color: ROLE_COLORS[currentUser.role], fontWeight: 700, background: ROLE_COLORS[currentUser.role] + "22", border: `1px solid ${ROLE_COLORS[currentUser.role]}55`, padding: "2px 7px", borderRadius: 99 }}>{ROLE_LABELS[currentUser.role]}</span>
              <span style={{ fontSize: 12, color: "#6B7280" }}>{currentUser.email}</span>
            </div>
            {currentUser.role === "admin" && (
              <button onClick={() => setShowAdmin(true)} style={{ background: "rgba(200,16,46,0.15)", border: "1px solid rgba(200,16,46,0.35)", borderRadius: 8, padding: "7px 14px", color: "#C8102E", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>👑 Admin</button>
            )}
            <button onClick={() => setShowSaved(s => !s)} style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 14px", color: "#6B7280", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              📂 ({projects.length})
            </button>
            <button onClick={() => downloadPDF(project, schedule, quote, currentUser)} style={{ background: "rgba(107,158,204,0.15)", border: "1px solid rgba(107,158,204,0.35)", borderRadius: 8, padding: "7px 14px", color: "#6B9ECC", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📄 PDF</button>
            <button onClick={saveProject} style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "7px 14px", color: "#34D399", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 저장</button>
            <button onClick={newProject} style={{ background: "#C8102E", border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 새 프로젝트</button>
            <button onClick={handleLogout} style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 12px", color: "#6B7280", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>로그아웃</button>
          </div>
        </div>

        {/* 저장된 프로젝트 패널 */}
        {showSaved && (
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 14px", color: "#C8102E", fontSize: 14, fontWeight: 700 }}>저장된 프로젝트</h3>
            {projects.length === 0 ? (
              <p style={{ color: "#6B7280", fontSize: 13 }}>아직 저장된 프로젝트가 없습니다.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {projects.map(entry => (
                  <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#F8F9FA", border: "1px solid #EEEFF2" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.project.name || "무제 프로젝트"}</div>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>{entry.project.client && `${entry.project.client} · `}{entry.savedAt} · by {entry.savedBy}</div>
                    </div>
                    <button onClick={() => loadProject(entry)} style={{ background: "#C8102E", border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>불러오기</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 현재 프로젝트 배지 */}
        {project.name && (
          <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#6B7280" }}>현재:</span>
            <Tag color="#C8102E">{project.name}</Tag>
            {project.client && <Tag color="#9CA3AF">{project.client}</Tag>}
            {project.videoType && <Tag color="#6B9ECC">{project.videoType}</Tag>}
            {project.deadline && <Tag color="#34D399">납품 {project.deadline}</Tag>}
            {!userCanEditRate && <Tag color="#F59E0B">⚠ 단가 수정 불가 (Member)</Tag>}
          </div>
        )}

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#FFFFFF", padding: 4, borderRadius: 12, border: "1px solid #EEEFF2" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 9, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all 0.2s",
              background: activeTab === tab.id ? "#C8102E" : "transparent",
              color: activeTab === tab.id ? "#fff" : "#374151",
            }}>{tab.icon} {tab.label}</button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {activeTab === "info" && <ProjectInfoTab project={project} onChange={updateProject} />}
        {activeTab === "schedule" && <ScheduleTab schedule={schedule} onChange={updateSchedule} projectStart={project.startDate} projectDeadline={project.deadline} />}
        {activeTab === "quote" && <QuoteTab quote={quote} onChange={updateQuote} userCanEditRate={userCanEditRate} />}
        {activeTab === "summary" && <SummaryTab project={project} schedule={schedule} quote={quote} />}

        {/* 하단 네비게이션 */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <button onClick={() => { const i = TABS.findIndex(t => t.id === activeTab); if (i > 0) setActiveTab(TABS[i-1].id); }}
            disabled={activeTab === TABS[0].id}
            style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 20px", color: "#6B7280", fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: activeTab === TABS[0].id ? 0.3 : 1 }}>← 이전</button>
          <button onClick={() => { const i = TABS.findIndex(t => t.id === activeTab); if (i < TABS.length - 1) setActiveTab(TABS[i+1].id); }}
            disabled={activeTab === TABS[TABS.length-1].id}
            style={{ background: "#C8102E", border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: activeTab === TABS[TABS.length-1].id ? 0.3 : 1 }}>다음 →</button>
        </div>
      </div>
    </div>
  );
}
