import React from "react";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  ["Cmd/Ctrl + K", "Focus provider data filter"],
  ["Cmd/Ctrl + E", "Export snapshot JSON"],
  ["Cmd/Ctrl + Shift + C", "Copy full raw JSON"],
  ["Safe Mode Toggle", "Masks PII (name, username, email, token)"],
];

const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-6 space-y-4 animate-fade-in">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-slate-100">
            Help & Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <div>
          <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-2">
            Keyboard Shortcuts
          </h3>
          <ul className="space-y-1 text-sm">
            {shortcuts.map(([combo, desc]) => (
              <li key={combo} className="flex justify-between gap-4">
                <span className="font-mono text-slate-200">{combo}</span>
                <span className="text-slate-400">{desc}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-slate-400 leading-relaxed">
          <p>
            <strong>Snapshot Export</strong> downloads a masked JSON
            representation of the current provider response and view settings
            (token digits are redacted).
          </p>
          <p className="mt-2">
            <strong>Safe Mode</strong> is intended for demos/screenshares;
            exported snapshots are always masked regardless of Safe Mode.
          </p>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-sm rounded-md border border-slate-500 text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
