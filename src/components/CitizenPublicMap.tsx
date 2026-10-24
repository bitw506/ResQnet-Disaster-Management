import React, { useEffect, useMemo, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  useMap
} from '@vis.gl/react-google-maps';
import {
  ShieldCheck,
  ExternalLink,
  Navigation,
  Home,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X
} from 'lucide-react';
import {
  GroundedPlaceRecord,
  MentionedPlaceKey,
  PUBLIC_PLACE_SPECS,
  PlaceQuerySpec,
  useDetourRoute,
  GeoPoint,
  isRealGoogleMapsKey
} from '../services/groundedLocations';
import {
  ALL_INDIA_CENTER,
  ALL_INDIA_ZOOM,
  INDIAN_STATES_ONLY,
  INDIAN_UTS_ONLY,
  getStateInfo,
  formatLocationWithState,
  getDistrictsForState
} from '../data/indianStates';
import {
  SIMULATION_LABEL_STRING
} from '../services/operationalCheckpoints';

interface CitizenPublicMapProps {
  placesMap: Record<string, GroundedPlaceRecord>;
  isResolving: boolean;
  quotaBlocked?: boolean;
  onRetryPlaces?: () => void;
  isShelterTelemetryStale: boolean;
  focusedPlaceKey: MentionedPlaceKey | null;
  onSelectPlaceKey: (key: MentionedPlaceKey | null) => void;
  selectedStateFilter?: string;
  onSelectStateFilter?: (stateName: string) => void;
}

const CitizenMapOverlaysController: React.FC<{
  focusedPoint: GeoPoint | null;
  fitPoints: GeoPoint[];
  fitTriggerKey: string;
  fallbackViewport: { center: GeoPoint; zoom: number } | null;
  showFloodZones: boolean;
  floodZones: Array<{ center: GeoPoint; radius: number; color: string }>;
  detourPath: GeoPoint[] | null;
}> = ({
  focusedPoint,
  fitPoints,
  fitTriggerKey,
  fallbackViewport,
  showFloodZones,
  floodZones,
  detourPath
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
    if (!map || !showFloodZones || floodZones.length === 0) return;
    const circles = floodZones.map(
      (z) =>
        new google.maps.Circle({
          map,
          center: z.center,
          radius: z.radius,
          strokeColor: z.color,
          strokeOpacity: 0.75,
          strokeWeight: 2,
          fillColor: z.color,
          fillOpacity: 0.15,
          clickable: false
        })
    );
    return () => {
      circles.forEach((c) => c.setMap(null));
    };
  }, [map, showFloodZones, floodZones]);

  useEffect(() => {
    if (!map || !detourPath || detourPath.length < 2) return;
    const polyline = new google.maps.Polyline({
      map,
      path: detourPath,
      geodesic: true,
      strokeColor: '#d97706',
      strokeOpacity: 0.92,
      strokeWeight: 5
    });
    return () => {
      polyline.setMap(null);
    };
  }, [map, detourPath]);

  return null;
};

export const CitizenPublicMap: React.FC<CitizenPublicMapProps> = ({
  placesMap,
  isResolving,
  quotaBlocked = false,
  onRetryPlaces,
  isShelterTelemetryStale,
  focusedPlaceKey,
  onSelectPlaceKey,
  selectedStateFilter,
  onSelectStateFilter
}) => {
  const [internalStateFilter, setInternalStateFilter] = useState<string>('ALL');
  const activeState = selectedStateFilter ?? internalStateFilter;
  const hasLiveKey = useMemo(
    () => isRealGoogleMapsKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
    []
  );
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>('ALL');

  const availableDistricts = useMemo(() => {
    if (activeState === 'ALL') {
      return ['ALL', 'Barpeta', 'Kamrup', 'Morigaon', 'Dhubri', 'Cachar', 'Patna', 'Wayanad', 'Puri'];
    }
    return ['ALL', ...getDistrictsForState(activeState)];
  }, [activeState]);

  const handleStateChange = (nextState: string) => {
    setInternalStateFilter(nextState);
    setSelectedDistrictFilter('ALL');
    if (onSelectStateFilter) {
      onSelectStateFilter(nextState);
    }
    onSelectPlaceKey(null);
  };

  const [showShelters, setShowShelters] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showFloodZones, setShowFloodZones] = useState(true);

  const activePlace = focusedPlaceKey ? placesMap[focusedPlaceKey] || null : null;

  const detourRoute = useDetourRoute(showRoads && (activeState === 'ALL' || activeState === 'Assam'));

  const matchesRoleAndState = (
    role: PlaceQuerySpec['publicRole'],
    stateName: string
  ): boolean => {
    if (activeState !== 'ALL' && stateName.toLowerCase() !== activeState.toLowerCase()) return false;
    if ((role === 'shelter' || role === 'backup_shelter') && !showShelters) return false;
    if (role === 'road_advisory' && !showRoads) return false;
    if ((role === 'flood_zone' || role === 'fact_check') && !showFloodZones) return false;
    return true;
  };

  const visiblePlaces = useMemo(() => {
    return Object.values(placesMap).filter(
      (p): p is GroundedPlaceRecord =>
        Boolean(p?.location) && matchesRoleAndState(p.publicRole, p.stateName || 'Assam')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesMap, activeState, showShelters, showRoads, showFloodZones]);

  const filteredSpecs = useMemo(() => {
    const baseSpecs = PUBLIC_PLACE_SPECS.filter((spec) =>
      matchesRoleAndState(spec.publicRole, spec.stateName)
    );
    // Append any dynamically resolved state shelter for the selected Indian State/UT
    const dynamicResolved = Object.values(placesMap)
      .filter(
        (p) =>
          p.key.startsWith('state_shelter_') &&
          matchesRoleAndState(p.publicRole, p.stateName)
      )
      .map(
        (p): PlaceQuerySpec => ({
          key: p.key,
          textQuery: `${p.displayName} ${p.district} ${p.stateName}`,
          stateName: p.stateName,
          district: p.district,
          publicRole: p.publicRole,
          publicTitle: p.publicTitle,
          publicSummary: p.publicSummary,
          fallbackLocation: p.location
        })
      );
    const merged = [...baseSpecs, ...dynamicResolved];
    if (merged.length === 0 && activeState !== 'ALL' && showShelters) {
      const stInfo = getStateInfo(activeState);
      const primaryDistrict = stInfo?.districts[0] || activeState;
      return [
        {
          key: `state_shelter_${activeState.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          textQuery: `Government Higher Secondary School Relief Shelter ${primaryDistrict} ${activeState} India`,
          stateName: activeState,
          district: primaryDistrict,
          publicRole: 'shelter' as const,
          publicTitle: `${primaryDistrict} SDMA Relief Shelter (${activeState})`,
          publicSummary: `Designated government relief shelter in ${primaryDistrict}, ${activeState} · Drinking water & medical desk.`,
          fallbackLocation: stInfo?.viewCenter || ALL_INDIA_CENTER
        }
      ];
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesMap, activeState, showShelters, showRoads, showFloodZones]);

  const fallbackViewport = useMemo(() => {
    if (activeState === 'ALL') {
      return { center: ALL_INDIA_CENTER, zoom: ALL_INDIA_ZOOM };
    }
    const stInfo = getStateInfo(activeState);
    if (stInfo) {
      return { center: stInfo.viewCenter, zoom: stInfo.viewZoom };
    }
    return { center: ALL_INDIA_CENTER, zoom: ALL_INDIA_ZOOM };
  }, [activeState]);

  const floodZoneCircles = useMemo(() => {
    const items: Array<{ center: GeoPoint; radius: number; color: string }> = [];
    if (
      (activeState === 'ALL' || activeState === 'Assam') &&
      placesMap.barpeta_vidyapith?.location
    ) {
      items.push({ center: placesMap.barpeta_vidyapith.location, radius: 3800, color: '#dc2626' });
    }
    if (
      (activeState === 'ALL' || activeState === 'Bihar') &&
      placesMap.patna_gandhi_maidan?.location
    ) {
      items.push({ center: placesMap.patna_gandhi_maidan.location, radius: 4200, color: '#d97706' });
    }
    return items;
  }, [placesMap, activeState]);

  const getBadgeConfig = (role: PlaceQuerySpec['publicRole'], key: MentionedPlaceKey) => {
    if (role === 'shelter') {
      const isFull = key === 'bhuragaon_hs' && isShelterTelemetryStale;
      return {
        bgClass: isFull ? 'bg-amber-600' : 'bg-emerald-600',
        code: 'S',
        tag: isFull ? 'Camp Full — Use Backup' : 'Shelter Open',
        tagColor: isFull ? 'text-amber-700' : 'text-emerald-700'
      };
    }
    if (role === 'backup_shelter') {
      return {
        bgClass: 'bg-emerald-700',
        code: 'B',
        tag: 'Backup Shelter Open',
        tagColor: 'text-emerald-700'
      };
    }
    if (role === 'road_advisory') {
      return {
        bgClass: 'bg-amber-600',
        code: '!',
        tag: 'Road Closed',
        tagColor: 'text-amber-700'
      };
    }
    if (role === 'fact_check') {
      return {
        bgClass: 'bg-sky-700',
        code: '✓',
        tag: 'Safe Area',
        tagColor: 'text-sky-700'
      };
    }
    return {
      bgClass: 'bg-red-600',
      code: 'W',
      tag: 'Flood Zone',
      tagColor: 'text-red-700'
    };
  };

  const telemetryAgeMinutes = isShelterTelemetryStale ? 94 : 8;

  return (
    <div className="space-y-4">
      {/* Simulation Feed Watermark Label */}
      <div className="flex items-center justify-between px-3.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400 text-amber-950 text-xs">
        <span className="font-mono font-bold tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>{SIMULATION_LABEL_STRING}</span>
        </span>
        <span className="text-[11px] text-amber-900 font-medium hidden sm:inline">
          For emergency planning &amp; simulation. Official shelter locations are designated by district administration.
        </span>
      </div>

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Safe Shelters &amp; Open Roads Across India
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Find open relief shelters, safe detours, and flood advisories across all 28 States &amp; 8 Union Territories on Google Maps. Private homes and SOS calls are never shown here.
          </p>
        </div>
        {isResolving && (
          <span className="text-xs text-slate-500 font-medium">
            Resolving Google Maps places…
          </span>
        )}
      </div>

      {/* Data Age & Shelter Guidance Notice */}
      {isShelterTelemetryStale && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-950 uppercase text-[10px] bg-amber-200/90 px-2 py-0.5 rounded">
                CAUTION · DATA AGE {telemetryAgeMinutes}m
              </span>
              <strong className="text-amber-950">Bhuragaon Shelter Report Outdated</strong>
            </div>
            <p className="text-amber-900 text-[11px]">
              Last update was {telemetryAgeMinutes} minutes ago. This camp may be near capacity. We recommend proceeding to <strong>Morigaon Polytechnic (Backup Camp)</strong> or checking verified ground updates.
            </p>
          </div>
        </div>
      )}

      {/* Map or Offline Fallback Container */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {/* All-India State/UT & District Filter Bar */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="citizen-map-state-select" className="font-semibold text-slate-700 whitespace-nowrap">
                State / UT:
              </label>
              <select
                id="citizen-map-state-select"
                value={activeState}
                onChange={(e) => handleStateChange(e.target.value)}
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
              <label htmlFor="citizen-map-district-select" className="font-semibold text-slate-700 whitespace-nowrap">
                District:
              </label>
              <select
                id="citizen-map-district-select"
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

          <div className="flex flex-wrap items-center gap-4 text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showShelters}
                onChange={(e) => setShowShelters(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              <span>Shelters</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showRoads}
                onChange={(e) => setShowRoads(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              <span>Roads</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showFloodZones}
                onChange={(e) => setShowFloodZones(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              <span>Flood Zones</span>
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

        {/* Main View Container: Google Map */}
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
            <CitizenMapOverlaysController
              focusedPoint={activePlace?.location || null}
              fitPoints={visiblePlaces.map((p) => p.location)}
              fitTriggerKey={activeState}
              fallbackViewport={fallbackViewport}
              showFloodZones={showFloodZones}
              floodZones={floodZoneCircles}
              detourPath={showRoads && detourRoute ? detourRoute.path : null}
            />

            {visiblePlaces.map((place) => {
              const badge = getBadgeConfig(place.publicRole, place.key);
              const isSelected = activePlace?.key === place.key;
              return (
                <AdvancedMarker
                  key={place.key}
                  position={place.location}
                  title={place.publicTitle}
                  zIndex={isSelected ? 40 : 20}
                  onClick={() => onSelectPlaceKey(place.key)}
                >
                  <button
                    type="button"
                    onClick={() => onSelectPlaceKey(place.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-900 shadow-md text-[11px] font-semibold whitespace-nowrap transition-transform ${
                      isSelected
                        ? 'ring-2 ring-slate-900 scale-105 border border-slate-900'
                        : 'border border-slate-300 hover:scale-105'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full ${badge.bgClass} text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0`}
                    >
                      {badge.code}
                    </span>
                    <span className="max-w-[160px] truncate">{place.displayName}</span>
                  </button>
                </AdvancedMarker>
              );
            })}
          </GoogleMap>

          {/* Selected Public Place Detail Card */}
          {activePlace && (
            <div className="absolute top-3 right-3 max-w-xs w-[calc(100%-1.5rem)] bg-white text-slate-900 rounded-xl border border-slate-200 shadow-lg p-4 text-xs z-20 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`text-[11px] font-semibold ${
                      getBadgeConfig(activePlace.publicRole, activePlace.key).tagColor
                    }`}
                  >
                    {getBadgeConfig(activePlace.publicRole, activePlace.key).tag} ·{' '}
                    {formatLocationWithState(activePlace.district, activePlace.stateName)}
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm mt-0.5 leading-snug">
                    {activePlace.publicTitle}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlaceKey(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                  aria-label="Close place details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                {activePlace.formattedAddress}
              </div>

              <p className="text-slate-700 leading-relaxed">
                {activePlace.key === 'bhuragaon_hs' && !isShelterTelemetryStale
                  ? 'Open (~140 spots left). Drinking water, meals, and nurse available.'
                  : activePlace.publicSummary}
              </p>

              {activePlace.key === 'puthimari_bridge' && detourRoute && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-950 tabular-nums">
                  <strong>SH-12 Detour:</strong> {detourRoute.distanceKm} km (~{detourRoute.durationMin} mins)
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <a
                  href={activePlace.googleMapsDirectionsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Directions</span>
                </a>
                <a
                  href={activePlace.googleMapsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Clean Unboxed Legend Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold inline-flex items-center justify-center">S</span>
              Shelter
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center justify-center">B</span>
              Backup Camp
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] font-bold inline-flex items-center justify-center">!</span>
              Road Closed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold inline-flex items-center justify-center">W</span>
              Flood Area
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-sky-700 text-white text-[10px] font-bold inline-flex items-center justify-center">✓</span>
              Safe Area
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Private homes hidden · Google Maps
          </span>
        </div>
      </div>

      {/* Quick Jump & Direct Google Maps Place Directory */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        {filteredSpecs.map((spec) => {
          const resolvedItem = placesMap[spec.key];
          const isFocused = focusedPlaceKey === spec.key && Boolean(resolvedItem);
          const badge = getBadgeConfig(spec.publicRole, spec.key);
          const directSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            spec.textQuery
          )}`;

          if (resolvedItem) {
            return (
              <button
                key={spec.key}
                type="button"
                onClick={() => onSelectPlaceKey(spec.key)}
                className={`p-3 rounded-xl border text-left transition-colors text-xs space-y-1 ${
                  isFocused
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className={`font-semibold ${badge.tagColor}`}>
                    {badge.tag} · {spec.stateName}
                  </span>
                  {spec.publicRole === 'shelter' || spec.publicRole === 'backup_shelter' ? (
                    <Home className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : spec.publicRole === 'fact_check' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                </div>
                <div className="font-bold text-slate-900 line-clamp-1">{resolvedItem.displayName}</div>
                <div className="text-[11px] text-slate-500 line-clamp-1">{resolvedItem.formattedAddress}</div>
              </button>
            );
          }

          return (
            <div
              key={spec.key}
              className="p-3 rounded-xl border border-slate-200 bg-white text-left text-xs flex flex-col justify-between gap-2"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className={`font-semibold ${badge.tagColor}`}>
                    {badge.tag} · {formatLocationWithState(spec.district, spec.stateName)}
                  </span>
                  {spec.publicRole === 'shelter' || spec.publicRole === 'backup_shelter' ? (
                    <Home className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : spec.publicRole === 'fact_check' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                </div>
                <div className="font-bold text-slate-900 line-clamp-1">{spec.publicTitle}</div>
                <div className="text-[11px] text-slate-600 line-clamp-2">
                  {spec.key === 'bhuragaon_hs' && !isShelterTelemetryStale
                    ? 'Open (~140 spots left). Drinking water, meals, and nurse available.'
                    : spec.publicSummary}
                </div>
              </div>
              <a
                href={directSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-slate-900 hover:text-slate-700 inline-flex items-center gap-1 underline underline-offset-2 pt-1 border-t border-slate-100"
              >
                <span>Open in Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};
