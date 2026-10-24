import React, { useState, useEffect } from 'react';
import { FusedIncident, MisinformationItem } from '../types/disaster';
import {
  Send,
  Check
} from 'lucide-react';
import { LanguageCode } from '../services/i18n';

interface MisinformationQuarantineProps {
  incidents: FusedIncident[];
  misinfoList: MisinformationItem[];
  setMisinfoList: React.Dispatch<React.SetStateAction<MisinformationItem[]>>;
  onDebunkAndBroadcast: (incidentId: string, debunkNotice: string, misinfoId?: string) => void;
  language: LanguageCode;
}

export const MisinformationQuarantine: React.FC<MisinformationQuarantineProps> = ({
  incidents: _incidents,
  misinfoList,
  setMisinfoList,
  onDebunkAndBroadcast,
  language: _language
}) => {
  const [selectedId, setSelectedId] = useState<string>(misinfoList[0]?.id || 'MISINFO-HOAX-01');
  const activeItem = misinfoList.find((m) => m.id === selectedId) || misinfoList[0];

  useEffect(() => {
    if (misinfoList.length > 0 && !misinfoList.some((m) => m.id === selectedId)) {
      setSelectedId(misinfoList[0].id);
    }
  }, [misinfoList, selectedId]);

  const [debunkSms, setDebunkSms] = useState(
    'OFFICIAL UPDATE: Khandajan Gate is SAFE. River levels are normal. The voice note about a dam break is false. Please stay calm.'
  );
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  if (!activeItem) return null;

  const handleReviewDecision = (decision: 'CONFIRMED_HOAX' | 'GENUINE_EMERGENCY') => {
    const updated: MisinformationItem = {
      ...activeItem,
      humanReviewDecision: decision,
      reviewerName: 'Duty Officer',
      reviewerNotes:
        decision === 'CONFIRMED_HOAX'
          ? 'Checked against river sensors. Confirmed false.'
          : 'Confirmed by field team. Escalated to active alerts.'
    };

    setMisinfoList((prev) => prev.map((m) => (m.id === activeItem.id ? updated : m)));
  };

  const handleTriggerDebunkBroadcast = () => {
    setIsBroadcasting(true);
    setTimeout(() => {
      setIsBroadcasting(false);
      setBroadcastSuccess(true);
      setTimeout(() => setBroadcastSuccess(false), 4000);

      onDebunkAndBroadcast('INC-VIRAL-03', debunkSms, activeItem.id);
    }, 600);
  };

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900">
          Rumor Check
        </h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Check viral messages against river sensors before they reach the public, and send quick SMS corrections.
        </p>
      </div>

      {/* 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left: Flagged Rumor List */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-700 tabular-nums">
            Flagged Messages ({misinfoList.length})
          </div>
          <div className="divide-y divide-slate-100">
            {misinfoList.map((item) => {
              const isSelected = activeItem.id === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected ? 'bg-slate-100/90' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>{item.originChannel}</span>
                    <span className={`font-semibold ${
                      item.humanReviewDecision === 'CONFIRMED_HOAX'
                        ? 'text-rose-700'
                        : item.humanReviewDecision === 'GENUINE_EMERGENCY'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}>
                      {item.humanReviewDecision === 'CONFIRMED_HOAX'
                        ? 'False Rumor'
                        : item.humanReviewDecision === 'GENUINE_EMERGENCY'
                        ? 'Real Emergency'
                        : 'Needs Check'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 line-clamp-2">
                    {item.sourceText}
                  </p>
                  <div className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
                    ~{item.exposedCitizenCount.toLocaleString()} people saw this
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Review & Correction Broadcast */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="border-b border-slate-100 pb-4 space-y-1">
            <div className="text-xs text-slate-500">
              Source: {activeItem.originChannel}
            </div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              "{activeItem.sourceText}"
            </h3>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
            <strong className="text-slate-900 block">River Sensor Check</strong>
            <p className="text-slate-600 leading-relaxed">
              Water levels at Khandajan are normal and all dam gates are safe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-semibold text-slate-800 mr-1">Mark as:</span>
            <button
              type="button"
              onClick={() => handleReviewDecision('CONFIRMED_HOAX')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeItem.humanReviewDecision === 'CONFIRMED_HOAX'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              False Rumor
            </button>
            <button
              type="button"
              onClick={() => handleReviewDecision('GENUINE_EMERGENCY')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeItem.humanReviewDecision === 'GENUINE_EMERGENCY'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Real Alert
            </button>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="font-bold text-slate-900">
                SMS Correction to Public
              </label>
              <span className="text-slate-500 tabular-nums">
                Sends to {activeItem.exposedCitizenCount.toLocaleString()} phones
              </span>
            </div>

            <textarea
              value={debunkSms}
              onChange={(e) => setDebunkSms(e.target.value)}
              rows={3}
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900 leading-relaxed"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <span className="text-slate-500 text-[11px]">
                Sent by text SMS and spoken voice call in English &amp; Hindi.
              </span>

              <button
                type="button"
                onClick={handleTriggerDebunkBroadcast}
                disabled={isBroadcasting}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 tabular-nums"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isBroadcasting ? 'Sending...' : `Send Fact-Check (${activeItem.exposedCitizenCount.toLocaleString()})`}
                </span>
              </button>
            </div>

            {broadcastSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-center gap-2 tabular-nums">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Correction sent to all {activeItem.exposedCitizenCount.toLocaleString()} phones.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
