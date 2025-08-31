import React, { useState, useEffect, useCallback } from 'react';
import type { AppUser, AuthProvider, ProviderGitHubUser, ProviderGoogleUser } from './types';
import { Spinner } from './components/icons';
import UserInfoDisplay from './components/UserInfoDisplay';
import LoginScreen from './components/LoginScreen';

const getRedirectUri = () => window.location.origin + window.location.pathname;

const App: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state'); // Provider passed in state
    
    // Check for stored session first
    const storedAuth = localStorage.getItem('auth_details');

    if (code && state) {
        // Check if this is a hosted OAuth flow
        const isHosted = state.endsWith('-hosted');
        const provider = (isHosted ? state.replace('-hosted', '') : state) as AuthProvider;
        window.history.replaceState({}, document.title, window.location.pathname);
        exchangeCodeForToken(code, provider, isHosted);
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
  }, [exchangeCodeForToken, fetchUser]);
  
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
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-slate-600 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all"
            >
              Logout
            </button>
          </div>
          <UserInfoDisplay user={user} />
        </>
      );
    }
    
    return <LoginScreen onOAuthLogin={handleOAuthLogin} onPatLogin={handlePatSubmit} onGcloudTokenLogin={handleGcloudTokenSubmit} onHostedOAuthLogin={handleHostedOAuthLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-slate-200">
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center">
        {error && (
          <div className="w-full p-4 mb-4 bg-red-900/50 border border-red-500/50 text-red-300 rounded-lg" role="alert">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}
        {renderContent()}
      </main>
      <footer className="text-center text-sm text-slate-600 mt-12">
        <p>Built for demonstration and troubleshooting.</p>
      </footer>
    </div>
  );
};

export default App;