import React from 'react';
import type { AppUser } from '../types';
import { GithubIcon, GoogleIcon } from './icons';

interface UserInfoDisplayProps {
  user: AppUser;
}

const renderValue = (value: any): string => {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
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

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(user.rawData, null, 2)).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  };

  return (
    <div className="mt-8 w-full animate-fade-in">
      <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left bg-slate-800/50 p-6 rounded-t-xl border-b border-slate-700">
        <img
          src={user.avatarUrl}
          alt={`${user.username}'s avatar`}
          className="w-24 h-24 rounded-full border-4 border-slate-600 shadow-lg"
        />
        <div className="mt-4 sm:mt-0 sm:ml-6">
          <div className="flex items-center justify-center sm:justify-start gap-3">
             <ProviderIcon provider={user.provider} className="w-8 h-8 text-white" />
             <h2 className="text-3xl font-bold text-white">{user.name || user.username}</h2>
          </div>
          <a
            href={user.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg text-blue-400 hover:text-blue-300"
          >
            @{user.username}
          </a>
          <p className="mt-2 text-slate-400 max-w-xl">{user.email}</p>
        </div>
      </div>
      <div className="bg-slate-800/50 p-6 rounded-b-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-slate-200">Provider Data Dump</h3>
          <button
            onClick={handleCopy}
            className="flex items-center px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-md text-sm text-slate-300 hover:bg-slate-700 transition-all"
          >
            {isCopied ? (
              <>
                <ClipboardCheckIcon className="w-4 h-4 mr-2 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardIcon className="w-4 h-4 mr-2" />
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
  );
};

export default UserInfoDisplay;