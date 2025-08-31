import React, { useState } from 'react';
import { AuthProvider } from '../types';
import { GithubIcon, GoogleIcon, ClipboardIcon, ClipboardCheckIcon } from './icons';
import Tabs, { Tab } from './Tabs';

interface LoginScreenProps {
  onOAuthLogin: (provider: AuthProvider, clientId: string, clientSecret: string) => void;
  onPatLogin: (pat: string) => void;
  onGcloudTokenLogin: (token: string) => void;
  onHostedOAuthLogin: (provider: AuthProvider) => void;
}

const getRedirectUri = () => window.location.origin + window.location.pathname;

const LoginScreen: React.FC<LoginScreenProps> = ({ onOAuthLogin, onPatLogin, onGcloudTokenLogin, onHostedOAuthLogin }) => {
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [pat, setPat] = useState('');
  const [gcloudToken, setGcloudToken] = useState('');
  const [copiedProvider, setCopiedProvider] = useState<AuthProvider | null>(null);

  const handleCopy = (provider: AuthProvider) => {
    navigator.clipboard.writeText(getRedirectUri()).then(() => {
      setCopiedProvider(provider);
      setTimeout(() => setCopiedProvider(null), 2000); // Reset after 2 seconds
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  };

  return (
    <div className="bg-slate-800 p-8 rounded-xl shadow-2xl ring-1 ring-white/10 w-full max-w-2xl transition-all duration-300">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          OAuth User Inspector
        </h1>
        <p className="text-slate-400 mt-2">
          Select a provider to inspect your user data.
        </p>
      </div>

      <Tabs>
        <Tab label="GitHub" icon={<GithubIcon />}>
          <div className="space-y-6">
            {/* GitHub OAuth */}
            <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
              <div className="flex items-center mb-4">
                <GithubIcon className="h-8 w-8 text-white" />
                <h2 className="ml-3 text-xl font-semibold text-white">Sign in with GitHub OAuth</h2>
              </div>
              <p className="text-sm text-slate-400 mb-2">
                Create a <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">New OAuth App</a> and set the "Authorization callback URL" to:
              </p>
              <div className="flex items-center justify-between text-sm bg-slate-700 p-2 rounded-md mb-4">
                  <code className="text-xs text-slate-300 truncate">{getRedirectUri()}</code>
                  <button
                    onClick={() => handleCopy('github')}
                    className="p-1 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500 rounded transition-colors"
                    aria-label="Copy redirect URL"
                  >
                    {copiedProvider === 'github' ? (
                      <ClipboardCheckIcon className="h-5 w-5 text-green-400" />
                    ) : (
                      <ClipboardIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="github-client-id" className="block text-sm font-medium text-slate-300">
                    GitHub OAuth App Client ID
                  </label>
                  <input
                    id="github-client-id"
                    type="text"
                    value={githubClientId}
                    onChange={(e) => setGithubClientId(e.target.value)}
                    placeholder="Enter your GitHub Client ID"
                    className="w-full mt-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="github-client-secret" className="block text-sm font-medium text-slate-300">
                    GitHub OAuth App Client Secret
                  </label>
                  <input
                    id="github-client-secret"
                    type="password"
                    value={githubClientSecret}
                    onChange={(e) => setGithubClientSecret(e.target.value)}
                    placeholder="Enter your GitHub Client Secret"
                    className="w-full mt-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => onOAuthLogin('github', githubClientId, githubClientSecret)}
                  disabled={!githubClientId || !githubClientSecret}
                  className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-slate-600 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:bg-slate-600/50 disabled:cursor-not-allowed transition-all"
                >
                  <GithubIcon className="h-5 w-5 mr-2"/>
                  Continue with GitHub
                </button>
              </div>
            </div>

            {/* GitHub PAT */}
            <div className="mt-8 pt-6 border-t border-slate-700">
                <h3 className="text-center text-lg font-medium text-slate-300 mb-4">Or use a GitHub Token</h3>
                <div className="text-slate-400 space-y-2 text-sm bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <p>You can use a classic or fine-grained PAT. The token needs the <code className="text-xs bg-slate-700 p-1 rounded">read:user</code> and <code className="text-xs bg-slate-700 p-1 rounded">user:email</code> scopes.</p>
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Generate a new token here.</a>
                </div>
                <div className="space-y-4 mt-4">
                  <label htmlFor="pat-input" className="block text-sm font-medium text-slate-300">
                    Personal Access Token (PAT)
                  </label>
                  <input
                    id="pat-input"
                    type="password"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                  />
                </div>
                <div className="mt-6">
                  <button
                    onClick={() => onPatLogin(pat)}
                    disabled={!pat}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-slate-600/50 disabled:cursor-not-allowed transition-all"
                  >
                    <GithubIcon className="h-5 w-5 mr-2" />
                    Fetch with GitHub Token
                  </button>
                </div>
            </div>

            {/* Hosted GitHub OAuth */}
            <div className="mt-8 pt-6 border-t border-slate-700">
                <h3 className="text-center text-lg font-medium text-slate-300 mb-4">Or use our GitHub App</h3>
                <div className="text-slate-400 space-y-2 text-sm bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <p>Use our hosted GitHub OAuth app - no setup required! Just click the button below to authenticate with GitHub.</p>
                  <p className="text-slate-500">This option uses our pre-configured OAuth application for your convenience.</p>
                </div>
                <div className="mt-6">
                  <button
                    onClick={() => onHostedOAuthLogin('github')}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all"
                  >
                    <GithubIcon className="h-5 w-5 mr-2" />
                    Sign in with Hosted GitHub App
                  </button>
                </div>
            </div>
          </div>
        </Tab>

        <Tab label="Google" icon={<GoogleIcon />}>
          <div className="space-y-6">
            {/* Google OAuth */}
            <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
              <div className="flex items-center mb-4">
                <GoogleIcon className="h-8 w-8" />
                <h2 className="ml-3 text-xl font-semibold text-white">Sign in with Google OAuth</h2>
              </div>
              <p className="text-sm text-slate-400 mb-2">
                Create OAuth credentials in the <a href="https://console.developers.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google API Console</a>. Under "Authorized redirect URIs", add:
              </p>
              <div className="flex items-center justify-between text-sm bg-slate-700 p-2 rounded-md mb-4">
                  <code className="text-xs text-slate-300 truncate">{getRedirectUri()}</code>
                  <button
                    onClick={() => handleCopy('google')}
                    className="p-1 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500 rounded transition-colors"
                    aria-label="Copy redirect URL"
                  >
                    {copiedProvider === 'google' ? (
                      <ClipboardCheckIcon className="h-5 w-5 text-green-400" />
                    ) : (
                      <ClipboardIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="google-client-id" className="block text-sm font-medium text-slate-300">
                    Google OAuth App Client ID
                  </label>
                  <input
                    id="google-client-id"
                    type="text"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="Enter your Google Client ID"
                    className="w-full mt-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="google-client-secret" className="block text-sm font-medium text-slate-300">
                    Google OAuth App Client Secret
                  </label>
                  <input
                    id="google-client-secret"
                    type="password"
                    value={googleClientSecret}
                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                    placeholder="Enter your Google Client Secret"
                    className="w-full mt-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => onOAuthLogin('google', googleClientId, googleClientSecret)}
                  disabled={!googleClientId || !googleClientSecret}
                  className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-600/50 disabled:cursor-not-allowed transition-all"
                >
                  <GoogleIcon className="h-5 w-5 mr-2"/>
                  Continue with Google
                </button>
              </div>
            </div>

            {/* Google gcloud Token */}
            <div className="mt-8 pt-6 border-t border-slate-700">
                <h3 className="text-center text-lg font-medium text-slate-300 mb-4">Or use a Google CLI Token</h3>
                <div className="text-slate-400 space-y-2 text-sm bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <p>You can use a short-lived token generated by the gcloud CLI. Note: these tokens typically expire in one hour.</p>
                  <p>Run the following command: <code className="text-xs bg-slate-700 p-1 rounded">gcloud auth print-access-token</code></p>
                </div>
                <div className="space-y-4 mt-4">
                  <label htmlFor="gcloud-token-input" className="block text-sm font-medium text-slate-300">
                    Google CLI Access Token
                  </label>
                  <textarea
                    id="gcloud-token-input"
                    rows={3}
                    value={gcloudToken}
                    onChange={(e) => setGcloudToken(e.target.value)}
                    placeholder="ya29..."
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-mono text-sm"
                  />
                </div>
                <div className="mt-6">
                  <button
                    onClick={() => onGcloudTokenLogin(gcloudToken)}
                    disabled={!gcloudToken}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-slate-600 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:bg-slate-600/50 disabled:cursor-not-allowed transition-all"
                  >
                    <GoogleIcon className="h-5 w-5 mr-2" />
                    Fetch with Google Token
                  </button>
                </div>
            </div>

            {/* Hosted Google OAuth - Placeholder */}
            <div className="mt-8 pt-6 border-t border-slate-700">
                <h3 className="text-center text-lg font-medium text-slate-300 mb-4">Or use our Google App</h3>
                <div className="text-slate-400 space-y-2 text-sm bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <p>Our hosted Google OAuth app will be available soon! This option will allow you to authenticate without setting up your own OAuth application.</p>
                  <p className="text-slate-500">Coming soon - no setup required, just one-click authentication with Google.</p>
                </div>
                <div className="mt-6">
                  <button
                    disabled={true}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-slate-400 bg-slate-700/50 cursor-not-allowed transition-all"
                  >
                    <GoogleIcon className="h-5 w-5 mr-2" />
                    Sign in with Hosted Google App (Coming Soon)
                  </button>
                </div>
            </div>
          </div>
        </Tab>
      </Tabs>
    </div>
  );
};

export default LoginScreen;