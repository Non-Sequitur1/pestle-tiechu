# 铁杵题库 Schema v3（Tiechu QB Format）

本文件描述 `assets/jsonqb/*.json` 的题库格式。设计原则：

- **向后兼容 v1/v2**：题面/解答仍叫 `Question` / `Markscheme`，题目唯一 ID 仍叫 `question_id`，
  仍是数组式题目列表——原 Mortar & Pestle 的字段名全部保留；v2 题库由前端在内存中
  自动归一化为 v3（`autumn-midterm` 卷型承接模块级情报），无需改文件。
- **v3 新增：分试卷类型（paper kind）架构**。题型归纳 / 高频考点 / 命题趋势 / 讲师画像 /
  组卷模板 / 基础知识补给站**按试卷类型分卷维护**（秋季期中 / 春季期中 / 夏季大考 / 重考 /
  习题集……）；**题型与考点可跨卷型共用（`kinds` 缺省或空 = 全卷型共用），也可专属某卷型**
  （如“某题型只在秋季期中出现”）。
- **v3 新增：题型易错点（pitfalls）、解题秘笈（secrets）、刷题型横幅（drill_banner）、
  基础知识补给站（notes）**。
- **双语三语内置**：`Question` / `Markscheme` 及所有展示性字段从“字符串”升级为
  **语言对象** `{"en", "zh-Hans", "zh-Hant"}`；渲染时按当前界面语言取值，缺失回退 `en`。
  繁中界面下题型代号与选项字母显示为天干 **甲乙丙丁戊己庚辛**（仅显示层映射，数据仍存 A–H）。
- **面向大学考试**：每题挂 **题型**（format）、**出处**（source：秋季期中/春季期中/重考卷/
  夏季试卷/习题集/Unseen 习题集/自编模拟卷）、**重要性星级**（importance，1–5）、
  **压轴标记**（is_finale）。
- **v2.1 新增**：每题可选挂 **渐进式提示**（hints，1–5 条语言对象数组）与
  **解题示范**（walkthrough，语言对象）——刷题界面逐条揭示提示、独立展开示范。
  两者与 **v3.1 的考官报告**（examiner_report）均**按需添加、不要求每题都有**；
  已添加的予以保留，缺失时界面自动隐藏对应入口。
- **v3 界面约定**：不再提供主观题屏幕作答区（纸上作答 + 对照评分标准自评）。

## 顶层结构

```jsonc
{
  "schema": "tiechu-qb-v3",
  "module": { /* 模块元数据（见下） */ },
  "questions": [ /* 题目数组（见下） */ ]
}
```

## 题目记录（questions[] 的元素）

```jsonc
{
  // ---- 题面与解答（语言对象）----
  "Question": {
    "en": "Let $\\\\mathcal{F}$ be a sigma algebra…",
    "zh-Hans": "设 $\\\\mathcal{F}$ 是 σ-代数…",
    "zh-Hant": "設 $\\\\mathcal{F}$ 是 σ-代數…"
  },
  "Markscheme": { "en": "…", "zh-Hans": "…", "zh-Hant": "…" },
  "examiner_note": { "en": "…评分人习惯/陷阱提示…", "zh-Hans": "…", "zh-Hant": "…" },

  // ---- 标识与分类 ----
  "question_id": "MATH50013.MT2023.Q1",   // 唯一：<模块>.<卷>.<题号>
  "module": "MATH50013",
  "qtype": "subjective",                    // subjective | single | multi
  "format": "B",                            // 题型代号（模块 formats 主键）
  "secondary_format": null,                 // 次要题型（可空）
  "topics": ["foundations"],                // 模块 topics 主键
  "subtopics": [],

  // ---- 客观题（qtype 为 single/multi 时）----
  "options": [ {"en": "…", "zh-Hans": "…", "zh-Hant": "…"}, … ],  // 顺序即 A,B,C…
  "answer_key": ["C"],                      // 正确选项字母数组；multi 可多个

  // ---- 出处 ----
  "source": {
    "paper_id": "MT2023",                   // 模块 papers[].id 或 PS1/PS2/PS3/UQ
    "paper_name": {"en": "Autumn 2023 Midterm", "zh-Hans": "2023 秋季期中试卷", …},
    "kind": "autumn-midterm",               // 枚举见下
    "year": 2023,                           // 习题集/自编可为 null
    "question_number": "Q1",
    "marks": 7,
    "source_note": {"en": "Problem Sheet 1, Q3", "zh-Hans": "习题集 1，第 3 题", …}
  },

  // ---- 重要性 / 被考概率 ----
  "importance": 5,        // 1–5 星，对齐《五三》式被考概率评级
  "is_finale": false,     // 压轴题（每年最重的多问大题）
  "tags": ["Similar-seen", "Closure-proof"]

  // ---- v2.1 可选：渐进式提示 + 解题示范 ----
  "hints": {                        // 1–5 条，刷题界面逐条揭示（先方向、后关键步骤，不剧透结论）
    "en": ["Work out E(S) as a function of the reported p…", "…", "…"],
    "zh-Hans": ["…", "…", "…"],
    "zh-Hant": ["…", "…", "…"]      // 每种语言的条数必须与 en 一致
  },
  "walkthrough": {                  // 完整解题示范（Markdown+TeX），比 Markscheme 更教学化
    "en": "**审题.** …\\n\\n**思路.** …",   // 推荐"审题 → 思路 → 示范 → 点评"四段式
    "zh-Hans": "…", "zh-Hant": "…"

  // ---- v3.1 可选：考官报告（Examiner Report）——按需添加，非每题必写 ----
  "examiner_report": {              // "当年评分人怎么判这题"：给分结构/给分点/扣分点/官方熟悉度标签
    "en": "**Examiner report (2025, Q5, 18 marks).** Official tags: (a)(b) [Seen — Example 3.21]…",
    "zh-Hans": "**考官报告（2025，Q5，18 分）。** 官方标签：(a)(b) [Seen——讲义例题 3.21]…",
    "zh-Hant": "…"                  // 与 examiner_note（备考提示）不同：report 是逐年阅卷视角
  }
}
```

**hints 编写规范**（参考《五三》分层提示）：
1. 第 1 条只给**审题方向**（用哪条定理/哪个模型），不出现公式；
2. 第 2 条给**关键一步**（题眼），仍不给出最终数字；
3. 最多 5 条；条数少而准优于多而碎；
4. 三语条数必须一致（校验器强制）；语言对象内是**字符串数组**。

**walkthrough 编写规范**（参考《题型总归纳狂练》解题示范）：
1. 推荐四段式：**审题**（读出隐含条件）→ **思路**（为什么这么走）→ **示范**（完整严谨过程）
   → **点评**（本题在题型库中的位置、易错点、与哪些题同源）；
2. Markdown + LaTeX（`$…$` / `$$…$$`），可用 `**粗体**`、列表；
3. 与 Markscheme 的分工：Markscheme 面向对答案（按得分点），walkthrough 面向学习
   （按思维过程）；两者内容允许有重叠但视角不同；
4. 两字段均为**可选**：老题库不写不影响加载；一旦写入则校验三语完整性。

`source.kind` 枚举（适配大学考试，替换原 IB 的 Paper 1/2/3）：

| kind | 含义 |
| --- | --- |
| `autumn-midterm` | 秋季期中试卷 |
| `spring-midterm` | 春季期中试卷 |
| `resit` | 重考卷 |
| `summer` | 夏季试卷 |
| `problem-sheet` | 习题集 |
| `unseen-sheet` | Unseen 习题集（自编概念核查等） |
| `mock` | 自编模拟卷素材 |

## 模块元数据（module）

```jsonc
{
  "code": "MATH50013",
  "name": {"en": "…", "zh-Hans": "…", "zh-Hant": "…"},
  "short_name": {"en": "…", "zh-Hans": "…", "zh-Hant": "…"},
  "university": {…}, "term": {…}, "scope": {…}, "assessment": {…},
  "papers": [                    // 收录的历年试卷（具体卷，kind 指向所属卷型）
    {"id": "MT2025", "name": {…}, "date": "2025-11-11",
     "kind": "autumn-midterm", "total_marks": 50}
  ],

  // ===== v3：卷型注册表（分试卷类型的根）=====
  "paper_kinds": [               // 有序；UI 卷型选择器按此顺序渲染
    {"id": "autumn-midterm", "name": {"en": "Autumn Midterm", "zh-Hans": "秋季期中试卷", "zh-Hant": "秋季期中試卷"}},
    {"id": "spring-midterm",  "name": {…}},   // 夏季大考/重考/习题集等同理；
    …                                        // 未收录数据的卷型也会列出（置灰，等待导入）
  ],

  // ===== v3：按卷型独立的情报块（命题趋势/讲师/组卷模板全部在此维度分开）=====
  "kind_meta": {
    "autumn-midterm": {
      "trends": {                // 该卷型的命题趋势（结构同 v2 module.trends）
        "summary": {…},
        "yearly": [ {"year": 2025, "rows": [["Q1","8","σ-algebra…","B","—"], …]} ],
        "chapter_share": [ {"label": {…}, "share": 0.29} ]
      },
      "order": {…},              // 出题顺序说明（Markdown+TeX 语言对象）
      "mock_template": {         // 该卷型的组卷模板（结构同 v2 module.mock_template）
        "duration_min": 60, "source": {…},
        "slots": [ {"qno": "Q1", "format": "B", "note": {…}}, … ]
      },
      "lecturers": [ … ]         // 该卷型的讲师画像（结构同 v2 module.lecturers）
    },
    "spring-midterm": { … }      // 未来新增卷型：加一段即可，前端自动出现
  },

  "lecturers": [                 // v2 兼容保留：模块级讲师画像（v3 优先读 kind_meta[].lecturers）
    {"name": "…", "name_display": {…}, "role": {…}, "research": {…},
     "habits": [{…}, …], "source": {…}}
  ],
  "topics": [                    // 章节知识块（题目 topics 的取值域）
    {"id": "foundations", "name": {…}}
  ],
  "keypoints": [                 // 高频考点清单（按热度）
    {"id": "KP-sigma", "topic": "foundations", "heat": 5, "name": {…},
     "detail": {…}, "years": ["2022 Q1a", "2023 Q1", …],
     "kinds": ["autumn-midterm"]} // v3：该考点属于哪些卷型；缺省/空 = 全卷型共用
  ],
  "formats": [                   // 题型归纳（A–H；数据层 ID 不变，繁中界面显示天干）
    {"id": "A", "name": {…}, "stars": 5, "likelihood": {…}, "slot": {…},
     "years": ["2022 Q3", …], "drills": ["PS3 Q4"], "skeleton": {…},
     "kinds": ["autumn-midterm"],           // v3：专属卷型；缺省/空 = 全卷型共用
     "pitfalls": {…},                        // v3：易错点（Markdown+TeX 语言对象）
     "secrets": {…}}                         // v3：解题秘笈（Markdown+TeX 语言对象）
  ],
  "trends": {                    // v2 兼容保留：模块级趋势（v3 优先读 kind_meta[].trends）
    "summary": {…},
    "yearly": [ … ],
    "chapter_share": [ … ]
  },
  "mock_template": { … },        // v2 兼容保留：模块级组卷模板

  // ===== v3：基础知识补给站（课堂笔记/基础知识复习笔记）=====
  "notes": [
    {"id": "NOTE-sigma", "topic": "foundations",        // topics 主键
     "title": {…}, "body": {…},                          // Markdown+TeX
     "kinds": ["autumn-midterm"]}                        // 缺省 = 全卷型共用
  ],

  // ===== v3：刷题型横幅（按题型筛选刷题时置顶显示）=====
  "drill_banner": {
    "default": {…},              // 通用横幅（题型未单列时回退）
    "A": {…}, "B": {…}           // 按题型 ID 覆盖（Markdown+TeX 语言对象）
  }
}
```

**kinds 字段约定（核心）**：
- `kinds` **缺省或空数组** = 该题型/考点/笔记**全卷型共用**（如“σ-代数默写”春季秋季都考）；
- `kinds` **非空** = **专属**所列卷型（如“2021 长篇建模格式”仅秋季期中历史上出现）；
- 同一题型要跨卷型共用：把两个 kind 都列入（`["autumn-midterm","summer"]`），
  试卷中心/组卷模板按卷型分别引用它即可；
- 题目的归属由 `source.kind` 决定，`paper_kinds` 必须覆盖所有用到的 kind。

## 编写规范

1. **题面用 Markdown + LaTeX**：行内 `$…$`、行间 `$$…$$`；粗体用 `**…**`；
   小问用 `**(a)**` 起头，分值写 `**[8 分]**` / `**[8]**`。
2. **三语齐全**：`zh-Hans` 人写，`zh-Hant` 由构建脚本 OpenCC（s2t）转换并抽查；
   缺失语言时前端回退 `en`，但新题库要求三语齐全（校验器强制）。
3. **数据可核**：分值、题号、年份必须与原卷一致；解析中的数值结果先经代码复算。
4. **importance 口径**：5 = 近乎必考/每年出现；4 = 很可能/近年常客；3 = 可能/轮换出现；
   2 = 较低（老题型或已淘汰）；1 = 仅历史参考。
5. **首轮题库**：`MATH50013.json` 收录 2021–2025 五份秋季期中全部 21 题真题、
   PS1–PS3 精选 15 题训练题、自编 5 题客观题（Unseen 习题集，明确标注 Authored）。

## 校验

`tools/validate_qb.py <bank.json…>`：检查 schema（v2/v3）、ID 唯一性、三语完整性、
客观题 options/answer_key、期中卷分值合计；v3 额外校验 `paper_kinds` 注册表、
`kind_meta` 键必须已声明、`formats/keypoints/notes` 的 `kinds` 引用、
`drill_banner`/`pitfalls`/`secrets`/`notes` 三语完整性。
