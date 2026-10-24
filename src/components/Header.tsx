import React from 'react';
import {
  WifiOff,
  Plus,
  PhoneCall,
  Languages,
  SignalLow
} from 'lucide-react';
import { LanguageCode, translations } from '../services/i18n';

interface HeaderProps {
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  isLowNetwork: boolean;
  setIsLowNetwork: (low: boolean) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  portalMode: 'citizen' | 'official';
  onSelectPortalMode: (mode: 'citizen' | 'official') => void;
  onLogoutOfficial: () => void;
  authenticatedOfficer: { name: string; role: string; badgeId: string } | null;
  onOpenIngestModal: () => void;
  liveConnectedOfficerTabs?: number;
  isOfficerRealtimeConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isOffline,
  setIsOffline,
  isLowNetwork,
  setIsLowNetwork,
  language,
  setLanguage,
  portalMode,
  onSelectPortalMode,
  onLogoutOfficial,
  authenticatedOfficer,
  onOpenIngestModal,
  liveConnectedOfficerTabs = 0,
  isOfficerRealtimeConnected = false
}) => {
  const t = translations[language];

  const subtitleText =
    portalMode === 'citizen'
      ? t.citizenSubtitle
      : `${t.officialSubtitlePrefix} · ${authenticatedOfficer?.name || 'Authorized Responder'}`;

  return (
    <header className="bg-black text-white border-b border-neutral-900 sticky top-0 z-40">
      {/* Top utility strip */}
      <div className="bg-black border-b border-neutral-900 px-4 py-2 text-xs">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="font-semibold text-neutral-200">{t.helplineLabel}</span>
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span className="inline-flex items-center gap-1.5 text-neutral-300 font-mono tabular-nums">
              <PhoneCall className="w-3.5 h-3.5 text-red-400" />
              1070 / 1078 / 112
            </span>
          </div>

          <div className="flex items-center gap-3 text-neutral-300">
            <button
              onClick={() => setIsLowNetwork(!isLowNetwork)}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                isLowNetwork
                  ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-xs'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700 hover:text-white'
              }`}
              title="Toggle low signal simulation"
            >
              <SignalLow className="w-3.5 h-3.5" />
              <span>{isLowNetwork ? t.lowSignalOn : t.lowSignalOff}</span>
            </button>

            <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-0.5">
              <Languages className="w-3.5 h-3.5 text-neutral-400" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="bg-transparent text-neutral-200 text-xs py-0.5 outline-none font-medium cursor-pointer"
                aria-label="Select language"
              >
                <option value="en" className="bg-neutral-900">English</option>
                <option value="hi" className="bg-neutral-900">हिन्दी</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main navigation bar */}
      <div className="bg-black px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
              <img
                src="/assets/aistudio/ResQnet_Medical_Connectivity_Logo_c2ba50c4.png"
                alt="ResQnet Logo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain scale-110"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight whitespace-nowrap">
                ResQnet
              </h1>
              <p className="text-xs text-neutral-400 leading-none mt-0.5">
                {subtitleText}
              </p>
            </div>
          </div>

          {/* Primary Navigation: Citizen & Officer Portals Only */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-1 p-1 bg-neutral-950 border border-neutral-800 rounded-lg text-xs"
              role="tablist"
              aria-label="Primary portals"
            >
              <button
                type="button"
                role="tab"
                aria-selected={portalMode === 'citizen'}
                onClick={() => onSelectPortalMode('citizen')}
                className={`px-4 py-2 rounded-md font-semibold transition-all whitespace-nowrap shrink-0 ${
                  portalMode === 'citizen'
                    ? 'bg-white text-black shadow-xs font-bold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                {t.citizenTab}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={portalMode === 'official'}
                onClick={() => onSelectPortalMode('official')}
                className={`px-4 py-2 rounded-md font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  portalMode === 'official'
                    ? 'bg-white text-black shadow-xs font-bold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                <span>{t.officerTab}</span>
              </button>
            </div>

            {portalMode === 'official' && (
              <div className="flex items-center gap-2">
                {isOfficerRealtimeConnected && (
                  <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 whitespace-nowrap tabular-nums">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>
                      {language === 'hi'
                        ? `सिंक सक्रिय (${Math.max(1, liveConnectedOfficerTabs)} टर्मिनल)`
                        : `Sync Active (${Math.max(1, liveConnectedOfficerTabs)} ${liveConnectedOfficerTabs === 1 ? 'terminal' : 'terminals'})`}
                    </span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={onOpenIngestModal}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.addReportBtn}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Offline notification banner */}
      {isOffline && (
        <div className="bg-amber-400 text-slate-950 px-4 py-2 text-xs font-medium">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>{t.offlineBanner}</span>
            </div>
            <button
              onClick={() => setIsOffline(false)}
              className="text-xs font-bold underline whitespace-nowrap shrink-0 hover:text-black"
            >
              {t.goOnlineBtn}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
