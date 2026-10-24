import React, { useState } from 'react';
import {
  KeyRound,
  AlertCircle,
  X
} from 'lucide-react';
import { loginOfficerOnServer } from '../services/realtimeClient';

interface OfficialAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessfulLogin: (officerName: string, role: string, badgeId: string) => void;
  onFailedAttempt: (attemptedId: string) => void;
}

export const OfficialAuthModal: React.FC<OfficialAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessfulLogin,
  onFailedAttempt
}) => {
  const [badgeId, setBadgeId] = useState('NDMA-OFFICER-7102');
  const [password, setPassword] = useState('');
  const [officerName, setOfficerName] = useState('SI M. K. Roy');
  const [role, setRole] = useState('NDRF Rescue Lead');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const res = await loginOfficerOnServer({
      officerName,
      role,
      badgeId,
      password
    });

    setLoading(false);
    if (res.ok && res.officer) {
      setPassword('');
      onSuccessfulLogin(res.officer.name, res.officer.role, res.officer.badgeId);
      onClose();
    } else {
      setErrorMsg(res.error || 'Wrong passkey. Only rescue officers can sign in here.');
      onFailedAttempt(badgeId);
    }
  };

  const fillDemoCredentials = () => {
    setBadgeId('NDMA-OFFICER-7102');
    setPassword('ndma@2026');
    setOfficerName('SI M. K. Roy');
    setRole('NDRF Rescue Lead');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src="/assets/aistudio/image_5af4968a.png"
                alt="ResQnet Logo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain scale-110"
              />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Officer Sign In
              </h3>
              <p className="text-[11px] text-slate-400">
                Rescue & District Teams
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close login dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleLogin} className="p-5 space-y-4 text-xs">
          <p className="text-slate-600">
            For rescue officers only. Citizens do not need to sign in to request help.
          </p>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Name
            </label>
            <input
              type="text"
              value={officerName}
              onChange={(e) => setOfficerName(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Team
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
            >
              <option value="NDRF Rescue Lead">NDRF Rescue Lead</option>
              <option value="SDRF Boat Team">SDRF Boat Team</option>
              <option value="District Control Desk">District Control Desk</option>
              <option value="PWD Roads Engineer">PWD Roads Engineer</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Badge ID
              </label>
              <input
                type="text"
                value={badgeId}
                onChange={(e) => setBadgeId(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg font-mono outline-none focus:border-slate-900"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Passkey
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passkey"
                  className="w-full p-2.5 pr-8 border border-slate-300 rounded-lg font-mono outline-none focus:border-slate-900"
                  required
                />
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
              </div>
            </div>
          </div>

          <div className="p-3 bg-indigo-50/80 rounded-lg border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <span className="text-[11px] font-semibold text-indigo-900 block">Evaluator &amp; Presenter Mode</span>
              <span className="text-[11px] text-indigo-700">SI M. K. Roy (NDRF Rescue Lead) · Passkey: <code className="font-mono font-bold">ndma@2026</code></span>
            </div>
            <button
              type="button"
              onClick={() => {
                onSuccessfulLogin('SI M. K. Roy', 'NDRF Rescue Lead', 'NDMA-OFFICER-7102');
                onClose();
              }}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>⚡ 1-Click Demo Login</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
