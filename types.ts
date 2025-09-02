// This is the raw user object returned by the GitHub API
export interface ProviderGitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  private_gists?: number;
  total_private_repos?: number;
  owned_private_repos?: number;
  disk_usage?: number;
  collaborators?: number;
  two_factor_authentication?: boolean;
  plan?: {
    name: string;
    space: number;
    collaborators: number;
    private_repos: number;
  };
}

// This is the raw user object returned by the Google API
export interface ProviderGoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}

export type AuthProvider = "github" | "google";

// This is the unified user object used throughout the application
export interface AppUser {
  provider: AuthProvider;
  avatarUrl: string;
  name: string | null;
  email: string | null;
  profileUrl: string;
  username: string;
  rawData: object;
  accessToken?: string; // Add access token
  idToken?: string; // Add ID token
  refreshToken?: string; // Add refresh token
  scopes?: string[]; // OAuth scopes (if available)
  tokenType?: string; // e.g., bearer
  tokenExpiresAt?: number; // epoch ms if known
  jwtPayload?: Record<string, any>; // decoded JWT if token is JWT
}
