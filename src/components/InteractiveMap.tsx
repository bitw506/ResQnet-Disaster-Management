import React, { useEffect, useMemo, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  useMap
} from '@vis.gl/react-google-maps';
import {
  FusedIncident,
  CredibilityState
} from '../types/disaster';
import {
  AlertTriangle,
  Bell,
  Send,
  X,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  MapPin
} from 'lucide-react';
import { LanguageCode } from '../services/i18n';
import {
  INCIDENT_TO_PLACE_KEY,
  useGroundedAssamPlaces,
  useDetourRoute,
  GeoPoint,
  isRealGoogleMapsKey
} from '../services/groundedLocations';
import { dispatchAreaAlertOnServer } from '../services/realtimeClient';
import { SIMULATION_LABEL_STRING } from '../services/operationalCheckpoints';
import {
  ALL_INDIA_CENTER,
  ALL_INDIA_ZOOM,
  INDIAN_STATES_ONLY,
  INDIAN_UTS_ONLY,
  getDistrictsForState,
  getStateInfo,
  inferStateFromDistrict,
  formatLocationWithState,
  getDistrictZoneListForState
} from '../data/indianStates';

interface InteractiveMapProps {
  incidents: FusedIncident[];
  selectedIncident: FusedIncident | null;
  onSelectIncident: (inc: FusedIncident) => void;
  language: LanguageCode;
  onOpenProvenance: (inc: FusedIncident) => void;
  onResolveBridgeConflict?: () => void;
}

const OfficerMapOverlaysController: React.FC<{
  focusedPoint: GeoPoint | null;
  fitPoints: GeoPoint[];
  fitTriggerKey: string;
  fallbackViewport: { center: GeoPoint; zoom: number } | null;
  showFloodLayer: boolean;
  floodCenters: Array<{ center: GeoPoint; radius: number }>;
  detourPath: GeoPoint[] | null;
  isBridgeDisputed: boolean;
}> = ({
  focusedPoint,
  fitPoints,
  fitTriggerKey,
  fallbackViewport,
  showFloodLayer,
  floodCenters,
  detourPath,
  isBridgeDisputed
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusedPoint) return;
    map.panTo(focusedPoint);
    if ((map.getZoom() || 8) < 12) {
      map.setZoom(13);
    }
  }, [map, focusedPoint?.lat, focusedPoint?.lng]);

  useEffect(() => {
    if (!map || focusedPoint) return;
    if (fitPoints.length === 1) {
      map.panTo(fitPoints[0]);
      map.setZoom(11);
      return;
    }
    if (fitPoints.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      fitPoints.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, 48);
      return;
    }
    if (fallbackViewport) {
      map.panTo(fallbackViewport.center);
      map.setZoom(fallbackViewport.zoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitTriggerKey, fitPoints.length]);

  useEffect(() => {
    if (!map || !showFloodLayer || floodCenters.length === 0) return;
    const circles = floodCenters.map(
      (item) =>
        new google.maps.Circle({
          map,
          center: item.center,
          radius: item.radius,
          strokeColor: '#0284c7',
          strokeOpacity: 0.75,
          strokeWeight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 0.16,
          clickable: false
        })
    );
    return () => {
      circles.forEach((c) => c.setMap(null));
    };
  }, [map, showFloodLayer, floodCenters]);

  useEffect(() => {
    if (!map || !detourPath || detourPath.length < 2) return;
    const polyline = new google.maps.Polyline({
      map,
      path: detourPath,
      geodesic: true,
      strokeColor: isBridgeDisputed ? '#d97706' : '#059669',
      strokeOpacity: 0.92,
      strokeWeight: 5
    });
    return () => {
      polyline.setMap(null);
    };
  }, [map, detourPath, isBridgeDisputed]);

  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  language: _language,
  onOpenProvenance,
  onResolveBridgeConflict
}) => {
  const hasLiveKey = useMemo(
    () => isRealGoogleMapsKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
    []
  );
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('ALL');
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>('ALL');
  const [selectedShelter, setSelectedShelter] = useState<any>(null);

  const availableDistricts = useMemo(() => {
    if (selectedStateFilter === 'ALL') {
      return ['ALL', 'Barpeta', 'Kamrup', 'Morigaon', 'Dhubri', 'Cachar', 'Patna', 'Wayanad', 'Puri'];
    }
    return ['ALL', ...getDistrictsForState(selectedStateFilter)];
  }, [selectedStateFilter]);

  const primaryDistrictForSelectedState =
    selectedStateFilter === 'ALL' ? undefined : getDistrictsForState(selectedStateFilter)[0];

  const { placesMap, isResolving, quotaBlocked, retryResolvePlaces } = useGroundedAssamPlaces({
    enabled: true,
    activeStateName: selectedStateFilter,
    activeDistrict: primaryDistrictForSelectedState
  });

  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showBypassRoute, setShowBypassRoute] = useState(true);
  const [alertTargetingOpen, setAlertTargetingOpen] = useState(false);
  const [alertStateName, setAlertStateName] = useState<string>('Assam');
  const [alertDistrictName, setAlertDistrictName] = useState<string>('Barpeta');
  const [alertSeverity, setAlertSeverity] = useState<'advisory' | 'warning' | 'critical'>('critical');
  const [alertFormat, setAlertFormat] = useState<'sms' | 'ivr' | 'pictograph' | 'audio'>('pictograph');
  const [alertBroadcastSent, setAlertBroadcastSent] = useState(false);
  const [showBridgeDetails, setShowBridgeDetails] = useState<boolean>(false);

  const bridgeIncident = incidents.find((i) => i.id === 'INC-BRIDGE-01');
  const isBridgeDisputed = bridgeIncident ? bridgeIncident.state === 'disputed' : false;

  const detourRoute = useDetourRoute(
    showBypassRoute && (selectedStateFilter === 'ALL' || selectedStateFilter === 'Assam')
  );

  const getGroundedIncidentCoords = (inc: FusedIncident): GeoPoint | null => {
    const mappedKey = INCIDENT_TO_PLACE_KEY[inc.id];
    if (mappedKey && placesMap[mappedKey]?.location) {
      return placesMap[mappedKey].location;
    }
    return inc.coordinates || null;
  };

  const visibleIncidentsWithCoords = useMemo(() => {
    return incidents
      .filter((inc) => {
        if (selectedStateFilter !== 'ALL') {
          const incState = inferStateFromDistrict(inc.district, inc.stateName);
          if (incState.toLowerCase() !== selectedStateFilter.toLowerCase()) return false;
        }
        if (selectedDistrictFilter !== 'ALL') {
          if (inc.district.toLowerCase() !== selectedDistrictFilter.toLowerCase()) return false;
        }
        return true;
      })
      .map((inc) => ({ incident: inc, coords: getGroundedIncidentCoords(inc) }))
      .filter((entry): entry is { incident: FusedIncident; coords: GeoPoint } => Boolean(entry.coords));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, selectedStateFilter, selectedDistrictFilter, placesMap]);

  const visibleShelters = useMemo(() => {
    if (!showShelters) return [];
    return Object.values(placesMap).filter(
      (s) =>
        Boolean(s?.location) &&
        (s.publicRole === 'shelter' || s.publicRole === 'backup_shelter') &&
        (selectedStateFilter === 'ALL' ||
          (s.stateName || 'Assam').toLowerCase() === selectedStateFilter.toLowerCase())
    );
  }, [showShelters, placesMap, selectedStateFilter]);

  const fallbackViewport = useMemo(() => {
    if (selectedStateFilter === 'ALL') {
      return { center: ALL_INDIA_CENTER, zoom: ALL_INDIA_ZOOM };
    }
    const stInfo = getStateInfo(selectedStateFilter);
    if (stInfo) {
      return { center: stInfo.viewCenter, zoom: stInfo.viewZoom };
    }
    return { center: ALL_INDIA_CENTER, zoom: ALL_INDIA_ZOOM };
  }, [selectedStateFilter]);

  const floodCenters = useMemo(() => {
    const items: Array<{ center: GeoPoint; radius: number }> = [];
    if (
      (selectedStateFilter === 'ALL' || selectedStateFilter === 'Assam') &&
      placesMap.barpeta_vidyapith?.location
    ) {
      items.push({ center: placesMap.barpeta_vidyapith.location, radius: 4200 });
    }
    if (
      (selectedStateFilter === 'ALL' || selectedStateFilter === 'Assam') &&
      placesMap.morigaon_dyke?.location
    ) {
      items.push({ center: placesMap.morigaon_dyke.location, radius: 3800 });
    }
    if (
      (selectedStateFilter === 'ALL' || selectedStateFilter === 'Bihar') &&
      placesMap.patna_gandhi_maidan?.location
    ) {
      items.push({ center: placesMap.patna_gandhi_maidan.location, radius: 4400 });
    }
    return items;
  }, [placesMap, selectedStateFilter]);

  const selectedIncidentCoords = selectedIncident
    ? getGroundedIncidentCoords(selectedIncident)
    : null;

  const selectedIncidentPlace =
    selectedIncident && INCIDENT_TO_PLACE_KEY[selectedIncident.id]
      ? placesMap[INCIDENT_TO_PLACE_KEY[selectedIncident.id]]
      : null;

  const getMarkerBadge = (state: CredibilityState) => {
    switch (state) {
      case 'verified':
        return { bgClass: 'bg-emerald-600', symbol: '✓', label: 'Verified' };
      case 'corroborated':
        return { bgClass: 'bg-amber-600', symbol: '2+', label: '2+ Reports' };
      case 'unconfirmed':
        return { bgClass: 'bg-sky-600', symbol: '?', label: 'Needs Check' };
      case 'disputed':
        return { bgClass: 'bg-red-600', symbol: '!', label: 'Conflicting' };
    }
  };

  const handleBroadcastAlert = async () => {
    setAlertBroadcastSent(true);
    await dispatchAreaAlertOnServer({
      area: `${alertDistrictName}, ${alertStateName}`,
      urgency: alertSeverity,
      format: alertFormat
    });
    setTimeout(() => {
      setAlertBroadcastSent(false);
    }, 4000);
  };

  const availableAlertDistricts = getDistrictsForState(alertStateName);

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            National Rescue &amp; Road Operations Map
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            All-India Google Maps view of flood zones, designated shelters, detour corridors, and active rescue calls across all States &amp; UTs.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {isResolving && (
            <span className="text-xs text-slate-500">Resolving Google Maps places…</span>
          )}
          {quotaBlocked && !isResolving && (
            <button
              type="button"
              onClick={retryResolvePlaces}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Places</span>
            </button>
          )}
          <button
            onClick={() => setAlertTargetingOpen(!alertTargetingOpen)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              alertTargetingOpen
                ? 'bg-slate-200 text-slate-900'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{alertTargetingOpen ? 'Close Alert Form' : 'Send Area Alert'}</span>
          </button>
        </div>
      </div>

      {/* Bridge Status Notice */}
      {bridgeIncident && (selectedStateFilter === 'ALL' || selectedStateFilter === 'Assam') && (
        <div
          className={`p-4 rounded-xl border text-xs space-y-3 ${
            isBridgeDisputed
              ? 'border-rose-200 bg-rose-50/50 text-slate-800'
              : 'border-emerald-200 bg-emerald-50/50 text-slate-800'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {isBridgeDisputed ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <strong className="text-sm text-slate-900">
                  NH-27 Puthimari Bridge (Kamrup, Assam): {isBridgeDisputed ? 'Closed (Conflicting Reports)' : 'Open & Safe'}
                </strong>
              </div>
              <p className="text-slate-600 pl-6">
                {isBridgeDisputed
                  ? `PWD reported it open, while SDRF saw water damage on Pier 3. Use SH-12 detour${
                      detourRoute ? ` (${detourRoute.distanceKm} km, ~${detourRoute.durationMin} mins)` : ''
                    } until checked.`
                  : 'Joint team checked the bridge. Safe for rescue vehicles.'}
              </p>
            </div>

            {isBridgeDisputed && (
              <div className="flex items-center gap-2 pl-6 md:pl-0 shrink-0">
                <button
                  onClick={() => setShowBridgeDetails(!showBridgeDetails)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {showBridgeDetails ? 'Hide Reports' : 'Compare Reports'}
                </button>
                {onResolveBridgeConflict && (
                  <button
                    onClick={onResolveBridgeConflict}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    Mark Safe &amp; Open
                  </button>
                )}
              </div>
            )}
          </div>

          {isBridgeDisputed && showBridgeDetails && bridgeIncident.conflictingReports && (
            <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-slate-500 text-[11px] font-semibold">
                  {bridgeIncident.conflictingReports.sourceA}
                </div>
                <p className="text-slate-700 mt-0.5">
                  "{bridgeIncident.conflictingReports.claimA}"
                </p>
              </div>
              <div>
                <div className="text-rose-700 text-[11px] font-semibold">
                  {bridgeIncident.conflictingReports.sourceB}
                </div>
                <p className="text-slate-700 mt-0.5">
                  "{bridgeIncident.conflictingReports.claimB}"
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Area Alert Form */}
      {alertTargetingOpen && (
        <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Send State / District Area Warning
              </h3>
              <p className="text-slate-600 mt-0.5">
                Alerts phones in the selected State/UT &amp; District via the ResQnet backend (skips phones warned in the last hour).
              </p>
            </div>
            <button
              onClick={() => setAlertTargetingOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Close alert panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">
                State / Union Territory
              </label>
              <select
                value={alertStateName}
                onChange={(e) => {
                  const nextSt = e.target.value;
                  setAlertStateName(nextSt);
                  const firstDist = getDistrictsForState(nextSt)[0] || nextSt;
                  setAlertDistrictName(firstDist);
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
              <label className="block font-semibold text-slate-800 mb-1.5">
                District / Zone
              </label>
              <select
                value={alertDistrictName}
                onChange={(e) => setAlertDistrictName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-slate-900"
              >
                {availableAlertDistricts.map((dist) => (
                  <option key={dist} value={dist}>
                    {dist}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">
                Urgency
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'advisory', label: 'Notice' },
                  { id: 'warning', label: 'Warning' },
                  { id: 'critical', label: 'Evacuate Now' }
                ] as const).map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setAlertSeverity(lvl.id)}
                    className={`py-2 px-2 rounded-lg border font-semibold transition-colors whitespace-nowrap truncate ${
                      alertSeverity === lvl.id
                        ? lvl.id === 'critical'
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1.5">
              How to Send
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {([
                { id: 'pictograph', title: 'Screen Icon', desc: 'Simple visual warning' },
                { id: 'sms', title: 'Text SMS', desc: 'Works without internet' },
                { id: 'ivr', title: 'Voice Call', desc: 'Spoken in English & Hindi' },
                { id: 'audio', title: 'Local Siren', desc: 'Outdoor warning horn' }
              ] as const).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setAlertFormat(fmt.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    alertFormat === fmt.id
                      ? 'border-red-600 bg-red-50/50 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-slate-900">{fmt.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{fmt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-slate-600 tabular-nums">
              <strong className="text-slate-900">
                Target: {alertDistrictName}, {alertStateName}
              </strong>{' '}
              · 3,982 phones ready (228 skipped — warned within 60m)
            </div>

            <button
              type="button"
              onClick={handleBroadcastAlert}
              disabled={alertBroadcastSent}
              className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                alertBroadcastSent
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {alertBroadcastSent ? `Sent to ${alertDistrictName}, ${alertStateName}` : 'Send Warning Now'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Simulation Feed Watermark */}
      <div className="flex items-center justify-between px-3.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400 text-amber-950 text-xs">
        <span className="font-mono font-bold tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>{SIMULATION_LABEL_STRING}</span>
        </span>
        <span className="text-[11px] text-amber-900 font-medium hidden sm:inline">
          Programmatic Checkpoint: Verified mock hazard tracks, river gauges &amp; detour routes.
        </span>
      </div>

      {/* Map Filter Bar & Viewport */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="officer-map-state-select" className="font-semibold text-slate-700 whitespace-nowrap">
                State / UT:
              </label>
              <select
                id="officer-map-state-select"
                value={selectedStateFilter}
                onChange={(e) => {
                  setSelectedStateFilter(e.target.value);
                  setSelectedDistrictFilter('ALL');
                  onSelectIncident(null as any);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium outline-none focus:border-slate-900"
              >
                <option value="ALL">All States &amp; UTs (India)</option>
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

            <div className="flex items-center gap-2">
              <label htmlFor="officer-map-district-select" className="font-semibold text-slate-700 whitespace-nowrap">
                District:
              </label>
              <select
                id="officer-map-district-select"
                value={selectedDistrictFilter}
                onChange={(e) => setSelectedDistrictFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium outline-none focus:border-slate-900"
              >
                {availableDistricts.map((dist) => (
                  <option key={dist} value={dist}>
                    {dist === 'ALL' ? 'All Districts' : dist}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showFloodLayer}
                onChange={(e) => setShowFloodLayer(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              <span>Flood Zones</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showBypassRoute}
                onChange={(e) => setShowBypassRoute(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              <span>Detour Route</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showShelters}
                onChange={(e) => setShowShelters(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              <span>Shelters</span>
            </label>
          </div>
        </div>

        {/* District Chips Quick Bar */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px] scrollbar-thin">
          <span className="font-bold text-slate-600 whitespace-nowrap mr-1">Districts:</span>
          {availableDistricts.slice(0, 14).map((dist) => {
            const isSelected = selectedDistrictFilter === dist;
            return (
              <button
                key={dist}
                type="button"
                onClick={() => setSelectedDistrictFilter(dist)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {dist === 'ALL' ? '🌐 All Districts' : dist}
              </button>
            );
          })}
        </div>

        {/* Map Viewport: GoogleMap */}
        <div className="relative w-full h-[500px] min-h-[480px] bg-slate-100">
          <GoogleMap
            defaultCenter={ALL_INDIA_CENTER}
            defaultZoom={ALL_INDIA_ZOOM}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
            style={{ width: '100%', height: '100%', minHeight: '480px' }}
          >
            <OfficerMapOverlaysController
              focusedPoint={selectedIncidentCoords || (selectedShelter?.location ?? null)}
              fitPoints={visibleIncidentsWithCoords.map((v) => v.coords)}
              fitTriggerKey={selectedStateFilter}
              fallbackViewport={fallbackViewport}
              showFloodLayer={showFloodLayer}
              floodCenters={floodCenters}
              detourPath={showBypassRoute && detourRoute ? detourRoute.path : null}
              isBridgeDisputed={isBridgeDisputed}
            />

            {/* Relief Shelter Advanced Markers */}
            {visibleShelters.map((shelter, idx) => {
              const isSelected = selectedShelter?.key === shelter.key;
              return (
                <AdvancedMarker
                  key={`shelter-${shelter.key}`}
                  position={shelter.location}
                  title={shelter.publicTitle}
                  zIndex={isSelected ? 45 : 25}
                  onClick={() => {
                    setSelectedShelter(shelter);
                    onSelectIncident(null as any);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShelter(shelter);
                      onSelectIncident(null as any);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-900 text-white border shadow-md text-[11px] font-semibold whitespace-nowrap transition-transform cursor-pointer ${
                      isSelected
                        ? 'ring-2 ring-emerald-400 scale-105 border-white'
                        : 'border-white hover:scale-105'
                    }`}
                  >
                    <span className="font-bold">S{idx + 1}</span>
                    <span>{shelter.displayName}</span>
                  </button>
                </AdvancedMarker>
              );
            })}

            {/* Active Rescue Incident Advanced Markers */}
            {visibleIncidentsWithCoords.map(({ incident, coords }) => {
              const badge = getMarkerBadge(incident.state);
              const isSelected = selectedIncident?.id === incident.id;
              return (
                <AdvancedMarker
                  key={incident.id}
                  position={coords}
                  title={incident.title}
                  zIndex={isSelected ? 40 : 20}
                  onClick={() => {
                    setSelectedShelter(null);
                    onSelectIncident(incident);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShelter(null);
                      onSelectIncident(incident);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-900 shadow-md text-[11px] font-semibold whitespace-nowrap transition-transform ${
                      isSelected
                        ? 'ring-2 ring-slate-900 scale-105 border border-slate-900'
                        : 'border border-slate-300 hover:scale-105'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full ${badge.bgClass} text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0`}
                    >
                      {badge.symbol}
                    </span>
                    <span className="max-w-[160px] truncate">{incident.title}</span>
                  </button>
                </AdvancedMarker>
              );
            })}
          </GoogleMap>

          {/* Selected Incident Detail Overlay */}
          {selectedIncident && (
            <div className="absolute top-3 right-3 max-w-xs w-[calc(100%-1.5rem)] bg-white text-slate-900 rounded-xl border border-slate-200 shadow-lg p-4 text-xs z-20 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">
                    <strong
                      className={
                        selectedIncident.state === 'verified'
                          ? 'text-emerald-700'
                          : selectedIncident.state === 'corroborated'
                          ? 'text-amber-700'
                          : selectedIncident.state === 'disputed'
                          ? 'text-rose-700'
                          : 'text-sky-700'
                      }
                    >
                      {getMarkerBadge(selectedIncident.state).label}
                    </strong>
                    {' · '}
                    <span>{formatLocationWithState(selectedIncident.district, selectedIncident.stateName)}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-0.5 leading-snug">
                    {selectedIncident.title}
                  </h4>
                </div>
                <button
                  onClick={() => onSelectIncident(null as any)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                  aria-label="Close incident details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-slate-600 text-[11px]">
                {selectedIncidentPlace
                  ? selectedIncidentPlace.formattedAddress
                  : selectedIncident.landmark}
              </div>

              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex justify-between tabular-nums">
                <span>Updated {selectedIncident.ageMinutes}m ago</span>
                <strong className="text-slate-900">{selectedIncident.currentReliability}% confidence</strong>
              </div>

              {selectedIncident.state === 'disputed' && selectedIncident.conflictingReports && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-900">
                  {selectedIncident.conflictingReports.conservativeAction}
                </div>
              )}

              {selectedIncident.freshnessStatus === 'stale' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                  {selectedIncident.fallbackInstructions}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                {(selectedIncidentPlace?.googleMapsURI || selectedIncidentCoords) && (
                  <a
                    href={
                      selectedIncidentPlace?.googleMapsURI ||
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${selectedIncidentCoords!.lat},${selectedIncidentCoords!.lng}`
                      )}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <span>Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => onOpenProvenance(selectedIncident)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors ml-auto"
                >
                  Details ({selectedIncident.provenanceTrail.length})
                </button>
              </div>
            </div>
          )}

          {/* Selected Shelter Detail Overlay */}
          {selectedShelter && (
            <div className="absolute top-3 right-3 max-w-xs w-[calc(100%-1.5rem)] bg-white text-slate-900 rounded-xl border border-emerald-200 shadow-lg p-4 text-xs z-20 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                    <span>Designated Relief Shelter · {formatLocationWithState(selectedShelter.district, selectedShelter.stateName)}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-0.5 leading-snug">
                    {selectedShelter.displayName || selectedShelter.publicTitle}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedShelter(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                  aria-label="Close shelter details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-slate-600 text-[11px]">
                {selectedShelter.formattedAddress}
              </div>

              <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-[11px] text-emerald-950 leading-relaxed">
                {selectedShelter.publicSummary}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 tabular-nums">Helpline: 1070 / 112</span>
                {selectedShelter.googleMapsURI && (
                  <a
                    href={selectedShelter.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <span>Directions</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clean Unboxed Legend Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold inline-flex items-center justify-center">✓</span>
              Verified
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[9px] font-bold inline-flex items-center justify-center">2+</span>
              2+ Reports
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-sky-600 text-white text-[10px] font-bold inline-flex items-center justify-center">?</span>
              Needs Check
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold inline-flex items-center justify-center">!</span>
              Conflicting
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Powered by Google Maps Platform · Click any pin for details
          </span>
        </div>
      </div>
    </div>
  );
};
