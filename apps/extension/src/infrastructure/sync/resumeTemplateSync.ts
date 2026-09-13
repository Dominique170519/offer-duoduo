import type { ResumeTemplateRecord, ResumeVersionRecord } from "@offerflow/contracts";
import { DEFAULT_RESUME_TEMPLATE, mergeCloudResumeProfile, toCloudResumeProfile, toCloudResumeAssets } from "@offerflow/domain";
import type { StoredResume } from "../storage/storage.ts";

export function resumeSyncFingerprint(resume: Pick<StoredResume, "name" | "profile" | "assets" | "portraitAssetId" | "template"> | ResumeTemplateRecord): string {
  const local = resume as StoredResume;
  const document = (resume as ResumeTemplateRecord).document;
  return JSON.stringify({ name: resume.name, profile: toCloudResumeProfile(resume.profile), assets: toCloudResumeAssets(document ? document.assets : local.assets), portraitAssetId: (document ? document.portraitAssetId : local.portraitAssetId) || "", template: document?.template || local.template || DEFAULT_RESUME_TEMPLATE });
}

/** Revision + last acknowledged content, never a device clock, decides whether
 * a remote write can replace local work. Conflicts retain both candidates. */
export function mergeRemoteResumeTemplates(
  library: StoredResume[],
  remoteTemplates: ResumeTemplateRecord[]
): StoredResume[] {
  const merged = new Map(library.map((resume) => [resume.id, resume]));

  for (const remote of remoteTemplates) {
    const current = merged.get(remote.id);
    if (remote.deletedAt) {
      if (current?.cloudBaseline && resumeSyncFingerprint(current) !== current.cloudBaseline) {
        merged.set(remote.id, { ...current, syncConflict: remote });
        continue;
      }
      merged.delete(remote.id);
      continue;
    }
    if (current && remote.revision !== undefined && resumeSyncFingerprint(current) !== resumeSyncFingerprint(remote)) {
      const dirty = !current.cloudBaseline || resumeSyncFingerprint(current) !== current.cloudBaseline;
      if (dirty) {
        if (current.cloudRevision === remote.revision && !current.syncConflict) continue;
        merged.set(remote.id, { ...current, syncConflict: remote });
        continue;
      }
    }
    // Compatibility for an old server; new servers always return revision.
    if (remote.revision === undefined && current && current.updatedAt.localeCompare(remote.updatedAt) > 0) continue;
    const remoteDocument = remote.document;
    merged.set(remote.id, {
      ...current,
      id: remote.id,
      name: remote.name,
      cloudRevision: remote.revision ?? 1,
      cloudBaseline: resumeSyncFingerprint(remote),
      syncConflict: undefined,
      kind: "base",
      versionNumber: current?.versionNumber || 1,
      lifecycleStatus: "active",
      sourceFileName: remote.sourceFileName || current?.sourceFileName,
      profile: mergeCloudResumeProfile(current?.profile, remote.profile),
      assets: remoteDocument ? remoteDocument.assets : current?.assets,
      portraitAssetId: remoteDocument ? remoteDocument.portraitAssetId : current?.portraitAssetId,
      template: remoteDocument?.template || current?.template,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
      lastUsedAt: current?.lastUsedAt
    });
  }

  return [...merged.values()];
}

export function mergeRemoteResumeVersions(library: StoredResume[], versions: ResumeVersionRecord[]): StoredResume[] {
  const available = new Set(versions.map(item => item.version.id));
  const next = structuredClone(library).filter(resume => !resume.cloudVersionId || available.has(resume.cloudVersionId));
  for (const { version, revision } of versions) {
    if (!["reviewed", "exported", "applied"].includes(version.status)) continue;
    const existing = next.find(resume => resume.cloudVersionId === version.id);
    if (existing?.cloudVersionRevision === revision) continue;
    // Keep an older locally edited/used snapshot when the web version changes.
    if (existing) {
      existing.cloudVersionId = undefined;
      existing.name = `${existing.name}（历史版本）`;
    }
    next.push({
      id: `cloud_${version.id}_${revision}`,
      name: `${version.company} · ${version.position}`,
      kind: "job", parentResumeId: version.sourceResumeId,
      cloudVersionId: version.id, cloudVersionRevision: revision,
      applicationId: version.applicationId, tailorTaskId: version.tailorTaskId,
      template: version.document.template, jobSnapshot: version.jobSnapshot,
      company: version.company, position: version.position,
      profile: mergeCloudResumeProfile(undefined, version.document.profile),
      assets: version.document.assets, portraitAssetId: version.document.portraitAssetId,
      createdAt: version.createdAt, updatedAt: version.updatedAt,
      lifecycleStatus: "active"
    });
  }
  return next;
}
