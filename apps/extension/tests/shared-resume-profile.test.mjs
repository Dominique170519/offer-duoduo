import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEmptyPersonalProfile, createResumeDocument, toCloudResumeProfile, detachedApplicationEntries } from "../../../packages/domain/src/index.ts";
import { mergeRemoteResumeTemplates, mergeRemoteResumeVersions, resumeSyncFingerprint } from "../src/infrastructure/sync/resumeTemplateSync.ts";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const now = "2026-09-13T00:00:00.000Z";
const candidate = () => ({ ...createEmptyPersonalProfile(), fullName: "测试用户", phone: "13800000000", hobbies: "摄影", earliestStartDate: "两周内", idNumber: "LOCAL_ID", experiences: [{ id: "exp-1", organization: "测试公司", title: "产品经理", startDate: "2024", endDate: "2026", description: "完成用户调研", salary: "LOCAL_SALARY", refereeContact: "LOCAL_REFEREE" }] });

test("application-first and web-first share facts without sharing private data or overwriting prose", async t => {
  const folder = await mkdtemp(join(tmpdir(), "offerflow-profile-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const out = join(folder, "storage.mjs");
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  await build({ entryPoints: [join(root, "infrastructure/storage/storage.ts")], outfile: out, bundle: true, format: "esm", platform: "node", alias: { "@": root }, logLevel: "silent" });
  const savedChrome = globalThis.chrome;
  const data = {};
  let storageWrites = 0;
  globalThis.chrome = { storage: { local: {
    async get(keys) { return structuredClone(keys === null ? data : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, data[key]]))); },
    async set(values) { storageWrites += 1; Object.assign(data, structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
  } } };
  t.after(() => { globalThis.chrome = savedChrome; });
  const storage = await import(pathToFileURL(out).href);

  const initial = await storage.saveApplicationProfile(candidate());
  const masterId = initial[0].id;
  assert.equal(initial.length, 1);
  assert.equal(initial[0].kind, "base");
  assert.equal(data[storage.RESUMES_KEY][0].profile.fullName, "测试用户");
  assert.equal(data[storage.RESUMES_KEY][0].profile.hobbies, "摄影");
  assert.equal(data[storage.RESUMES_KEY][0].profile.earliestStartDate, "两周内");
  assert.equal(JSON.stringify(data[storage.RESUMES_KEY]).includes("LOCAL_"), false);
  assert.equal(JSON.stringify(data[storage.PROFILE_KEY]).includes("LOCAL_"), false);
  assert.equal((await storage.loadProfile()).idNumber, "LOCAL_ID");
  assert.equal((await storage.loadProfile()).experiences[0].refereeContact, "LOCAL_REFEREE");

  // Chrome serializes dictionaries with its own key order. Reading an already
  // migrated profile must not write again and recursively trigger onChanged.
  data[storage.RESUMES_KEY] = JSON.parse(JSON.stringify(data[storage.RESUMES_KEY], (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value));
  const writesBeforeRead = storageWrites;
  await storage.loadResumeLibrary();
  await storage.loadResumeLibrary();
  assert.equal(storageWrites, writesBeforeRead, "loading normalized Chrome storage must be read-only");

  // A web edit arrives after initial acknowledgement; it changes a shared fact
  // and independently rewrites the resume description.
  const remote = { id: masterId, name: initial[0].name, profile: toCloudResumeProfile(candidate()), revision: 1, createdAt: now, updatedAt: now };
  let library = mergeRemoteResumeTemplates(await storage.loadResumeLibrary(), [remote]);
  await storage.saveResumeLibrary(library, { origin: "cloud" });
  remote.revision = 2;
  remote.profile.phone = "13900000000";
  remote.profile.experiences[0].description = "通过用户调研明确产品需求";
  library = mergeRemoteResumeTemplates(await storage.loadResumeLibrary(), [remote]);
  await storage.saveResumeLibrary(library, { origin: "cloud" });
  assert.equal((await storage.loadProfile()).phone, "13900000000");
  const editedForm = await storage.loadProfile();
  editedForm.experiences[0].title = "高级产品经理";
  editedForm.experiences[0].description = "网申的详细职责表达";
  await storage.saveApplicationProfile(editedForm, masterId);
  const master = (await storage.loadResumeLibrary())[0];
  assert.equal(master.profile.experiences[0].title, "高级产品经理");
  assert.equal(master.profile.experiences[0].description, "通过用户调研明确产品需求");
  assert.equal((await storage.loadProfile()).experiences[0].description, "网申的详细职责表达");

  // A cloud removal cannot destroy the detached referee/salary record.
  const acknowledged = { ...remote, revision: 3, profile: toCloudResumeProfile(master.profile) };
  library = mergeRemoteResumeTemplates(await storage.loadResumeLibrary(), [acknowledged]);
  await storage.saveResumeLibrary(library, { origin: "cloud" });
  library = mergeRemoteResumeTemplates(await storage.loadResumeLibrary(), [{ ...acknowledged, revision: 4, profile: { ...acknowledged.profile, experiences: [] } }]);
  await storage.saveResumeLibrary(library, { origin: "cloud" });
  assert.equal((await storage.loadProfile()).experiences.length, 0);
  const detached = detachedApplicationEntries(await storage.loadProfile(), await storage.loadLocalApplicationProfile());
  assert.equal(detached[0].entry.refereeContact, "LOCAL_REFEREE");
  assert.equal(detached[0].entry.salary, "LOCAL_SALARY");

  // Filling records the actual selected resume fields, without private values.
  await storage.recordResumeUsage(masterId, editedForm, "https://jobs.example/apply?token=SECRET", 7);
  const usage = await storage.loadResumeUsage();
  assert.equal(usage.length, 1);
  assert.equal(usage[0].profile.experiences[0].description, "网申的详细职责表达");
  assert.equal(JSON.stringify(usage).includes("LOCAL_"), false);
  assert.equal(usage[0].pageUrl, "https://jobs.example/apply");
  await storage.clearLocalProfileAndResumes();
  assert.equal(JSON.stringify(data).includes("LOCAL_"), false);
  assert.deepEqual(await storage.loadResumeUsage(), []);
});

test("revision conflicts preserve both edits regardless of device clocks; explicit asset removal is honored", () => {
  const profile = candidate();
  const remote = { id: "base", name: "母版", profile: toCloudResumeProfile(profile), revision: 1, createdAt: now, updatedAt: now };
  const [ack] = mergeRemoteResumeTemplates([], [remote]);
  const edited = { ...ack, profile: { ...ack.profile, phone: "LOCAL_EDIT" }, updatedAt: "2099-01-01T00:00:00.000Z" };
  const [conflicted] = mergeRemoteResumeTemplates([edited], [{ ...remote, revision: 2, profile: { ...remote.profile, email: "WEB_EDIT" } }]);
  assert.equal(conflicted.profile.phone, "LOCAL_EDIT");
  assert.equal(conflicted.syncConflict.profile.email, "WEB_EDIT");
  const photo = { id: "photo", kind: "portrait", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", width: 1, height: 1, source: "upload" };
  const document = createResumeDocument({ id: "base", title: "母版", profile, assets: [photo], portraitAssetId: "photo" });
  const [withPhoto] = mergeRemoteResumeTemplates([], [{ ...remote, document }]);
  const [withoutPhoto] = mergeRemoteResumeTemplates([withPhoto], [{ ...remote, revision: 2, document: { ...document, assets: [], portraitAssetId: undefined } }]);
  assert.equal(withoutPhoto.assets?.length || 0, 0);
  assert.equal(withoutPhoto.portraitAssetId, undefined);
});

test("only reviewed versions flow back and updated versions retain historical local snapshots", () => {
  const document = createResumeDocument({ id: "doc", title: "岗位", profile: candidate() });
  const version = { id: "version", tailorTaskId: "task", sourceResumeId: "base", sourceResumeName: "母版", company: "公司", position: "产品经理", document, status: "draft", createdAt: now, updatedAt: now };
  assert.equal(mergeRemoteResumeVersions([], [{ version, revision: 1 }]).length, 0);
  const first = mergeRemoteResumeVersions([], [{ version: { ...version, status: "reviewed" }, revision: 2 }]);
  assert.equal(first[0].kind, "job");
  assert.equal(first[0].cloudVersionRevision, 2);
  const original = structuredClone(first);
  const second = mergeRemoteResumeVersions(first, [{ version: { ...version, status: "reviewed", document: { ...document, profile: { ...document.profile, selfIntroduction: "新版表达" } } }, revision: 3 }]);
  assert.deepEqual(first, original);
  assert.equal(second.length, 2);
  assert.equal(second[0].profile.selfIntroduction, document.profile.selfIntroduction);
  assert.equal(second[1].profile.selfIntroduction, "新版表达");
});
