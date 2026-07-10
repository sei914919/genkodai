import { useState, useMemo, useRef } from "react";

// ---------- 配色・書体（朱入れシステム：朱＝校正/未充填、藍＝確定した引用） ----------
const C = {
  chrome: "#F5F2EA",
  rail: "#F0EDE3",
  page: "#FDFCF8",
  ink: "#26231E",
  sub: "#7A7468",
  faint: "#A9A395",
  line: "#E4E0D4",
  lineStrong: "#D4CFC0",
  shu: "#B4392A",
  shuBg: "#F9EBE7",
  shuLine: "#E5BDB4",
  ai: "#35567D",
  aiBg: "#EDF2F8",
  aiLine: "#C2D1E2",
  ok: "#4A6B3A",
  okBg: "#EFF3E9",
};

const FONT_UI = "'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN',sans-serif";
const FONT_MS = "'Shippori Mincho','Hiragino Mincho ProN',serif";
const FONT_MONO = "'SF Mono',Menlo,Consolas,monospace";

// ---------- サンプルデータ（v2仕様 §5.3 テンプレート準拠） ----------
const NOTES = {
  file: "notes/self-preferencing.md",
  topics: [
    {
      heading: "自己優遇の定義",
      entries: [
        {
          id: "n1",
          source: "泉水文雄『独占禁止法』123頁",
          key: "@sensui2018",
          quote:
            "「自己優遇とは、プラットフォーム事業者が、自らが供給する商品又は役務を、競争者のそれよりも有利に取り扱う行為をいう。」",
          memo: "Paper2 §2の導入で使える",
        },
        {
          id: "n2",
          source: "United States v. Google, Doc.1436, at 45",
          key: "—",
          quote:
            "\u201cSelf-preferencing occurs when a platform operator favors its own products or services over those of rivals competing on the platform.\u201d",
          memo: "米国の定義アプローチ。判例なのでプレーンテキスト。EUと対比する材料",
        },
      ],
    },
    {
      heading: "自己優遇の競争上の害",
      entries: [
        {
          id: "n3",
          source: "泉水文雄『独占禁止法』88頁",
          key: "@sensui2018",
          quote:
            "「垂直統合されたプラットフォームによる自己優遇は、隣接市場における競争者の費用を引き上げ、市場閉鎖効果を生じさせうる。」",
          memo: "反競争効果の類型化がここ",
        },
      ],
    },
  ],
};

const REFS = [
  {
    key: "wakui2018",
    type: "book",
    author: "Wakui, Masako",
    title: "Antimonopoly Law: Competition Law and Policy in Japan",
    pub: "Edward Elgar",
    year: 2018,
    csl: true,
  },
  {
    key: "sensui2018",
    type: "book",
    author: "泉水文雄",
    title: "独占禁止法",
    pub: "有斐閣",
    year: 2018,
    csl: false,
  },
  {
    key: "ezrachi2016",
    type: "book",
    author: "Ezrachi, Ariel and Stucke, Maurice E.",
    title: "Virtual Competition",
    pub: "Harvard University Press",
    year: 2016,
    csl: true,
  },
];

// 本文：seg = 文字列 / {m:マーカーid} / {fn:既存脚注番号}
const DOC = [
  { id: "s1", type: "h2", num: "Ⅰ", text: "はじめに" },
  {
    id: "p1",
    type: "p",
    segs: [
      "デジタル・プラットフォームによる自己優遇は、日米欧の競争当局が共通して直面する規制課題である。本稿は、排除型私的独占の規範的評価という観点から、自己優遇規制の分析枠組みを検討する",
      { fn: 1 },
      "。",
    ],
  },
  { id: "s2", type: "h2", num: "Ⅱ", text: "自己優遇の意義" },
  {
    id: "p2",
    type: "p",
    segs: [
      "まず概念の外延を確定する必要がある。本稿は、自己優遇を垂直統合型プラットフォームに固有の行為類型として捉える立場をとる",
      { m: "m1" },
      "。この定義は、探索バイアスの操作からランキングの劣後化まで、多様な行為態様を包摂する点に特徴がある。",
    ],
  },
  {
    id: "p3",
    type: "p",
    segs: [
      "もっとも、定義の広狭は規制の射程に直結する。EUデジタル市場法6条5項が採用した形式的アプローチと、効果分析を前提とする日本法の構造との差異は、この点に現れる",
      { fn: 2 },
      "。",
    ],
  },
  { id: "s3", type: "h2", num: "Ⅲ", text: "競争上の害の類型" },
  {
    id: "p4",
    type: "p",
    segs: [
      "自己優遇が競争制限効果をもたらす典型的な経路は、隣接市場における競争者の費用引上げと市場閉鎖である",
      { m: "m3" },
      "。他方で、プラットフォームの品質改善と観念的に区別し難い場合も多く、当然違法型の規制には理論的困難が伴う。",
    ],
  },
  {
    id: "p5",
    type: "p",
    segs: [
      "この評価は、間接ネットワーク効果の作用する多面市場においていっそう複雑になる",
      { m: "m2" },
      "。市場の一方の面における優遇が他方の面の厚生を高める場合、総体としての競争上の害の認定は容易でない。",
    ],
  },
  { id: "s4", type: "h2", num: "Ⅳ", text: "米国判決の示唆" },
  {
    id: "p6",
    type: "p",
    segs: [
      "United States v. Google の排除措置命令は、行為の是正可能性（remediability）が救済設計を規定するという本稿の視座に重要な素材を提供する",
      { fn: 3 },
      "。詳細は次章で扱う。",
    ],
  },
];

const INITIAL_MARKERS = {
  m1: { topic: "自己優遇の定義", status: "open" },
  m2: { topic: "間接ネットワーク効果", status: "open" },
  m3: { topic: "自己優遇の競争上の害", status: "open" },
};

const INITIAL_FOOTNOTES = [
  "自己優遇規制の国際動向につき、Ezrachi & Stucke, Virtual Competition (2016) ch.6 参照。",
  "Digital Markets Act, Art. 6(5). 日本法の構造については別稿を予定。",
  "United States v. Google, Doc.1436 (D.D.C.) の救済命令部分。",
];

// ---------- 部品 ----------
function KeyChip({ k }) {
  const none = k === "—";
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        padding: "1px 7px",
        borderRadius: 4,
        background: none ? "#EDEAE0" : C.aiBg,
        color: none ? C.sub : C.ai,
        border: `1px solid ${none ? C.line : C.aiLine}`,
        whiteSpace: "nowrap",
      }}
    >
      {none ? "key: —" : `key: ${k}`}
    </span>
  );
}

function PanelTab({ label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "9px 0",
        background: "none",
        border: "none",
        borderBottom: active ? `2px solid ${C.ink}` : `2px solid transparent`,
        color: active ? C.ink : C.sub,
        fontFamily: FONT_UI,
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        letterSpacing: "0.06em",
        cursor: "pointer",
      }}
    >
      {label}
      {badge > 0 && (
        <span
          style={{
            marginLeft: 5,
            fontSize: 10.5,
            color: C.shu,
            fontWeight: 700,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ---------- 本体 ----------
export default function WritingStudio() {
  const [markers, setMarkers] = useState(INITIAL_MARKERS);
  const [footnotes, setFootnotes] = useState(INITIAL_FOOTNOTES);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("notes");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const centerRef = useRef(null);

  const openCount = Object.values(markers).filter((m) => m.status === "open").length;

  const charCount = useMemo(() => {
    let n = 0;
    for (const b of DOC) {
      if (b.type === "p") for (const s of b.segs) if (typeof s === "string") n += s.length;
      else n += (b.text || "").length;
    }
    return n;
  }, []);

  const showToast = (msg, tone = "ink") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, tone });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  const jumpTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const selectMarker = (id) => {
    setSelected(id);
    setTab("notes");
    jumpTo(`marker-${id}`);
  };

  const fillMarker = (markerId, entry) => {
    const num = footnotes.length + 1;
    const topic = markers[markerId].topic;
    setFootnotes((f) => [...f, `${topic}につき、${entry.source}。`]);
    setMarkers((m) => ({
      ...m,
      [markerId]: { ...m[markerId], status: "filled", fn: num },
    }));
    setSelected(null);
    showToast(
      `脚注 ${num} を挿入しました — 逐語引用は原典と最終照合してください（NFR4）`,
      "ok"
    );
  };

  const runLint = () => {
    if (openCount > 0) {
      showToast(`レンダー中止：要出典が ${openCount} 件残っています（FR6）`, "shu");
    } else {
      showToast("要出典 0 件 — Quarto レンダーを開始します（モック）", "ok");
    }
  };

  const runIntegrity = () => {
    showToast("整合性チェック：notes/ 内 @キー 2 件 → refs.bib と一致、孤児 0 件（FR5）", "ok");
  };

  const matchedTopics = useMemo(() => {
    if (selected) {
      const t = markers[selected].topic;
      return NOTES.topics.filter((tp) => tp.heading === t);
    }
    const q = query.trim();
    if (!q) return NOTES.topics;
    return NOTES.topics
      .map((tp) => ({
        ...tp,
        entries: tp.entries.filter(
          (e) =>
            tp.heading.includes(q) || e.source.includes(q) || e.quote.includes(q) || e.memo.includes(q)
        ),
      }))
      .filter((tp) => tp.heading.includes(q) || tp.entries.length > 0);
  }, [selected, query, markers]);

  const noMatch = selected && matchedTopics.length === 0;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: C.chrome,
        color: C.ink,
        fontFamily: FONT_UI,
        minWidth: 960,
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible { outline: 2px solid ${C.ai}; outline-offset: 2px; }
        ::selection { background: ${C.aiBg}; }
        .entry-card { transition: border-color .15s; }
        .toc-item:hover, .marker-item:hover { background: rgba(0,0,0,0.045); }
        .fill-btn:hover { background: #A33325; }
        .fill-btn { transition: background .15s; }
        @keyframes toastIn { from { transform: translate(-50%, 12px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; animation: none !important; } }
      `}</style>

      {/* ===== トップバー ===== */}
      <div
        style={{
          height: 46,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: `1px solid ${C.lineStrong}`,
          background: C.chrome,
          gap: 14,
        }}
      >
        <div style={{ fontFamily: FONT_MS, fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>
          原稿台<span style={{ fontSize: 10.5, fontWeight: 400, color: C.faint, marginLeft: 7, fontFamily: FONT_UI }}>GENKŌDAI — layout mockup</span>
        </div>
        <div style={{ fontSize: 12, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: FONT_MONO }}>paper.qmd</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.ok, display: "inline-block" }} title="committed" />
          <span style={{ fontSize: 11, color: C.faint }}>main · committed</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.sub }}>{charCount.toLocaleString()} 字</span>
        <span
          style={{
            fontSize: 12,
            color: openCount ? C.shu : C.ok,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 4,
            background: openCount ? C.shuBg : C.okBg,
          }}
        >
          要出典 {openCount}
        </span>
        <button
          onClick={runIntegrity}
          style={{
            fontSize: 12, fontFamily: FONT_UI, padding: "5px 12px", borderRadius: 5,
            border: `1px solid ${C.lineStrong}`, background: C.page, color: C.ink, cursor: "pointer",
          }}
        >
          整合チェック
        </button>
        <button
          onClick={runLint}
          style={{
            fontSize: 12, fontFamily: FONT_UI, fontWeight: 700, padding: "5px 14px", borderRadius: 5,
            border: `1px solid ${C.ink}`, background: C.ink, color: C.page, cursor: "pointer",
          }}
        >
          レンダー
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ===== 左レール：目次＋要出典 ===== */}
        <div
          style={{
            width: 218,
            flexShrink: 0,
            borderRight: `1px solid ${C.lineStrong}`,
            background: C.rail,
            overflowY: "auto",
            padding: "14px 0",
          }}
        >
          <div style={{ padding: "0 16px 8px", fontSize: 11, letterSpacing: "0.14em", color: C.faint, fontWeight: 700 }}>
            目次
          </div>
          {DOC.filter((b) => b.type === "h2").map((h) => (
            <div
              key={h.id}
              className="toc-item"
              onClick={() => jumpTo(h.id)}
              style={{ padding: "6px 16px", fontSize: 13, cursor: "pointer", fontFamily: FONT_MS, display: "flex", gap: 8 }}
            >
              <span style={{ color: C.faint, width: 16, flexShrink: 0 }}>{h.num}</span>
              <span>{h.text}</span>
            </div>
          ))}

          <div style={{ margin: "14px 16px 8px", borderTop: `1px solid ${C.lineStrong}`, paddingTop: 12, fontSize: 11, letterSpacing: "0.14em", color: C.shu, fontWeight: 700 }}>
            朱 — 要出典
          </div>
          {Object.entries(markers).map(([id, m]) => (
            <div
              key={id}
              className="marker-item"
              onClick={() => (m.status === "open" ? selectMarker(id) : jumpTo(`marker-${id}`))}
              style={{
                padding: "6px 16px",
                fontSize: 12.5,
                cursor: "pointer",
                display: "flex",
                gap: 7,
                alignItems: "baseline",
                color: m.status === "filled" ? C.faint : C.ink,
                background: selected === id ? C.shuBg : "transparent",
              }}
            >
              <span style={{ color: m.status === "filled" ? C.ok : C.shu, fontSize: 11, flexShrink: 0, width: 12 }}>
                {m.status === "filled" ? "✓" : "●"}
              </span>
              <span style={{ textDecoration: m.status === "filled" ? "line-through" : "none" }}>{m.topic}</span>
            </div>
          ))}

          <div style={{ margin: "14px 16px 0", borderTop: `1px solid ${C.lineStrong}`, paddingTop: 12, fontSize: 11, color: C.faint, lineHeight: 1.7 }}>
            マーカーを選ぶと右の資料ペインが該当トピックに絞り込まれます
          </div>
        </div>

        {/* ===== 中央：原稿 ===== */}
        <div ref={centerRef} style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <div
            style={{
              maxWidth: 660,
              margin: "28px auto 80px",
              background: C.page,
              border: `1px solid ${C.line}`,
              borderRadius: 3,
              padding: "56px 64px 64px",
              boxShadow: "0 1px 3px rgba(60,50,30,0.06)",
              fontFamily: FONT_MS,
            }}
          >
            <div style={{ fontSize: 11.5, color: C.faint, fontFamily: FONT_UI, letterSpacing: "0.1em", marginBottom: 18 }}>
              公正取引 投稿予定稿 — DRAFT
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.6, margin: "0 0 6px", letterSpacing: "0.01em" }}>
              自己優遇規制の分析枠組み
            </h1>
            <div style={{ fontSize: 13.5, color: C.sub, marginBottom: 36 }}>
              ――排除型私的独占の規範的評価の観点から
            </div>

            {DOC.map((b) => {
              if (b.type === "h2")
                return (
                  <h2
                    key={b.id}
                    id={b.id}
                    style={{ fontSize: 16.5, fontWeight: 700, margin: "34px 0 12px", letterSpacing: "0.02em" }}
                  >
                    <span style={{ color: C.faint, marginRight: 10 }}>{b.num}</span>
                    {b.text}
                  </h2>
                );
              return (
                <p key={b.id} style={{ fontSize: 15, lineHeight: 2.05, margin: "0 0 16px", textAlign: "justify" }}>
                  {b.segs.map((s, i) => {
                    if (typeof s === "string") return <span key={i}>{s}</span>;
                    if (s.fn !== undefined)
                      return (
                        <sup key={i} style={{ color: C.ai, fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, cursor: "pointer" }} onClick={() => setTab("fn")}>
                          {s.fn}
                        </sup>
                      );
                    const m = markers[s.m];
                    if (m.status === "filled")
                      return (
                        <sup key={i} id={`marker-${s.m}`} style={{ color: C.ai, fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, cursor: "pointer" }} onClick={() => setTab("fn")}>
                          {m.fn}
                        </sup>
                      );
                    return (
                      <span
                        key={i}
                        id={`marker-${s.m}`}
                        onClick={() => selectMarker(s.m)}
                        style={{
                          fontFamily: FONT_UI,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: C.shu,
                          background: C.shuBg,
                          border: `1px ${selected === s.m ? "solid" : "dashed"} ${selected === s.m ? C.shu : C.shuLine}`,
                          borderRadius: 4,
                          padding: "1px 7px",
                          margin: "0 2px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          verticalAlign: "0.15em",
                        }}
                        title="クリックで資料ペインを照合"
                      >
                        要出典: {m.topic}
                      </span>
                    );
                  })}
                </p>
              );
            })}

            <div style={{ marginTop: 44, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: C.faint, fontFamily: FONT_UI, letterSpacing: "0.12em", marginBottom: 10 }}>
                脚注
              </div>
              {footnotes.map((f, i) => (
                <div key={i} style={{ fontSize: 12.5, lineHeight: 1.9, color: C.sub, display: "flex", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: C.ai, fontFamily: FONT_UI, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== 右パネル ===== */}
        <div
          style={{
            width: 340,
            flexShrink: 0,
            borderLeft: `1px solid ${C.lineStrong}`,
            background: C.rail,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", borderBottom: `1px solid ${C.lineStrong}`, flexShrink: 0 }}>
            <PanelTab label="資料 notes/" active={tab === "notes"} onClick={() => setTab("notes")} badge={selected ? 1 : 0} />
            <PanelTab label="文献 refs.bib" active={tab === "refs"} onClick={() => setTab("refs")} />
            <PanelTab label={`脚注 ${footnotes.length}`} active={tab === "fn"} onClick={() => setTab("fn")} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            {/* --- 資料タブ --- */}
            {tab === "notes" && (
              <>
                {selected ? (
                  <div
                    style={{
                      marginBottom: 12, padding: "8px 12px", borderRadius: 5,
                      background: C.shuBg, border: `1px solid ${C.shuLine}`,
                      fontSize: 12, display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    <span style={{ color: C.shu, fontWeight: 700 }}>照合中:</span>
                    <span style={{ fontWeight: 700 }}>{markers[selected].topic}</span>
                    <button
                      onClick={() => setSelected(null)}
                      style={{ marginLeft: "auto", border: "none", background: "none", color: C.sub, cursor: "pointer", fontSize: 12 }}
                    >
                      解除
                    </button>
                  </div>
                ) : (
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="トピック・出典・引用文を検索"
                    style={{
                      width: "100%", padding: "7px 11px", marginBottom: 12, borderRadius: 5,
                      border: `1px solid ${C.lineStrong}`, background: C.page,
                      fontSize: 12.5, fontFamily: FONT_UI, color: C.ink,
                    }}
                  />
                )}

                <div style={{ fontSize: 11, color: C.faint, fontFamily: FONT_MONO, marginBottom: 10 }}>
                  {NOTES.file}
                </div>

                {noMatch && (
                  <div
                    style={{
                      border: `1px solid ${C.shuLine}`, borderLeft: `3px solid ${C.shu}`,
                      background: C.page, borderRadius: 5, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.8,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: C.shu, marginBottom: 4 }}>該当なし</div>
                    「{markers[selected].topic}」に一致するエントリは notes/ にありません。
                    出典を勝手に補いません（NFR2）。原典を読んでメモを追加してから再照合してください。
                    <div style={{ marginTop: 10 }}>
                      <button
                        onClick={() => setSelected(null)}
                        style={{
                          fontSize: 12, padding: "5px 12px", borderRadius: 5, cursor: "pointer",
                          border: `1px solid ${C.lineStrong}`, background: C.page, fontFamily: FONT_UI,
                        }}
                      >
                        マーカーを保留のまま残す
                      </button>
                    </div>
                  </div>
                )}

                {matchedTopics.map((tp) => (
                  <div key={tp.heading} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_MS, marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.line}` }}>
                      {tp.heading}
                    </div>
                    {tp.entries.map((e) => (
                      <div
                        key={e.id}
                        className="entry-card"
                        style={{
                          background: C.page, border: `1px solid ${C.line}`, borderRadius: 6,
                          padding: "11px 13px", marginBottom: 9,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 7 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: FONT_MS, flex: 1, lineHeight: 1.6 }}>
                            {e.source}
                          </span>
                          <KeyChip k={e.key} />
                        </div>
                        <div
                          style={{
                            fontSize: 12, lineHeight: 1.9, fontFamily: FONT_MS, color: C.ink,
                            borderLeft: `2px solid ${C.aiLine}`, paddingLeft: 10, marginBottom: 7,
                          }}
                        >
                          {e.quote}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.6 }}>メモ: {e.memo}</div>
                        {selected && markers[selected].topic === tp.heading && (
                          <button
                            className="fill-btn"
                            onClick={() => fillMarker(selected, e)}
                            style={{
                              marginTop: 9, width: "100%", padding: "7px 0", borderRadius: 5,
                              border: "none", background: C.shu, color: "#fff",
                              fontSize: 12.5, fontWeight: 700, fontFamily: FONT_UI, cursor: "pointer",
                            }}
                          >
                            この出典で脚注を埋める
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* --- 文献タブ --- */}
            {tab === "refs" && (
              <>
                {REFS.map((r) => (
                  <div
                    key={r.key}
                    style={{
                      background: C.page, border: `1px solid ${C.line}`, borderRadius: 6,
                      padding: "10px 13px", marginBottom: 9,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.ai, fontWeight: 700 }}>@{r.key}</span>
                      <span
                        style={{
                          fontSize: 10.5, padding: "1px 7px", borderRadius: 4,
                          background: r.csl ? C.aiBg : "#EDEAE0",
                          color: r.csl ? C.ai : C.sub,
                        }}
                      >
                        {r.csl ? "CSL整形" : "プレーンテキスト"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontFamily: FONT_MS, lineHeight: 1.7 }}>
                      {r.author}『{r.title}』
                    </div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>
                      {r.pub}, {r.year}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.8, marginTop: 4 }}>
                  台帳方式：キーを持つ全文献を記帳。CSL自動整形の対象は欧米二次文献のみ（v2仕様＋レビュー修正）。
                </div>
              </>
            )}

            {/* --- 脚注タブ --- */}
            {tab === "fn" && (
              <>
                {footnotes.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      background: C.page, border: `1px solid ${C.line}`, borderRadius: 6,
                      padding: "9px 13px", marginBottom: 8, fontSize: 12.5, lineHeight: 1.8,
                      display: "flex", gap: 9,
                    }}
                  >
                    <span style={{ color: C.ai, fontFamily: FONT_UI, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontFamily: FONT_MS }}>{f}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.8 }}>
                  穴埋めで挿入された脚注はここに追加されます。逐語引用の最終照合は人間（NFR4）。
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== トースト ===== */}
      {toast && (
        <div
          style={{
            position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)",
            background: toast.tone === "shu" ? C.shu : toast.tone === "ok" ? "#3B5530" : C.ink,
            color: "#FDFCF8", fontSize: 13, fontFamily: FONT_UI,
            padding: "10px 20px", borderRadius: 7, maxWidth: 560,
            animation: "toastIn .18s ease-out", boxShadow: "0 4px 14px rgba(40,30,10,0.25)",
            zIndex: 50,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
