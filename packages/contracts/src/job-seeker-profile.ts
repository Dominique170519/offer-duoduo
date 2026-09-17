import type { JobSeekerProfile } from "@offerflow/domain";

export interface JobSeekerProfileResponse {
  profile: JobSeekerProfile;
}

export type UpdateJobSeekerProfileRequest = Partial<
  Omit<JobSeekerProfile, "userId" | "updatedAt">
>;
