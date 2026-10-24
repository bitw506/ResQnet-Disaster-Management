import React from 'react';
import { StoreForwardMessage } from '../types/disaster';
import { LanguageCode } from '../services/i18n';
import { RefreshCw } from 'lucide-react';

interface StoreForwardConsoleProps {
  language: LanguageCode;
  messages: StoreForwardMessage[];
  onSyncMessage: (msgId: string) => void;
  onSyncAllMessages: () => void;
}

function formatReadableNeed(msg: StoreForwardMessage): { title: string; summary: string } {
  switch (msg.lastKnownSafeStatus) {
    case 'OXYGEN_NEEDED':
      return {
        title: 'Needs Medical Oxygen',
        summary: 'Power out 6+ hours with rising water (~4.5 ft). Urgent oxygen backup needed.'
      };
    case 'NEED_RESCUE':
      return {
        title: 'Trapped — Needs Rescue Boat',
        summary: 'Elderly family member stranded near washed-out road.'
      };
    case 'WATER_RISING':
      return {
        title: 'Water Rising Fast',
        summary: 'Floodwater around 4 ft and rising in neighborhood.'
      };
    case 'SAFE':
    default:
      return {
        title: 'Earlier Check-In: Safe',
        summary: 'Earlier message reported family safe before water rose.'
      };
  }
}

export const StoreForwardConsole: React.FC<StoreForwardConsoleProps> = ({
  language: _language,
  messages,
  onSyncMessage,
  onSyncAllMessages
}) => {
  const pendingCount = messages.filter((m) => m.status === 'queued_locally').length;

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Offline Text & Phone Messages
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Help requests sent by SMS or <code className="font-mono">*1070#</code> from areas without internet.
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={onSyncAllMessages}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto tabular-nums"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Add All to Map ({pendingCount})</span>
          </button>
        )}
      </div>

      {/* Queued Messages */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700 tabular-nums">
          <span>Received Messages ({messages.length})</span>
          <span className="text-slate-500 font-normal">SMS & *1070#</span>
        </div>

        <div className="divide-y divide-slate-100">
          {messages.map((msg) => {
            const readable = formatReadableNeed(msg);
            return (
              <div key={msg.id} className="p-4 space-y-1.5 hover:bg-slate-50/60 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-slate-500">
                    <strong className="text-slate-900">{readable.title}</strong>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{msg.phoneNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>via {msg.channel}</span>
                  </div>

                  <span
                    className={`font-semibold ${
                      msg.status === 'synced'
                        ? 'text-emerald-700'
                        : msg.status === 'conflict_resolved'
                        ? 'text-slate-500'
                        : 'text-amber-700'
                    }`}
                  >
                    {msg.status === 'synced'
                      ? 'Added to Map'
                      : msg.status === 'conflict_resolved'
                      ? 'Replaced by Newer Text'
                      : 'Waiting'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {readable.summary}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                  <span className="text-slate-500">Area: {msg.locationText}</span>

                  {msg.status === 'queued_locally' && (
                    <button
                      type="button"
                      onClick={() => onSyncMessage(msg.id)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                    >
                      Add to Map
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
