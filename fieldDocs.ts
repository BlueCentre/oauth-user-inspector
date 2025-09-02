// Field documentation metadata for provider user profile fields
// Minimal initial set; can be expanded iteratively.

export interface FieldDoc {
  description: string;
  docsUrl?: string;
  provider?: string; // specific provider if set
}

// Generic field docs (apply across providers when names match)
const generic: Record<string, FieldDoc> = {
  id: {
    description:
      "Unique numeric identifier for the user in the provider system.",
  },
  login: {
    description: "Primary username / handle used for login and profile URLs.",
  },
  name: { description: "Display name set by the user." },
  email: {
    description: "Publicly visible email address (may be null if not public).",
  },
  avatar_url: { description: "URL to the user's avatar image." },
  created_at: {
    description: "Timestamp indicating when the account was created.",
  },
  updated_at: { description: "Timestamp of the most recent profile update." },
  public_repos: {
    description: "Count of public repositories owned by the user.",
  },
  followers: { description: "Number of users following this account." },
  following: { description: "Number of users this account follows." },
  location: { description: "User-provided location string." },
  bio: { description: "User biography / profile summary." },
  company: {
    description: "User-provided company or organization affiliation.",
  },
  blog: { description: "User-provided website or blog URL." },
  twitter_username: {
    description: "Associated Twitter / X username if provided.",
  },
};

// Provider specific overrides or additions
const github: Record<string, FieldDoc> = {
  node_id: {
    description: "Global node identifier used in GitHub's GraphQL (Relay) API.",
    provider: "github",
  },
  gravatar_id: {
    description: "Legacy Gravatar identifier (often empty).",
    provider: "github",
  },
  site_admin: {
    description:
      "True if this account is a GitHub staff member (site administrator).",
    provider: "github",
  },
  type: {
    description: "Account type (e.g., User or Organization).",
    provider: "github",
  },
};

export const providerDocs: Record<string, Record<string, FieldDoc>> = {
  github,
  // google: {...} // placeholder for potential future provider-specific fields
};

export function getFieldDoc(
  provider: string,
  field: string,
): FieldDoc | undefined {
  const p = providerDocs[provider] || {};
  return p[field] || generic[field];
}
