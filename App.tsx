import React, { useState, useEffect, useCallback } from "react";
import type {
  AppUser,
  AuthProvider,
  ProviderGitHubUser,
  ProviderGoogleUser,
  ProviderGitLabUser,
  ProviderAuth0User,
  ProviderLinkedInUser,
  EnhancedOAuthError,
} from "./types";
import { Spinner } from "./components/icons";
import TopMenu from "./components/TopMenu";
import UserInfoDisplay from "./components/UserInfoDisplay";
import HelpModal from "./components/HelpModal";
import LoginScreen from "./components/LoginScreen";
import EnhancedErrorDisplay from "./components/EnhancedErrorDisplay";

const getRedirectUri = () => window.location.origin + window.location.pathname;

const App: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | EnhancedOAuthError | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [hostedAvailability, setHostedAvailability] = useState<
    Partial<Record<AuthProvider, boolean>>
  >({});
  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if (
        (isMac && e.metaKey && e.key.toLowerCase() === "k") ||
        (!isMac && e.ctrlKey && e.key.toLowerCase() === "k")
      ) {
        e.preventDefault();
        const btn = document.querySelector(
          '[aria-label="Open menu"]',
        ) as HTMLButtonElement | null;
        if (btn) btn.click();
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
      }
      if (e.key.toLowerCase() === "g") {
        const tabTriggers = Array.from(
          document.querySelectorAll("button"),
        ).filter(
          (el) =>
            el.textContent?.trim() === "GitHub" ||
            el.textContent?.trim() === "Google" ||
            el.textContent?.trim() === "GitLab" ||
            el.textContent?.trim() === "Auth0" ||
            el.textContent?.trim() === "LinkedIn",
        );
        if (tabTriggers.length >= 2) {
          e.preventDefault();
          (tabTriggers[0] as HTMLButtonElement).click();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Fetch hosted OAuth availability (secrets existence)
  useEffect(() => {
    const loadAvailability = async () => {
      try {
        const resp = await fetch("/api/oauth-hosted/availability");
        if (!resp.ok) return; // don't block UI if this fails
        const data = await resp.json();
        if (data && data.availability) {
          setHostedAvailability(data.availability);
        }
      } catch {}
    };
    loadAvailability();
  }, []);
  const runDiagnostics = async () => {
    try {
      setDiagnostics("Running diagnostics...");
      const resp = await fetch("/api/health");
      if (!resp.ok) {
        setDiagnostics(`Health endpoint error: ${resp.status}`);
        return;
      }
      const data = await resp.json();
      setDiagnostics(`Health OK (uptime: ${Math.round(data.uptime)}s)`);
    } catch (e: any) {
      setDiagnostics(`Diagnostics failed: ${e.message}`);
    }
  };
  const [safeMode, setSafeMode] = useState<boolean>(() => {
    return localStorage.getItem("safe_mode") === "true";
  });
  const toggleSafeMode = () => {
    setSafeMode((v) => {
      const nv = !v;
      localStorage.setItem("safe_mode", String(nv));
      return nv;
    });
  };
  // Imported snapshot (does not affect authenticated state)
  const [importedSnapshot, setImportedSnapshot] = useState<any | null>(null);
  const handleSnapshotImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        setImportedSnapshot(data);
      } catch (e) {
        setError("Invalid snapshot file.");
      }
    };
    reader.readAsText(file);
  };
  const clearSnapshot = () => setImportedSnapshot(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("auth_details");
    setUser(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const fetchUser = useCallback(
    async (token: string, provider: AuthProvider) => {
      setIsLoading(true);
      setError(null);
      try {
        let response: Response;
        if (provider === "github") {
          response = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28",
            },
          });
        } else if (provider === "google") {
          response = await fetch(
            "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
        } else if (provider === "gitlab") {
          response = await fetch("https://gitlab.com/api/v4/user", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } else if (provider === "auth0") {
          // For Auth0, get the domain from previously stored auth_meta
          const metaRaw = localStorage.getItem("auth_meta");
          let auth0Domain = "";
          if (metaRaw) {
            try {
              const meta = JSON.parse(metaRaw);
              auth0Domain = meta.auth0_domain || meta.auth0Domain || "";
            } catch {}
          }
          if (!auth0Domain) {
            throw new Error(
              "Auth0 domain not found. Please log in again with your Auth0 domain.",
            );
          }
          response = await fetch(`https://${auth0Domain}/userinfo`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } else if (provider === "linkedin") {
          // LinkedIn requires separate calls for profile and email
          response = await fetch("https://api.linkedin.com/v2/people/~", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } else {
          throw new Error("Unsupported provider");
        }

        if (!response.ok) {
          if (response.status === 401) {
            handleLogout();
            throw new Error(
              "Your token is invalid or has expired. Please log in again.",
            );
          }
          const errorData = await response.json();
          throw new Error(
            errorData.message || `Error fetching user: ${response.status}`,
          );
        }

        const rawData = await response.json();
        let appUser: AppUser;

        // Token metadata (if previously stored)
        let scopes: string[] | undefined;
        let tokenType: string | undefined;
        let tokenExpiresAt: number | undefined;
        let jwtPayload: Record<string, any> | undefined;
        let refreshToken: string | undefined;
        let idToken: string | undefined;
        try {
          const metaRaw = localStorage.getItem("auth_meta");
          if (metaRaw) {
            const meta = JSON.parse(metaRaw);
            if (meta.scope)
              scopes = String(meta.scope).split(/[ ,]/).filter(Boolean);
            if (meta.token_type) tokenType = meta.token_type;
            if (meta.expires_in && meta.fetched_at)
              tokenExpiresAt = meta.fetched_at + meta.expires_in * 1000;
            if (meta.refresh_token) refreshToken = meta.refresh_token;
            if (meta.id_token) {
              idToken = meta.id_token;
              const parts = meta.id_token.split(".");
              if (parts.length === 3) {
                try {
                  jwtPayload = JSON.parse(
                    atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
                  );
                } catch {}
              }
            }
          }
        } catch {}

        if (provider === "github") {
          const githubUser = rawData as ProviderGitHubUser;
          appUser = {
            provider: "github",
            avatarUrl: githubUser.avatar_url,
            name: githubUser.name,
            email: githubUser.email,
            profileUrl: githubUser.html_url,
            username: githubUser.login,
            rawData: githubUser,
            accessToken: token,
            refreshToken,
            idToken,
            scopes,
            tokenType,
            tokenExpiresAt,
            jwtPayload,
          };
        } else if (provider === "google") {
          const googleUser = rawData as ProviderGoogleUser;
          appUser = {
            provider: "google",
            avatarUrl: googleUser.picture,
            name: googleUser.name,
            email: googleUser.email,
            profileUrl: `https://myaccount.google.com/u/0/?authuser=${googleUser.email}`,
            username: googleUser.email,
            rawData: googleUser,
            accessToken: token,
            refreshToken,
            idToken,
            scopes,
            tokenType,
            tokenExpiresAt,
            jwtPayload,
          };
        } else if (provider === "gitlab") {
          const gitlabUser = rawData as ProviderGitLabUser;
          appUser = {
            provider: "gitlab",
            avatarUrl: gitlabUser.avatar_url,
            name: gitlabUser.name,
            email: gitlabUser.email,
            profileUrl: gitlabUser.web_url,
            username: gitlabUser.username,
            rawData: gitlabUser,
            accessToken: token,
            refreshToken,
            idToken,
            scopes,
            tokenType,
            tokenExpiresAt,
            jwtPayload,
          };
        } else if (provider === "auth0") {
          const auth0User = rawData as ProviderAuth0User;
          appUser = {
            provider: "auth0",
            avatarUrl: auth0User.picture || "",
            name: auth0User.name,
            email: auth0User.email,
            profileUrl: auth0User.profile || "",
            username:
              auth0User.preferred_username ||
              auth0User.nickname ||
              auth0User.email ||
              auth0User.sub,
            rawData: auth0User,
            accessToken: token,
            refreshToken,
            idToken,
            scopes,
            tokenType,
            tokenExpiresAt,
            jwtPayload,
          };
        } else if (provider === "linkedin") {
          const linkedinUser = rawData as ProviderLinkedInUser;
          const firstName =
            Object.values(linkedinUser.firstName.localized)[0] || "";
          const lastName =
            Object.values(linkedinUser.lastName.localized)[0] || "";

          // Fetch email separately for LinkedIn
          let email: string | null = null;
          try {
            const emailResponse = await fetch(
              "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            );
            if (emailResponse.ok) {
              const emailData = await emailResponse.json();
              if (emailData.elements && emailData.elements.length > 0) {
                email = emailData.elements[0]["handle~"]?.emailAddress || null;
              }
            }
          } catch (emailError) {
            // Email fetch failed, continue without email
            console.warn("Failed to fetch LinkedIn email:", emailError);
          }

          appUser = {
            provider: "linkedin",
            avatarUrl: linkedinUser.profilePicture?.displayImage || "",
            name: `${firstName} ${lastName}`.trim(),
            email: email,
            profileUrl: `https://www.linkedin.com/in/profile-${linkedinUser.id}`,
            username: linkedinUser.id,
            rawData: { ...linkedinUser, emailAddress: email },
            accessToken: token,
            refreshToken,
            idToken,
            scopes,
            tokenType,
            tokenExpiresAt,
            jwtPayload,
          };
        } else {
          throw new Error("Provider mapping failed.");
        }

        setUser(appUser);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [handleLogout],
  );

  const exchangeCodeForToken = useCallback(
    async (code: string, provider: AuthProvider, isHosted = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const requestBody: any = {
          code,
          provider,
          isHosted,
          redirectUri: getRedirectUri(),
        };

        if (!isHosted) {
          const credsString = sessionStorage.getItem("oauth_credentials");
          sessionStorage.removeItem("oauth_credentials");
          if (!credsString) {
            throw new Error(
              "Could not find OAuth credentials. Please try logging in again.",
            );
          }
          const creds = JSON.parse(credsString);
          requestBody.clientId = creds.clientId;
          requestBody.clientSecret = creds.clientSecret;
          if (creds.auth0Domain) {
            requestBody.auth0Domain = creds.auth0Domain;
          }
        }

        const response = await fetch("/api/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();
        let data;

        try {
          data = JSON.parse(responseText);
        } catch (e) {
          if (e instanceof SyntaxError) {
            if (
              responseText.trim().toLowerCase().startsWith("<!doctype html")
            ) {
              throw new Error(
                "Received HTML instead of JSON. This likely means the backend for token exchange is not running or is misconfigured.",
              );
            }
            throw new Error(
              "Received an invalid JSON response from the server.",
            );
          }
          throw e;
        }

        if (!response.ok) {
          // If we received an enhanced OAuth error, preserve it
          if (data.guide) {
            setError(data);
            setIsLoading(false);
            return;
          }

          throw new Error(
            data.error ||
              data.message ||
              "Token exchange failed on the server.",
          );
        }

        const {
          access_token,
          scope,
          expires_in,
          token_type,
          id_token,
          refresh_token,
          auth0_domain,
        } = data;
        if (!access_token) {
          throw new Error("Access token not found in server response.");
        }

        localStorage.setItem(
          "auth_details",
          JSON.stringify({ token: access_token, provider }),
        );
        localStorage.setItem(
          "auth_meta",
          JSON.stringify({
            scope,
            expires_in,
            token_type,
            id_token,
            refresh_token,
            fetched_at: Date.now(),
            auth0_domain,
          }),
        );
        await fetchUser(access_token, provider);
      } catch (err: any) {
        // Don't override enhanced OAuth errors that were already set
        if (error && typeof error === "object" && error.guide) {
          return;
        }
        setError(`Failed to authenticate: ${err.message}`);
        setIsLoading(false);
      }
    },
    [fetchUser],
  );

  const handleAuthCallback = useCallback(
    async (code: string, state: string) => {
      const isHosted = state.endsWith("-hosted");
      const provider = (
        isHosted ? state.replace("-hosted", "") : state
      ) as AuthProvider;
      window.history.replaceState({}, document.title, window.location.pathname);
      await exchangeCodeForToken(code, provider, isHosted);
    },
    [exchangeCodeForToken],
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const storedAuth = localStorage.getItem("auth_details");

    if (code && state) {
      handleAuthCallback(code, state);
    } else if (storedAuth) {
      try {
        const { token, provider } = JSON.parse(storedAuth);
        if (token && provider) {
          fetchUser(token, provider);
        } else {
          setIsLoading(false);
        }
      } catch {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, [handleAuthCallback, fetchUser]);
  const handleOAuthLogin = (
    provider: AuthProvider,
    clientId: string,
    clientSecret: string,
    auth0Domain?: string,
    scopes?: string,
  ) => {
    if (!clientId || !clientSecret) {
      setError(`Please provide a Client ID and Client Secret for ${provider}.`);
      return;
    }
    if (provider === "auth0" && !auth0Domain) {
      setError("Please provide an Auth0 domain.");
      return;
    }
    setError(null);

    // Store credentials in sessionStorage to retrieve after redirect
    const credentials: any = { clientId, clientSecret };
    if (auth0Domain) credentials.auth0Domain = auth0Domain;
    sessionStorage.setItem("oauth_credentials", JSON.stringify(credentials));

    let authUrl = "";
    const redirectUri = getRedirectUri();

    if (provider === "github") {
      const scope = scopes || "read:user,user:email";
      authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=github`;
    } else if (provider === "google") {
      const scope =
        scopes ||
        "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=google`;
    } else if (provider === "gitlab") {
      const scope = scopes || "read_user";
      authUrl = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=gitlab`;
    } else if (provider === "auth0") {
      const scope = scopes || "openid profile email";
      authUrl = `https://${auth0Domain}/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=auth0`;
    } else if (provider === "linkedin") {
      const scope = scopes || "r_liteprofile r_emailaddress";
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=linkedin`;
    }
    window.location.href = authUrl;
  };

  const handlePatSubmit = async (pat: string) => {
    if (!pat) {
      setError("Please provide a Personal Access Token.");
      return;
    }
    localStorage.setItem(
      "auth_details",
      JSON.stringify({ token: pat, provider: "github" }),
    );
    await fetchUser(pat, "github");
  };

  const handleGcloudTokenSubmit = async (token: string) => {
    if (!token) {
      setError("Please provide a Google CLI token.");
      return;
    }
    localStorage.setItem(
      "auth_details",
      JSON.stringify({ token: token, provider: "google" }),
    );
    await fetchUser(token, "google");
  };

  const handleHostedOAuthLogin = async (
    provider: AuthProvider,
    scopes?: string,
  ) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/oauth-hosted/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          redirectUri: getRedirectUri(),
          scopes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Failed to initialize hosted OAuth.",
        );
      }

      if (!data.authUrl) {
        throw new Error("Authorization URL not received from server.");
      }

      // Redirect to OAuth provider
      window.location.href = data.authUrl;
    } catch (err: any) {
      setError(`Failed to start hosted OAuth: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleTokenRefresh = async () => {
    if (!user || !user.refreshToken) {
      setError("No refresh token available for this session.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get stored credentials for non-hosted flow or use hosted flag
      const metaRaw = localStorage.getItem("auth_meta");
      let isHosted = false;
      let clientId = "";
      let clientSecret = "";
      let auth0Domain = "";

      // Try to determine if this was a hosted OAuth session
      // For simplicity, we'll try hosted first, then fall back to stored credentials
      try {
        const response = await fetch("/api/oauth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: user.provider,
            refreshToken: user.refreshToken,
            isHosted: true,
          }),
        });

        if (response.ok) {
          const tokenData = await response.json();
          await handleRefreshSuccess(tokenData);
          return;
        }
      } catch (hostedError) {
        // Hosted refresh failed, try with stored credentials
      }

      // Try with stored credentials if available
      const credsString = sessionStorage.getItem("oauth_credentials");
      if (credsString) {
        const creds = JSON.parse(credsString);
        const response = await fetch("/api/oauth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: user.provider,
            refreshToken: user.refreshToken,
            isHosted: false,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            auth0Domain: creds.auth0Domain,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          // If we received an enhanced OAuth error, preserve it
          if (errorData.guide) {
            setError(errorData);
            setIsLoading(false);
            return;
          }
          throw new Error(errorData.error || "Failed to refresh token");
        }

        const tokenData = await response.json();
        await handleRefreshSuccess(tokenData);
      } else {
        throw new Error(
          "No OAuth credentials available for token refresh. This session may have been started with hosted OAuth.",
        );
      }
    } catch (err: any) {
      setError(`Token refresh failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshSuccess = async (tokenData: any) => {
    const {
      access_token,
      refresh_token,
      expires_in,
      token_type,
      scope,
      id_token,
    } = tokenData;

    if (!access_token) {
      throw new Error("No access token received from refresh");
    }

    // Update stored tokens
    localStorage.setItem(
      "auth_details",
      JSON.stringify({ token: access_token, provider: user!.provider }),
    );

    // Update metadata with new tokens
    const currentMeta = JSON.parse(localStorage.getItem("auth_meta") || "{}");
    const updatedMeta = {
      ...currentMeta,
      ...(refresh_token && { refresh_token }),
      ...(expires_in && { expires_in }),
      ...(token_type && { token_type }),
      ...(scope && { scope }),
      ...(id_token && { id_token }),
      fetched_at: Date.now(),
    };

    localStorage.setItem("auth_meta", JSON.stringify(updatedMeta));

    // Refresh user data with new token
    await fetchUser(access_token, user!.provider);
  };

  const handleTokenRevocation = async () => {
    if (!user || !user.accessToken) {
      setError("No access token available to revoke.");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to revoke your access token? This will log you out.",
      )
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Try hosted revocation first
      try {
        const response = await fetch("/api/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: user.provider,
            token: user.accessToken,
            tokenTypeHint: "access_token",
            isHosted: true,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            handleLogout();
            setError(null);
            alert(result.message || "Token revoked successfully!");
            return;
          }
        }
      } catch (hostedError) {
        // Hosted revocation failed, try with stored credentials
      }

      // Try with stored credentials if available
      const credsString = sessionStorage.getItem("oauth_credentials");
      if (credsString) {
        const creds = JSON.parse(credsString);
        const response = await fetch("/api/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: user.provider,
            token: user.accessToken,
            tokenTypeHint: "access_token",
            isHosted: false,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            auth0Domain: creds.auth0Domain,
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          handleLogout();
          setError(null);
          alert(result.message || "Token revoked successfully!");
        } else {
          throw new Error(result.error || "Failed to revoke token");
        }
      } else {
        // For providers like LinkedIn that don't support revocation, just log out locally
        handleLogout();
        setError(null);
        alert(
          "Session ended locally. Some providers don't support token revocation.",
        );
      }
    } catch (err: any) {
      setError(`Token revocation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Development-only function to create a sample user with JWT tokens for testing
  const createSampleTokenDemo = () => {
    // Sample JWT tokens for demonstration (these are NOT real tokens)
    const sampleAccessToken = "ghp_1234567890abcdefghijklmnopqrstuvwxyz12"; // GitHub PAT format
    // Create a JWT with very long URLs and values to test layout breaking
    const longPictureUrl =
      "https://images.very-long-domain-name-for-testing-layout-breaking-scenarios.com/user-profile-pictures/high-resolution-avatars/subfolder/another-subfolder/yet-another-very-long-folder-name/final-destination-folder-with-extremely-long-name/user-avatar-image-with-very-long-filename-that-should-break-layout-if-not-properly-handled.jpg?version=2024&size=large&quality=high&cache-buster=1234567890abcdefghijklmnopqrstuvwxyz&extra-param=another-very-long-parameter-value-to-make-this-url-even-longer";
    const longProfileUrl =
      "https://social-media-platform-with-extremely-long-domain-name-for-testing.com/profiles/users/detailed-view/with-many-query-parameters/user-profile-page?user_id=1234567890&display_mode=full&include_details=true&show_activity=true&theme=dark&language=en-US&timezone=America/New_York&format=json&api_version=v2.1&include_permissions=true&show_preferences=true&extra_data=true&debug_mode=false&cache_control=no-cache";

    const longJwtPayload = {
      iss: "https://very-long-issuer-domain-name-for-testing-jwt-layout-breaking.com",
      aud: "extremely-long-audience-client-id-that-should-cause-layout-issues-if-not-properly-handled-with-css-constraints",
      sub: "user123",
      email:
        "john.doe.with.very.long.email.address@extremely-long-domain-name-for-testing-layout-scenarios.com",
      email_verified: true,
      name: "John Doe with Very Long Name That Should Test Text Wrapping",
      picture: longPictureUrl,
      profile: longProfileUrl,
      iat: 1725390400,
      exp: 1725394000,
      nbf: 1725390400,
      scope:
        "openid email profile read:user read:repositories write:repositories admin:org admin:public_key admin:repo_hook admin:org_hook gist notifications user:email user:follow delete_repo write:discussion read:discussion",
      custom_claim_with_long_name:
        "this-is-a-very-long-custom-claim-value-that-contains-no-spaces-and-should-test-word-breaking-behavior-in-the-jwt-display-component",
      another_long_url:
        "https://api.service-with-very-long-name.com/v1/endpoints/with/many/path/segments/that/go/on/and/on/user/profile/data/extended/information/detailed/view?access_token=very_long_access_token_value_1234567890abcdefghijklmnopqrstuvwxyz&refresh_token=another_long_token_value&scope=full_access&client_id=long_client_identifier&redirect_uri=https://callback.url.with.long.domain.name.com/oauth/callback",
    };

    // Create a JWT token with the long payload
    const header = { alg: "RS256", typ: "JWT", kid: "123" };
    const encodedHeader = btoa(JSON.stringify(header))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const encodedPayload = btoa(JSON.stringify(longJwtPayload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const sampleIdToken = `${encodedHeader}.${encodedPayload}.example-signature-not-real-but-very-long-to-test-layout-breaking-scenarios`;

    const sampleRefreshToken =
      "refresh_token_with_very_long_value_1234567890abcdefghijklmnopqrstuvwxyz_additional_suffix_to_make_it_longer";

    const sampleUser: AppUser = {
      provider: "google",
      avatarUrl: longPictureUrl,
      name: "Demo User",
      email: "demo@example.com",
      profileUrl: "https://example.com/profile/demo",
      username: "demo",
      rawData: {
        id: "demo123",
        email: "demo@example.com",
        verified_email: true,
        name: "Demo User",
        given_name: "Demo",
        family_name: "User",
        picture: longPictureUrl,
        locale: "en",
      },
      accessToken: sampleAccessToken,
      idToken: sampleIdToken,
      refreshToken: sampleRefreshToken,
      scopes: ["openid", "email", "profile"],
      tokenType: "Bearer",
      tokenExpiresAt: Date.now() + 3600000, // 1 hour from now
      jwtPayload: longJwtPayload,
    };

    setUser(sampleUser);
    setError(null);
    setIsLoading(false);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-6" aria-label="Loading skeleton">
          <div className="h-6 w-48 bg-slate-700/50 rounded animate-pulse" />
          <div className="h-40 bg-slate-800/50 rounded border border-slate-700 animate-pulse" />
          <div className="h-10 bg-slate-700/50 rounded animate-pulse" />
        </div>
      );
    }

    if (user) {
      return (
        <>
          <UserInfoDisplay
            user={user}
            safeMode={safeMode}
            importedSnapshot={importedSnapshot}
            onTokenRefresh={handleTokenRefresh}
            onTokenRevocation={handleTokenRevocation}
          />
        </>
      );
    }
    return (
      <div className="w-full">
        {importedSnapshot && (
          <div className="mb-6 p-4 border border-slate-600 rounded-lg bg-slate-800/60 text-xs text-slate-300">
            <p className="font-semibold mb-2">Imported Snapshot Preview</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(importedSnapshot, null, 2)}
            </pre>
            <p className="mt-2 text-slate-400">
              Authenticate to compare snapshot with live user data.
            </p>
          </div>
        )}
        <LoginScreen
          onOAuthLogin={handleOAuthLogin}
          onPatLogin={handlePatSubmit}
          onGcloudTokenLogin={handleGcloudTokenSubmit}
          onHostedOAuthLogin={handleHostedOAuthLogin}
          isLoading={isLoading}
          hostedAvailability={hostedAvailability}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-200">
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/60 bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60/90">
        <div className="mx-auto max-w-full px-4 py-3 flex justify-end">
          <TopMenu
            userLoggedIn={!!user}
            importedSnapshot={importedSnapshot}
            onImportSnapshot={handleSnapshotImport}
            onClearSnapshot={clearSnapshot}
            onToggleSafeMode={toggleSafeMode}
            safeMode={safeMode}
            onLogout={handleLogout}
            onShowHelp={() => setShowHelp(true)}
            runDiagnostics={runDiagnostics}
            hasError={!!error}
          />
        </div>
      </header>
      <main className="flex-1 w-full py-8">
        {error && (
          <EnhancedErrorDisplay
            error={error}
            onDiagnose={runDiagnostics}
            onDismiss={() => setError(null)}
            diagnostics={diagnostics}
          />
        )}
        <div className="mx-auto max-w-4xl px-4">
          <div className="mx-auto max-w-4xl">{renderContent()}</div>
        </div>
      </main>
      <footer className="w-full border-t border-slate-800/60 mt-8">
        <div className="mx-auto max-w-4xl px-4 py-6 text-center text-sm text-slate-600 flex flex-col items-center gap-2">
          <p>Built for demonstration and troubleshooting.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
            >
              Help & Shortcuts
            </button>
            {process.env.NODE_ENV === "development" && (
              <button
                onClick={createSampleTokenDemo}
                className="text-xs px-3 py-1.5 rounded-md border border-emerald-600 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-700/20"
                title="Demo the enhanced token display with sample JWT tokens"
              >
                Demo Token Display
              </button>
            )}
          </div>
        </div>
      </footer>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};

export default App;
