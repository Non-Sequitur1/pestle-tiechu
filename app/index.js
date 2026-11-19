/* 铁杵 Tiechu — app core.
 * Views: bank (刷题) / formats (题型归纳) / keypoints (高频考点) / intel (科目情报) /
 *        papers (试卷中心) / notes (基础知识补给站) / pomodoro (番茄钟).
 *
 * v3: per-paper-KIND architecture (分试卷类型：秋季期中 / 春季期中 / 大考 / 重考 / 习题集…).
 * A kind selector drives formats / keypoints / intel / papers / notes; formats may be
 * shared across kinds (kinds absent/empty) or exclusive to specific kinds.
 * zh-Hant displays format ids & option letters as heavenly stems 甲乙丙丁戊….
 */

/* ---------------- i18n ---------------- */
const LANGS = ["zh-Hans", "zh-Hant", "en"];
let LANG = localStorage.getItem("tiechuLang") || "zh-Hans";
if (!LANGS.includes(LANG)) LANG = "zh-Hans";

function t(key) {
  const d = window.TIECHU_I18N[LANG] || window.TIECHU_I18N["zh-Hans"];
  return d[key] !== undefined ? d[key] : (window.TIECHU_I18N["zh-Hans"][key] ?? key);
}
function tFmt(key, args) {
  let s = t(key);
  for (const [k, v] of Object.entries(args || {})) s = s.replace("{" + k + "}", String(v));
  return s;
}
/** pick from a language object {en, zh-Hans, zh-Hant} with fallback to en */
function pick(langobj, fallbackKey) {
  if (langobj == null) return fallbackKey ? t(fallbackKey) : "";
  if (typeof langobj === "string") return langobj; // v1 compatibility
  return langobj[LANG] || langobj["en"] || "";
}

/* ---------------- 天干 labels (zh-Hant convention) ---------------- */
/* Traditional Chinese shows format ids and objective option letters as the
 * heavenly stems 甲乙丙丁戊己庚辛 instead of A B C D E F G H. Internal data
 * stays A–H; only the displayed glyph is mapped. */
const TIANGAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"];
const fmtGlyph = id => (LANG === "zh-Hant" && /^[A-H]$/.test(id)) ? TIANGAN[id.charCodeAt(0) - 65] : id;
const optGlyph = letter => (LANG === "zh-Hant" && /^[A-H]$/.test(letter)) ? TIANGAN[letter.charCodeAt(0) - 65] : letter;

/* ---------------- state ---------------- */
const QB_REGISTRY = [
  { code: "MATH50013", file: "MATH50013" },
  { code: "MATH50003/50016", file: "MATH50003" },
  { code: "ANALYSIS2", file: "ANALYSIS2" },
];
let currentBank = null;      // parsed bank {schema, module, questions}
let currentView = "bank";
let filters = {
  search: "", format: "all", source: "all", year: "all", topic: "all",
  importance: 0, finaleOnly: false, sort: "default",
};
let kindFilter = "all";      // paper-kind selector: "all" | kind id
let schemeOpen = {};         // key -> bool (plain qid or "PAPER:<pid><qid>")
let hintsOpen = {};          // key -> number of revealed hints
let walkOpen = {};           // key -> bool
let exrOpen = {};            // question_id -> bool (examiner report open)
let objectivePicks = {};     // question_id -> [letters]
let objectiveChecked = {};   // question_id -> 'correct'|'wrong'
let selfMarks = {};          // question_id -> 0|1|2 (self assessment)
let pdfPick = {};            // question_id -> bool (selected for the custom PDF)
const LS_PREFIX = "tiechu.";

function lsGet(key, dflt) {
  try { const v = localStorage.getItem(LS_PREFIX + key); return v === null ? dflt : JSON.parse(v); }
  catch (e) { return dflt; }
}
function lsSet(key, val) { try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch (e) { } }

function loadState() {
  selfMarks = lsGet("selfMarks", {});
  schemeOpen = lsGet("schemeOpen", {});
  hintsOpen = lsGet("hintsOpen", {});
  walkOpen = lsGet("walkOpen", {});
  exrOpen = lsGet("exrOpen", {});
  pdfPick = lsGet("pdfPick", {});
}
function practisedCount() { return Object.keys(selfMarks).length; }

/* ---------------- paper kinds (v3) ---------------- */
function moduleKinds(mod) {
  const out = [];
  for (const k of (mod.paper_kinds || [])) out.push(k.id);
  for (const k of Object.keys(mod.kind_meta || {})) if (!out.includes(k)) out.push(k);
  return out;
}
function kindName(mod, kindId) {
  const k = (mod.paper_kinds || []).find(x => x.id === kindId);
  if (k) return pick(k.name);
  return (t("source-kinds") || {})[kindId] || kindId;
}
function kindsOf(item) {
  // formats / keypoints / notes: absent or empty kinds = shared across ALL kinds
  return (item.kinds && item.kinds.length) ? item.kinds : null;
}
function itemAppliesTo(item, kindId) {
  if (kindId === "all") return true;
  const ks = kindsOf(item);
  return !ks || ks.includes(kindId);
}
function questionAppliesToKind(q, kindId) {
  if (kindId === "all") return true;
  return q.source.kind === kindId;
}
function kindHasData(mod, kindId) {
  const fmts = (mod.formats || []).some(f => itemAppliesTo(f, kindId));
  const kps = (mod.keypoints || []).some(k => itemAppliesTo(k, kindId));
  const km = (mod.kind_meta || {})[kindId];
  const notes = (mod.notes || []).some(n => itemAppliesTo(n, kindId));
  return !!(fmts || kps || km || notes);
}

/* ---------------- kind selector bar (shared by the kind-aware views) ---------------- */
function renderKindBar(extra) {
  const bar = document.getElementById("kindBar");
  if (!currentBank) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  const mod = currentBank.module;
  const kinds = moduleKinds(mod);
  if (!kinds.length) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  bar.classList.remove("hidden");
  const chip = (id, label, on, dim) =>
    `<button class="kind-chip ${on ? "kind-on" : ""} ${dim ? "kind-dim" : ""}" data-kind="${id}">${label}</button>`;
  let html = chip("all", t("kinds-all"), kindFilter === "all");
  for (const k of kinds) {
    html += chip(k, kindName(mod, k), kindFilter === k, !kindHasData(mod, k));
  }
  bar.innerHTML = `<span class="kind-label">${esc(t("paper-kind"))}:</span>` + html + (extra || "");
  bar.querySelectorAll(".kind-chip").forEach(b =>
    b.addEventListener("click", () => { kindFilter = b.dataset.kind; renderCurrentView(); }));
}

/* ---------------- markdown + math pipeline ---------------- */
/* Protect math from the markdown parser, render markdown, restore math, then MathJax. */
let mathStore = [];
let mathSeq = 0;

function protectMath(src) {
  mathStore = [];
  return src
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) => placeholder("display", inner))
    .replace(/\\\[([\s\S]+?)\\\]/g, (m, inner) => placeholder("display", inner))
    .replace(/\$([^\$\n]+?)\$/g, (m, inner) => placeholder("inline", inner))
    .replace(/\\\(([\s\S]+?)\\\)/g, (m, inner) => placeholder("inline", inner));
}
function placeholder(kind, inner) {
  const token = `%%MATH${mathSeq++}%%`;
  mathStore.push({ token, kind, tex: inner });
  return token;
}
function restoreMath(html) {
  for (const m of mathStore) {
    const delim = m.kind === "display" ? "$$" : "$";
    html = html.split(m.token).join(delim + m.tex + delim);
  }
  return html;
}

function mdToHtml(src) {
  if (!src) return "";
  const guarded = protectMath(src);
  let raw = marked.parse(guarded, { breaks: true, mangle: false, headerIds: false });
  raw = restoreMath(raw);
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ["mjx-container"], ADD_ATTR: ["tex"],
  });
}

function typesetMath(el) {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise(el ? [el] : undefined).catch(() => { });
  }
}

/* ---------------- question bank loading ---------------- */
async function loadBank(code, file) {
  const banner = document.getElementById("loadingBanner");
  banner.style.display = "block";
  try {
    const res = await fetch(`../assets/jsonqb/${file || code}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bank = await res.json();
    if (!["tiechu-qb-v2", "tiechu-qb-v3"].includes(bank.schema)) throw new Error("unknown schema");
    currentBank = bank;
    // normalise v2 banks into the v3 shape in memory (no file rewrite)
    const m = currentBank.module;
    if (!m.paper_kinds) m.paper_kinds = [];
    if (!m.kind_meta) m.kind_meta = {};
    if (bank.schema === "tiechu-qb-v2") {
      if (!m.paper_kinds.find(k => k.id === "autumn-midterm"))
        m.paper_kinds.push({ id: "autumn-midterm", name: { en: "Autumn Midterm", "zh-Hans": "秋季期中试卷", "zh-Hant": "秋季期中試卷" } });
      if (!m.kind_meta["autumn-midterm"])
        m.kind_meta["autumn-midterm"] = {
          trends: m.trends, order: null, mock_template: m.mock_template, lecturers: m.lecturers || [],
        };
    }
    lsSet("lastBank", code);
  } catch (e) {
    currentBank = null;
    const rc = document.getElementById("right-col");
    rc.innerHTML = `<div class="q-card error-card">${esc(t("load-error"))} ${code}: ${e.message}</div>`;
  } finally {
    banner.style.display = "none";
  }
}

/* ---------------- helpers ---------------- */
function stars(n) {
  const full = Math.round(n);
  return t("star-full").repeat(full) + t("star-empty").repeat(Math.max(0, 5 - full));
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function paperLabel(q) {
  const src = q.source;
  const kind = (t("source-kinds") || {})[src.kind] || src.kind;
  const yr = src.year ? ` ${src.year}` : "";
  return `${kind}${yr}`;
}
function formatBreadcrumbs(q) {
  // format badges with kind-ownership tooltips (共用/专属)
  const mod = currentBank.module;
  const parts = [];
  for (const fid of [q.format, q.secondary_format].filter(Boolean)) {
    const f = (mod.formats || []).find(x => x.id === fid);
    const ks = f ? kindsOf(f) : null;
    const tag = ks ? ks.map(k => kindName(mod, k)).join("/") : t("kinds-shared");
    parts.push({ id: fid, tag });
  }
  return parts;
}
function sortQuestions(qs) {
  const arr = [...qs];
  switch (filters.sort) {
    case "importance": arr.sort((a, b) => b.importance - a.importance || a.source.marks - b.source.marks); break;
    case "marks": arr.sort((a, b) => b.source.marks - a.source.marks); break;
    case "random": arr.sort(() => Math.random() - 0.5); break;
    default:
      arr.sort((a, b) => {
        const ka = `${a.source.year ?? 0}-${a.source.paper_id}-${a.source.question_number}`;
        const kb = `${b.source.year ?? 0}-${b.source.paper_id}-${b.source.question_number}`;
        return ka.localeCompare(kb, undefined, { numeric: true });
      });
  }
  return arr;
}
function applyFilters(qs) {
  const f = filters;
  return qs.filter(q => {
    if (f.format !== "all" && q.format !== f.format && q.secondary_format !== f.format) return false;
    if (f.source !== "all" && q.source.kind !== f.source) return false;
    if (f.year !== "all" && String(q.source.year ?? "—") !== f.year) return false;
    if (f.topic !== "all" && !q.topics.includes(f.topic)) return false;
    if (f.importance > 0 && q.importance < f.importance) return false;
    if (f.finaleOnly && !q.is_finale) return false;
    if (f.search) {
      const hay = [
        q.question_id, pick(q.Question), pick(q.Markscheme),
        q.tags.join(" "), q.source.question_number,
      ].join(" \n ").toLowerCase();
      if (!hay.includes(f.search.toLowerCase())) return false;
    }
    return true;
  });
}
function bankQuestions() {
  if (kindFilter === "all") return currentBank.questions;
  return currentBank.questions.filter(q => questionAppliesToKind(q, kindFilter));
}

/* ---------------- view: question bank (刷题) ---------------- */
function renderFilterBar() {
  const bar = document.getElementById("filterBar");
  if (!currentBank) { bar.innerHTML = ""; bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const mod = currentBank.module;
  const pool = bankQuestions();
  const years = [...new Set(pool.map(q => q.source.year).filter(y => y))].sort().reverse();
  const sources = [...new Set(pool.map(q => q.source.kind))];
  const fmts = (mod.formats || []).filter(f => itemAppliesTo(f, kindFilter));
  const fmtOpt = f => `<option value="${f.id}" ${filters.format === f.id ? "selected" : ""}>${esc(pick(f.name))} (${fmtGlyph(f.id)})</option>`;
  bar.innerHTML = `
    <div class="filter-row">
      <input type="search" id="f-search" placeholder="${esc(t("search-ph"))}" value="${esc(filters.search)}">
      <select id="f-format" aria-label="${esc(t("format"))}">
        <option value="all">${esc(t("format"))} · ${esc(t("all"))}</option>
        ${fmts.map(fmtOpt).join("")}
      </select>
      <select id="f-source" aria-label="${esc(t("source"))}">
        <option value="all">${esc(t("source"))} · ${esc(t("all"))}</option>
        ${sources.map(k => `<option value="${k}" ${filters.source === k ? "selected" : ""}>${esc((t("source-kinds") || {})[k] || k)}</option>`).join("")}
      </select>
      <select id="f-year" aria-label="${esc(t("year"))}">
        <option value="all">${esc(t("year"))} · ${esc(t("all"))}</option>
        ${years.map(y => `<option value="${y}" ${filters.year === String(y) ? "selected" : ""}>${y}</option>`).join("")}
        <option value="—" ${filters.year === "—" ? "selected" : ""}>—</option>
      </select>
      <select id="f-topic" aria-label="${esc(t("topic"))}">
        <option value="all">${esc(t("topic"))} · ${esc(t("all"))}</option>
        ${mod.topics.map(tp => `<option value="${tp.id}" ${filters.topic === tp.id ? "selected" : ""}>${esc(pick(tp.name))}</option>`).join("")}
      </select>
      <select id="f-importance" aria-label="${esc(t("importance"))}">
        <option value="0">${esc(t("importance-any"))}</option>
        ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${filters.importance === n ? "selected" : ""}>${stars(n)}</option>`).join("")}
      </select>
      <select id="f-sort" aria-label="${esc(t("sort"))}">
        <option value="default" ${filters.sort === "default" ? "selected" : ""}>${esc(t("sort-default"))}</option>
        <option value="importance" ${filters.sort === "importance" ? "selected" : ""}>${esc(t("sort-importance"))}</option>
        <option value="marks" ${filters.sort === "marks" ? "selected" : ""}>${esc(t("sort-marks"))}</option>
        <option value="random" ${filters.sort === "random" ? "selected" : ""}>${esc(t("random"))}</option>
      </select>
      <label class="chk"><input type="checkbox" id="f-finale" ${filters.finaleOnly ? "checked" : ""}> ${esc(t("finale-only"))}</label>
    </div>`;
  const bind = (id, key, transform) => {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
      filters[key] = transform ? transform(el) : el.value;
      renderCurrentView();
    });
  };
  bind("f-format", "format");
  bind("f-source", "source");
  bind("f-year", "year");
  bind("f-topic", "topic");
  bind("f-importance", "importance", el => parseInt(el.value, 10));
  bind("f-sort", "sort");
  document.getElementById("f-finale").addEventListener("change", e => {
    filters.finaleOnly = e.target.checked; renderCurrentView();
  });
  const search = document.getElementById("f-search");
  let deb;
  search.addEventListener("input", () => {
    clearTimeout(deb);
    deb = setTimeout(() => { filters.search = search.value.trim(); renderCurrentView(); }, 250);
  });
}

/* ---- 刷题型 banner: format info + skeleton + pitfalls + secrets while grinding ---- */
function drillFormatBanner() {
  if (filters.format === "all") return "";
  const mod = currentBank.module;
  const f = (mod.formats || []).find(x => x.id === filters.format);
  if (!f) return "";
  const banner = (mod.drill_banner || {})[f.id] || (mod.drill_banner || {}).default;
  const ks = kindsOf(f);
  const kindTag = ks ? ks.map(k => kindName(mod, k)).join(" / ") : t("kinds-shared");
  const blocks = [];
  blocks.push(`<div class="dfb-row"><span class="dfb-fmt">${esc(t("format-x"))} ${fmtGlyph(f.id)}</span>
    <span class="dfb-name">${esc(pick(f.name))}</span>
    <span class="dfb-stars" title="${esc(t("likelihood"))}">${stars(f.stars)}</span>
    <span class="badge badge-kind">${esc(kindTag)}</span></div>`);
  if (banner) blocks.push(`<div class="dfb-banner">${mdToHtml(pick(banner))}</div>`);
  const cols = [];
  if (f.skeleton) cols.push(`<div class="dfb-col"><h4>${esc(t("skeleton"))}</h4><div class="dfb-body">${mdToHtml(pick(f.skeleton))}</div></div>`);
  if (f.pitfalls) cols.push(`<div class="dfb-col"><h4>⚠️ ${esc(t("pitfalls"))}</h4><div class="dfb-body">${mdToHtml(pick(f.pitfalls))}</div></div>`);
  if (f.secrets) cols.push(`<div class="dfb-col"><h4>🔑 ${esc(t("secrets"))}</h4><div class="dfb-body">${mdToHtml(pick(f.secrets))}</div></div>`);
  return `<section class="drill-banner" id="drillBanner">${blocks.join("")}${cols.length ? `<div class="dfb-cols">${cols.join("")}</div>` : ""}</section>`;
}

function objectiveBlock(q) {
  const letters = "ABCDEFGH".slice(0, q.options.length).split("");
  const picked = objectivePicks[q.question_id] || [];
  const checked = objectiveChecked[q.question_id];
  const isMulti = q.qtype === "multi";
  const opts = q.options.map((o, i) => {
    const letter = letters[i];
    const isPicked = picked.includes(letter);
    const isKey = (q.answer_key || []).includes(letter);
    let cls = "opt";
    if (checked) {
      if (isKey) cls += " opt-correct";
      if (isPicked && !isKey) cls += " opt-wrong";
      if (isPicked && isKey) cls += " opt-picked";
    } else if (isPicked) cls += " opt-picked";
    return `<label class="${cls}">
      <input type="${isMulti ? "checkbox" : "radio"}" name="ob-${q.question_id}" value="${letter}"
        ${isPicked ? "checked" : ""} onchange="onObjectivePick('${q.question_id}')">
      <span class="opt-letter">${optGlyph(letter)}.</span>
      <span class="opt-text">${mdToHtml(pick(o))}</span>
    </label>`;
  }).join("");
  let verdict = "";
  if (checked === "correct") verdict = `<div class="verdict ok">${esc(t("correct"))}</div>`;
  else if (checked === "wrong") verdict = `<div class="verdict bad">${esc(t("wrong"))}</div>`;
  return `
    <div class="objective">
      <div class="hint">${esc(t("objective-hint"))} (${esc((t("qtype-labels") || {})[q.qtype] || q.qtype)})</div>
      ${opts}
      <div class="obj-actions">
        <button class="btn-secondary" onclick="checkObjective('${q.question_id}')">${esc(t("check-answer"))}</button>
        ${verdict}
      </div>
      ${checked ? `<div class="correct-key">${esc(t("correct-key"))}: ${(q.answer_key || []).map(optGlyph).join("、")}</div>` : ""}
    </div>`;
}

window.onObjectivePick = function (qid) {
  const inputs = document.querySelectorAll(`input[name="ob-${qid}"]:checked`);
  objectivePicks[qid] = [...inputs].map(i => i.value);
};

window.checkObjective = function (qid) {
  const q = currentBank.questions.find(x => x.question_id === qid);
  const picked = objectivePicks[qid] || [];
  if (!picked.length) return;
  const key = q.answer_key || [];
  const same = picked.length === key.length && picked.every(p => key.includes(p));
  objectiveChecked[qid] = same ? "correct" : "wrong";
  renderCurrentView();
  if (same) {
    selfMarks[qid] = 0; lsSet("selfMarks", selfMarks); updateProgress();
  }
};

window.toggleScheme = function (qid) {
  schemeOpen[qid] = !schemeOpen[qid];
  lsSet("schemeOpen", schemeOpen);
  renderCurrentView();
};

/* hint & walkthrough interactions (persisted so a reload keeps progress).
 * keys may carry a view prefix ("PAPER:<paperId><qid>" / "MOCK:<qid>") — strip it
 * before looking the question up in the bank. */
function qidFromKey(key) {
  if (key.startsWith("MOCK:")) return key.slice(5);
  if (key.startsWith("PAPER:")) {
    for (const p of currentBank.module.papers) {
      if (key.startsWith("PAPER:" + p.id)) return key.slice(("PAPER:" + p.id).length);
    }
  }
  return key;
}
window.revealHint = function (key) {
  const q = currentBank.questions.find(x => x.question_id === qidFromKey(key));
  if (!q) return;
  const hints = (q.hints && (pick(q.hints) || q.hints.en)) || [];
  hintsOpen[key] = Math.min((hintsOpen[key] || 0) + 1, hints.length);
  lsSet("hintsOpen", hintsOpen);
  rerenderAfterHintState();
};
window.toggleWalkthrough = function (qid) {
  walkOpen[qid] = !walkOpen[qid];
  lsSet("walkOpen", walkOpen);
  rerenderAfterHintState();
};

/** after hint/walkthrough state changes, stay inside the open view:
 *  a past-paper view must re-open itself (renderCurrentView would drop it). */
function rerenderAfterHintState() {
  if (openPastPaper) viewPastPaper(openPastPaper);
  else renderCurrentView();
}

/** shared hint + walkthrough blocks for question cards (all views) */
function hintWalkthroughBlocks(q, keyPrefix) {
  const key = keyPrefix ? keyPrefix + q.question_id : q.question_id;
  const hints = (q.hints && (pick(q.hints) || q.hints.en)) || [];
  const shown = hintsOpen[key] || 0;
  const hintBody = hints.slice(0, shown).map(h =>
    `<li class="hint-item">${mdToHtml(pick(h))}</li>`).join("");
  const hintBlock = hints.length ? `
    <div class="hints">
      ${hintBody ? `<ol class="hint-list">${hintBody}</ol>` : ""}
      ${shown < hints.length
        ? `<button class="btn-hint" onclick="revealHint('${esc(key)}')">💡 ${esc(t("reveal-hint"))} (${shown + 1}/${hints.length})</button>`
        : `<div class="hint-done">${esc(t("hints-done"))}</div>`}
    </div>` : "";
  const walkBlock = q.walkthrough && walkOpen[key] ? `
    <div class="walkthrough">
      <div class="ms-title">📖 ${esc(t("walkthrough-title"))}</div>
      <div class="ms-body">${mdToHtml(pick(q.walkthrough))}</div>
    </div>` : "";
  return { hintBlock, walkBlock, any: !!(hints.length || q.walkthrough) };
}

window.setSelfMark = function (qid, level) {
  selfMarks[qid] = level;
  lsSet("selfMarks", selfMarks);
  updateProgress();
  renderCurrentView();
};

/* ---------------- examiner report (考官报告) block ---------------- */
window.toggleExaminerReport = function (qid) {
  exrOpen[qid] = !exrOpen[qid];
  lsSet("exrOpen", exrOpen);
  renderCurrentView();
};

function examinerReportBlock(q) {
  if (!q.examiner_report) return { btn: "", block: "" };
  const on = !!exrOpen[q.question_id];
  const btn = `<button class="btn-secondary" onclick="toggleExaminerReport('${q.question_id}')">${on ? "🗂 " + esc(t("hide-examiner-report")) : "🗂 " + esc(t("show-examiner-report"))}</button>`;
  const block = on ? `
    <div class="examiner-report">
      <div class="ms-title">🗂 ${esc(t("examiner-report-title"))}</div>
      <div class="ms-body">${mdToHtml(pick(q.examiner_report))}</div>
    </div>` : "";
  return { btn, block };
}

/* ---------------- custom question-set PDF (自选题组, after Mortar & Pestle) ---------------- */
/* Original: per-question "Add to PDF" buttons + sessionStorage list + a
 * prompt()-driven print window. Tiechu keeps the workflow but upgrades it:
 * picks persist in localStorage, the print window takes live checkboxes for
 * markschemes / examiner reports / hints instead of a blocking prompt(), and
 * MathJax renders inside the print window before printing. */
window.togglePdfPick = function (qid) {
  pdfPick[qid] = !pdfPick[qid];
  lsSet("pdfPick", pdfPick);
  updatePdfTray();
  const btn = document.querySelector(`#qc-${CSS.escape(qid)} .pdf-pick-btn`);
  if (btn) syncPdfPickBtn(btn, qid);
};
function syncPdfPickBtn(btn, qid) {
  const on = !!pdfPick[qid];
  btn.classList.toggle("pdf-picked", on);
  btn.textContent = on ? `✓ ${t("pdf-added")}` : `📄 ${t("pdf-add")}`;
}
window.addAllVisibleToPdf = function () {
  document.querySelectorAll(".q-card[id^='qc-']").forEach(card => {
    const qid = card.id.slice(3);
    if (!card.classList.contains("hidden")) pdfPick[qid] = true;
  });
  lsSet("pdfPick", pdfPick);
  renderCurrentView();
};
window.clearPdfPicks = function () {
  pdfPick = {};
  lsSet("pdfPick", pdfPick);
  renderCurrentView();
};

/** the floating tray showing current selection + generate/clear actions */
function pdfTrayHtml() {
  const n = Object.values(pdfPick).filter(Boolean).length;
  if (!n) return "";
  return `<div class="pdf-tray no-print" id="pdfTray">
    <span class="pdf-tray-count">${tFmt("pdf-tray-count", { n })}</span>
    <button class="btn-secondary" onclick="clearPdfPicks()">${esc(t("pdf-clear"))}</button>
    <button class="btn-primary" onclick="generatePdf()">${esc(t("pdf-generate"))}</button>
  </div>`;
}
function updatePdfTray() {
  const old = document.getElementById("pdfTray");
  if (old) old.remove();
  if (currentView === "bank" || currentView === "papers") {
    const rc = document.getElementById("right-col");
    rc.insertAdjacentHTML("beforeend", pdfTrayHtml());
  }
}

/** build + open the printable window; checkboxes re-render sections live */
window.generatePdf = function () {
  const qids = Object.keys(pdfPick).filter(k => pdfPick[k]);
  if (!qids.length) return;
  const mod = currentBank.module;
  const qs = qids.map(id => currentBank.questions.find(q => q.question_id === id)).filter(Boolean);
  if (!qs.length) return;

  const totalMarks = qs.reduce((s, q) => s + q.source.marks, 0);
  const head = `
    <div class="pdf-cover">
      <h1>${esc(mod.code)} · ${esc(t("pdf-doc-title"))}</h1>
      <div class="pdf-cover-meta">
        ${esc(pick(mod.name))} · ${esc(mod.university ? pick(mod.university) : "")}<br>
        ${qs.length} ${esc(t("questions"))} · ${totalMarks} ${esc(t("marks"))} · ${new Date().toLocaleDateString()}
      </div>
    </div>`;

  const qHtml = qs.map((q, i) => `
    <section class="pdf-q">
      <h3>${i + 1}. ${esc(pick(q.Question)).replace(/\s+/g, " ").slice(0, 0)}${esc(paperLabel(q))} · ${esc(q.source.question_number)} (${q.source.marks} ${esc(t("marks"))})</h3>
      <div class="pdf-q-body">${mdToHtml(pick(q.Question))}</div>
      ${q.qtype !== "subjective" ? objectivePrintBlock(q) : ""}
    </section>`).join("");

  const msHtml = qs.map((q, i) => `
    <section class="pdf-q">
      <h3>${i + 1}. ${esc(paperLabel(q))} · ${esc(q.source.question_number)}</h3>
      <div class="pdf-q-body">${mdToHtml(pick(q.Markscheme))}</div>
      ${q.examiner_note ? `<div class="pdf-note"><b>${esc(t("examiner-note"))}:</b> ${mdToHtml(pick(q.examiner_note))}</div>` : ""}
    </section>`).join("");

  const exrHtml = qs.map((q, i) => q.examiner_report ? `
    <section class="pdf-q">
      <h3>${i + 1}. ${esc(paperLabel(q))} · ${esc(q.source.question_number)}</h3>
      <div class="pdf-q-body">${mdToHtml(pick(q.examiner_report))}</div>
    </section>` : "").join("");

  const w = window.open("", "_blank");
  if (!w) { alert(t("pdf-popup-blocked")); return; }
  w.document.write(`<!DOCTYPE html><html lang="${LANG}"><head><meta charset="UTF-8">
    <title>${esc(mod.code)} · ${esc(t("pdf-doc-title"))}</title>
    <script>
      window.MathJax = {
        tex: { inlineMath: [["$","$"],["\\\\(","\\\\)"]], displayMath: [["$$","$$"],["\\\\[","\\\\]"]] },
        options: { skipHtmlTags: ["script","noscript","style","textarea","pre","code"] },
        startup: { typeset: false }
      };
      function fmt(){return ${JSON.stringify({ qs: qs.length, marks: totalMarks })};}
      function toggleSec(id, chk){
        var el=document.getElementById(id); el.style.display = chk.checked ? "" : "none";
        var pg=document.getElementById(id+"-pagebreak"); if(pg) pg.style.display = chk.checked ? "" : "none";
      }
      function doPrint(){ setTimeout(function(){ window.print(); }, 600); }
    <\/script>
    <script src="${location.origin}${location.pathname.replace(/app\/.*$/, "")}assets/vendor/mathjax.js"><\/script>
    <style>
      /* CJK font follows the app language: zh-Hant → Noto Sans TC, else SC */
      @font-face { font-family: "Noto Sans CJK SC"; font-weight: 400; src: url("${fontBase()}fonts/NotoSansSC-Regular.otf") format("opentype"); }
      @font-face { font-family: "Noto Sans CJK SC"; font-weight: 700; src: url("${fontBase()}fonts/NotoSansSC-Bold.otf") format("opentype"); }
      @font-face { font-family: "Noto Sans TC"; font-weight: 400; src: url("${fontBase()}fonts/NotoSansTC-Regular.otf") format("opentype"); }
      @font-face { font-family: "Noto Sans TC"; font-weight: 700; src: url("${fontBase()}fonts/NotoSansTC-Bold.otf") format("opentype"); }
      body { font-family: "Noto Sans Latin", ${LANG === "zh-Hant" ? '"Noto Sans TC","Noto Sans CJK TC","Noto Sans CJK SC"' : '"Noto Sans CJK SC","Noto Sans SC","Noto Sans TC"'}, system-ui, sans-serif; margin: 32px auto; max-width: 780px; color: #111; line-height: 1.65; }
      .pdf-cover { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
      .pdf-cover h1 { font-size: 1.5rem; margin: 0 0 6px; }
      .pdf-cover-meta { font-size: .92rem; color: #444; }
      .pdf-ctrl { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ccc; padding: 8px 0; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; z-index: 9; }
      .pdf-ctrl label { font-size: .88rem; }
      .pdf-q { break-inside: avoid; margin-bottom: 14px; }
      .pdf-q h3 { font-size: 1rem; margin: 0 0 4px; }
      .pdf-q-body { font-size: .95rem; }
      .pdf-opts { margin: 4px 0 10px; }
      .pdf-opts .opt { display: block; margin: 2px 0; }
      .pdf-note { background: #f6f8fa; border-left: 3px solid #888; padding: 6px 10px; font-size: .88rem; margin-top: 6px; }
      h2.sec { border-bottom: 1px solid #999; padding-bottom: 4px; margin-top: 26px; }
      .pagebreak { page-break-after: always; }
      @media print { .pdf-ctrl { display: none; } body { margin: 0 auto; } }
    </style></head><body>
    <div class="pdf-ctrl">
      <b>${esc(t("pdf-doc-title"))}</b>
      <label><input type="checkbox" checked onchange="toggleSec('sec-ms', this)"> ${esc(t("pdf-include-ms"))}</label>
      <label><input type="checkbox" ${qs.some(q => q.examiner_report) ? "checked" : ""} onchange="toggleSec('sec-exr', this)"> ${esc(t("pdf-include-exr"))}</label>
      <button onclick="doPrint()" style="padding:4px 14px;">🖨 ${esc(t("pdf-print"))}</button>
    </div>
    ${head}
    <h2 class="sec">${esc(t("pdf-sec-questions"))}</h2>
    ${qHtml}
    <div class="pagebreak" id="sec-ms-pagebreak"></div>
    <h2 class="sec" id="sec-ms-h">${esc(t("pdf-sec-ms"))}</h2>
    <div id="sec-ms">${msHtml}</div>
    <div class="pagebreak" id="sec-exr-pagebreak"></div>
    <h2 class="sec" id="sec-exr-h">${esc(t("pdf-sec-exr"))}</h2>
    <div id="sec-exr">${exrHtml}</div>
  </body></html>`);
  w.document.close();
  // hide the examiner-report section entirely when no question carries one
  if (!qs.some(q => q.examiner_report)) {
    setTimeout(() => {
      ["sec-exr", "sec-exr-h", "sec-exr-pagebreak"].forEach(id => {
        const el = w.document.getElementById(id); if (el) el.style.display = "none";
      });
      const chk = w.document.querySelector('.pdf-ctrl input[type=checkbox]:nth-of-type(1)');
      // keep the checkbox list honest: disable the exr toggle
      const boxes = w.document.querySelectorAll('.pdf-ctrl input[type=checkbox]');
      if (boxes[1]) { boxes[1].disabled = true; }
    }, 0);
  }
  // typeset math in the print window once MathJax is ready
  const tryTypeset = (n) => {
    if (w.MathJax && w.MathJax.typesetPromise) w.MathJax.typesetPromise([w.document.body]).catch(() => { });
    else if (n > 0) setTimeout(() => tryTypeset(n - 1), 300);
  };
  tryTypeset(20);
};

/** objective options in the print window (letters only, no interactivity) */
function objectivePrintBlock(q) {
  const letters = "ABCDEFGH".slice(0, q.options.length).split("");
  const opts = q.options.map((o, i) =>
    `<span class="opt"><b>${optGlyph(letters[i])}.</b> ${mdToHtml(pick(o))}</span>`).join("");
  return `<div class="pdf-opts">${opts}</div>`;
}

/** base URL of assets/ for the print window's @font-face sources */
function fontBase() {
  return location.origin + location.pathname.replace(/app\/.*$/, "") + "assets/";
}

function selfAssessBlock(q) {
  const opts = t("self-assess-opts");
  const cur = selfMarks[q.question_id];
  const btns = opts.map((label, i) =>
    `<button class="chip ${cur === i ? "chip-on" : ""}" onclick="setSelfMark('${q.question_id}', ${i})">${esc(label)}</button>`
  ).join(" ");
  return `<div class="self-assess"><span class="sa-label">${esc(t("self-assess"))}:</span> ${btns}</div>`;
}

function questionCard(q) {
  const open = !!schemeOpen[q.question_id];
  const src = q.source;
  const fmtTags = formatBreadcrumbs(q).map(fb =>
    `<span class="badge badge-format" title="${esc(fb.tag)}">${esc(t("format-x"))} ${fmtGlyph(fb.id)}</span>`).join("");
  const badges = [
    fmtTags,
    `<span class="badge badge-source">${esc(paperLabel(q))} · ${esc(src.question_number)}</span>`,
    `<span class="badge badge-marks">${src.marks} ${esc(t("marks"))}</span>`,
    `<span class="badge badge-stars" title="${esc(t("importance"))}">${stars(q.importance)}</span>`,
  ];
  if (q.is_finale) badges.push(`<span class="badge badge-finale">${esc(t("finale-badge"))}</span>`);
  if (src.kind === "problem-sheet" || src.kind === "unseen-sheet")
    badges.push(`<span class="badge badge-drill">${esc(t("drill-badge"))}</span>`);
  if (src.source_note) badges.push(`<span class="badge badge-note">${esc(pick(src.source_note))}</span>`);
  if (q.examiner_report) badges.push(`<span class="badge badge-exr" title="${esc(t("examiner-report-title"))}">🗂 EXR</span>`);

  const hw = hintWalkthroughBlocks(q);
  const walkBtn = q.walkthrough ? `
      <button class="btn-secondary" onclick="toggleWalkthrough('${q.question_id}')">${walkOpen[q.question_id] ? "🙈 " + esc(t("hide-walkthrough")) : "📖 " + esc(t("show-walkthrough"))}</button>` : "";
  const exr = examinerReportBlock(q);
  const pickCls = pdfPick[q.question_id] ? "pdf-picked" : "";
  const pickTxt = pdfPick[q.question_id] ? `✓ ${t("pdf-added")}` : `📄 ${t("pdf-add")}`;

  const scheme = open ? `
    <div class="markscheme">
      <div class="ms-title">${LANG === "en" ? "Markscheme" : "评分标准 / 解答"}</div>
      <div class="ms-body">${mdToHtml(pick(q.Markscheme))}</div>
      ${q.examiner_note ? `<div class="examiner-note"><b>${esc(t("examiner-note"))}：</b>${mdToHtml(pick(q.examiner_note))}</div>` : ""}
    </div>` : "";

  // v3: no on-screen answer area — work on paper, self-assess against the scheme
  return `<article class="q-card" id="qc-${q.question_id}">
    <header class="q-head">
      <div class="q-id">${q.question_id}</div>
      <div class="q-badges">${badges.join("")}</div>
      <button class="pdf-pick-btn ${pickCls}" onclick="togglePdfPick('${q.question_id}')" title="${esc(t("pdf-add"))}">${pickTxt}</button>
    </header>
    <div class="q-body">${mdToHtml(pick(q.Question))}</div>
    ${q.qtype !== "subjective" ? objectiveBlock(q) : ""}
    ${hw.hintBlock}
    <div class="q-actions">
      <button class="btn-secondary" onclick="toggleScheme('${q.question_id}')">${open ? esc(t("hide-scheme")) : esc(t("show-scheme"))}</button>
      ${walkBtn}
      ${exr.btn}
    </div>
    ${scheme}
    ${exr.block}
    ${hw.walkBlock}
    ${selfAssessBlock(q)}
  </article>`;
}

function renderBankView() {
  renderKindBar();
  renderFilterBar();
  const rc = document.getElementById("right-col");
  if (!currentBank) return;
  if (currentBank.module.meta_only) {
    rc.innerHTML = `<div class="q-card">${esc(t("load-empty"))}</div>`;
    return;
  }
  const pool = bankQuestions();
  const qs = sortQuestions(applyFilters(pool));
  const mid = currentBank.questions.filter(q => ["autumn-midterm", "spring-midterm", "summer", "resit"].includes(q.source.kind)).length;
  const drill = currentBank.questions.length - mid;
  const kindNote = kindFilter === "all" ? "" : ` · ${esc(t("paper-kind"))}: ${esc(kindName(currentBank.module, kindFilter))}`;
  const header = `<div class="bank-stats">${tFmt("bank-stats", { total: pool.length, mid, drill })}${kindNote} · ${esc(t("showing"))} ${qs.length} ${esc(t("questions"))}
    <button class="btn-secondary pdf-addall" onclick="addAllVisibleToPdf()">📄 ${esc(t("pdf-add-all"))}</button></div>`;
  if (!qs.length) {
    rc.innerHTML = header + drillFormatBanner() + `<div class="q-card">${esc(t("no-match"))}</div>`;
    return;
  }
  rc.innerHTML = header + drillFormatBanner() + qs.map(questionCard).join("") + pdfTrayHtml();
  typesetMath(rc);
}

function updateProgress() {
  const total = currentBank ? currentBank.questions.length : 0;
  const done = practisedCount();
  document.getElementById("progressNum").textContent = `${done} / ${total}`;
  const fill = document.getElementById("progressFill");
  fill.style.width = total ? `${Math.round(100 * done / total)}%` : "0%";
}

/* ---------------- view: formats (题型归纳) ---------------- */
window.practiceFormat = function (fmtId) {
  currentView = "bank";
  // jump to the kind this format lives in when it is kind-exclusive
  const f = (currentBank.module.formats || []).find(x => x.id === fmtId);
  if (f && kindsOf(f) && kindsOf(f).length === 1) kindFilter = kindsOf(f)[0];
  filters = { ...filters, format: fmtId, search: "" };
  renderCurrentView();
  const b = document.getElementById("drillBanner");
  if (b) b.scrollIntoView({ behavior: "smooth", block: "start" });
};

function renderFormatsView() {
  renderKindBar();
  document.getElementById("filterBar").classList.add("hidden");
  const rc = document.getElementById("right-col");
  if (!currentBank) return;
  const mod = currentBank.module;
  const fmts = (mod.formats || []).filter(f => itemAppliesTo(f, kindFilter));
  if (!fmts.length) {
    rc.innerHTML = `<div class="q-card">${esc(tFmt("kind-empty", { kind: kindName(mod, kindFilter) }))}</div>`;
    return;
  }
  const cards = fmts.map(f => {
    const count = currentBank.questions.filter(q =>
      (q.format === f.id || q.secondary_format === f.id) &&
      (kindFilter === "all" || questionAppliesToKind(q, kindFilter))).length;
    const drills = (f.drills || []).map(d => `<span class="badge badge-drill">${esc(d)}</span>`).join(" ");
    const years = (f.years || []).map(y => `<span class="badge badge-year">${esc(y)}</span>`).join(" ");
    const ks = kindsOf(f);
    const kindTag = ks
      ? `<span class="badge badge-kind">${ks.map(k => esc(kindName(mod, k))).join(" · ")}</span>`
      : `<span class="badge badge-kind badge-kind-shared">${esc(t("kinds-shared"))}</span>`;
    return `<article class="f-card">
      <header class="f-head">
        <div class="f-id">${fmtGlyph(f.id)}</div>
        <div class="f-name">${esc(pick(f.name))}</div>
        <div class="f-stars" title="${esc(t("likelihood"))}">${stars(f.stars)}</div>
      </header>
      <div class="f-kindrow">${kindTag}</div>
      <dl class="f-meta">
        <div><dt>${esc(t("likelihood"))}</dt><dd>${esc(pick(f.likelihood))}</dd></div>
        <div><dt>${esc(t("typical-slot"))}</dt><dd>${esc(pick(f.slot))}</dd></div>
        <div><dt>${esc(t("years-appeared"))}</dt><dd class="f-years">${years}</dd></div>
        ${drills ? `<div><dt>${esc(t("drills"))}</dt><dd>${drills}</dd></div>` : ""}
      </dl>
      ${f.skeleton ? `<details class="f-skeleton" open>
        <summary>${esc(t("skeleton"))}</summary>
        <div class="skeleton-body">${mdToHtml(pick(f.skeleton))}</div>
      </details>` : ""}
      ${f.pitfalls ? `<details class="f-skeleton f-pitfalls">
        <summary>⚠️ ${esc(t("pitfalls"))}</summary>
        <div class="skeleton-body pitfall-body">${mdToHtml(pick(f.pitfalls))}</div>
      </details>` : ""}
      ${f.secrets ? `<details class="f-skeleton f-secrets">
        <summary>🔑 ${esc(t("secrets"))}</summary>
        <div class="skeleton-body secret-body">${mdToHtml(pick(f.secrets))}</div>
      </details>` : ""}
      <div class="f-actions">
        <button class="btn-secondary" onclick="practiceFormat('${f.id}')">${esc(t("practice-format"))} (${count})</button>
      </div>
    </article>`;
  }).join("");
  rc.innerHTML = `<div class="formats-grid">${cards}</div>`;
  typesetMath(rc);
}

/* ---------------- view: keypoints (高频考点) ---------------- */
function renderKeypointsView() {
  renderKindBar();
  document.getElementById("filterBar").classList.add("hidden");
  const rc = document.getElementById("right-col");
  if (!currentBank) return;
  const mod = currentBank.module;
  const kps = [...(mod.keypoints || [])].filter(kp => itemAppliesTo(kp, kindFilter))
    .sort((a, b) => b.heat - a.heat);
  if (!kps.length) {
    rc.innerHTML = `<div class="q-card">${esc(tFmt("kind-empty", { kind: kindName(mod, kindFilter) }))}</div>`;
    return;
  }
  const cards = kps.map(kp => {
    const years = (kp.years || []).map(y => `<span class="badge badge-year">${esc(y)}</span>`).join(" ");
    const topicName = pick((mod.topics.find(tp => tp.id === kp.topic) || {}).name);
    const ks = kindsOf(kp);
    const kindTag = ks
      ? `<span class="badge badge-kind">${ks.map(k => esc(kindName(mod, k))).join(" · ")}</span>`
      : `<span class="badge badge-kind badge-kind-shared">${esc(t("kinds-shared"))}</span>`;
    return `<article class="kp-card">
      <header class="kp-head">
        <div class="kp-heat" title="${esc(t("kp-heat"))}">${stars(kp.heat)}</div>
        <div class="kp-name">${esc(pick(kp.name))}</div>
        <div class="kp-topic">${esc(topicName)}</div>
      </header>
      <div class="f-kindrow">${kindTag}</div>
      <div class="kp-detail">${mdToHtml(pick(kp.detail))}</div>
      <div class="kp-years"><b>${esc(t("kp-years"))}：</b>${years}</div>
    </article>`;
  }).join("");
  rc.innerHTML = `<div class="kp-grid">${cards}</div>`;
  typesetMath(rc);
}

/* ---------------- view: intel (科目情报) — per paper kind ---------------- */
function renderIntelView() {
  renderKindBar();
  document.getElementById("filterBar").classList.add("hidden");
  const rc = document.getElementById("right-col");
  if (!currentBank) return;
  const mod = currentBank.module;

  const km = kindFilter !== "all" ? (mod.kind_meta || {})[kindFilter] : null;
  if (kindFilter !== "all" && !km) {
    rc.innerHTML = `<div class="q-card">${esc(tFmt("kind-intel-empty", { kind: kindName(mod, kindFilter) }))}</div>`;
    return;
  }

  const kindPapers = mod.papers.filter(p => kindFilter === "all" || p.kind === kindFilter);
  const papersRows = kindPapers.map(p =>
    `<tr><td>${esc(pick(p.name))}</td><td>${p.date ?? "—"}</td><td>${esc((t("source-kinds") || {})[p.kind] || p.kind)}</td><td>${p.total_marks}</td></tr>`
  ).join("");

  const trends = km ? km.trends : mod.trends;
  const trendsRows = (trends && trends.yearly || []).map(y => {
    const rows = y.rows.map(r =>
      `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(fmtGlyph(r[3]))}</td><td>${esc(r[4] && r[4] !== "—" ? fmtGlyph(r[4]) : "—")}</td></tr>`
    ).join("");
    return `<h4 class="trend-year">${y.year}</h4>
      <div class="table-wrap"><table class="intel-table">
        <thead><tr><th>#</th><th>${esc(t("marks"))}</th><th>·</th><th>${esc(t("format"))}</th><th>2nd</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }).join("");

  const share = (trends && trends.chapter_share || []).map(c =>
    `<div class="share-row"><span class="share-label">${esc(pick(c.label))}</span>
      <div class="share-track"><div class="share-fill" style="width:${Math.round(c.share * 100)}%"></div></div>
      <span class="share-num">${Math.round(c.share * 100)}%</span></div>`
  ).join("");

  const lects = ((km ? km.lecturers : mod.lecturers) || []).map(l => `
    <article class="lect-card">
      <h4>${esc(pick(l.name_display) || l.name)}</h4>
      <dl class="f-meta">
        <div><dt>${esc(t("lecturer-role"))}</dt><dd>${esc(pick(l.role))}</dd></div>
        <div><dt>${esc(t("lecturer-research"))}</dt><dd>${esc(pick(l.research))}</dd></div>
        <div><dt>${esc(t("lecturer-habits"))}</dt><dd><ul>${(l.habits || []).map(h => `<li>${mdToHtml(pick(h))}</li>`).join("")}</ul></dd></div>
        <div><dt>${esc(t("lecturer-source"))}</dt><dd>${esc(pick(l.source))}</dd></div>
      </dl>
    </article>`).join("");

  const tpl = km ? km.mock_template : mod.mock_template;
  const orderTpl = tpl ? tpl.slots.map(s =>
    `<span class="badge badge-format">${s.qno} → ${fmtGlyph(s.format)}</span> <span class="tpl-note">${esc(pick(s.note))}</span>`
  ).join("") : "";
  const orderBlurb = km && km.order ? `<div class="order-blurb">${mdToHtml(pick(km.order))}</div>` : "";

  const kindTitle = kindFilter === "all" ? "" : `<div class="intel-kindtag">${esc(t("paper-kind"))}: ${esc(kindName(mod, kindFilter))}</div>`;
  const summaryCard = trends ? `<div class="intel-card"><h3>${esc(t("intel-trends-summary"))}</h3>${mdToHtml(pick(trends.summary))}</div>` : "";

  rc.innerHTML = `
    <div class="intel-grid">
      ${kindTitle}
      <div class="intel-card"><h3>${esc(mod.code)}</h3><p>${esc(pick(mod.name))}</p>
        <dl class="f-meta">
          <div><dt>${esc(t("intel-scope"))}</dt><dd>${mdToHtml(pick(mod.scope))}</dd></div>
          <div><dt>${esc(t("intel-assessment"))}</dt><dd>${esc(pick(mod.assessment))}</dd></div>
        </dl>
      </div>
      ${kindPapers.length ? `<div class="intel-card"><h3>${esc(t("intel-papers"))}</h3>
        <div class="table-wrap"><table class="intel-table">
          <thead><tr><th>·</th><th>·</th><th>·</th><th>·</th></tr></thead>
          <tbody>${papersRows}</tbody>
        </table></div></div>` : ""}
      ${orderTpl ? `<div class="intel-card"><h3>${esc(t("intel-order"))}</h3><div class="order-tpl">${orderTpl}</div>${orderBlurb}</div>` : ""}
      ${share ? `<div class="intel-card"><h3>${esc(t("intel-chapter-share"))}</h3>${share}</div>` : ""}
      ${summaryCard}
      ${trendsRows ? `<div class="intel-card"><h3>${esc(t("intel-trends"))}</h3>${trendsRows}</div>` : ""}
      ${lects ? `<div class="intel-card"><h3>${esc(t("intel-lecturers"))} ${kindFilter === "all" ? "" : `· ${esc(kindName(mod, kindFilter))}`}</h3>${lects}</div>` : ""}
    </div>`;
  typesetMath(rc);
}

/* ---------------- view: papers (试卷中心) ---------------- */
let mockState = null;   // {questions:[...], showScheme:false}

function activeMockTemplate() {
  if (!currentBank) return null;
  const mod = currentBank.module;
  if (kindFilter !== "all") {
    const km = (mod.kind_meta || {})[kindFilter];
    if (km && km.mock_template) return km.mock_template;
  }
  return mod.mock_template || null;
}

function generateMock() {
  if (!currentBank) return;
  const tpl = activeMockTemplate();
  if (!tpl) return;
  const qs = [];
  const used = new Set();
  for (const slot of tpl.slots) {
    // prefer questions from the selected kind; fall back to format matches only
    let pool = currentBank.questions.filter(q =>
      (q.format === slot.format || q.secondary_format === slot.format) &&
      !used.has(q.question_id) &&
      (kindFilter === "all" || q.source.kind === kindFilter));
    if (!pool.length) {
      pool = currentBank.questions.filter(q =>
        (q.format === slot.format || q.secondary_format === slot.format) && !used.has(q.question_id));
    }
    if (!pool.length) continue;
    // prefer least-practised, then random among the top half by importance
    pool.sort((a, b) => (selfMarks[a.question_id] !== undefined ? 1 : 0) - (selfMarks[b.question_id] !== undefined ? 1 : 0) || b.importance - a.importance);
    const pickIdx = Math.floor(Math.random() * Math.max(1, Math.ceil(pool.length / 2)));
    const chosen = pool[pickIdx];
    used.add(chosen.question_id);
    qs.push(chosen);
  }
  mockState = { questions: qs, showScheme: false };
}

window.regenerateMock = function () { generateMock(); renderPapersView(); };
window.toggleMockScheme = function () {
  if (mockState) { mockState.showScheme = !mockState.showScheme; renderPapersView(); }
};
window.printPaper = function () { window.print(); };
let openPastPaper = null;   // paper id while a past-paper view is open
window.viewPastPaper = function (paperId) {
  openPastPaper = paperId;
  const p = currentBank.module.papers.find(x => x.id === paperId);
  const qs = currentBank.questions.filter(q => q.source.paper_id === paperId)
    .sort((a, b) => a.source.question_number.localeCompare(b.source.question_number, undefined, { numeric: true }));
  const header = `<div class="paper-head no-print">
    <button class="btn-primary" onclick="renderCurrentView()">←</button>
    <h3>${esc(pick(p.name))} · ${p.total_marks} ${esc(t("marks"))}</h3>
    <button class="btn-secondary" onclick="printPaper()">${esc(t("mock-print"))}</button>
  </div>`;
  const body = qs.map(q => {
    const hw = hintWalkthroughBlocks(q, "PAPER:" + paperId);
    const wkey = "PAPER:" + paperId + q.question_id;
    return `
    <article class="q-card paper-q">
      <header class="q-head"><div class="q-id">${q.source.question_number} (${q.source.marks} ${esc(t("marks"))})</div>
        <div class="q-badges"><span class="badge badge-format">${esc(t("format-x"))} ${fmtGlyph(q.format)}</span><span class="badge badge-stars">${stars(q.importance)}</span></div></header>
      <div class="q-body">${mdToHtml(pick(q.Question))}</div>
      ${hw.hintBlock}
      ${schemeOpen[wkey] ? `<div class="markscheme"><div class="ms-title">${LANG === "en" ? "Markscheme" : "评分标准 / 解答"}</div><div class="ms-body">${mdToHtml(pick(q.Markscheme))}</div></div>` : ""}
      ${hw.walkBlock}
      <div class="q-actions"><button class="btn-secondary" onclick="togglePaperScheme('${paperId}', '${q.question_id}')">${schemeOpen[wkey] ? esc(t("hide-scheme")) : esc(t("show-scheme"))}</button>
      ${q.walkthrough ? `<button class="btn-secondary" onclick="toggleWalkthrough('${esc(wkey)}')">${walkOpen[wkey] ? "🙈 " + esc(t("hide-walkthrough")) : "📖 " + esc(t("show-walkthrough"))}</button>` : ""}</div>
    </article>`;
  }).join("");
  const rc = document.getElementById("right-col");
  rc.innerHTML = header + body;
  typesetMath(rc);
};
window.togglePaperScheme = function (paperId, qid) {
  const key = "PAPER:" + paperId + qid;
  schemeOpen[key] = !schemeOpen[key];
  lsSet("schemeOpen", schemeOpen);
  viewPastPaper(paperId);
};

function renderPapersView() {
  openPastPaper = null;
  renderKindBar();
  document.getElementById("filterBar").classList.add("hidden");
  const rc = document.getElementById("right-col");
  if (!currentBank) return;
  const mod = currentBank.module;

  const kindPapers = mod.papers.filter(p => kindFilter === "all" || p.kind === kindFilter);
  const pastList = kindPapers.length ? kindPapers.map(p => `
    <div class="paper-row">
      <div><b>${esc(pick(p.name))}</b><span class="text-neutralVariant"> · ${p.date ?? ""} · ${p.total_marks} ${esc(t("marks"))}</span></div>
      <button class="btn-secondary" onclick="viewPastPaper('${p.id}')">${esc(t("paper-questions"))} →</button>
    </div>`).join("") : `<div class="q-card">${esc(tFmt("kind-empty", { kind: kindName(mod, kindFilter) }))}</div>`;

  let mockHtml = "";
  if (mockState && mockState.questions.length) {
    const total = mockState.questions.reduce((s, q) => s + q.source.marks, 0);
    const tpl = activeMockTemplate();
    const dur = tpl ? tpl.duration_min : 60;
    const body = mockState.questions.map(q => {
      const hw = hintWalkthroughBlocks(q, "MOCK:");
      const wkey = "MOCK:" + q.question_id;
      return `
      <article class="q-card paper-q">
        <header class="q-head"><div class="q-id">${q.source.question_number} (${q.source.marks} ${esc(t("marks"))})</div>
          <div class="q-badges"><span class="badge badge-format">${esc(t("format-x"))} ${fmtGlyph(q.format)}</span><span class="badge badge-source">${esc(paperLabel(q))}</span></div></header>
        <div class="q-body">${mdToHtml(pick(q.Question))}</div>
        ${hw.hintBlock}
        ${mockState.showScheme ? `<div class="markscheme"><div class="ms-title">${LANG === "en" ? "Markscheme" : "评分标准 / 解答"}</div><div class="ms-body">${mdToHtml(pick(q.Markscheme))}</div></div>` : ""}
        ${hw.walkBlock}
        ${q.walkthrough ? `<div class="q-actions no-print"><button class="btn-secondary" onclick="toggleWalkthrough('${esc(wkey)}')">${walkOpen[wkey] ? "🙈 " + esc(t("hide-walkthrough")) : "📖 " + esc(t("show-walkthrough"))}</button></div>` : ""}
      </article>`;
    }).join("");
    mockHtml = `
      <div class="mock-paper">
        <div class="mock-head">
          <h3>${esc(t("mock-title"))} · ${esc(mod.code)}${kindFilter === "all" ? "" : " · " + esc(kindName(mod, kindFilter))}</h3>
          <div class="mock-meta">${esc(t("mock-total"))}: ${total} · ${esc(t("mock-duration"))}: ${dur} min</div>
          <div class="mock-actions no-print">
            <button class="btn-secondary" onclick="toggleMockScheme()">${mockState.showScheme ? "🙈" : "👁"} ${esc(t("mock-show-scheme"))}</button>
            <button class="btn-secondary" onclick="printPaper()">🖨 ${esc(t("mock-print"))}</button>
            <button class="btn-primary" onclick="regenerateMock()">🎲 ${esc(t("mock-regenerate"))}</button>
          </div>
        </div>
        ${body}
      </div>`;
  } else {
    mockHtml = `<div class="q-card">${esc(t("mock-empty"))}</div>`;
  }

  const metaOnly = !!mod.meta_only;
  const hasTpl = !!activeMockTemplate();
  rc.innerHTML = `
    <div class="papers-grid">
      <section class="papers-col">
        ${metaOnly || !hasTpl ? "" : `<h3>${esc(t("papers-generate"))}${kindFilter === "all" ? "" : " · " + esc(kindName(mod, kindFilter))}</h3>
        <p class="text-neutralVariant">${esc(t("papers-generate-hint"))}</p>
        <button class="btn-primary" onclick="regenerateMock()">🎲 ${esc(t("papers-generate"))}</button>
        ${mockHtml}`}
      </section>
      <section class="papers-col">
        <h3>${esc(t("papers-past"))}</h3>
        <p class="text-neutralVariant">${esc(t("papers-past-hint"))}</p>
        <div class="past-list">${pastList}</div>
      </section>
    </div>` + pdfTrayHtml();
  typesetMath(rc);
}

/* ---------------- view: notes (基础知识补给站) ---------------- */
function renderNotesView() {
  renderKindBar();
  document.getElementById("filterBar").classList.add("hidden");
  const rc = document.getElementById("right-col");
  if (!currentBank) return;
  const mod = currentBank.module;
  const notes = (mod.notes || []).filter(n => itemAppliesTo(n, kindFilter));
  if (!notes.length) {
    rc.innerHTML = `<div class="q-card">${esc(tFmt("kind-empty", { kind: kindName(mod, kindFilter) }))}</div>`;
    return;
  }
  const cards = notes.map(n => {
    const topicName = pick((mod.topics.find(tp => tp.id === n.topic) || {}).name);
    const ks = kindsOf(n);
    const kindTag = ks
      ? `<span class="badge badge-kind">${ks.map(k => esc(kindName(mod, k))).join(" · ")}</span>`
      : `<span class="badge badge-kind badge-kind-shared">${esc(t("kinds-shared"))}</span>`;
    return `<article class="note-card">
      <header class="note-head">
        <div class="note-title">${esc(pick(n.title))}</div>
        <div class="note-topic">${esc(topicName)} ${kindTag}</div>
      </header>
      <div class="note-body">${mdToHtml(pick(n.body))}</div>
    </article>`;
  }).join("");
  rc.innerHTML = `<div class="notes-grid">${cards}</div>`;
  typesetMath(rc);
}

/* ---------------- view: pomodoro (番茄钟) ---------------- */
const POMO_MODES = { focus: 25, break: 5, long: 15 };
let pomo = {
  mode: "focus", custom: lsGet("pomoCustom", 25),
  remain: 60 * (lsGet("pomoCustom", 25)), running: false,
  sessions: lsGet("pomoSessions", {}), timer: null,
};
function pomoToday() { return new Date().toISOString().slice(0, 10); }
function pomoLength() { return (pomo.mode === "focus" ? pomo.custom : POMO_MODES[pomo.mode]) * 60; }

function pomoTick() {
  if (!pomo.running) return;
  pomo.remain--;
  if (pomo.remain <= 0) {
    if (pomo.mode === "focus") {
      const d = pomoToday();
      pomo.sessions[d] = (pomo.sessions[d] || 0) + 1;
      lsSet("pomoSessions", pomo.sessions);
      pomo.mode = "break"; pomo.remain = pomoLength();
    } else {
      pomo.mode = "focus"; pomo.remain = pomoLength();
    }
  }
  lsSet("pomoRemain", pomo.remain); lsSet("pomoMode", pomo.mode);
  pomoRender();
}
window.pomoToggle = function () {
  pomo.running = !pomo.running;
  if (pomo.running) {
    clearInterval(pomo.timer);
    pomo.timer = setInterval(pomoTick, 1000);
  } else clearInterval(pomo.timer);
  pomoRender();
};
window.pomoReset = function () {
  pomo.running = false; clearInterval(pomo.timer);
  pomo.remain = pomoLength(); pomoRender();
};
window.pomoSetMode = function (mode) {
  pomo.mode = mode; pomo.running = false; clearInterval(pomo.timer);
  pomo.remain = pomoLength(); pomoRender();
};
window.pomoSetCustom = function (val) {
  const n = Math.max(1, Math.min(120, parseInt(val, 10) || 25));
  pomo.custom = n; lsSet("pomoCustom", n);
  if (pomo.mode === "focus") { pomo.running = false; clearInterval(pomo.timer); pomo.remain = n * 60; }
  pomoRender();
};

function pomoClock() {
  const m = Math.floor(pomo.remain / 60), s = pomo.remain % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function pomoRender() {
  const chipTime = document.getElementById("pomoChipTime");
  const chip = document.getElementById("pomoChip");
  if (chipTime) {
    chipTime.textContent = pomoClock();
    chip.classList.toggle("pomo-running", pomo.running);
    chip.classList.toggle("pomo-focus", pomo.mode === "focus");
  }
  if (currentView !== "pomodoro") return;
  const rc = document.getElementById("right-col");
  const today = pomo.sessions[pomoToday()] || 0;
  const pct = pomoLength() ? Math.max(0, Math.min(100, Math.round(100 * (1 - pomo.remain / pomoLength())))) : 0;
  rc.innerHTML = `
    <div class="pomo-view">
      <h3>${esc(t("pomo-title"))}</h3>
      <div class="pomo-modes">
        <button class="chip ${pomo.mode === "focus" ? "chip-on" : ""}" onclick="pomoSetMode('focus')">${esc(t("pomo-focus"))}</button>
        <button class="chip ${pomo.mode === "break" ? "chip-on" : ""}" onclick="pomoSetMode('break')">${esc(t("pomo-break"))} ${POMO_MODES.break}'</button>
        <button class="chip ${pomo.mode === "long" ? "chip-on" : ""}" onclick="pomoSetMode('long')">${esc(t("pomo-long-break"))} ${POMO_MODES.long}'</button>
        <label class="pomo-custom">${esc(t("pomo-custom"))}:
          <input type="number" min="1" max="120" value="${pomo.custom}" onchange="pomoSetCustom(this.value)"> ${esc(t("pomo-focus-min"))}
        </label>
      </div>
      <div class="pomo-clock ${pomo.running ? "running" : ""}">${pomoClock()}</div>
      <div class="pomo-ring" style="--pct:${pct}%"></div>
      <div class="pomo-ctrl">
        <button class="btn-primary" onclick="pomoToggle()">${pomo.running ? esc(t("pomo-pause")) : esc(t("pomo-start"))}</button>
        <button class="btn-secondary" onclick="pomoReset()">${esc(t("pomo-reset"))}</button>
      </div>
      <div class="pomo-stats">${esc(t("pomo-sessions"))}: <b>${today}</b> ${esc(t("pomo-rounds"))}</div>
    </div>`;
}

function renderPomodoroView() {
  document.getElementById("filterBar").classList.add("hidden");
  document.getElementById("kindBar").classList.add("hidden");
  pomoRender();
}

/* ---------------- router & boot ---------------- */
const VIEW_TITLES = {
  bank: "nav-bank", formats: "nav-formats", keypoints: "nav-keypoints",
  intel: "nav-intel", papers: "nav-papers", notes: "nav-notes", pomodoro: "nav-pomodoro",
};
const RENDERERS = {
  bank: renderBankView, formats: renderFormatsView, keypoints: renderKeypointsView,
  intel: renderIntelView, papers: renderPapersView, notes: renderNotesView, pomodoro: renderPomodoroView,
};

function renderCurrentView() {
  if (currentView !== "papers") openPastPaper = null;  // leaving paper view closes the open paper
  document.querySelectorAll(".nav-btn").forEach(b =>
    b.classList.toggle("nav-on", b.dataset.view === currentView));
  document.getElementById("viewTitle").textContent = t(VIEW_TITLES[currentView]);
  (RENDERERS[currentView] || renderBankView)();
  updateProgress();
}

function switchView(view) {
  currentView = view;
  renderCurrentView();
  window.scrollTo({ top: 0 });
}

function applyI18nDOM() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (typeof val === "string") el.textContent = val;
  });
  const steps = document.getElementById("helpSteps");
  if (steps) steps.innerHTML = (t("help-steps") || []).map(s => `<li>${esc(s)}</li>`).join("");
  document.title = t("app-title");
  const creditEl = document.querySelector("#sidebarFooter [data-i18n='about-brand']");
  if (creditEl) creditEl.textContent = tFmt("about-brand", { credit: t("credit") });
}

function switchLang(lang) {
  LANG = lang;
  localStorage.setItem("tiechuLang", lang);
  // v3.2: 繁中界面切换到 Noto Sans TC（简中保持 SC）
  document.documentElement.setAttribute("lang-font", lang === "zh-Hant" ? "tc" : "sc");
  applyI18nDOM();
  const sel = document.getElementById("langSel");
  if (sel) sel.value = lang;
  renderCurrentView();
}

function toggleDarkMode() {
  const body = document.body, head = document.head;
  const btn = document.getElementById("darkmodebtn");
  if ((localStorage.getItem("darkMode") || "disabled") === "disabled") {
    body.classList.add("dark-mode"); head.classList.add("dark-mode");
    localStorage.setItem("darkMode", "enabled"); btn.innerText = "Light Mode";
  } else {
    body.classList.remove("dark-mode"); head.classList.remove("dark-mode");
    localStorage.setItem("darkMode", "disabled"); btn.innerText = "Dark Mode";
  }
}
function toggleHelp() { document.getElementById("helpmenu").classList.toggle("hidden"); }

function bindChrome() {
  document.querySelectorAll(".nav-btn").forEach(b =>
    b.addEventListener("click", () => switchView(b.dataset.view)));
  const sel = document.getElementById("langSel");
  sel.value = LANG;
  sel.addEventListener("change", () => switchLang(sel.value));
  // restore dark mode
  const pref = localStorage.getItem("darkMode");
  const wantsDark = pref === "enabled" || (pref === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (wantsDark) {
    document.body.classList.add("dark-mode"); document.head.classList.add("dark-mode");
    document.getElementById("darkmodebtn").innerText = "Light Mode";
    localStorage.setItem("darkMode", "enabled");
  }
  const texBtn = document.getElementById("texfontbtn");
  if (texBtn) texBtn.addEventListener("click", toggleTexFont);
  document.getElementById("pomoChip").addEventListener("click", () => switchView("pomodoro"));
}

function buildModuleSwitcher() {
  const card = document.getElementById("moduleCard");
  const sel = document.createElement("select");
  sel.id = "moduleSel";
  sel.style.width = "100%";
  sel.setAttribute("aria-label", t("module"));
  sel.innerHTML = QB_REGISTRY.map(m => `<option value="${esc(m.code)}" ${currentBank && currentBank.module.code === m.code.split("/")[0] ? "selected" : ""}>${esc(m.code)}</option>`).join("");
  card.appendChild(sel);
  sel.addEventListener("change", async () => {
    const entry = QB_REGISTRY.find(m => m.code === sel.value);
    filters = { search: "", format: "all", source: "all", year: "all", topic: "all", importance: 0, finaleOnly: false, sort: "default" };
    kindFilter = "all";
    mockState = null;
    pdfPick = {};   // picks are bank-specific; drop them on module switch
    lsSet("pdfPick", pdfPick);
    await loadBank(entry.code, entry.file);
    if (currentBank) {
      const mod = currentBank.module;
      document.getElementById("moduleCode").textContent = mod.code;
      document.getElementById("moduleName").textContent = pick(mod.short_name);
      const mid = currentBank.questions.filter(q => ["autumn-midterm", "spring-midterm", "summer", "resit"].includes(q.source.kind)).length;
      document.getElementById("moduleStats").textContent = mod.meta_only
        ? t("bank-planned")
        : tFmt("bank-stats", { total: currentBank.questions.length, mid, drill: currentBank.questions.length - mid });
    }
    renderCurrentView();
  });
}

async function boot() {
  loadState();
  bindChrome();
  applyI18nDOM();
  // v3.2: restore the per-language CJK font (zh-Hant → Noto Sans TC) on load
  document.documentElement.setAttribute("lang-font", LANG === "zh-Hant" ? "tc" : "sc");
  // restore pomodoro across reloads
  const savedMode = lsGet("pomoMode", null);
  const savedRemain = lsGet("pomoRemain", null);
  if (savedMode && pomo.mode !== savedMode) pomo.mode = savedMode;
  if (typeof savedRemain === "number" && savedRemain > 0) pomo.remain = savedRemain;
  const lastBank = lsGet("lastBank", QB_REGISTRY[0].code);
  const entry = QB_REGISTRY.find(m => m.code === lastBank) || QB_REGISTRY[0];
  await loadBank(entry.code, entry.file);
  if (currentBank) {
    const mod = currentBank.module;
    document.getElementById("moduleCode").textContent = mod.code;
    document.getElementById("moduleName").textContent = pick(mod.short_name);
    const mid = currentBank.questions.filter(q => ["autumn-midterm", "spring-midterm", "summer", "resit"].includes(q.source.kind)).length;
    document.getElementById("moduleStats").textContent =
      tFmt("bank-stats", { total: currentBank.questions.length, mid, drill: currentBank.questions.length - mid });
    if (currentBank.module.meta_only) {
      document.getElementById("moduleStats").textContent = t("bank-planned");
    }
  }
  buildModuleSwitcher();
  renderCurrentView();
  pomoRender();
}

window.addEventListener("DOMContentLoaded", boot);
