import React, { useMemo, useState } from 'react';
import type { AppUser } from '../types';
import { GithubIcon, GoogleIcon, ClipboardIcon, ClipboardCheckIcon } from './icons';

interface UserInfoDisplayProps {
  user: AppUser;
}

const isUrl = (val: string) => /^https?:\/\//i.test(val);
const renderPrimitive = (value: any): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') return value;
  return '';
};

const ProviderIcon: React.FC<{ provider: AppUser['provider']; className?: string }> = ({ provider, className }) => {
    switch (provider) {
        case 'github':
            return <GithubIcon className={className} />;
        case 'google':
            return <GoogleIcon className={className} />;
        default:
            return null;
    }
};

const UserInfoDisplay: React.FC<UserInfoDisplayProps> = ({ user }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(user.rawData, null, 2)).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  };

  const handleCopyToken = () => {
    if (!user.accessToken) return;
    navigator.clipboard.writeText(user.accessToken).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }).catch(err => console.error('Could not copy token', err));
  };

  // Build a stable ordered list of top-level primitive fields for table view
  const [search, setSearch] = useState('');
  const tableEntries = useMemo(() => {
    const raw: Record<string, any> = user.rawData as any;
    // Only show primitive (string/number/boolean/null) top-level keys; skip objects unless known URL
    const primitiveKeys = Object.keys(raw).filter(k => {
      const v = raw[k];
      return v === null || ['string','number','boolean'].includes(typeof v);
    });
    // Preferred ordering for common GitHub fields
    const preferredOrder = [
      'login','id','node_id','avatar_url','gravatar_id','url','html_url','followers_url','following_url','gists_url','starred_url','subscriptions_url','organizations_url','repos_url','events_url','received_events_url','type','site_admin','name','company','blog','location','email','hireable','bio','twitter_username','public_repos','public_gists','followers','following','created_at','updated_at'
    ];
    primitiveKeys.sort((a,b) => {
      const ai = preferredOrder.indexOf(a); const bi = preferredOrder.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1; if (bi !== -1) return 1; return a.localeCompare(b);
    });
    const entries = primitiveKeys.map(key => ({ key, value: raw[key] }));
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e => (e.key.toLowerCase().includes(q) || String(e.value).toLowerCase().includes(q)));
  }, [user.rawData, search]);

  return (
    <div className="mt-8 w-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left bg-slate-800/50 p-6 rounded-t-xl border-b border-slate-700">
        <img
          src={user.avatarUrl}
          alt={`${user.username}'s avatar`}
          className="w-24 h-24 rounded-full border-4 border-slate-600 shadow-lg"
        />
        <div className="mt-4 sm:mt-0 sm:ml-6 w-full">
          <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
             <ProviderIcon provider={user.provider} className="w-8 h-8 text-white" />
             <h2 className="text-3xl font-bold text-white break-all">{user.name || user.username}</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 mt-2">
            <a
              href={user.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg text-blue-400 hover:text-blue-300 break-all"
            >
              @{user.username}
            </a>
            {user.email && <p className="text-slate-400 break-all">{user.email}</p>}
          </div>
          {user.accessToken && (
            <div className="mt-4 bg-slate-900/60 border border-slate-700 rounded-md p-3 text-left space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-wide text-slate-400">Access Token</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTokenVisible(v => !v)}
                    className="text-[10px] px-2 py-1 rounded bg-slate-700/60 border border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    {tokenVisible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={handleCopyToken}
                    className="text-[10px] px-2 py-1 rounded bg-slate-700/60 border border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    {tokenCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <code className="block text-[10px] sm:text-xs break-all text-slate-300 select-all">
                {tokenVisible ? user.accessToken : user.accessToken.replace(/.(?=.{4})/g, '•')}
              </code>
            </div>
          )}
        </div>
      </div>
      {/* Body: table + JSON */}
      <div className="bg-slate-800/50 p-0 rounded-b-xl overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Structured Table */}
          <div className="p-6 border-b md:border-b-0 md:border-r border-slate-700 overflow-x-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-xl font-semibold text-slate-200">Provider Data Dump</h3>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter (key or value)"
                className="w-full sm:w-64 text-sm px-3 py-1.5 bg-slate-900/70 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 text-slate-200 placeholder-slate-500"
              />
            </div>
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wide">
                  <th className="py-2 pr-3 font-medium">Field</th>
                  <th className="py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {tableEntries.map(({ key, value }) => {
                  const display = renderPrimitive(value);
                  const isLink = typeof value === 'string' && isUrl(value);
                  return (
                    <tr key={key} className="border-t border-slate-700/60 hover:bg-slate-700/30">
                      <td className="py-2 pr-3 align-top text-slate-300 font-mono text-[11px] sm:text-xs break-all">{key}</td>
                      <td className="py-2 align-top text-slate-100 text-[11px] sm:text-xs break-all">
                        {isLink ? (
                          <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Link</a>
                        ) : display || <span className="text-slate-500">(object)</span>}
                      </td>
                    </tr>
                  );
                })}
                {tableEntries.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-500 text-xs">No matching fields</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Raw JSON */}
          <div className="p-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-semibold text-slate-200">Raw JSON Data</h3>
              <button
                onClick={handleCopy}
                className="flex items-center px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-md text-xs text-slate-300 hover:bg-slate-700 transition-all"
              >
                {isCopied ? (
                  <>
                    <ClipboardCheckIcon className="w-4 h-4 mr-1.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <ClipboardIcon className="w-4 h-4 mr-1.5" />
                    Copy JSON
                  </>
                )}
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto bg-slate-900/70 p-4 rounded-lg border border-slate-700">
              <pre className="text-xs text-slate-200 whitespace-pre-wrap break-all">
                {JSON.stringify(user.rawData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserInfoDisplay;