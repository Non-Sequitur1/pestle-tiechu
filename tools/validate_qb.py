#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tiechu QB validator: validate question bank JSON files against schema tiechu-qb-v3.

v3 adds the per-paper-kind architecture (分试卷类型):
  module.paper_kinds   : ordered [{id, name:{lang}}] (autumn-midterm, spring-midterm,
                         summer, resit, problem-sheet, unseen-sheet)
  formats[].kinds      : kind ids this format appears in (absent/empty = shared by ALL kinds)
  formats[].pitfalls   : 易错点 (language object, md+tex) — optional but validated when present
  formats[].secrets    : 解题秘笈 (language object, md+tex) — optional but validated when present
  keypoints[].kinds    : kind ids this keypoint is hot in (absent = all kinds)
  module.kind_meta     : PER-KIND intel {<kind>: {trends, order, mock_template, lecturers}}
  module.notes         : 基础知识补给站 [{id, topic, title, body, kinds?}]
  module.drill_banner  : {default: langobj, <FMTID>: langobj} shown while grinding a format

v2 banks are still accepted (checked under v2 rules) for backward compatibility.

Usage: python3 tools/validate_qb.py assets/jsonqb/MATH50013.json [more.json ...]
Exit code 0 = all banks valid.
"""
import json
import sys

REQUIRED_LANGS = ("en", "zh-Hans", "zh-Hant")
QTYPES = {"subjective", "single", "multi"}
SOURCE_KINDS = {"autumn-midterm", "spring-midterm", "resit", "summer",
                "problem-sheet", "unseen-sheet", "mock"}
PAPER_KIND_IDS = {"autumn-midterm", "spring-midterm", "resit", "summer",
                  "problem-sheet", "unseen-sheet"}
LANG_FIELDS = ("Question", "Markscheme")
HINTWALK_FIELDS = ("hints", "walkthrough")
# language-object md+tex fields on formats (validated when present)
FORMAT_LANGFIELDS = ("pitfalls", "secrets", "skeleton", "likelihood", "slot")


def fail(msgs, msg):
    msgs.append(msg)


def is_langobj(v):
    return isinstance(v, dict) and isinstance(v.get("en"), str) and v["en"].strip()


def lang_complete(v, where, msgs):
    if not is_langobj(v):
        fail(msgs, f"{where}: not a language object with non-empty 'en'")
        return
    for lang in REQUIRED_LANGS:
        if not (isinstance(v.get(lang), str) and v[lang].strip()):
            fail(msgs, f"{where}: missing/empty '{lang}'")


def validate_kinds_list(v, where, msgs):
    """kinds must be a list of known paper-kind ids (unknown ids allowed but flagged
    if they are not declared in module.paper_kinds either)."""
    if not isinstance(v, list) or not v:
        fail(msgs, f"{where}.kinds must be a non-empty list of paper-kind ids (or absent = all kinds)")
        return []
    for k in v:
        if not isinstance(k, str) or not k.strip():
            fail(msgs, f"{where}.kinds contains a non-string entry")
    return v


def validate_bank(path):
    msgs = []
    try:
        with open(path, encoding="utf-8") as f:
            head = f.read(200)
        if head.startswith("version https://git-lfs.github.com/spec/v1"):
            return []  # git-lfs pointer stub, not a bank; skip silently
        with open(path, encoding="utf-8") as f:
            bank = json.load(f)
    except Exception as e:
        return [f"{path}: cannot parse JSON: {e}"]
    if not isinstance(bank, dict) or bank.get("schema") not in ("tiechu-qb-v2", "tiechu-qb-v3"):
        fail(msgs, f"{path}: top-level must be {{'schema': 'tiechu-qb-v2'|'tiechu-qb-v3', ...}}")
        return msgs
    v3 = bank.get("schema") == "tiechu-qb-v3"
    mod = bank.get("module")
    fmt_ids, topic_ids, paper_ids = set(), set(), set()
    declared_kind_ids = set()
    if not isinstance(mod, dict):
        fail(msgs, f"{path}: missing module metadata")
    else:
        for fld in ("code", "name", "papers", "topics", "keypoints", "formats", "trends"):
            if fld not in mod:
                fail(msgs, f"{path}: module.{fld} missing")
        for fld in ("name", "scope", "assessment"):
            if fld in mod:
                lang_complete(mod[fld], f"{path}: module.{fld}", msgs)
        if v3:
            # paper_kinds: ordered declarations with names
            pk = mod.get("paper_kinds")
            if not isinstance(pk, list) or not pk:
                fail(msgs, f"{path}: module.paper_kinds must be a non-empty list (v3)")
            else:
                for entry in pk:
                    if not isinstance(entry, dict) or not entry.get("id"):
                        fail(msgs, f"{path}: module.paper_kinds[] needs id")
                        continue
                    lang_complete(entry.get("name"), f"{path}: paper_kinds[{entry.get('id')}].name", msgs)
                    declared_kind_ids.add(entry["id"])
            # per-kind intel block
            km = mod.get("kind_meta")
            if not isinstance(km, dict) or not km:
                fail(msgs, f"{path}: module.kind_meta must be a non-empty object (v3): at least one paper kind carries its own trends/order/mock_template/lecturers")
            else:
                for kind, meta in km.items():
                    if kind not in declared_kind_ids:
                        fail(msgs, f"{path}: kind_meta key '{kind}' not declared in module.paper_kinds")
                    if not isinstance(meta, dict):
                        fail(msgs, f"{path}: kind_meta.{kind} must be an object")
                        continue
                    tr = meta.get("trends")
                    if isinstance(tr, dict):
                        for fld in ("summary", "yearly", "chapter_share"):
                            if fld not in tr:
                                fail(msgs, f"{path}: kind_meta.{kind}.trends.{fld} missing")
                        lang_complete(tr.get("summary"), f"{path}: kind_meta.{kind}.trends.summary", msgs)
                        for yy in tr.get("yearly", []):
                            if not (isinstance(yy, dict) and "year" in yy and isinstance(yy.get("rows"), list)):
                                fail(msgs, f"{path}: kind_meta.{kind}.trends.yearly[] needs year+rows")
                            for row in yy.get("rows", []):
                                if not (isinstance(row, list) and len(row) >= 4):
                                    fail(msgs, f"{path}: kind_meta.{kind}.trends.yearly[{yy.get('year')}] rows need >=4 columns (Q#, marks, topic, format)")
                        for c in tr.get("chapter_share", []):
                            lang_complete(c.get("label"), f"{path}: kind_meta.{kind}.chapter_share[].label", msgs)
                            sh = c.get("share")
                            if not isinstance(sh, (int, float)) or not (0 <= sh <= 1):
                                fail(msgs, f"{path}: kind_meta.{kind}.chapter_share[].share must be 0..1")
                    if "order" in meta and meta["order"] is not None:
                        lang_complete(meta["order"], f"{path}: kind_meta.{kind}.order", msgs)
                    for lect in meta.get("lecturers", []) or []:
                        for fld in ("role", "research", "source"):
                            if fld in lect:
                                lang_complete(lect[fld], f"{path}: kind_meta.{kind}.lecturers[].{fld}", msgs)
                        for h in lect.get("habits", []) or []:
                            lang_complete(h, f"{path}: kind_meta.{kind}.lecturers[].habits[]", msgs)
            # notes (基础知识补给站)
            for n in mod.get("notes", []) or []:
                nid = n.get("id", "<no-id>")
                if not n.get("id"):
                    fail(msgs, f"{path}: notes[] needs id")
                lang_complete(n.get("title"), f"{path}: notes[{nid}].title", msgs)
                lang_complete(n.get("body"), f"{path}: notes[{nid}].body", msgs)
                if n.get("topic") and n["topic"] not in topic_ids and topic_ids:
                    fail(msgs, f"{path}: notes[{nid}].topic '{n['topic']}' not in module.topics ids")
                if "kinds" in n:
                    validate_kinds_list(n["kinds"], f"{path}: notes[{nid}]", msgs)
            # drill banners
            db = mod.get("drill_banner", {}) or {}
            if db:
                if "default" not in db:
                    fail(msgs, f"{path}: drill_banner should carry a 'default' entry")
                for k, v in db.items():
                    lang_complete(v, f"{path}: drill_banner[{k}]", msgs)
        fmt_ids = set()
        for fmt in mod.get("formats", []):
            if "id" not in fmt or "name" not in fmt or "stars" not in fmt:
                fail(msgs, f"{path}: module.formats[] needs id/name/stars")
            fmt_ids.add(fmt.get("id"))
            if v3 and "kinds" in fmt:
                ks = validate_kinds_list(fmt["kinds"], f"{path}: formats[{fmt.get('id')}]", msgs)
                for k in ks:
                    if declared_kind_ids and k not in declared_kind_ids:
                        fail(msgs, f"{path}: formats[{fmt.get('id')}].kinds references undeclared kind '{k}'")
            if v3:
                for fld in FORMAT_LANGFIELDS:
                    if fld in fmt and fmt[fld] is not None:
                        lang_complete(fmt[fld], f"{path}: formats[{fmt.get('id')}].{fld}", msgs)
        topic_ids = {t.get("id") for t in mod.get("topics", [])}
        paper_ids = {p.get("id") for p in mod.get("papers", [])}
        for kp in mod.get("keypoints", []):
            if v3 and "kinds" in kp:
                ks = validate_kinds_list(kp["kinds"], f"{path}: keypoints[{kp.get('id')}]", msgs)
                for k in ks:
                    if declared_kind_ids and k not in declared_kind_ids:
                        fail(msgs, f"{path}: keypoints[{kp.get('id')}].kinds references undeclared kind '{k}'")

    questions = bank.get("questions")
    if questions == [] and isinstance(mod, dict) and mod.get("meta_only"):
        return msgs  # metadata-only bank (module registered, questions to be imported)
    if not isinstance(questions, list) or not questions:
        fail(msgs, f"{path}: questions must be a non-empty array "
                   f"(or [] with module.meta_only=true)")
        return msgs
    ids = set()
    midterm_totals = {}
    for q in questions:
        qid = q.get("question_id", "<no-id>")
        where = f"{path}: {qid}"
        if q["question_id"] in ids:
            fail(msgs, f"{where}: duplicate question_id")
        ids.add(q["question_id"])
        for fld in LANG_FIELDS:
            if fld not in q:
                fail(msgs, f"{where}: missing {fld}")
            else:
                lang_complete(q[fld], f"{where}.{fld}", msgs)
        if q.get("examiner_note"):
            lang_complete(q["examiner_note"], f"{where}.examiner_note", msgs)
        # v3.1 optional: examiner report (考官报告) — full trilingual completeness when present
        if q.get("examiner_report"):
            lang_complete(q["examiner_report"], f"{where}.examiner_report", msgs)
        if "hints" in q:
            h = q["hints"]
            if not isinstance(h, dict) or not isinstance(h.get("en"), list) or not h["en"]:
                fail(msgs, f"{where}.hints: must be {{lang: [strings]}} with non-empty 'en' list")
            else:
                if len(h["en"]) > 5:
                    fail(msgs, f"{where}.hints: keep to at most 5 progressive hints")
                for lang in REQUIRED_LANGS:
                    vals = h.get(lang)
                    if not isinstance(vals, list) or len(vals) != len(h["en"]):
                        fail(msgs, f"{where}.hints.{lang}: must be a list matching 'en' length")
                    elif any(not (isinstance(x, str) and x.strip()) for x in vals):
                        fail(msgs, f"{where}.hints.{lang}: empty hint entry")
        if "walkthrough" in q:
            lang_complete(q["walkthrough"], f"{where}.walkthrough", msgs)
        if q.get("qtype") not in QTYPES:
            fail(msgs, f"{where}: qtype must be one of {sorted(QTYPES)}")
        if q.get("format") not in fmt_ids:
            fail(msgs, f"{where}: format '{q.get('format')}' not in module.formats ids")
        for t in q.get("topics", []):
            if t not in topic_ids:
                fail(msgs, f"{where}: topic '{t}' not in module.topics ids")
        src = q.get("source")
        if not isinstance(src, dict):
            fail(msgs, f"{where}: missing source")
        else:
            if src.get("kind") not in SOURCE_KINDS:
                fail(msgs, f"{where}: source.kind must be one of {sorted(SOURCE_KINDS)}")
            if not isinstance(src.get("marks"), (int, float)) or src["marks"] <= 0:
                fail(msgs, f"{where}: source.marks must be positive number")
            if v3 and src.get("kind") in PAPER_KIND_IDS and declared_kind_ids:
                if src["kind"] not in declared_kind_ids:
                    fail(msgs, f"{where}: source.kind '{src['kind']}' not declared in module.paper_kinds")
            if src.get("kind") == "autumn-midterm":
                if src.get("paper_id") not in paper_ids:
                    fail(msgs, f"{where}: source.paper_id not in module.papers")
                midterm_totals[src["paper_id"]] = (
                    midterm_totals.get(src["paper_id"], 0) + src["marks"])
        imp = q.get("importance")
        if not isinstance(imp, (int, float)) or not (1 <= imp <= 5):
            fail(msgs, f"{where}: importance must be 1-5")
        if q.get("qtype") in ("single", "multi"):
            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) < 2:
                fail(msgs, f"{where}: objective question needs >=2 options")
            else:
                for i, o in enumerate(opts):
                    lang_complete(o, f"{where}.options[{i}]", msgs)
            key = q.get("answer_key")
            letters = [chr(65 + i) for i in range(len(opts or []))]
            if not isinstance(key, list) or not key:
                fail(msgs, f"{where}: objective question needs answer_key array")
            elif any(k not in letters for k in key):
                fail(msgs, f"{where}: answer_key {key} out of range for {len(letters)} options")
            elif q["qtype"] == "single" and len(key) != 1:
                fail(msgs, f"{where}: single-choice must have exactly one answer")
        else:
            if q.get("options") or q.get("answer_key"):
                fail(msgs, f"{where}: subjective question must not carry options/answer_key")
    for pid, tot in midterm_totals.items():
        expected = next((p.get("total_marks") for p in mod.get("papers", [])
                         if p.get("id") == pid), None)
        if expected and abs(tot - expected) > 1e-9:
            fail(msgs, f"{path}: paper {pid} marks sum {tot} != declared {expected}")
    return msgs


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    all_msgs, n, skipped = [], 0, 0
    for path in sys.argv[1:]:
        n += 1
        msgs = validate_bank(path)
        if msgs:
            print(f"FAIL {path}")
            for m in msgs:
                print("  -", m)
            all_msgs.extend(msgs)
        else:
            with open(path, encoding="utf-8") as f:
                head = f.read(200)
            if head.startswith("version https://git-lfs.github.com/spec/v1"):
                print(f"SKIP {path}: git-lfs pointer (legacy v1 bank)")
                skipped += 1
                continue
            f = open(path, encoding="utf-8")
            bank = json.load(f)
            f.close()
            print(f"OK   {path}: {len(bank['questions'])} questions, "
                  f"{len(bank['module']['formats'])} formats, "
                  f"{len(bank['module']['keypoints'])} keypoints"
                  + (f", kinds meta: {sorted(bank['module'].get('kind_meta', {}))}"
                     if bank.get("schema") == "tiechu-qb-v3" else ""))
    if all_msgs:
        print(f"\n{len(all_msgs)} problem(s) in {n} bank(s)")
        sys.exit(1)
    print(f"\nAll {n - skipped} bank(s) valid ({skipped} legacy LFS stubs skipped).")


if __name__ == "__main__":
    main()
