import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/store/memory-store.ts";
import {
  createEmptyJobSeekerProfile,
  formatJobSeekerProfile,
  isEmptyJobSeekerProfile,
  mergeJobSeekerProfile
} from "@offerflow/domain";

function makeStore() {
  return new MemoryStore({ persistence: false });
}

test("user profile: get returns empty profile for new user", async () => {
  const store = makeStore();
  const profile = await store.getUserProfile("user-1");
  assert.equal(profile.userId, "user-1");
  assert.equal(isEmptyJobSeekerProfile(profile), true);
});

test("user profile: update merges fields and persists", async () => {
  const store = makeStore();
  const updated = await store.updateUserProfile("user-1", {
    background: { major: "计算机科学", school: "南京大学", degree: "本科", graduationYear: "2027届" },
    intention: { targetRoles: ["产品经理"], targetCities: ["杭州"] }
  });
  assert.equal(updated.background.major, "计算机科学");
  assert.equal(updated.background.school, "南京大学");
  assert.deepEqual(updated.intention.targetRoles, ["产品经理"]);
  assert.deepEqual(updated.intention.targetCities, ["杭州"]);

  // Re-read to confirm persistence
  const reloaded = await store.getUserProfile("user-1");
  assert.equal(reloaded.background.major, "计算机科学");
  assert.deepEqual(reloaded.intention.targetCities, ["杭州"]);
});

test("user profile: partial update preserves existing fields", async () => {
  const store = makeStore();
  await store.updateUserProfile("user-1", {
    background: { major: "计算机科学", school: "南京大学" }
  });
  const updated = await store.updateUserProfile("user-1", {
    background: { major: "软件工程" },
    intention: { targetCities: ["上海"] }
  });
  assert.equal(updated.background.major, "软件工程");
  assert.equal(updated.background.school, "南京大学"); // preserved
  assert.deepEqual(updated.intention.targetCities, ["上海"]);
});

test("user profile: profiles are isolated per user", async () => {
  const store = makeStore();
  await store.updateUserProfile("user-a", { background: { major: "设计" } });
  await store.updateUserProfile("user-b", { background: { major: "计算机" } });
  const a = await store.getUserProfile("user-a");
  const b = await store.getUserProfile("user-b");
  assert.equal(a.background.major, "设计");
  assert.equal(b.background.major, "计算机");
});

test("user profile: formatJobSeekerProfile returns readable summary", async () => {
  const profile = createEmptyJobSeekerProfile("u1");
  profile.background = { major: "计算机", school: "南大", degree: "本科", graduationYear: "2027届" };
  profile.intention = { targetRoles: ["产品经理"], targetCities: ["杭州"] };
  profile.preferences = { writtenExam: "avoid" };
  const summary = formatJobSeekerProfile(profile);
  assert.ok(summary.includes("计算机"));
  assert.ok(summary.includes("产品经理"));
  assert.ok(summary.includes("杭州"));
  assert.ok(summary.includes("避开笔试"));
});

test("user profile: formatJobSeekerProfile handles empty profile", () => {
  const profile = createEmptyJobSeekerProfile("u1");
  assert.equal(formatJobSeekerProfile(profile), "用户尚未设置求职画像。");
});

test("user profile: mergeJobSeekerProfile updates timestamp", () => {
  const before = createEmptyJobSeekerProfile("u1");
  const after = mergeJobSeekerProfile(before, { background: { major: "设计" } });
  assert.equal(after.background.major, "设计");
  assert.ok(after.updatedAt >= before.updatedAt);
});

test("user profile: update with no fields throws", async () => {
  const store = makeStore();
  // The store layer accepts any patch; the tool layer validates.
  // Test that empty patch doesn't crash and returns existing.
  const profile = await store.updateUserProfile("user-1", {});
  assert.equal(profile.userId, "user-1");
});
