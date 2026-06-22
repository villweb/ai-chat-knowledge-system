export type CredentialService = "openai_compatible";

export interface CredentialProfile {
  service: CredentialService;
  profile_id: string;
  display_name: string;
}

export interface SessionCredential {
  profile: CredentialProfile;
  api_key: string;
  created_at: string;
}

export interface CredentialProvider {
  getSessionCredential(profile_id: string): Promise<SessionCredential | null>;
  setSessionCredential(credential: SessionCredential): Promise<void>;
  clearSessionCredential(profile_id: string): Promise<void>;
}
