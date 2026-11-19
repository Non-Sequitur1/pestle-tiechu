# 铁杵 Tiechu · 大学版题海研磨机

> 只要功夫深，题海磨成针。
> With enough grinding, the pestle becomes a needle.

铁杵是面向**大学课程复习**的静态题库应用（原 Mortar & Pestle 的重构版）：
按题型刷真题、背解题模板、盯被考概率、看历年趋势、自编模拟卷。
《五三》式复习指南语气，简体中文 / 繁體中文 / English 三语界面。

**伦敦红星软件 出品 · London Red Star Software**

## 启动

完全静态、完全离线（字体与渲染库已内置）：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000/
```

> 必须经由 HTTP 服务访问（fetch 不支持 file://）；任意静态服务器均可。

## 功能地图

| 视图 | 功能 |
| --- | --- |
| 刷题 | 题型/出处/年份/章节/被考概率/压轴多维筛选 + 关键词搜索；**纸上作答 + 评分标准对照自评**（v3 起取消屏幕作答区）；单选/多选即时判分；**渐进式提示（逐条揭示）与解题示范（审题→思路→示范）**；**每题考官报告 Examiner Report**（v3.1：给分结构 / 给分点 / 扣分点 / 官方熟悉度标签，独立折叠区块）；**自选题组 PDF**（v3.1，复刻原版 Pestle：逐题"加入自选"、一键全选当前筛选、悬浮选中条、打印窗内实时勾选"含评分标准 / 含考官报告"再打印或另存 PDF）；**选定题型后置顶显示题型情报横幅：解题模板 / 易错点 / 解题秘笈三栏**；解答/提示/自评/自选进度存 localStorage |
| 题型归纳 | 每个题型：五星被考概率、**卷型归属标签（全卷型共用 / 专属某卷型）**、典型题位与分值、出现年份、配套训练、**解题模板**（分步骤骨架）、**易错点**、**解题秘笈** |
| 高频考点 | 按热度排序的考点清单：精确表述（Markdown+LaTeX）+ 考过位置 + 卷型归属 |
| 科目情报 | **按试卷类型分开**的考试范围、考核方式、收录试卷、出题顺序模板与顺序说明、分值占比、历年趋势表、讲师画像（事实/网络/推断三档来源标注） |
| 试卷中心 | 往年全卷（按年查看、打印/导出 PDF）+ 按卷型组卷模板自编模拟卷（自动抽题、可显示评分标准） |
| 基础知识补给站 | **v3 新增**：相关课堂笔记 / 基础知识复习笔记（Markdown+LaTeX），按卷型归属 |
| 番茄钟 | 25/5/15 可自定义，跨刷新续时，今日完成轮数统计 |

### 分试卷类型（v3 核心）

题型归纳、高频考点、命题趋势、讲师画像、组卷模板、基础知识补给站**全部按试卷类型
（秋季期中 / 春季期中 / 夏季大考 / 重考 / 习题集 / Unseen 习题集）分卷维护**。
每个视图顶部有卷型选择器；**题型与考点可跨卷型共用（缺省 = 全卷型共用），也可专属
某卷型**（如“2021 长篇建模格式”仅秋季期中历史出现）。当前数据覆盖秋季期中，
其余卷型已注册、界面置灰等待导入（导入只需在 `kind_meta` 加一段，前端自动出现）。

### 繁体中文显示约定

繁中界面下题型代号与选项字母显示为天干 **甲乙丙丁戊己庚辛**（数据层仍存 A–H，
仅显示层映射）。

### TeX / Computer Modern 字体

MathJax (v3 CHTML) 的数学字形本就是 Computer Modern——其 23 个 woff 字体已
**本地内置**（`assets/vendor/mathjax-fonts/`），离线可用。工具栏 **TEX CM** 按钮
再把正文（题面/模板/笔记）切换为 LM Roman / Libertinus（CM Serif/Sans 系），
实现全文统一 Computer Modern 观感。

题目以 **Markdown + LaTeX**（`$…$` / `$$…$$`）存储，marked + DOMPurify + MathJax(v3)
渲染，公式先于 Markdown 保护（下划线等不会被吞）。

## 题库

- `assets/jsonqb/MATH50013.json` — 概率论与数理统计（JMC）：**41 题双语**
  （2021–2025 五份期中真题 21 题 + PS1–PS3 精选训练 15 题 + 自编客观题 5 题）、
  题型 A–H 归纳（**含易错点与解题秘笈**）、11 条高频考点、5 年趋势、讲师画像、
  模拟卷模板、**4 篇基础知识补给站笔记、按题型的刷题横幅**。
- `assets/jsonqb/MATH50003.json` — 线性代数（元数据：题型 A–J、考点热度榜、
  Zordan/Liebeck 讲师画像、2023–2025 趋势；题目导入中）。
- `assets/jsonqb/ANALYSIS2.json` — 数学分析 II（元数据：题型 1–6、考点、
  2020–2025 趋势；题目导入中）。
- 其余 `*.json` 为上游 IB 题库的 git-lfs 指针（保留占位，不加载）。

三个题库均为 **tiechu-qb-v3**（分试卷类型架构；当前情报数据覆盖秋季期中卷型，
其余卷型注册待导入）。

### 格式与导入

题库格式 `tiechu-qb-v3` 的完整规范见 [`docs/SCHEMA.md`](docs/SCHEMA.md)；
为开发者 / AI 智能体准备的导入指南见 [`skills/qb-import/SKILL.md`](skills/qb-import/SKILL.md)。
导入后运行校验：

```bash
python3 tools/validate_qb.py assets/jsonqb/<模块>.json
```

硬性要求：真题分值与原卷守恒；`Question`/`Markscheme` 三语齐全（zh-Hant 可由
OpenCC 生成后抽查）；客观题必须带 `options` + `answer_key`；`kinds` 只能引用
`paper_kinds` 已声明的卷型。

## 目录结构

```
index.html            落地页（三语）
app/index.html|.js    主应用（七视图 SPA，无构建步骤）
assets/i18n.js        三语字典
assets/style.css      样式（桌面 + 移动端 + 暗色 + 打印 + CM 字体模式）
assets/fonts/         Noto Sans Latin + Noto Sans SC/TC + CM Serif/Sans（LM Roman / Libertinus，离线内置）
assets/vendor/        marked / DOMPurify / MathJax + mathjax-fonts（CM 数学字形，离线内置）
assets/jsonqb/        题库（tiechu-qb-v3，分试卷类型）
docs/SCHEMA.md        题库格式规范
skills/qb-import/     题库导入技能文档
tools/validate_qb.py  题库校验器（v2/v3）
```

## 与上游的差异

上游 Mortar & Pestle（public domain，IB 题库）的题库 JSON 字段全部保留兼容
（`question_id` / `Question` / `Markscheme` / `topics`）；本项目将字段升级为
语言对象、新增题型/出处/重要性/压轴标记，并把 IB 的 Paper 1/2/3 试卷概念
替换为大学考试卷别（秋季期中/春季期中/重考卷/夏季试卷/习题集/Unseen 习题集）。

## 许可

继续上游 public domain 传统；参考 PDF 与 zip 为课程资料，版权归各自作者。
