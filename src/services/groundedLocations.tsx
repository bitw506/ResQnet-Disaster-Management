import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { DistrictName, IndianStateName } from '../types/disaster';
import { inferStateFromDistrict } from '../data/indianStates';

export type GeoPoint = google.maps.LatLngLiteral;

export type MentionedPlaceKey = string;

export interface GroundedPlaceRecord {
  key: MentionedPlaceKey;
  placeId: string;
  displayName: string;
  formattedAddress: string;
  location: GeoPoint;
  googleMapsURI: string;
  googleMapsDirectionsURI: string;
  stateName: IndianStateName;
  district: DistrictName;
  publicRole: 'shelter' | 'backup_shelter' | 'road_advisory' | 'flood_zone' | 'fact_check';
  publicTitle: string;
  publicSummary: string;
}

export interface PlaceQuerySpec {
  key: MentionedPlaceKey;
  textQuery: string;
  stateName: IndianStateName;
  district: DistrictName;
  publicRole: GroundedPlaceRecord['publicRole'];
  publicTitle: string;
  publicSummary: string;
  fallbackLocation: GeoPoint;
}

export function isRealGoogleMapsKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 25) return false;
  if (!trimmed.startsWith('AIza')) return false;
  if (
    trimmed.includes('MY_') ||
    trimmed.includes('YOUR_') ||
    trimmed.includes('CHANGE_ME') ||
    trimmed.includes('EXAMPLE')
  ) {
    return false;
  }
  return true;
}

/**
 * National public shelters & advisories resolved dynamically at runtime via Google Maps Platform
 * Places API (New) (`Place.searchByText`).
 * Pre-seeded with verified fallback coordinates so map markers and lists render immediately.
 */
export const PUBLIC_PLACE_SPECS: PlaceQuerySpec[] = [
  {
    key: 'barpeta_vidyapith',
    textQuery: 'Barpeta Vidyapith Higher Secondary School Barpeta Assam',
    stateName: 'Assam',
    district: 'Barpeta',
    publicRole: 'shelter',
    publicTitle: 'Barpeta Vidyapith School Camp (Assam)',
    publicSummary: 'Open (~80 spots) · Drinking water, hot food, and doctor on site.',
    fallbackLocation: { lat: 26.3216, lng: 91.0062 }
  },
  {
    key: 'bhuragaon_hs',
    textQuery: 'Bhuragaon Higher Secondary School Morigaon Assam',
    stateName: 'Assam',
    district: 'Morigaon',
    publicRole: 'shelter',
    publicTitle: 'Bhuragaon School Camp (Assam)',
    publicSummary: 'Open (~140 spots) · Safe high ground, dry food, and first aid.',
    fallbackLocation: { lat: 26.2512, lng: 92.3411 }
  },
  {
    key: 'morigaon_polytechnic',
    textQuery: 'Morigaon Polytechnic Morigaon Assam',
    stateName: 'Assam',
    district: 'Morigaon',
    publicRole: 'backup_shelter',
    publicTitle: 'Morigaon Polytechnic Backup Camp (Assam)',
    publicSummary: 'Open (~220 spots) · Safe high ground, dry food, and first aid.',
    fallbackLocation: { lat: 26.2589, lng: 92.3384 }
  },
  {
    key: 'puthimari_bridge',
    textQuery: 'Puthimari Bridge NH 27 Kamrup Assam',
    stateName: 'Assam',
    district: 'Kamrup',
    publicRole: 'road_advisory',
    publicTitle: 'NH-27 Puthimari Bridge (Assam)',
    publicSummary: 'Bridge closed for safety check. Use State Highway 12 detour.',
    fallbackLocation: { lat: 26.3508, lng: 91.6841 }
  },
  {
    key: 'morigaon_dyke',
    textQuery: 'Khandajan Morigaon Assam',
    stateName: 'Assam',
    district: 'Morigaon',
    publicRole: 'fact_check',
    publicTitle: 'Khandajan Dam Sector (Assam)',
    publicSummary: 'Safe · Dam collapse voice rumor is false. Water levels normal.',
    fallbackLocation: { lat: 26.2411, lng: 92.3556 }
  },
  {
    key: 'patna_gandhi_maidan',
    textQuery: 'Gandhi Maidan Patna Bihar',
    stateName: 'Bihar',
    district: 'Patna',
    publicRole: 'shelter',
    publicTitle: 'Gandhi Maidan Relief Camp (Patna, Bihar)',
    publicSummary: 'Open (~310 spots) · Ganga flood relief tents, clean drinking water & medical camp.',
    fallbackLocation: { lat: 25.6144, lng: 85.1416 }
  },
  {
    key: 'puri_cyclone_shelter',
    textQuery: 'Gopabandhu Ayurveda Mahavidyalaya Puri Odisha',
    stateName: 'Odisha',
    district: 'Puri',
    publicRole: 'shelter',
    publicTitle: 'Puri Coastal Cyclone Shelter (Odisha)',
    publicSummary: 'Open (~190 spots) · Cyclone high-ground shelter, dry ration & backup power.',
    fallbackLocation: { lat: 19.8135, lng: 85.8312 }
  },
  {
    key: 'wayanad_kalpetta_camp',
    textQuery: 'SKMJ Higher Secondary School Kalpetta Wayanad Kerala',
    stateName: 'Kerala',
    district: 'Wayanad',
    publicRole: 'shelter',
    publicTitle: 'Kalpetta Relief Camp (Wayanad, Kerala)',
    publicSummary: 'Open (~145 spots) · Hill-slope evacuation shelter, medical team & warm meals.',
    fallbackLocation: { lat: 11.6083, lng: 76.0847 }
  },
  {
    key: 'mumbai_bkc_camp',
    textQuery: 'Bandra Kurla Complex Ground Mumbai Maharashtra',
    stateName: 'Maharashtra',
    district: 'Mumbai',
    publicRole: 'shelter',
    publicTitle: 'BKC SDMA Relief Center (Mumbai, Maharashtra)',
    publicSummary: 'Open (~400 spots) · Monsoon urban flood relief, dry rations, and medical post.',
    fallbackLocation: { lat: 19.0667, lng: 72.8687 }
  },
  {
    key: 'delhi_yamuna_camp',
    textQuery: 'Yamuna Sports Complex Surajmal Vihar Delhi',
    stateName: 'Delhi',
    district: 'East Delhi',
    publicRole: 'shelter',
    publicTitle: 'Yamuna Sports Complex Relief Camp (Delhi)',
    publicSummary: 'Open (~350 spots) · Yamuna flood relief tents, clean drinking water & doctor on duty.',
    fallbackLocation: { lat: 28.6653, lng: 77.3045 }
  },
  {
    key: 'chennai_nehru_camp',
    textQuery: 'Jawaharlal Nehru Stadium Periamet Chennai Tamil Nadu',
    stateName: 'Tamil Nadu',
    district: 'Chennai',
    publicRole: 'shelter',
    publicTitle: 'Nehru Stadium Flood Shelter (Chennai, Tamil Nadu)',
    publicSummary: 'Open (~280 spots) · Coastal flood safe zone, emergency kitchen, and generator backup.',
    fallbackLocation: { lat: 13.0827, lng: 80.2707 }
  },
  {
    key: 'kolkata_saltlake_camp',
    textQuery: 'Salt Lake Stadium Sector III Bidhannagar Kolkata West Bengal',
    stateName: 'West Bengal',
    district: 'Kolkata',
    publicRole: 'shelter',
    publicTitle: 'Salt Lake Disaster Relief Camp (Kolkata, WB)',
    publicSummary: 'Open (~320 spots) · Cyclone & tidal surge high ground, medical desk, and cooked meals.',
    fallbackLocation: { lat: 22.5697, lng: 88.4069 }
  },
  {
    key: 'ahmedabad_sp_camp',
    textQuery: 'Sardar Vallabhbhai Patel Stadium Navrangpura Ahmedabad Gujarat',
    stateName: 'Gujarat',
    district: 'Ahmedabad',
    publicRole: 'shelter',
    publicTitle: 'Sardar Patel Relief Center (Ahmedabad, Gujarat)',
    publicSummary: 'Open (~250 spots) · Sabarmati surge shelter, drinking water & rapid response crew.',
    fallbackLocation: { lat: 23.0415, lng: 72.5623 }
  },
  {
    key: 'lucknow_kd_camp',
    textQuery: 'KD Singh Babu Stadium Hazratganj Lucknow Uttar Pradesh',
    stateName: 'Uttar Pradesh',
    district: 'Lucknow',
    publicRole: 'shelter',
    publicTitle: 'KD Singh Babu Relief Camp (Lucknow, UP)',
    publicSummary: 'Open (~260 spots) · Gomti river evacuation shelter, hot meals, and medical supplies.',
    fallbackLocation: { lat: 26.8526, lng: 80.9388 }
  },
  {
    key: 'bengaluru_kanteerava_camp',
    textQuery: 'Sree Kanteerava Stadium Sampangi Rama Nagar Bengaluru Karnataka',
    stateName: 'Karnataka',
    district: 'Bengaluru',
    publicRole: 'shelter',
    publicTitle: 'Kanteerava Disaster Shelter (Bengaluru, Karnataka)',
    publicSummary: 'Open (~300 spots) · Rain surge evacuation center, clean sanitation & emergency pantry.',
    fallbackLocation: { lat: 12.9698, lng: 77.5878 }
  },
  {
    key: 'jaipur_sms_camp',
    textQuery: 'Sawai Mansingh Stadium Amar Jawan Jyoti Jaipur Rajasthan',
    stateName: 'Rajasthan',
    district: 'Jaipur',
    publicRole: 'shelter',
    publicTitle: 'SMS Stadium SDMA Camp (Jaipur, Rajasthan)',
    publicSummary: 'Open (~210 spots) · Emergency relief center, shaded tents, drinking water tanks.',
    fallbackLocation: { lat: 26.8926, lng: 75.8056 }
  },
  {
    key: 'hyderabad_gachibowli_camp',
    textQuery: 'Gachibowli Indoor Stadium Old Mumbai Highway Hyderabad Telangana',
    stateName: 'Telangana',
    district: 'Hyderabad',
    publicRole: 'shelter',
    publicTitle: 'Gachibowli Relief Center (Hyderabad, Telangana)',
    publicSummary: 'Open (~275 spots) · Musi flash flood relief, emergency blankets & medical assistance.',
    fallbackLocation: { lat: 17.4435, lng: 78.3489 }
  },
  {
    key: 'vijayawada_ig_camp',
    textQuery: 'Indira Gandhi Municipal Corporation Stadium MG Road Vijayawada Andhra Pradesh',
    stateName: 'Andhra Pradesh',
    district: 'Krishna',
    publicRole: 'shelter',
    publicTitle: 'Indira Gandhi Cyclone Shelter (Vijayawada, AP)',
    publicSummary: 'Open (~340 spots) · Krishna river & cyclone evacuation shelter, clean water & doctor.',
    fallbackLocation: { lat: 16.5062, lng: 80.6480 }
  },
  {
    key: 'dehradun_parade_camp',
    textQuery: 'Parade Ground Clock Tower Dehradun Uttarakhand',
    stateName: 'Uttarakhand',
    district: 'Dehradun',
    publicRole: 'shelter',
    publicTitle: 'Parade Ground Disaster Camp (Dehradun, Uttarakhand)',
    publicSummary: 'Open (~230 spots) · Hill rain & landslide evacuation shelter, warm clothing & first aid.',
    fallbackLocation: { lat: 30.3244, lng: 78.0418 }
  },
  {
    key: 'shimla_ridge_camp',
    textQuery: 'The Ridge Mall Road Shimla Himachal Pradesh',
    stateName: 'Himachal Pradesh',
    district: 'Shimla',
    publicRole: 'shelter',
    publicTitle: 'Ridge Emergency Shelter (Shimla, Himachal Pradesh)',
    publicSummary: 'Open (~160 spots) · Landslide safe zone, winter gear, warm soups, and paramedic team.',
    fallbackLocation: { lat: 31.1048, lng: 77.1734 }
  },
  {
    key: 'srinagar_bakshi_camp',
    textQuery: 'Bakshi Stadium Wazir Bagh Srinagar Jammu and Kashmir',
    stateName: 'Jammu & Kashmir',
    district: 'Srinagar',
    publicRole: 'shelter',
    publicTitle: 'Bakshi Stadium Relief Center (Srinagar, J&K)',
    publicSummary: 'Open (~290 spots) · Jhelum flood safe zone, heated tents, dry rations & doctors.',
    fallbackLocation: { lat: 34.0725, lng: 74.8028 }
  }
];

export const INCIDENT_TO_PLACE_KEY: Record<string, MentionedPlaceKey> = {
  'INC-BRIDGE-01': 'puthimari_bridge',
  'INC-OXYGEN-02': 'barpeta_vidyapith',
  'INC-VIRAL-03': 'morigaon_dyke',
  'INC-SHELTER-04': 'bhuragaon_hs',
  'INC-BIH-07': 'patna_gandhi_maidan',
  'INC-ODI-08': 'puri_cyclone_shelter',
  'INC-KER-09': 'wayanad_kalpetta_camp',
  'INC-MAH-10': 'mumbai_bkc_camp',
  'INC-DEL-11': 'delhi_yamuna_camp',
  'INC-TN-12': 'chennai_nehru_camp'
};

// Compliant short-lived cache (24h TTL — well within Google Maps Platform's 30-day geospatial limit)
const PLACES_STORAGE_KEY = 'resqnet_gmp_places_india_v2';
const DETOUR_STORAGE_KEY = 'resqnet_gmp_detour_route_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 60 * 1000;

interface CachedPayload<T> {
  expiresAt: number;
  data: T;
}

export interface DetourRouteData {
  path: GeoPoint[];
  distanceKm: string;
  durationMin: number;
}

function readExpiringCache<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload<T>;
    if (!parsed || typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeExpiringCache<T>(storageKey: string, data: T): void {
  try {
    const payload: CachedPayload<T> = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

let quotaCooldownUntil = 0;

function isQuotaActiveCooldown(): boolean {
  return Date.now() < quotaCooldownUntil;
}

/**
 * Tier 2 Google Maps Platform quota check helper.
 * Emits `gmp-quota-exceeded` strictly on quota exhaustion errors (never on 0 results or network errors).
 */
export function emitMapsQuotaExceededIfApplicable(err: unknown): boolean {
  const errObj = err as { code?: unknown; status?: unknown; name?: unknown; message?: unknown } | null;
  const combined = [
    err instanceof Error ? `${err.name} ${err.message}` : String(err || ''),
    errObj?.code ? String(errObj.code) : '',
    errObj?.status ? String(errObj.status) : ''
  ].join(' ');

  const isQuotaError =
    combined.includes('RESOURCE_EXHAUSTED') ||
    combined.includes('OVER_QUERY_LIMIT') ||
    combined.includes('OverQuotaMapError') ||
    combined.includes('QuotaExceeded') ||
    /\b429\b/.test(combined);

  if (isQuotaError) {
    quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}

function toLatLngLiteral(loc: google.maps.LatLng | google.maps.LatLngLiteral): GeoPoint {
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  return { lat, lng };
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createInitialPlacesMemory(): Record<string, GroundedPlaceRecord> {
  const initial: Record<string, GroundedPlaceRecord> = {};
  for (const spec of PUBLIC_PLACE_SPECS) {
    const dest = encodeURIComponent(`${spec.fallbackLocation.lat},${spec.fallbackLocation.lng}`);
    initial[spec.key] = {
      key: spec.key,
      placeId: `seed-${spec.key}`,
      displayName: spec.publicTitle,
      formattedAddress: `${spec.district}, ${spec.stateName}, India`,
      location: spec.fallbackLocation,
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${dest}`,
      googleMapsDirectionsURI: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
      stateName: spec.stateName,
      district: spec.district,
      publicRole: spec.publicRole,
      publicTitle: spec.publicTitle,
      publicSummary: spec.publicSummary
    };
  }
  return initial;
}

// Shared tab memory hydrated from pre-seeded defaults + short-lived localStorage cache
let sessionPlacesMemory: Record<string, GroundedPlaceRecord> = {
  ...createInitialPlacesMemory(),
  ...(readExpiringCache<Record<string, GroundedPlaceRecord>>(PLACES_STORAGE_KEY) || {})
};
let activePlacesPromise: Promise<{
  resolved: Record<string, GroundedPlaceRecord>;
  hitQuota: boolean;
}> | null = null;
const sessionLandmarkMemory: Record<string, GeoPoint> = {};

function hasAllPublicPlaces(map: Record<string, GroundedPlaceRecord>): boolean {
  return PUBLIC_PLACE_SPECS.every(
    (spec) => Boolean(map[spec.key]?.location && !map[spec.key]?.placeId.startsWith('seed-'))
  );
}

/**
 * Resolves national public shelters, bridges, and flood zones across India dynamically via
 * Places API (New) `Place.searchByText`, with lazy activation, gentle request pacing,
 * 24-hour compliant caching, on-demand per-state shelter lookup, and an automatic quota circuit breaker.
 */
export function useGroundedAssamPlaces(options?: { enabled?: boolean; activeStateName?: string; activeDistrict?: string }) {
  const enabled = options?.enabled ?? true;
  const activeStateName = options?.activeStateName;
  const activeDistrict = options?.activeDistrict;
  const placesLib = useMapsLibrary('places');

  const [placesMap, setPlacesMap] = useState<Record<string, GroundedPlaceRecord>>(
    () => ({ ...sessionPlacesMemory })
  );
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [quotaBlocked, setQuotaBlocked] = useState<boolean>(() => isQuotaActiveCooldown());
  const [retryNonce, setRetryNonce] = useState<number>(0);

  useEffect(() => {
    const onQuotaEvent = () => setQuotaBlocked(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaEvent);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaEvent);
  }, []);

  useEffect(() => {
    if (hasAllPublicPlaces(sessionPlacesMemory)) {
      setPlacesMap({ ...sessionPlacesMemory });
      setIsResolving(false);
      return;
    }

    if (!enabled || !placesLib) {
      setIsResolving(false);
      return;
    }

    if (isQuotaActiveCooldown()) {
      setQuotaBlocked(true);
      setIsResolving(false);
      return;
    }

    let cancelled = false;
    setIsResolving(true);

    if (!activePlacesPromise) {
      activePlacesPromise = (async () => {
        const working: Record<string, GroundedPlaceRecord> = { ...sessionPlacesMemory };
        const missingSpecs = PUBLIC_PLACE_SPECS.filter(
          (s) => !working[s.key] || working[s.key].placeId.startsWith('seed-')
        );
        let hitQuota = false;

        // Gentle batching (2 places at a time) prevents burst rate-limiting and stops immediately on quota error
        for (let i = 0; i < missingSpecs.length; i += 2) {
          if (hitQuota || isQuotaActiveCooldown()) {
            hitQuota = true;
            break;
          }

          const batch = missingSpecs.slice(i, i + 2);
          await Promise.all(
            batch.map(async (spec) => {
              try {
                const { places } = await placesLib.Place.searchByText({
                  textQuery: spec.textQuery,
                  fields: ['id', 'displayName', 'formattedAddress', 'location'],
                  internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
                  region: 'in',
                  language: 'en',
                  maxResultCount: 1
                });

                const place = places?.[0];
                if (place && place.location && place.id) {
                  const coords = toLatLngLiteral(place.location);
                  const destParam = encodeURIComponent(`${coords.lat},${coords.lng}`);
                  const placeIdParam = encodeURIComponent(place.id);
                  working[spec.key] = {
                    key: spec.key,
                    placeId: place.id,
                    displayName: place.displayName || spec.publicTitle,
                    formattedAddress: place.formattedAddress || `${spec.district}, ${spec.stateName}`,
                    location: coords,
                    googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${destParam}&query_place_id=${placeIdParam}`,
                    googleMapsDirectionsURI: `https://www.google.com/maps/dir/?api=1&destination=${destParam}&destination_place_id=${placeIdParam}`,
                    stateName: spec.stateName,
                    district: spec.district,
                    publicRole: spec.publicRole,
                    publicTitle: spec.publicTitle,
                    publicSummary: spec.publicSummary
                  };
                  sessionPlacesMemory = { ...working };
                  writeExpiringCache(PLACES_STORAGE_KEY, sessionPlacesMemory);
                }
              } catch (err) {
                if (emitMapsQuotaExceededIfApplicable(err)) {
                  hitQuota = true;
                }
              }
            })
          );

          if (!hitQuota && i + 2 < missingSpecs.length) {
            await delayMs(120);
          }
        }

        activePlacesPromise = null;
        return { resolved: working, hitQuota };
      })();
    }

    activePlacesPromise
      .then(({ resolved, hitQuota }) => {
        if (!cancelled) {
          setPlacesMap({ ...resolved });
          if (hitQuota) setQuotaBlocked(true);
          else if (Object.keys(resolved).length > 0) setQuotaBlocked(false);
          setIsResolving(false);
        }
      })
      .catch((err) => {
        if (emitMapsQuotaExceededIfApplicable(err) && !cancelled) {
          setQuotaBlocked(true);
        }
        if (!cancelled) setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, placesLib, retryNonce]);

  // On-demand single-query resolution when user selects any of the 36 Indian States/UTs not yet in cache
  useEffect(() => {
    if (!enabled || !placesLib || !activeStateName || activeStateName === 'ALL' || isQuotaActiveCooldown()) {
      return;
    }

    const alreadyHasState = Object.values(sessionPlacesMemory).some(
      (p) => p.stateName?.toLowerCase() === activeStateName.toLowerCase()
    );
    if (alreadyHasState) return;

    const dynamicKey = `state_shelter_${activeStateName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    if (sessionPlacesMemory[dynamicKey]) return;

    let cancelled = false;
    const targetDistrict = activeDistrict || activeStateName;

    (async () => {
      try {
        const { places } = await placesLib.Place.searchByText({
          textQuery: `Government Higher Secondary School ${targetDistrict} ${activeStateName} India`,
          fields: ['id', 'displayName', 'formattedAddress', 'location'],
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          region: 'in',
          language: 'en',
          maxResultCount: 1
        });
        const place = places?.[0];
        if (!cancelled && place && place.location && place.id) {
          const coords = toLatLngLiteral(place.location);
          const destParam = encodeURIComponent(`${coords.lat},${coords.lng}`);
          const placeIdParam = encodeURIComponent(place.id);
          const record: GroundedPlaceRecord = {
            key: dynamicKey,
            placeId: place.id,
            displayName: place.displayName || `${targetDistrict} Relief Camp`,
            formattedAddress: place.formattedAddress || `${targetDistrict}, ${activeStateName}`,
            location: coords,
            googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${destParam}&query_place_id=${placeIdParam}`,
            googleMapsDirectionsURI: `https://www.google.com/maps/dir/?api=1&destination=${destParam}&destination_place_id=${placeIdParam}`,
            stateName: activeStateName,
            district: targetDistrict,
            publicRole: 'shelter',
            publicTitle: `${place.displayName || targetDistrict} Designated Relief Shelter (${activeStateName})`,
            publicSummary: `Designated SDMA emergency shelter in ${targetDistrict}, ${activeStateName} · Drinking water & first aid.`
          };
          sessionPlacesMemory = { ...sessionPlacesMemory, [dynamicKey]: record };
          writeExpiringCache(PLACES_STORAGE_KEY, sessionPlacesMemory);
          setPlacesMap({ ...sessionPlacesMemory });
        }
      } catch (err) {
        emitMapsQuotaExceededIfApplicable(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, placesLib, activeStateName, activeDistrict]);

  const retryResolvePlaces = useCallback(() => {
    quotaCooldownUntil = 0;
    setQuotaBlocked(false);
    setRetryNonce((n) => n + 1);
  }, []);

  const resolveLandmarkCoordinates = useCallback(
    async (
      landmarkText: string,
      district: DistrictName,
      stateName?: IndianStateName
    ): Promise<GeoPoint | null> => {
      const trimmed = landmarkText.trim();
      if (!trimmed || !placesLib || isQuotaActiveCooldown()) return null;

      const resolvedState = inferStateFromDistrict(district, stateName);
      const cacheKey = `${trimmed.toLowerCase()}_${district.toLowerCase()}_${resolvedState.toLowerCase()}`;
      if (sessionLandmarkMemory[cacheKey]) {
        return sessionLandmarkMemory[cacheKey];
      }

      try {
        const { places } = await placesLib.Place.searchByText({
          textQuery: `${trimmed}, ${district}, ${resolvedState}, India`,
          fields: ['id', 'location'],
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          region: 'in',
          language: 'en',
          maxResultCount: 1
        });
        const first = places?.[0];
        if (first?.location) {
          const coords = toLatLngLiteral(first.location);
          sessionLandmarkMemory[cacheKey] = coords;
          return coords;
        }
      } catch (err) {
        emitMapsQuotaExceededIfApplicable(err);
      }
      return null;
    },
    [placesLib]
  );

  return {
    placesMap,
    isResolving,
    quotaBlocked,
    retryResolvePlaces,
    resolveLandmarkCoordinates
  };
}

export const useGroundedPublicPlaces = useGroundedAssamPlaces;

let sessionDetourMemory: DetourRouteData | null =
  readExpiringCache<DetourRouteData>(DETOUR_STORAGE_KEY);

/**
 * Computes the SH-12 detour route between Hajo and Sualkuchi using the modern
 * Google Maps Platform Routes API (`Route.computeRoutes` via `useMapsLibrary('routes')` —
 * https://developers.google.com/maps/documentation/javascript/routes?utm_campaign=gmp_mcp_codeassist_v1_aistudio).
 */
export function useDetourRoute(enabled: boolean): DetourRouteData | null {
  const routesLib = useMapsLibrary('routes');
  const [routeData, setRouteData] = useState<DetourRouteData | null>(() => sessionDetourMemory);

  useEffect(() => {
    if (!enabled) return;

    if (sessionDetourMemory) {
      setRouteData(sessionDetourMemory);
      return;
    }

    if (!routesLib || isQuotaActiveCooldown()) {
      return;
    }

    let cancelled = false;

    const runRoute = async () => {
      try {
        const RouteClass = (routesLib as unknown as { Route?: any }).Route;
        if (!RouteClass) return;

        const originAddress = 'Hajo, Kamrup, Assam, India';
        const destinationAddress = 'Sualkuchi, Kamrup, Assam, India';

        let response: any = null;
        if (typeof RouteClass.computeRoutes === 'function') {
          response = await RouteClass.computeRoutes({
            origin: originAddress,
            destination: destinationAddress,
            travelMode: google.maps.TravelMode.DRIVING,
            fields: ['path', 'distanceMeters', 'durationMillis']
          });
        } else {
          const service = new RouteClass();
          response = await service.computeRoutes({
            origin: originAddress,
            destination: destinationAddress,
            travelMode: google.maps.TravelMode.DRIVING,
            fields: ['polyline', 'distanceMeters', 'duration']
          });
        }

        if (cancelled) return;
        const route = response?.routes?.[0];
        if (!route) return;

        let pathLiterals: GeoPoint[] = [];
        if (Array.isArray(route.path) && route.path.length >= 2) {
          pathLiterals = route.path.map((pt: google.maps.LatLng | google.maps.LatLngLiteral) =>
            toLatLngLiteral(pt)
          );
        } else if (route.polyline?.encodedPolyline && typeof RouteClass.decode === 'function') {
          const decoded = RouteClass.decode(route.polyline.encodedPolyline);
          if (Array.isArray(decoded)) {
            pathLiterals = decoded.map((pt: google.maps.LatLng | google.maps.LatLngLiteral) =>
              toLatLngLiteral(pt)
            );
          }
        }

        const distanceMeters = Number(route.distanceMeters || 0);
        const durationMillis =
          typeof route.durationMillis === 'number'
            ? route.durationMillis
            : typeof route.duration === 'string'
            ? parseFloat(route.duration) * 1000
            : 0;

        if (pathLiterals.length >= 2) {
          const computed: DetourRouteData = {
            path: pathLiterals,
            distanceKm: distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) : '13.6',
            durationMin: durationMillis > 0 ? Math.max(1, Math.round(durationMillis / 60000)) : 22
          };
          sessionDetourMemory = computed;
          writeExpiringCache(DETOUR_STORAGE_KEY, computed);
          setRouteData(computed);
        }
      } catch (err) {
        emitMapsQuotaExceededIfApplicable(err);
      }
    };

    void runRoute();

    return () => {
      cancelled = true;
    };
  }, [enabled, routesLib]);

  return enabled ? routeData : null;
}

/**
 * Privacy-preserving public landmark autocomplete input powered by Places API (New)
 * `AutocompleteSuggestion.fetchAutocompleteSuggestions` + `AutocompleteSessionToken` + `place.fetchFields`.
 */
export const LandmarkAutocompleteInput: React.FC<{
  value: string;
  district: DistrictName;
  stateName?: IndianStateName;
  onChange: (value: string, resolvedCoords?: GeoPoint) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}> = ({ value, district, stateName, onChange, disabled, required = false, placeholder }) => {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const resolvedState = inferStateFromDistrict(district, stateName);

  useEffect(() => {
    if (disabled || !placesLib || value.trim().length < 3 || isQuotaActiveCooldown()) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (isQuotaActiveCooldown()) return;
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: `${value.trim()}, ${district}, ${resolvedState}, India`,
          sessionToken: sessionTokenRef.current,
          region: 'in',
          language: 'en'
        });

        if (!cancelled) {
          setSuggestions(res?.suggestions || []);
        }
      } catch (err) {
        emitMapsQuotaExceededIfApplicable(err);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, district, resolvedState, disabled, placesLib]);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    const label = prediction.text?.text || value;
    setIsOpen(false);
    setSuggestions([]);

    if (isQuotaActiveCooldown()) {
      onChange(label);
      return;
    }

    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location']
      });
      // Reset session token after consuming Place Details in the session
      sessionTokenRef.current = null;

      if (place.location) {
        onChange(
          place.formattedAddress || place.displayName || label,
          toLatLngLiteral(place.location)
        );
        return;
      }
    } catch (err) {
      emitMapsQuotaExceededIfApplicable(err);
      sessionTokenRef.current = null;
    }

    onChange(label);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 180)}
        onChange={(e) => {
          setIsOpen(true);
          onChange(e.target.value);
        }}
        placeholder={
          placeholder || `Optional: nearby school, market, or chowk in ${district}, ${resolvedState}`
        }
        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-slate-900 bg-white"
        required={required}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-md divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto">
          {suggestions.map((suggestion, idx) => {
            const label = suggestion.placePrediction?.text?.text;
            if (!label) return null;
            return (
              <li key={suggestion.placePrediction?.placeId || idx}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-800 transition-colors"
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
