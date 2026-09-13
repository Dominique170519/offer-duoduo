import assert from "node:assert/strict";
import test from "node:test";
import questions from "../src/features/practice/questions-data.json" with { type: "json" };

test("practice questions data integrity", () => {
  assert.equal(questions.length, 100, "Should load exactly 100 questions");

  for (const q of questions) {
    assert.ok(q.id, `Question ${q.index} should have an id`);
    assert.ok(q.stem && q.stem.length > 5, `Question ${q.id} should have a non-empty stem`);
    assert.ok(q.options.length >= 2, `Question ${q.id} should have at least 2 options`);
    assert.ok(/^[A-D]$/.test(q.answer), `Question ${q.id} answer should be A, B, C, or D, got '${q.answer}'`);
  }
});

test("flash search logic matches target questions accurately", () => {
  function search(query) {
    const keywords = query.trim().toLowerCase().split(/[\s,，、]+/).filter(Boolean);
    const results = [];

    for (const q of questions) {
      const stemLower = q.stem.toLowerCase();
      let matchCount = 0;
      for (const kw of keywords) {
        if (stemLower.includes(kw)) matchCount += 3;
      }
      for (const opt of q.options) {
        if (opt.text.toLowerCase().includes(query)) matchCount += 2;
      }
      if (matchCount > 0) {
        results.push({ q, matchCount });
      }
    }
    results.sort((a, b) => b.matchCount - a.matchCount);
    return results[0]?.q;
  }

  // Test 1: "夏天 胃气"
  const qSummer = search("夏天 胃气");
  assert.ok(qSummer, "Should find question for '夏天 胃气'");
  assert.equal(qSummer.answer, "D", "Answer for summer breakfast question should be D");

  // Test 2: "莫扎特效应"
  const qMozart = search("莫扎特");
  assert.ok(qMozart, "Should find question for '莫扎特'");
  assert.equal(qMozart.answer, "C", "Answer for Mozart effect should be C");

  // Test 3: "荷尔蒙经济"
  const qHormone = search("荷尔蒙经济");
  assert.ok(qHormone, "Should find question for '荷尔蒙经济'");
  assert.equal(qHormone.answer, "C", "Answer for Hormone economy should be C");
});
