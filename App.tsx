import React, { useState, useEffect, useCallback } from 'react';
import type { AppUser, AuthProvider, ProviderGitHubUser, ProviderGoogleUser } from './types';
import { Spinner } from './components/icons';
import UserInfoDisplay from './components/UserInfoDisplay';
import HelpModal from './components/HelpModal';
import LoginScreen from './components/LoginScreen';

const getRedirectUri = () => window.location.origin + window.location.pathname;

const App: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const runDiagnostics = async () => {
    try {
      setDiagnostics('Running diagnostics...');
      const resp = await fetch('/api/health');
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
    return localStorage.getItem('safe_mode') === 'true';
  });
  const toggleSafeMode = () => {
    setSafeMode(v => {
      const nv = !v; localStorage.setItem('safe_mode', String(nv)); return nv; });
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
        setError('Invalid snapshot file.');
      }
    };
    reader.readAsText(file);
  };
  const clearSnapshot = () => setImportedSnapshot(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('auth_details');
    setUser(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const fetchUser = useCallback(async (token: string, provider: AuthProvider) => {
    setIsLoading(true);
    setError(null);
    try {
      let response: Response;
      if (provider === 'github') {
        response = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
      } else if (provider === 'google') {
         response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } else {
        throw new Error('Unsupported provider');
      }

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          throw new Error('Your token is invalid or has expired. Please log in again.');
        }
        const errorData = await response.json();
        throw new Error(errorData.message || `Error fetching user: ${response.status}`);
      }
      
      const rawData = await response.json();
      let appUser: AppUser;

      if (provider === 'github') {
          const githubUser = rawData as ProviderGitHubUser;
          appUser = {
              provider: 'github',
              avatarUrl: githubUser.avatar_url,
              name: githubUser.name,
              email: githubUser.email,
              profileUrl: githubUser.html_url,
              username: githubUser.login,
        rawData: githubUser,
        accessToken: token,
          };
      } else if (provider === 'google') {
          const googleUser = rawData as ProviderGoogleUser;
          appUser = {
              provider: 'google',
              avatarUrl: googleUser.picture,
              name: googleUser.name,
              email: googleUser.email,
              profileUrl: `https://myaccount.google.com/u/0/?authuser=${googleUser.email}`,
              username: googleUser.email,
        rawData: googleUser,
        accessToken: token,
          };
      } else {
          // Should not happen
          throw new Error('Provider mapping failed.');
      }
      setUser(appUser);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [handleLogout]);

  const exchangeCodeForToken = useCallback(async (code: string, provider: AuthProvider, isHosted = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const requestBody: any = { 
        code, 
        provider, 
        isHosted, 
        redirectUri: getRedirectUri() 
      };

      if (!isHosted) {
        const credsString = sessionStorage.getItem('oauth_credentials');
        sessionStorage.removeItem('oauth_credentials');
        if (!credsString) {
          throw new Error("Could not find OAuth credentials. Please try logging in again.");
        }
        const { clientId, clientSecret } = JSON.parse(credsString);
        requestBody.clientId = clientId;
        requestBody.clientSecret = clientSecret;
      }

      const response = await fetch('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (e) {
        if (e instanceof SyntaxError) {
          if (responseText.trim().toLowerCase().startsWith('<!doctype html')) {
            throw new Error("Received HTML instead of JSON. This likely means the backend for token exchange is not running or is misconfigured.");
          }
          throw new Error("Received an invalid JSON response from the server.");
        }
        throw e;
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Token exchange failed on the server.');
      }

      const { access_token } = data;
      if (!access_token) {
        throw new Error('Access token not found in server response.');
      }

      localStorage.setItem('auth_details', JSON.stringify({ token: access_token, provider }));
      await fetchUser(access_token, provider);

    } catch (err: any) {
      setError(`Failed to authenticate: ${err.message}`);
      setIsLoading(false);
    }
  }, [fetchUser]);

  const handleAuthCallback = useCallback(async (code: string, state: string) => {
    const isHosted = state.endsWith('-hosted');
    const provider = (isHosted ? state.replace('-hosted', '') : state) as AuthProvider;
    window.history.replaceState({}, document.title, window.location.pathname);
    await exchangeCodeForToken(code, provider, isHosted);
  }, [exchangeCodeForToken]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const storedAuth = localStorage.getItem('auth_details');

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
  
  const handleOAuthLogin = (provider: AuthProvider, clientId: string, clientSecret: string) => {
    if (!clientId || !clientSecret) {
      setError(`Please provide a Client ID and Client Secret for ${provider}.`);
      return;
    }
    setError(null);
    
    // Store credentials in sessionStorage to retrieve after redirect
    sessionStorage.setItem('oauth_credentials', JSON.stringify({ clientId, clientSecret }));
    
    let authUrl = '';
    const redirectUri = getRedirectUri();
    
    if (provider === 'github') {
      const scope = 'read:user,user:email';
      authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=github`;
    } else if (provider === 'google') {
      const scope = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=google`;
    }
    window.location.href = authUrl;
  };

  const handlePatSubmit = async (pat: string) => {
    if (!pat) {
      setError('Please provide a Personal Access Token.');
      return;
    }
    localStorage.setItem('auth_details', JSON.stringify({ token: pat, provider: 'github' }));
    await fetchUser(pat, 'github');
  };

  const handleGcloudTokenSubmit = async (token: string) => {
    if (!token) {
      setError('Please provide a Google CLI token.');
      return;
    }
    localStorage.setItem('auth_details', JSON.stringify({ token: token, provider: 'google' }));
    await fetchUser(token, 'google');
  };

  const handleHostedOAuthLogin = async (provider: AuthProvider) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/oauth-hosted/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          redirectUri: getRedirectUri()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to initialize hosted OAuth.');
      }

      if (!data.authUrl) {
        throw new Error('Authorization URL not received from server.');
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
        <div className="flex flex-col items-center justify-center text-slate-400">
          <Spinner className="w-10 h-10 mb-4" />
          <p>Loading...</p>
        </div>
      );
    }
    
    if (user) {
      return (
        <>
          <div className="w-full flex justify-end mb-4">
            <div className="flex items-center gap-2 mr-auto">
              <label className="text-xs px-3 py-1.5 rounded-md border border-slate-600 bg-slate-800/60 text-slate-300 cursor-pointer hover:bg-slate-700 transition-colors">
                Import Snapshot
                <input type="file" accept="application/json" className="hidden" onChange={e => e.target.files && e.target.files[0] && handleSnapshotImport(e.target.files[0])} />
              </label>
              {importedSnapshot && (
                <button onClick={clearSnapshot} className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700">Clear Snapshot</button>
              )}
            </div>
            <button
              onClick={toggleSafeMode}
              className={`mr-3 px-4 py-2 border text-sm font-medium rounded-md transition-all ${safeMode ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
              title="Mask personally identifiable data"
            >
              {safeMode ? 'Safe Mode On' : 'Safe Mode Off'}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-slate-600 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all"
            >
              Logout
            </button>
          </div>
          <UserInfoDisplay user={user} safeMode={safeMode} importedSnapshot={importedSnapshot} />
        </>
      );
    }
    
    return (
      <div className="w-full">
        <div className="flex justify-end mb-6">
          <label className="text-xs px-3 py-1.5 rounded-md border border-slate-600 bg-slate-800/60 text-slate-300 cursor-pointer hover:bg-slate-700 transition-colors">
            Import Snapshot
            <input type="file" accept="application/json" className="hidden" onChange={e => e.target.files && e.target.files[0] && handleSnapshotImport(e.target.files[0])} />
          </label>
        </div>
        {importedSnapshot && (
          <div className="mb-6 p-4 border border-slate-600 rounded-lg bg-slate-800/60 text-xs text-slate-300">
            <p className="font-semibold mb-2">Imported Snapshot Preview</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(importedSnapshot, null, 2)}</pre>
            <p className="mt-2 text-slate-400">Authenticate to compare snapshot with live user data.</p>
          </div>
        )}
        <LoginScreen onOAuthLogin={handleOAuthLogin} onPatLogin={handlePatSubmit} onGcloudTokenLogin={handleGcloudTokenSubmit} onHostedOAuthLogin={handleHostedOAuthLogin} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-slate-200">
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center">
        {error && (
          <div className="w-full p-4 mb-4 bg-red-900/50 border border-red-500/50 text-red-300 rounded-lg space-y-2" role="alert">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold">Error</p>
                <p>{error}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={runDiagnostics}
                  className="px-3 py-1.5 text-xs rounded-md border border-red-400/40 bg-red-800/40 hover:bg-red-800/60 text-red-200"
                >Diagnose</button>
                <button
                  onClick={() => setError(null)}
                  className="px-3 py-1.5 text-xs rounded-md border border-red-400/40 bg-red-800/40 hover:bg-red-800/60 text-red-200"
                >Dismiss</button>
              </div>
            </div>
            {diagnostics && <p className="text-xs text-red-200/80">{diagnostics}</p>}
          </div>
        )}
        {renderContent()}
      </main>
      <footer className="text-center text-sm text-slate-600 mt-12 flex flex-col items-center gap-2">
        <p>Built for demonstration and troubleshooting.</p>
        <button onClick={() => setShowHelp(true)} className="text-xs px-3 py-1.5 rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700">Help & Shortcuts</button>
      </footer>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};

export default App;