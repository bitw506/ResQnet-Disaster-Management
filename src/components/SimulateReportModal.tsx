import React, { useState } from 'react';
import {
  SourceChannel,
  DistrictName,
  IndianStateName,
  IncidentCategory,
  FusedIncident,
  ReportPacket
} from '../types/disaster';
import { generateProvenanceHash } from '../services/fusionEngine';
import {
  INDIAN_STATES_ONLY,
  INDIAN_UTS_ONLY,
  getDistrictsForState,
  getStateInfo,
  formatLocationWithState
} from '../data/indianStates';
import {
  X,
  Send
} from 'lucide-react';

interface SimulateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingIncidents: FusedIncident[];
  onIngestNewPacket: (packet: ReportPacket, targetIncidentId?: string, isConflicting?: boolean, conflictClaim?: string) => void;
}

export const SimulateReportModal: React.FC<SimulateReportModalProps> = ({
  isOpen,
  onClose,
  existingIncidents,
  onIngestNewPacket
}) => {
  const [channel, setChannel] = useState<SourceChannel>('sdrf_radio');
  const [stateName, setStateName] = useState<IndianStateName>('Assam');
  const [district, setDistrict] = useState<DistrictName>('Barpeta');
  const [customDistrict, setCustomDistrict] = useState<string>('');
  const [category, setCategory] = useState<IncidentCategory>('flood_surge');
  const [reporterName, setReporterName] = useState('Anand Das');
  const [reporterRole, setReporterRole] = useState('Field Responder');
  const [landmark, setLandmark] = useState('River Embankment, Ward 2');
  const [headline, setHeadline] = useState('Water rising near primary school');
  const [details, setDetails] = useState('Around 30 families waiting on high ground near the school.');
  const [targetClusterOption, setTargetClusterOption] = useState<'new' | 'corroborate' | 'conflict'>('new');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(existingIncidents[0]?.id || '');
  const [conflictClaimText, setConflictClaimText] = useState('Embankment is holding and water is receding.');

  if (!isOpen) return null;

  const districtOptions = getDistrictsForState(stateName);
  const resolvedDistrict = district === '__custom__' ? (customDistrict.trim() || stateName) : district;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const packetId = `REP-${channel.toUpperCase().slice(0, 3)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const now = Date.now();
    const isOfficial = channel === 'pwd_official' || channel === 'district_magistrate' || channel === 'cwc_gauge' || channel === 'imd_feed';
    const isAuthorized = channel === 'ndrf_agent' || channel === 'sdrf_radio';

    const stInfo = getStateInfo(stateName);
    const baseCenter = stInfo ? stInfo.viewCenter : { lat: 22.5937, lng: 78.9629 };

    const packet: ReportPacket = {
      id: packetId,
      incidentClusterId: targetClusterOption === 'new' ? `INC-${Math.floor(Math.random() * 900 + 100)}` : selectedIncidentId,
      timestamp: now,
      channel,
      reporterName,
      reporterRole,
      isOfficial,
      isAuthorizedFieldAgent: isAuthorized,
      stateName,
      district: resolvedDistrict,
      landmark,
      coordinates: {
        lat: Number((baseCenter.lat + (Math.random() - 0.5) * 0.08).toFixed(4)),
        lng: Number((baseCenter.lng + (Math.random() - 0.5) * 0.08).toFixed(4))
      },
      category,
      headline,
      details,
      rawPayload: JSON.stringify({
        packet_id: packetId,
        source: channel,
        reporter: reporterName,
        state: stateName,
        district: resolvedDistrict,
        landmark,
        text: headline,
        ingested_at: new Date(now).toISOString()
      }),
      provenanceHash: generateProvenanceHash(packetId, now, channel),
      contactMasked: '+91 98640 *****',
      exactAddress: `${landmark}, ${resolvedDistrict}, ${stateName}`
    };

    onIngestNewPacket(
      packet,
      targetClusterOption === 'new' ? undefined : selectedIncidentId,
      targetClusterOption === 'conflict',
      conflictClaimText
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-white">
              Add Field Report (All India)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Add a ground update from any Indian State / UT or confirm an existing report
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-800 mb-1.5">
              What are you reporting?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'new', title: 'New Incident' },
                { id: 'corroborate', title: 'Confirm Existing' },
                { id: 'conflict', title: 'Different Update' }
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTargetClusterOption(opt.id)}
                  className={`p-2.5 rounded-lg border text-center font-semibold transition-colors ${
                    targetClusterOption === opt.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {opt.title}
                </button>
              ))}
            </div>
          </div>

          {targetClusterOption !== 'new' && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Choose Report
                </label>
                <select
                  value={selectedIncidentId}
                  onChange={(e) => setSelectedIncidentId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
                >
                  {existingIncidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.title} ({formatLocationWithState(inc.district, inc.stateName)})
                    </option>
                  ))}
                </select>
              </div>

              {targetClusterOption === 'conflict' && (
                <div>
                  <label className="block font-semibold text-rose-800 mb-1">
                    What is different on the ground?
                  </label>
                  <input
                    type="text"
                    value={conflictClaimText}
                    onChange={(e) => setConflictClaimText(e.target.value)}
                    className="w-full p-2.5 border border-rose-300 rounded-lg bg-white outline-none focus:border-rose-600"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">State / Union Territory</label>
              <select
                value={stateName}
                onChange={(e) => {
                  const nextState = e.target.value;
                  setStateName(nextState);
                  const nextDistricts = getDistrictsForState(nextState);
                  setDistrict(nextDistricts[0] || nextState);
                  setCustomDistrict('');
                }}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
              >
                <optgroup label="States (28)">
                  {INDIAN_STATES_ONLY.map((st) => (
                    <option key={st.code} value={st.name}>
                      {st.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Union Territories (8)">
                  {INDIAN_UTS_ONLY.map((ut) => (
                    <option key={ut.code} value={ut.name}>
                      {ut.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">District / City</label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
              >
                {districtOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="__custom__">Other District / Town…</option>
              </select>
              {district === '__custom__' && (
                <input
                  type="text"
                  value={customDistrict}
                  onChange={(e) => setCustomDistrict(e.target.value)}
                  placeholder={`Enter district or town in ${stateName}`}
                  className="mt-2 w-full p-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
                  required
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Source</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as SourceChannel)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
              >
                <option value="sdrf_radio">SDRF Team</option>
                <option value="ndrf_agent">NDRF Officer</option>
                <option value="pwd_official">PWD Roads</option>
                <option value="district_magistrate">District Control / SDMA</option>
                <option value="citizen_sms">Citizen SMS</option>
                <option value="citizen_web">Citizen Web Form</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Type</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
              >
                <option value="flood_surge">Rising Water / Cyclone</option>
                <option value="medical_oxygen">Medical / Oxygen</option>
                <option value="bridge_collapse">Bridge Condition</option>
                <option value="road_cut">Road / Landslide Cut</option>
                <option value="shelter_capacity">Shelter Space</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">Area / Landmark</label>
            <input
              type="text"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Your Name</label>
              <input
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Team / Role</label>
              <input
                type="text"
                value={reporterRole}
                onChange={(e) => setReporterRole(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">Short Summary</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">Notes</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
            />
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
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Save Report</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
