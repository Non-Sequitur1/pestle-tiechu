---
name: qb-import
description: 为铁杵（Tiechu）题库导入新模块、新试卷类型、新题目、题型归纳、高频考点、易错点、解题秘笈与讲师画像。当需要把某门大学课程的历年真题 / 习题集整理成 assets/jsonqb/<模块码>.json（tiechu-qb-v3 分试卷类型架构）时使用本技能。
---

# 铁杵题库导入技能（qb-import）

本技能指导开发者或 AI 智能体把一门大学课程的考试材料（真题、习题集、应试指南）
转换成铁杵题库格式 `tiechu-qb-v3`，放入 `assets/jsonqb/<模块码>.json`，并在前端注册。

## 0. 前置阅读

1. `docs/SCHEMA.md` —— 完整字段规范（本技能的权威依据，冲突时以它为准）。
2. `tools/validate_qb.py` —— 校验器（导入后必须跑通）。
3. 参考成品：`assets/jsonqb/MATH50013.json`（41 题，含全部字段类型示例）。

## 1. 材料调研清单（先做，避免返工）

对目标模块逐项确认，全部标注来源（【事实】原卷/习题集/讲义；【网络】检索；
【推断】你的判断——三类信息必须可区分，禁止编造）：

| 信息 | 用途 | 优先来源 |
| --- | --- | --- |
| 模块码、名称、考核方式 | `module` 元数据 | 官网/讲义 |
| **涉及哪些试卷类型**（秋季期中/春季期中/夏季大考/重考/习题集） | `module.paper_kinds` | 官网/讲义 |
| 历年试卷（≥3 年为宜）：日期、总分、题号分值 | `module.papers` + 每题 `source.marks` | 原卷 |
| 每题原文 + 官方评分标准/答案 | `Question` / `Markscheme`（en） | 原卷 |
| **每个试卷类型各自的**出题规律：题型、题位、分值模板 | `kind_meta.<kind>.trends / order / mock_template` | 逐年归纳 |
| 题型被考概率（星级 1–5）**按卷型分别评级** | `formats[].stars`（+`kinds` 归属） | 频次+判断 |
| 解题模板（步骤骨架） | `formats[].skeleton` | 指南/自写 |
| **题型易错点**（判卷视角的典型失误） | `formats[].pitfalls` | 评分标准/指南 |
| **解题秘笈**（一句话可复用的核心打法） | `formats[].secrets` | 指南/自写 |
| 高频考点（精确表述 + 考过位置）**按卷型归属** | `module.keypoints`（+`kinds`） | 指南/真题 |
| 讲师画像（研究方向、出题习惯）**按卷型分开** | `kind_meta.<kind>.lecturers`（附来源标注） | 官网/指南 |
| **课堂笔记/基础知识复习笔记** | `module.notes`（+`kinds`） | 讲义/自写 |

## 1.1 分试卷类型（paper kind）核心概念 —— 先想清楚再写

**分试卷 = 按试卷类型（秋季期中、春季期中、夏季大考、重考……），不是按具体某一份卷。**

- 题型归纳、高频考点、命题趋势、讲师画像、组卷模板、基础知识补给站**全部按卷型分开维护**；
- **题型可跨卷型共用**：`formats[].kinds` 缺省或 `[]` = 全卷型共用（如“σ-代数默写”春季秋季都考）；
- **题型也可专属某卷型**：如“某长篇建模格式”只在秋季期中的历史上出现 → `kinds: ["autumn-midterm"]`；
- 同一题型要同时服务两个卷型：`kinds: ["autumn-midterm", "summer"]`——星级/模板仍只有一份，
  但两个卷型的组卷模板都可引用它；
- **当前已有数据只覆盖秋季期中**；其余卷型（春季期中/夏季大考/重考/习题集）已在
  `paper_kinds` 注册但置灰等待导入——未来导入时**只需在 `kind_meta` 加一段、
  formats/keypoints 的 `kinds` 数组加一项**，前端自动出现，无需改代码；
- 题目的卷型归属由 `source.kind` 决定（题目不挂 `kinds` 字段）。

## 2. 题库文件骨架

```jsonc
{
  "schema": "tiechu-qb-v3",
  "module": {
    "code": "<模块码>",            // 文件名 = code + ".json"
    "name": L("English name", "中文名"),
    "short_name": L(...), "university": L(...), "term": L(...),
    "scope": L("考试范围", "…"),   // 讲师/官网口径
    "assessment": L("期中x% + 期末y%", "…"),
    "papers": [ {"id":"MT2025","name":L(...),"date":"2025-11-11","kind":"autumn-midterm","total_marks":50} ],

    // ===== v3：卷型注册表（所有用到的 kind 必须在此声明）=====
    "paper_kinds": [
      {"id":"autumn-midterm","name":L("Autumn Midterm","秋季期中试卷")},
      {"id":"spring-midterm","name":L("Spring Midterm","春季期中试卷")},
      {"id":"summer","name":L("Summer Exam","夏季大考")},
      {"id":"resit","name":L("Resit","重考卷")},
      {"id":"problem-sheet","name":L("Problem Sheets","习题集")},
      {"id":"unseen-sheet","name":L("Unseen Sheets","Unseen 习题集")}
    ],

    // ===== v3：按卷型独立的情报块（新卷型导入时在此加一段）=====
    "kind_meta": {
      "autumn-midterm": {
        "trends": { "summary": L(...),
                    "yearly":[{"year":2025,"rows":[["Q1","8","σ-代数…","B","—"]]}],
                    "chapter_share":[{"label":L(...),"share":0.29}] },
        "order": L("出题顺序说明（Markdown+TeX）", "…"),        // 该卷型的固定开局/压轴结构
        "mock_template": { "slots":[{"qno":"Q1","format":"B","note":L(...)}], "duration_min":60, "source":L(...) },
        "lecturers": [ {"name":"...","name_display":L(...),"role":L(...),"research":L(...),"habits":[L(...)],"source":L(...)} ]
      }
      // "spring-midterm": { … }  ← 未来新增卷型时加这里
    },

    "lecturers": [ … ],   // v2 兼容：模块级讲师（v3 优先读 kind_meta[].lecturers）
    "topics": [ {"id":"foundations","name":L(...)} ],
    "keypoints": [ {"id":"KP-...","topic":"foundations","heat":5,"name":L(...),
                    "detail":L("Markdown+TeX","…"),"years":["2025 Q1"],
                    "kinds":["autumn-midterm"]} ],              // 缺省 = 全卷型共用
    "formats": [ {"id":"A","name":L(...),"stars":5,"likelihood":L(...),"slot":L(...),
                  "years":[...],"drills":[...],"skeleton":L(...),
                  "kinds":["autumn-midterm"],                   // 缺省 = 全卷型共用
                  "pitfalls":L("**典型失误1.** …","…"),          // v3 易错点（Markdown+TeX）
                  "secrets":L("**秘笈：核心打法名.** 三步…","…")} ], // v3 解题秘笈
    "mock_template": { … },   // v2 兼容：模块级模板
    "trends": { … },          // v2 兼容：模块级趋势

    // ===== v3：基础知识补给站（课堂笔记/复习笔记）=====
    "notes": [ {"id":"NOTE-<slug>","topic":"foundations",
                "title":L("…（课堂笔记）","…（課堂筆記）"),
                "body":L("**Definition.** $…$","**定义。** $…$"),
                "kinds":["autumn-midterm"]} ],                 // 缺省 = 全卷型共用

    // ===== v3：刷题型横幅（按题型筛选刷题时置顶显示）=====
    "drill_banner": { "default": L("通用刷题提示…","…"), "A": L("压轴题型提示…","…") }
  },
  "questions": [ /* 见下 */ ]
}
```

其中 `L(en, zhHans)` 是语言对象快捷记号，实际 JSON 必须展开为
`{"en": "...", "zh-Hans": "...", "zh-Hant": "..."}`（三语齐全，校验器强制）。

## 3. 题目记录

主观题（长答案）：

```jsonc
{
  "Question":     { "en": "Prove that …", "zh-Hans": "证明…", "zh-Hant": "證明…" },
  "Markscheme":   { "en": "**(a)** …", "zh-Hans": "…", "zh-Hant": "…" },
  "examiner_note": { "en": "trap note…", "zh-Hans": "…", "zh-Hant": "…" },  // 可选但强烈建议
  "question_id": "MATH50013.MT2025.Q1",     // <模块>.<卷>.<题号>，全局唯一
  "module": "MATH50013",
  "qtype": "subjective",
  "format": "B", "secondary_format": null,
  "topics": ["foundations"], "subtopics": [],
  "source": { "paper_id": "MT2025", "paper_name": {…}, "kind": "autumn-midterm",
              "year": 2025, "question_number": "Q1", "marks": 8, "source_note": null },
  "importance": 5,          // 1–5 星被考概率
  "is_finale": false,        // 压轴大题 true
  "tags": ["Bookwork"],

  // ---- v2.1 可选：渐进式提示 + 解题示范（按需添加，非每题必写；已添加的予以保留）----
  "hints": {                 // 1–5 条：第1条=审题方向(无公式)，第2条=关键一步，最后可给易错点
    "en": ["Identify which theorem applies…", "The pivotal move is to …"],
    "zh-Hans": ["先判断该用哪条定理……", "关键一步是……"],
    "zh-Hant": ["先判斷該用哪條定理……", "關鍵一步是……"]   // 三语条数必须一致
  },
  "walkthrough": {           // 完整解题示范：审题 → 思路 → 示范 → 点评 四段式
    "en": "**Read.** …\n\n**Plan.** …\n\n**Solution.** …",
    "zh-Hans": "**审题.** ……\n\n**思路.** ……\n\n**示范.** ……",
    "zh-Hant": "**審題.** ……"
  }
}
```

**hints / walkthrough 分工**：`Markscheme` 面向对答案（按得分点写）；`hints` 是分层脚手架
（逐条揭示、不剧透结论）；`walkthrough` 面向学习（把“为什么这么走”讲清楚）。三者互补。

客观题（单选 `qtype:"single"`，多选 `qtype:"multi"`）：

```jsonc
{
  …同上…,
  "qtype": "multi",
  "options": [ L("option text", "选项文字"), … ],   // 顺序即 A,B,C…
  "answer_key": ["A", "C"]                          // 字母数组
}
```

### 3.1 Markdown + LaTeX 规范

- 行内公式 `$…$`，行间公式独占段落 `$$…$$`；**不要**在公式里用 `<` `>` 裸符号（写成 `\lt` `\gt` 或加空格）。
- 粗体 `**…**`；小问 `**(a)**`；分值 `**[8 分]**` / `**[8]**`。
- 多行推导用行间公式；列表用 `-`；不要用 HTML 标签。
- 中文翻译保持公式原样（LaTeX 不翻译），叙述文字完整翻译，不删减条件。

### 3.2 importance 口径（与《五三》式评级对齐）

| 星 | 含义 |
| --- | --- |
| 5 | 近乎必考：每年或近四年≥3次 |
| 4 | 很可能：近年常客、轮换主力 |
| 3 | 可能：出现过、可复用 |
| 2 | 较低：老题型/疑似淘汰 |
| 1 | 历史参考 |

### 3.3 is_finale 判定

该卷**分值最大的多问大题**（通常 18–20 分、3 问以上、压轴位置）才标 true；每份真题至多 1–2 题。

## 4. 质量红线（校验器 + 人工自查）

1. **分值守恒**：每份真题的 `source.marks` 之和 = `module.papers[].total_marks`（校验器强制）。
2. **三语齐全**：`Question`/`Markscheme`/语言对象均需 en + zh-Hans + zh-Hant。
   简体人写，繁体用 OpenCC（`pip install opencc-python-reimplemented`）转换后人工抽查异形词。
3. **数值经代码复算**：解答中每个数值结果（概率、期望、分值）用 Python/NumPy 验算后再写入。
4. **来源三档标注**：事实/网络/推断不可混淆；讲师画像必须带 `source` 字段。
5. **标签体系**（如原卷提供）：Bookwork / Seen / Similar seen / Unseen；
   自编题必须打 `Authored` 且 `source.kind = unseen-sheet`。
6. **题号真实**：`question_number` 与原卷一致（Q1、Q2(a)…），不可重排。
7. **hints 分层**（若写入）：第 1 条不得出现公式或结论；三语条数一致（校验器强制）；
   最多 5 条。**walkthrough 四段式**（若写入）：审题/思路/示范/点评，Markdown+TeX。
8. **kinds 引用合法**（v3，校验器强制）：`formats/keypoints/notes` 的 `kinds` 只能引用
   `paper_kinds` 已声明的 id；`kind_meta` 的键必须已声明；`source.kind` 必须已声明。
9. **pitfalls / secrets 编写口径**：
   - `pitfalls`（易错点）写**判卷视角的真实失分点**（“引用了有限并而不是可数并——直接扣分”），
     不写泛泛的“仔细检查”；1–3 个失误点，每个带后果；
   - `secrets`（秘笈）写**可复用的核心打法**：先给一句命名（如“秘笈：CDF 三步机”），
     再给 3 步以内的操作序列 + 一个自检动作；与 skeleton 的分工：skeleton 是完整步骤骨架，
     secrets 是浓缩心法。
10. **drill_banner 按题型定制**：`default` 必写；高频/压轴题型可加单条覆盖
    （如 `"A"`），一句话即可，不写长篇。
11. **notes 是笔记不是教材**：`notes[].body` 控制在课堂笔记密度——定义逐字可默写、
    公式 + 一行注释、以“可直接引用的推论”收尾；不写叙事性讲解。
12. **examiner_report 编写口径**（v3.1，**可选字段——不要求每题都有**；已添加的予以保留）：
    - 定位是“**当年评分人怎么判这题**”，与 `examiner_note`（跨年备考提示）互补；
    - **同 `hints` / `walkthrough` / `examiner_note` 一样按需添加**：优先给真题、压轴题、
      陷阱题写报告；训练题/概念检查题可不写，界面对缺失字段自动隐藏入口；
    - 若写入则必含：年份+题号+分值；给分结构（方法分/答案分/陈述分怎么拆）；
      明确的给分点与扣分点（“漏‘可数’二字扣 1 分”级别）；
    - 有官方解卷标签（[Bookwork]/[Similar seen]/[Unseen]）时必须引用并注明
      “取自官方解卷 PDF”；无标签年份按指南归纳并标注【推断】；
    - 习题/自编题可写短版训练报告（训练点 + 镜像考题）；**一旦写入，三语齐全（校验器强制）**。

## 5. 构建流程（推荐脚本化）

1. 用 Python 数据文件 + `L(en, hans)` 辅助函数组织内容（参考
   `/home/z/my-project/scripts/qb50013_*.py`、`/home/z/my-project/scripts/migrate_v3.py` 的模式）。
2. `zh-Hant` 由 OpenCC 在构建期生成：`OpenCC('s2t').convert(hans)`。
3. 输出 JSON：`json.dump(..., ensure_ascii=False, indent=1)`。
4. 校验：`python3 tools/validate_qb.py assets/jsonqb/<模块码>.json` —— 必须 `All … valid.`。
5. 注册：把模块码加入 `app/index.js` 的 `QB_REGISTRY` 数组。
6. 浏览器实测：`python3 -m http.server` 起本地服务，
   - 刷题视图出题数正确、题型/出处/年份筛选正确；**切换卷型 chip 后题目数变化正确**；
   - 题型归纳/高频考点/科目情报/试卷中心/补给站在**每个有数据的卷型**下内容正确、
     空卷型显示“暂未收录”占位而不是报错；
   - 选定题型后**题型情报横幅**出现（模板/易错点/秘笈三栏）；
   - 客观题选项与判分正确（繁中下选项显示甲乙丙丁）；数学公式渲染（`.mjx-container` 数 > 0）；
   - 375px 视口无横向溢出（`document.documentElement.scrollWidth <= 375`）。

## 6. 完成定义（DoD）

- [ ] `tools/validate_qb.py` 全绿
- [ ] 该模块每份真题总分守恒
- [ ] 浏览器七视图（刷题/题型/考点/情报/试卷/补给站/番茄钟）无报错
- [ ] 卷型切换：每个已声明卷型下各视图正确响应（有数据出数据，无数据出占位）
- [ ] `agent-browser errors` 为空
- [ ] 移动端 375px 无横向滚动
- [ ] git commit（格式见下）

## 7. 提交规范

`<类型>(<范围>, <文件名不含后缀>): <描述>`，类型用 功能/修复/文档/测试/重构/初始，
例：`功能(题库, MATH50003): 导入2023-2025线代期中真题18题与题型A-O归纳（含易错点与秘笈）`。
