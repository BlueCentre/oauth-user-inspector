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
            // FIX: Completed the className attribute. It was truncated, which caused a JSX parsing error.
            className="text-lg text-blue-400 hover:text-blue-300"
          >
            @{user.username}
          </a>
          <p className="mt-2 text-slate-400 max-w-xl">{user.email}</p>
        </div>
      </div>
      <div className="bg-slate-800/50 p-6 rounded-b-xl max-h-[50vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-slate-200 mb-4">Provider Data Dump</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {Object.entries(user.rawData).map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between border-b border-slate-700 py-2"
            >
              <dt className="font-mono text-slate-400 capitalize">{key.replace(/_/g, ' ')}</dt>
              <dd className="font-mono text-slate-200 text-right truncate">
                {key.endsWith('_url') && typeof value === 'string' && value.startsWith('http') ? (
                  <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Link</a>
                ) : (
                  <span title={String(value)}>{renderValue(value)}</span>
                )}
              </dd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserInfoDisplay;