import React, { useState, useEffect, useCallback } from "react";
import type {
  AppUser,
  AuthProvider,
  ProviderGitHubUser,
  ProviderGoogleUser,
  ProviderGitLabUser,
  ProviderAuth0User,
  ProviderLinkedInUser,
} from "./types";
import { Spinner } from "./components/icons";
import TopMenu from "./components/TopMenu";
import UserInfoDisplay from "./components/UserInfoDisplay";
import HelpModal from "./components/HelpModal";
import LoginScreen from "./components/LoginScreen";

const getRedirectUri = () => window.location.origin + window.location.pathname;

const App: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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
          // For Auth0, we need to get the domain from stored credentials
          const credentialsRaw = sessionStorage.getItem("oauth_credentials");
          let auth0Domain = "";
          if (credentialsRaw) {
            try {
              const credentials = JSON.parse(credentialsRaw);
              auth0Domain = credentials.auth0Domain;
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
        try {
          const metaRaw = localStorage.getItem("auth_meta");
          if (metaRaw) {
            const meta = JSON.parse(metaRaw);
            if (meta.scope)
              scopes = String(meta.scope).split(/[ ,]/).filter(Boolean);
            if (meta.token_type) tokenType = meta.token_type;
            if (meta.expires_in && meta.fetched_at)
              tokenExpiresAt = meta.fetched_at + meta.expires_in * 1000;
            if (meta.id_token) {
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
          }),
        );
        await fetchUser(access_token, provider);
      } catch (err: any) {
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
      const scope = "read:user,user:email";
      authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=github`;
    } else if (provider === "google") {
      const scope =
        "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=google`;
    } else if (provider === "gitlab") {
      const scope = "read_user";
      authUrl = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=gitlab`;
    } else if (provider === "auth0") {
      const scope = "openid profile email";
      authUrl = `https://${auth0Domain}/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=auth0`;
    } else if (provider === "linkedin") {
      const scope = "r_liteprofile r_emailaddress";
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

  const handleHostedOAuthLogin = async (provider: AuthProvider) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/oauth-hosted/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          redirectUri: getRedirectUri(),
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
        <div className="mx-auto max-w-4xl px-4 py-3 flex justify-end">
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
          <div
            className="w-full p-4 mb-6 bg-red-900/40 border border-red-500/40 text-red-300 rounded-lg space-y-2"
            role="alert"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold">Error</p>
                <p>{error}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={runDiagnostics}
                  className="px-3 py-1.5 text-xs rounded-md border border-red-400/40 bg-red-800/40 hover:bg-red-800/60 text-red-200"
                >
                  Diagnose
                </button>
                <button
                  onClick={() => setError(null)}
                  className="px-3 py-1.5 text-xs rounded-md border border-red-400/40 bg-red-800/40 hover:bg-red-800/60 text-red-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
            {diagnostics && (
              <p className="text-xs text-red-200/80">{diagnostics}</p>
            )}
          </div>
        )}
        <div className="mx-auto max-w-4xl px-4">
          <div className="mx-auto max-w-2xl">{renderContent()}</div>
        </div>
      </main>
      <footer className="w-full border-t border-slate-800/60 mt-8">
        <div className="mx-auto max-w-4xl px-4 py-6 text-center text-sm text-slate-600 flex flex-col items-center gap-2">
          <p>Built for demonstration and troubleshooting.</p>
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          >
            Help & Shortcuts
          </button>
        </div>
      </footer>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};

export default App;
