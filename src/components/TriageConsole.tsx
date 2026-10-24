import React, { useState, useEffect } from 'react';
import { FusedIncident } from '../types/disaster';
import {
  Sliders,
  History,
  X,
  Lock,
  Unlock,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Key
} from 'lucide-react';
import { LanguageCode } from '../services/i18n';
import { formatLocationWithState } from '../data/indianStates';
import {
  ExplainableAiEngine,
  ImmutableOverrideLedger,
  ImmutableOverrideBlock,
  SIMULATION_LABEL_STRING
} from '../services/operationalCheckpoints';
import { ExplainableAiModal } from './ExplainableAiModal';

interface TriageConsoleProps {
  incidents: FusedIncident[];
  onUpdateIncidentOverride: (incidentId: string, newScore: number, reason: string, responderName: string) => void;
  language: LanguageCode;
  onOpenProvenance: (inc: FusedIncident) => void;
}

export const TriageConsole: React.FC<TriageConsoleProps> = ({
  incidents,
  onUpdateIncidentOverride,
  language: _language,
  onOpenProvenance
}) => {
  const [selectedIncidentForOverride, setSelectedIncidentForOverride] = useState<FusedIncident | null>(null);
  const [selectedIncidentForXai, setSelectedIncidentForXai] = useState<FusedIncident | null>(null);
  const [overrideScore, setOverrideScore] = useState<number>(90);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [responderName, setResponderName] = useState<string>('Commander S. Sarma (NDRF)');
  const [showAuditHistory, setShowAuditHistory] = useState<boolean>(false);
  const [ledgerBlocks, setLedgerBlocks] = useState<ImmutableOverrideBlock[]>(() =>
    ImmutableOverrideLedger.getLedger()
  );
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  // Tactical Responder Dashboard (POV 2) Ephemeral Coordinate Lease TTL (in seconds)
  // Seeds initial active leases for demonstration (e.g. #1 has 48s, #2 has expired 0s)
  const [coordinateTtlMap, setCoordinateTtlMap] = useState<Record<string, number>>(() => ({
    'INC-OXYGEN-02': 48.0,
    'INC-SAR-01': 0.0,
    'INC-BRIDGE-01': 30.0
  }));

  // Countdown timer (TTL) ticking every 200ms for smooth decimal countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCoordinateTtlMap((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [id, ttl] of Object.entries(prev)) {
          if (ttl > 0) {
            next[id] = Math.max(0, Number((ttl - 0.2).toFixed(2)));
            changed = true;
          } else {
            next[id] = 0;
          }
        }
        return changed ? { ...prev, ...next } : prev;
      });
    }, 200);

    return () => clearInterval(timer);
  }, []);

  const handleGrantCoordinateLease = (incidentId: string, durationSeconds: number = 60) => {
    setCoordinateTtlMap((prev) => ({
      ...prev,
      [incidentId]: durationSeconds
    }));
  };

  const handleExpireLeaseImmediately = (incidentId: string) => {
    setCoordinateTtlMap((prev) => ({
      ...prev,
      [incidentId]: 0.0
    }));
  };

  const triageQueue = [...incidents]
    .filter(i => i.category === 'medical_oxygen' || i.category === 'flood_surge' || i.category === 'road_cut')
    .sort((a, b) => b.triagePriorityScore - a.triagePriorityScore);

  const handleApplyOverride = () => {
    if (!selectedIncidentForOverride) return;

    const trimmed = overrideReason.trim();
    if (trimmed.length < 15) {
      setOverrideError('Mandatory operational rule: Typed justification must be at least 15 characters.');
      return;
    }

    // Cryptographically lock into the immutable ledger array
    const recordResult = ImmutableOverrideLedger.recordOverride({
      incidentId: selectedIncidentForOverride.id,
      incidentTitle: selectedIncidentForOverride.title,
      responderId: 'NDRF-OPS-LEAD-01',
      responderName,
      originalScore: selectedIncidentForOverride.triagePriorityScore,
      overriddenScore: overrideScore,
      justificationText: trimmed
    });

    if (!recordResult.success) {
      setOverrideError(recordResult.error || 'Failed to record immutable override');
      return;
    }

    setLedgerBlocks(ImmutableOverrideLedger.getLedger());
    onUpdateIncidentOverride(
      selectedIncidentForOverride.id,
      overrideScore,
      trimmed,
      responderName
    );
    setSelectedIncidentForOverride(null);
    setOverrideReason('');
    setOverrideError(null);
  };

  const handleVerifyLedger = () => {
    const result = ImmutableOverrideLedger.verifyIntegrity();
    setVerificationNotice(result.statusMessage);
    setTimeout(() => setVerificationNotice(null), 5000);
  };

  return (
    <div className="space-y-5">
      {/* Simulation Feed Watermark */}
      <div className="flex items-center justify-between px-3.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400 text-amber-950 text-xs">
        <span className="font-mono font-bold tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>{SIMULATION_LABEL_STRING}</span>
        </span>
        <span className="text-[11px] text-amber-900 font-medium hidden sm:inline">
          Programmatic Checkpoint: All mock hazard tracks, queue priority, and telemetry stamped.
        </span>
      </div>

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-white font-mono text-[11px] font-bold">
              POV 2: TACTICAL RESPONDER DASHBOARD
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ephemeral Coordinate TTL Leases Active</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[11px] font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
              <span>XAI Explanations Enforced</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            National Rescue Priority List &amp; Dispatch Queue
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Ranks families across India needing urgent medical care or boat rescue first. Every automated score includes an XAI explanation breakdown string and immutable human override ledger.
          </p>
        </div>

        <button
          onClick={() => setShowAuditHistory(!showAuditHistory)}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto shadow-xs"
        >
          <History className="w-3.5 h-3.5 text-slate-500" />
          <span>{showAuditHistory ? 'Hide Immutable Ledger' : `Immutable Override Ledger (${ledgerBlocks.length})`}</span>
        </button>
      </div>

      {/* Fleet Status Bar */}
      <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700">
        <div>
          <strong className="text-slate-900">Active NDRF / SDRF Rescue Fleet:</strong> 4 Boats · 2 High-Clearance Trucks
        </div>
        <div className="text-slate-500">
          Boat 1 → Milan Nagar, Assam (Oxygen) · Boat 2 → Sarthebari, Assam
        </div>
      </div>

      {/* Immutable Cryptographic Override Ledger */}
      {showAuditHistory && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 text-xs shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <strong className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Immutable Human Override Ledger (Cryptographically Sealed)</span>
              </strong>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Append-only SHA-256 hash-chained blocks. Every priority shift requires a typed text justification locked to the responder ID.
              </p>
            </div>

            <button
              type="button"
              onClick={handleVerifyLedger}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verify Chain Integrity</span>
            </button>
          </div>

          {verificationNotice && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono text-[11px] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{verificationNotice}</span>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {ledgerBlocks.map((block) => (
              <div key={block.blockIndex} className="py-3 space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-bold text-[10px]">
                      BLOCK #{block.blockIndex}
                    </span>
                    <strong className="text-slate-900">{block.incidentTitle}</strong>
                  </div>
                  <div className="font-mono text-xs tabular-nums shrink-0">
                    <span className="text-slate-400 line-through mr-2">{block.originalScore}</span>
                    <strong className="text-emerald-700">{block.overriddenScore}/100</strong>
                    <span className="ml-1 text-[11px] text-slate-500">
                      ({block.delta >= 0 ? `+${block.delta}` : block.delta} pts)
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 space-y-1 font-mono">
                  <div>
                    <span className="text-slate-500 font-sans font-semibold">Justification: </span>
                    <span className="text-slate-900 font-sans">"{block.justificationText}"</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 pt-0.5">
                    <span>Officer: <strong className="text-slate-800">{block.responderName}</strong></span>
                    <span>Sign: <code className="text-indigo-800 font-bold">{block.digitalSignature}</code></span>
                    <span>PrevHash: <code className="text-slate-600">{block.previousBlockHash.slice(0, 12)}…</code></span>
                    <span>BlockHash: <code className="text-emerald-800 font-bold">{block.blockHash.slice(0, 14)}…</code></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prioritized Dispatch Queue */}
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-xs">
        {triageQueue.map((incident, index) => {
          const hasOverride = !!incident.responderOverride;
          const needsOxygen = incident.provenanceTrail.some(p => p.vulnerabilityFactors?.needsOxygen);
          const isElderly = incident.provenanceTrail.some(p => p.vulnerabilityFactors?.isElderlyAlone);
          const callCount = incident.provenanceTrail.length;
          const xaiExplanation = ExplainableAiEngine.deriveExplanation(incident);

          return (
            <div key={incident.id} className="p-5 hover:bg-slate-50/60 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      #{index + 1}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {incident.landmark ? `${incident.landmark}, ` : ''}
                      {formatLocationWithState(incident.district, incident.stateName)}
                    </span>
                    {callCount > 1 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600 font-medium tabular-nums">{callCount} calls combined</span>
                      </>
                    )}
                    {hasOverride && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-700">Updated by Officer</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {incident.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {needsOxygen && 'Bedridden patient on oxygen with power out for 6+ hours.'}
                    {isElderly && !needsOxygen && 'Elderly resident stranded by rising water near washed-out road.'}
                    {!needsOxygen && !isElderly && (incident.provenanceTrail[0]?.details || incident.title)}
                  </p>

                  {/* Programmatic Checkpoint: Explainable AI Breakdown String */}
                  <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                      <span className="font-mono text-[11px] font-semibold text-indigo-950 truncate">
                        {xaiExplanation.summaryExplanationString}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedIncidentForXai(incident)}
                      className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded text-[10px] font-bold shrink-0 transition-colors shadow-2xs whitespace-nowrap"
                    >
                      Explain AI Score (XAI)
                    </button>
                  </div>

                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 pt-1">
                    <span>
                      Team:{' '}
                      <strong className="text-slate-800">
                        {needsOxygen ? 'NDRF Boat 1 (Oxygen)' : isElderly ? 'SDRF Boat 2' : 'Rescue Team 3'}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Arrival: <strong className="text-slate-800">~20 mins</strong></span>
                  </div>

                  {/* Ephemeral Tactical Coordinate Log with Visible TTL Countdown */}
                  {(() => {
                    const ttl = coordinateTtlMap[incident.id] ?? 0.0;
                    const isUnlocked = ttl > 0.0;
                    const rawAddress = incident.provenanceTrail[0]?.exactAddress || `${incident.landmark}, ${incident.district}`;
                    const maskedAddress = '******************** (Hidden)';

                    return (
                      <div className={`mt-3 p-3 rounded-lg border text-xs space-y-2 transition-all ${
                        isUnlocked
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                              {isUnlocked ? (
                                <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <span>Tactical Coordinate Log:</span>
                            </span>

                            {/* Visible Countdown Timer (TTL) */}
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] inline-flex items-center gap-1 tabular-nums ${
                                isUnlocked
                                  ? ttl < 10
                                    ? 'bg-amber-100 text-amber-950 border border-amber-300 animate-pulse'
                                    : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                                  : 'bg-rose-100 text-rose-950 border border-rose-300'
                              }`}
                            >
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{ttl.toFixed(2)}s TTL</span>
                              {!isUnlocked && (
                                <span className="ml-1 uppercase tracking-wide font-extrabold text-[10px]">
                                  [TOKEN EXPIRED]
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isUnlocked ? (
                              <button
                                type="button"
                                onClick={() => handleExpireLeaseImmediately(incident.id)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-[11px] font-medium transition-colors"
                              >
                                Expire Lease Now
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleGrantCoordinateLease(incident.id, 45)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shadow-xs"
                              >
                                <Unlock className="w-3 h-3 text-amber-400" />
                                <span>Unlock Ephemeral Coordinates (45s)</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Unlocked vs Masked Asterisks Address Display */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60 font-mono">
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase font-sans">
                              Household GPS Coordinates
                            </span>
                            <span className={`font-semibold ${isUnlocked ? 'text-emerald-950' : 'text-slate-500'}`}>
                              {isUnlocked
                                ? `${incident.coordinates.lat.toFixed(4)}° N, ${incident.coordinates.lng.toFixed(4)}° E`
                                : `${incident.coordinates.lat.toFixed(2)}**° N, ${incident.coordinates.lng.toFixed(2)}**° E [MASKED]`}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase font-sans">
                              Exact Pickup Location
                            </span>
                            <span className={`font-semibold ${isUnlocked ? 'text-slate-900' : 'text-rose-700 font-extrabold'}`}>
                              {isUnlocked ? (
                                rawAddress
                              ) : (
                                <>
                                  <span>{maskedAddress}</span>{' '}
                                  <span className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 text-[10px]">
                                    [TOKEN EXPIRED]
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  <div className="mr-2 tabular-nums">
                    <span className="text-slate-400 block text-[11px]">Urgency</span>
                    <strong className="text-lg font-mono text-slate-900">
                      {incident.triagePriorityScore}/100
                    </strong>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedIncidentForOverride(incident);
                      setOverrideScore(incident.triagePriorityScore);
                      setOverrideError(null);
                    }}
                    className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-2xs"
                  >
                    <Sliders className="w-3.5 h-3.5 text-slate-500" />
                    <span>Change Priority</span>
                  </button>

                  <button
                    onClick={() => onOpenProvenance(incident)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Change Priority Modal with Mandatory Justification & Immutable Ledger Signature */}
      {selectedIncidentForOverride && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-mono font-bold uppercase tracking-wider mb-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Immutable Human Override Checkpoint</span>
                </div>
                <h3 className="text-sm font-bold">Shift Triage Queue Priority</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-sm">
                  {selectedIncidentForOverride.title}
                </p>
              </div>
              <button
                onClick={() => setSelectedIncidentForOverride(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">
                  Queue Shift Impact
                </span>
                <div className="flex items-center justify-between font-mono">
                  <span>Current AI Score: <strong>{selectedIncidentForOverride.triagePriorityScore}/100</strong></span>
                  <span className="text-slate-400">→</span>
                  <span className="text-emerald-700 font-bold">New Priority: {overrideScore}/100</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1.5 tabular-nums">
                  Adjusted Urgency Score: <strong className="text-slate-900 font-mono">{overrideScore}/100</strong>
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(Number(e.target.value))}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-800">
                    Mandatory Operational Justification (Min 15 chars)
                  </label>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      overrideReason.trim().length >= 15 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {overrideReason.trim().length} / 15 chars
                  </span>
                </div>
                <textarea
                  value={overrideReason}
                  onChange={(e) => {
                    setOverrideReason(e.target.value);
                    if (overrideError) setOverrideError(null);
                  }}
                  placeholder="e.g., On-site boat commander confirmed generator failure and patient is on 1.5h reserve cylinder..."
                  rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900 font-sans"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This justification will be permanently stamped into the immutable cryptographic audit ledger with your officer credentials.
                </p>
                {overrideError && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{overrideError}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Authorized Officer Name &amp; Agency
                </label>
                <input
                  type="text"
                  value={responderName}
                  onChange={(e) => setResponderName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900 font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedIncidentForOverride(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyOverride}
                  disabled={overrideReason.trim().length < 15}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sign &amp; Append to Ledger</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Explainable AI (XAI) Modal */}
      <ExplainableAiModal
        incident={selectedIncidentForXai}
        onClose={() => setSelectedIncidentForXai(null)}
      />
    </div>
  );
};
