import React, { useState, useEffect } from 'react';
import { FusedIncident, SecurityAuditLog } from '../types/disaster';
import {
  Lock,
  Unlock
} from 'lucide-react';
import { LanguageCode } from '../services/i18n';
import {
  fetchAuditLogsFromServer,
  recordAuditLogOnServer
} from '../services/realtimeClient';

interface PrivacyScopeConsoleProps {
  incidents: FusedIncident[];
  language: LanguageCode;
}

export const PrivacyScopeConsole: React.FC<PrivacyScopeConsoleProps> = ({
  incidents,
  language: _language
}) => {
  const [viewMode, setViewMode] = useState<'public' | 'authorized'>('public');
  const [responderBadge, setResponderBadge] = useState('NDRF-OFFICER-7102');
  const [sessionExpirySeconds, setSessionExpirySeconds] = useState(900);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([
    {
      id: 'AUD-SEC-01',
      timestamp: Date.now() - 48 * 60 * 1000,
      userId: 'NDRF-OFFICER-7102',
      userName: 'SI M. K. Roy (NDRF)',
      role: 'Rescue Officer',
      requestedScope: 'Viewed house address (For Rescue Team only)',
      outcome: 'granted',
      reason: 'Boat rescue for oxygen patient',
      ipAddress: ''
    },
    {
      id: 'AUD-SEC-8821',
      timestamp: Date.now() - 3 * 60 * 1000,
      userId: 'CONTRACTOR-TEMP-88',
      userName: 'External Vendor',
      role: 'Supply Contractor',
      requestedScope: 'Tried to download full citizen phone list',
      outcome: 'denied_unauthorized',
      reason: 'Not an authorized rescue officer',
      ipAddress: ''
    }
  ]);

  useEffect(() => {
    let cancelled = false;
    fetchAuditLogsFromServer().then((serverLogs) => {
      if (!cancelled && serverLogs && serverLogs.length > 0) {
        setAuditLogs(serverLogs);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let timer: any;
    if (isSessionActive && sessionExpirySeconds > 0) {
      timer = setInterval(() => {
        setSessionExpirySeconds(prev => {
          if (prev <= 1) {
            setIsSessionActive(false);
            setViewMode('public');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isSessionActive, sessionExpirySeconds]);

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSessionActive(true);
    setViewMode('authorized');
    setSessionExpirySeconds(900);

    const serverEntry = await recordAuditLogOnServer({
      userId: responderBadge,
      userName: `Officer (${responderBadge})`,
      role: 'Rescue Lead',
      requestedScope: 'Unlocked contact details (15m)',
      outcome: 'granted',
      reason: 'Active rescue dispatch'
    });

    const fallbackLog: SecurityAuditLog = serverEntry || {
      id: `AUD-SEC-${Math.floor(Math.random() * 9000 + 1000)}`,
      timestamp: Date.now(),
      userId: responderBadge,
      userName: `Officer (${responderBadge})`,
      role: 'Rescue Lead',
      requestedScope: 'Unlocked contact details (15m)',
      outcome: 'granted',
      reason: 'Active rescue dispatch',
      ipAddress: ''
    };

    setAuditLogs(prev => [fallbackLog, ...prev.filter(l => l.id !== fallbackLog.id)]);
  };

  const handleRevoke = () => {
    setIsSessionActive(false);
    setViewMode('public');
    setSessionExpirySeconds(0);
  };

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900">
          Citizen Contacts & Privacy
        </h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Phone numbers and house numbers stay hidden by default. Rescue boat leaders can unlock them for 15 minutes during a pickup.
        </p>
      </div>

      {/* Active View Control */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <strong className="text-base font-bold text-slate-900 block">
            {viewMode === 'public' ? 'Contacts Hidden' : 'Contacts Unlocked for Rescue'}
          </strong>
          <p className="text-xs text-slate-600 tabular-nums">
            {viewMode === 'public'
              ? 'Phone numbers and exact house numbers are hidden.'
              : `Auto-locks in ${Math.floor(sessionExpirySeconds / 60)}m ${sessionExpirySeconds % 60}s.`}
          </p>
        </div>

        <div className="shrink-0">
          {viewMode === 'authorized' ? (
            <button
              type="button"
              onClick={handleRevoke}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Hide Contacts Now</span>
            </button>
          ) : (
            <form onSubmit={handleGrantAccess} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={responderBadge}
                onChange={(e) => setResponderBadge(e.target.value)}
                placeholder="Badge ID"
                className="p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-slate-900 w-44"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlock for 15 Mins</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Citizen Contact Records */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>Active Rescue Requests ({incidents.filter((i) => !i.isQuarantined).length})</span>
          <span className={viewMode === 'public' ? 'text-slate-500 font-normal' : 'text-emerald-700'}>
            {viewMode === 'public' ? 'Hidden' : 'For Rescue Team only'}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {incidents
            .filter((i) => !i.isQuarantined)
            .map((inc) => (
              <div key={inc.id} className="p-4 space-y-2 text-xs hover:bg-slate-50/60 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-slate-900 text-sm">{inc.title}</strong>
                  {inc.provenanceTrail.some((p) => p.fromLiveDevice) && (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      Live Device Request
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phone</span>
                    <span className="font-mono font-medium text-slate-800 tabular-nums">
                      {viewMode === 'authorized'
                        ? inc.provenanceTrail[0]?.contactMasked.replace(/\(Ref:.*\)/, '').trim()
                        : '+91 ••••• ••••• (Hidden)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Address (For Rescue Team only)</span>
                    <span className="font-medium text-slate-800">
                      {viewMode === 'authorized'
                        ? inc.provenanceTrail[0]?.exactAddress
                        : `${inc.landmark}, ${inc.district} (Address hidden)`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Simple Access History */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-700">
          Recent Access Log
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {auditLogs.map((log) => {
            const isRedViolation =
              log.isViolation ||
              log.highlightRed ||
              log.userId === 'GUEST-ATTACKER-09' ||
              log.reason?.includes('SECURITY_VIOLATION') ||
              log.role?.includes('Guest_09');

            return (
              <div
                key={log.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                  isRedViolation
                    ? 'bg-rose-50 border-l-4 border-l-rose-600 text-rose-950'
                    : 'hover:bg-slate-50/60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className={isRedViolation ? 'text-rose-950 font-bold' : 'text-slate-900'}>
                      {log.userName}
                    </strong>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        log.outcome === 'granted' ? 'text-emerald-700' : 'text-rose-700 font-bold'
                      }`}
                    >
                      {log.outcome === 'granted' ? 'Allowed' : 'BLOCKED (HTTP 403)'}
                    </span>
                    {isRedViolation && (
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono text-[10px] font-extrabold uppercase tracking-wide">
                        [CRITICAL SECURITY VIOLATION]
                      </span>
                    )}
                  </div>
                  <p className={isRedViolation ? 'text-rose-900 font-medium leading-relaxed' : 'text-slate-600'}>
                    <strong>Scope:</strong> {log.requestedScope} — {log.reason}
                  </p>
                </div>

                <div className="font-mono text-[11px] text-slate-500 shrink-0 self-start sm:self-auto">
                  {log.ipAddress || '198.51.100.42'} · {log.id}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
