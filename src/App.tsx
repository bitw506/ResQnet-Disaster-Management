/**
 * ResQnet Disaster Relief Coordination Portal
 * Segments:
 * 1. Citizen — Simple emergency help requests, safe shelter map, verified alerts, private tracker
 * 2. Officer — Live rescue map, field reports, rescue priority list, rumor check, offline texts, contacts
 * 3. Developer — Visible step-by-step test execution processes, curveball simulations, and real-time solutions
 */

import React, { useState, useEffect } from 'react';
import { APIProvider, APIProviderContext } from '@vis.gl/react-google-maps';
import { isRealGoogleMapsKey } from './services/groundedLocations';
import {
  FusedIncident,
  ReportPacket,
  StoreForwardMessage,
  MisinformationItem,
  RescueAsset
} from './types/disaster';
import {
  createInitialDisasterScenario,
  calculateDecayedReliability,
  evaluateCredibilityState,
  computeTriagePriority,
  buildFusedIncident,
  initialRescueAssets,
  initialMisinformationItems,
  reallocateRescueAssets,
  generateProvenanceHash
} from './services/fusionEngine';
import { LanguageCode, translations } from './services/i18n';
import {
  ALL_INDIA_CENTER,
  formatLocationWithState,
  getStateInfo,
  inferStateFromDistrict
} from './data/indianStates';
import { Header } from './components/Header';
import { KPIStrip } from './components/KPIStrip';
import { InteractiveMap } from './components/InteractiveMap';
import { FusionFeed } from './components/FusionFeed';
import { TriageConsole } from './components/TriageConsole';
import { MisinformationQuarantine } from './components/MisinformationQuarantine';
import { StoreForwardConsole } from './components/StoreForwardConsole';
import { PrivacyScopeConsole } from './components/PrivacyScopeConsole';
import { MediaPriorityConsole } from './components/MediaPriorityConsole';
import { ProvenanceInspectorModal } from './components/ProvenanceInspectorModal';
import { SimulateReportModal } from './components/SimulateReportModal';
import { CitizenPortal } from './components/CitizenPortal';
import { OfficialAuthModal } from './components/OfficialAuthModal';
import {
  SimulationFeedInterceptor,
  ZeroPublicExposureValidator
} from './services/operationalCheckpoints';
import {
  connectOfficerRealtimeChannel,
  LiveOfficerSyncState,
  LivePacketRecord,
  logoutOfficerOnServer,
  pushOfficerPacketToServer,
  pushOfflineBeaconToServer,
  pushConflictResolutionToServer,
  pushPriorityOverrideToServer,
  recordAuditLogOnServer,
  resetServerLiveState,
  attemptPrivilegeEscalationOnServer
} from './services/realtimeClient';

import {
  Map,
  Radio,
  HeartHandshake,
  ShieldAlert,
  Layers,
  Lock,
  Globe,
  X
} from 'lucide-react';

const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const fallbackMapsContext = {
  mapInstances: {},
  addMapInstance: () => {},
  removeMapInstance: () => {},
  clearMapInstances: () => {},
  loadedLibraries: {},
  importLibrary: async () => null
};

const AppMapsProvider: React.FC<{
  apiKey: string;
  language: string;
  children: React.ReactNode;
}> = ({ apiKey, language, children }) => {
  const isKeyValid = isRealGoogleMapsKey(apiKey);

  if (isKeyValid) {
    return (
      <APIProvider
        apiKey={apiKey}
        language={language}
        region="IN"
        libraries={['marker', 'places', 'routes']}
      >
        {children}
      </APIProvider>
    );
  }

  return (
    <APIProviderContext.Provider value={fallbackMapsContext as any}>
      {children}
    </APIProviderContext.Provider>
  );
};

function createInitialStoreForwardQueue(nowMs: number): StoreForwardMessage[] {
  return [
    {
      id: 'SF-SMS-7980',
      referenceNo: 'REF-NDMA-798019',
      channel: 'SMS',
      phoneNumber: '+91 7980190589',
      timestamp: nowMs - 25 * 60 * 1000,
      payload: 'SMS to 1070: OXYGEN_NEEDED (Power out 6h, 1.5h oxygen remaining, water 4.5ft at Milan Nagar)',
      status: 'queued_locally',
      lastKnownSafeStatus: 'OXYGEN_NEEDED',
      householdId: 'HSH-BAR-892',
      locationText: 'Milan Nagar, Barpeta'
    },
    {
      id: 'SF-USSD-9880',
      referenceNo: 'REF-NDMA-988018',
      channel: 'USSD',
      phoneNumber: '+91 9880182287',
      timestamp: nowMs - 15 * 60 * 1000,
      payload: '*1070*4# (Ref: REF-NDMA-988018, NEED_RESCUE, ELDERLY_TRAPPED: 1, ROAD_SEVERED: SH9)',
      status: 'queued_locally',
      lastKnownSafeStatus: 'NEED_RESCUE',
      householdId: 'HSH-SAR-411',
      locationText: 'Sarthebari SH-9, Barpeta'
    },
    {
      id: 'SF-SMS-0991',
      referenceNo: 'REF-NDMA-798019',
      channel: 'SMS',
      phoneNumber: '+91 7980190589',
      timestamp: nowMs - 58 * 60 * 1000,
      payload: 'Earlier status: SAFE (Water knee level, patient stable on battery power).',
      status: 'conflict_resolved',
      lastKnownSafeStatus: 'SAFE',
      householdId: 'HSH-BAR-892',
      locationText: 'Milan Nagar, Barpeta'
    },
    {
      id: 'SF-USSD-902',
      channel: 'USSD',
      phoneNumber: '+91 98640 44102',
      timestamp: nowMs - 14 * 60 * 1000,
      payload: '*1070*2# (STATUS: WATER_RISING, FLOOD_FT: 4.0, OXYGEN: NO)',
      status: 'queued_locally',
      lastKnownSafeStatus: 'WATER_RISING',
      householdId: 'HSH-MOR-331',
      locationText: 'Bhuragaon Ward 3, Morigaon'
    }
  ];
}

function mergePacketRecordIdempotently(
  prevIncidents: FusedIncident[],
  record: LivePacketRecord,
  simTimeMs: number
): FusedIncident[] {
  const { packet, targetIncidentId, isConflicting, conflictClaim } = record;
  if (!packet || !packet.id) return prevIncidents;

  // Deduplicate by packet ID so multi-device WS + local actions never create duplicates
  const alreadyIngested = prevIncidents.some((inc) =>
    inc.provenanceTrail.some((p) => p.id === packet.id)
  );
  if (alreadyIngested) return prevIncidents;

  if (targetIncidentId) {
    return prevIncidents.map((inc) => {
      if (inc.id !== targetIncidentId) return inc;

      const updatedTrail = [packet, ...inc.provenanceTrail];
      const conflictData = isConflicting
        ? {
            sourceA: inc.provenanceTrail[0]?.reporterName || 'Earlier Team',
            claimA: inc.provenanceTrail[0]?.headline || 'Road open',
            channelA: inc.provenanceTrail[0]?.channel || 'pwd_official',
            timestampA: inc.provenanceTrail[0]?.timestamp || simTimeMs,
            sourceB: packet.reporterName,
            claimB: conflictClaim || packet.headline,
            channelB: packet.channel,
            timestampB: packet.timestamp,
            conflictDescription: 'Opposing reports received from field teams.',
            conservativeAction:
              'Safety First: Treat route as closed and use detour until teams verify together.'
          }
        : inc.conflictingReports;

      const { state, baseReliability, corroborationCount } = evaluateCredibilityState(
        updatedTrail,
        conflictData
      );

      const { currentReliability, ageMinutes, freshnessStatus, fallbackInstructions } =
        calculateDecayedReliability(
          baseReliability,
          packet.timestamp,
          Math.max(simTimeMs, packet.timestamp),
          inc.decayHalfLifeMin
        );

      return {
        ...inc,
        state,
        baseReliability,
        currentReliability,
        lastUpdatedAt: packet.timestamp,
        ageMinutes,
        freshnessStatus,
        fallbackInstructions,
        provenanceTrail: updatedTrail,
        corroborationCount,
        conflictingReports: conflictData
      };
    });
  }

  const newInc = buildFusedIncident(
    packet.incidentClusterId || `INC-LIVE-${packet.id.slice(-4)}`,
    `CLUST-${packet.district.slice(0, 3).toUpperCase()}-${packet.id.slice(-2)}`,
    packet.headline,
    packet.category,
    packet.district,
    packet.landmark,
    packet.coordinates,
    [packet],
    null,
    packet.category === 'medical_oxygen' ? 'critical' : 'high',
    Math.max(simTimeMs, packet.timestamp),
    45,
    false,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    packet.stateName
  );

  return [newInc, ...prevIncidents];
}

export default function App() {
  const [portalMode, setPortalMode] = useState<'citizen' | 'official'>('citizen');
  const [authenticatedOfficer, setAuthenticatedOfficer] = useState<{
    name: string;
    role: string;
    badgeId: string;
  } | null>({
    name: 'Duty Officer (NDMA / SDRF)',
    role: 'Disaster Operations Coordinator',
    badgeId: 'NDMA-OPS-01'
  });

  const [isLowNetwork, setIsLowNetwork] = useState<boolean>(false);
  const [isOfficialAuthOpen, setIsOfficialAuthOpen] = useState<boolean>(false);

  // Real-time Officer Channel Telemetry (strictly active in Common Officer Tab only)
  const [isOfficerRealtimeConnected, setIsOfficerRealtimeConnected] = useState<boolean>(false);
  const [liveConnectedOfficerTabs, setLiveConnectedOfficerTabs] = useState<number>(0);
  const [liveArrivalBanner, setLiveArrivalBanner] = useState<{
    headline: string;
    district: string;
  } | null>(null);

  const [simulatedTime, setSimulatedTime] = useState<number>(() => Date.now());
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<
    'map' | 'feed' | 'triage' | 'misinfo' | 'storeforward' | 'privacy' | 'media'
  >('map');

  // Officer + Sandbox state (receives live multi-device reports)
  const [incidents, setIncidents] = useState<FusedIncident[]>(() =>
    createInitialDisasterScenario(Date.now())
  );
  const [storeForwardMessages, setStoreForwardMessages] = useState<StoreForwardMessage[]>(() =>
    createInitialStoreForwardQueue(Date.now())
  );
  const [misinfoList, setMisinfoList] = useState<MisinformationItem[]>(() =>
    initialMisinformationItems.map((m) => ({ ...m }))
  );
  const [rescueAssets, setRescueAssets] = useState<RescueAsset[]>(() =>
    initialRescueAssets.map((a) => ({ ...a }))
  );

  const [selectedIncident, setSelectedIncident] = useState<FusedIncident | null>(null);
  const [inspectedIncidentForProvenance, setInspectedIncidentForProvenance] =
    useState<FusedIncident | null>(null);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState<boolean>(false);
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('all');

  const [globalSupervisorAlert, setGlobalSupervisorAlert] = useState<{
    id: string;
    timestamp: number;
    userId: string;
    userName: string;
    role: string;
    requestedScope: string;
    ipAddress: string;
  } | null>(null);

  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);
  const [isQuotaBannerDismissed, setIsQuotaBannerDismissed] = useState<boolean>(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Connect real-time multi-device WebSocket channel STRICTLY when the Common Officer Tab is active.
  // Citizen views NEVER subscribe to or receive other devices' real-time data.
  useEffect(() => {
    if (portalMode !== 'official' || !authenticatedOfficer || isOffline) {
      setIsOfficerRealtimeConnected(false);
      setLiveConnectedOfficerTabs(0);
      return;
    }

    const applyServerStateSnapshot = (
      state: LiveOfficerSyncState,
      connectedTabs: number
    ) => {
      setIsOfficerRealtimeConnected(true);
      setLiveConnectedOfficerTabs(connectedTabs);

      // Merge packets oldest-first so ordering matches chronological arrival
      if (Array.isArray(state.packets) && state.packets.length > 0) {
        const chronological = [...state.packets].reverse();
        setIncidents((prev) => {
          let next = prev;
          for (const rec of chronological) {
            next = mergePacketRecordIdempotently(next, rec, Date.now());
          }
          return next;
        });
      }

      if (Array.isArray(state.offlineMessages) && state.offlineMessages.length > 0) {
        setStoreForwardMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = state.offlineMessages.filter((m) => !existingIds.has(m.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      }

      if (Array.isArray(state.misinfoItems) && state.misinfoItems.length > 0) {
        setMisinfoList((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = state.misinfoItems!.filter((m) => !existingIds.has(m.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      }
    };

    const disconnect = connectOfficerRealtimeChannel({
      onFullState: applyServerStateSnapshot,
      onPacketIngested: (record, connectedTabs) => {
        setIsOfficerRealtimeConnected(true);
        setLiveConnectedOfficerTabs(connectedTabs);
        setIncidents((prev) => mergePacketRecordIdempotently(prev, record, Date.now()));
        if (record.packet?.headline) {
          setLiveArrivalBanner({
            headline: record.packet.headline,
            district: formatLocationWithState(record.packet.district, record.packet.stateName)
          });
        }
      },
      onOfflineBeacon: (message) => {
        setStoreForwardMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [message, ...prev]
        );
      },
      onMisinfoFlagged: (item) => {
        setMisinfoList((prev) =>
          prev.some((m) => m.id === item.id) ? prev : [item, ...prev]
        );
      },
      onConflictResolved: (incidentId, resolutionNote) => {
        applyLocalConflictResolution(incidentId, resolutionNote);
      },
      onPriorityOverride: (incidentId, override) => {
        applyLocalPriorityOverride(
          incidentId,
          override.newScore,
          override.reason,
          override.responderName
        );
      },
      onSecurityBreachDetected: (log) => {
        setGlobalSupervisorAlert({
          id: log.id,
          timestamp: log.timestamp,
          userId: log.userId,
          userName: log.userName,
          role: log.role,
          requestedScope: log.requestedScope,
          ipAddress: log.ipAddress || '198.51.100.42'
        });
      },
      onConnectionChange: (connected, tabs) => {
        setIsOfficerRealtimeConnected(connected);
        setLiveConnectedOfficerTabs(tabs);
      }
    });

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalMode, authenticatedOfficer, isOffline]);

  // Tick simulation clock and dynamically recalculate time decay for all incidents
  useEffect(() => {
    if (simSpeed <= 0) return;
    const interval = setInterval(() => {
      setSimulatedTime((prev) => prev + 1000 * simSpeed);
    }, 1000);

    return () => clearInterval(interval);
  }, [simSpeed]);

  // Recalculate time decay when simulatedTime changes
  useEffect(() => {
    setIncidents((prevIncidents) =>
      prevIncidents.map((inc) => {
        const latestTime = inc.provenanceTrail.reduce(
          (max, p) => (p.timestamp > max ? p.timestamp : max),
          inc.lastUpdatedAt
        );

        const { currentReliability, ageMinutes, freshnessStatus, fallbackInstructions } =
          calculateDecayedReliability(
            inc.baseReliability,
            latestTime,
            Math.max(simulatedTime, latestTime),
            inc.decayHalfLifeMin
          );

        const triagePriorityScore = inc.responderOverride
          ? inc.responderOverride.overriddenScore
          : computeTriagePriority(inc.severityLevel, inc.vulnerabilityScore, currentReliability);

        return {
          ...inc,
          currentReliability,
          ageMinutes,
          freshnessStatus,
          fallbackInstructions,
          triagePriorityScore
        };
      })
    );
  }, [simulatedTime]);

  const advanceMinutes = (minutes: number) => {
    setSimulatedTime((prev) => prev + minutes * 60 * 1000);
  };

  const resetSimulation = () => {
    const now = Date.now();
    setSimulatedTime(now);
    setSimSpeed(1);
    setIsOffline(false);
    setIncidents(createInitialDisasterScenario(now));
    setStoreForwardMessages(createInitialStoreForwardQueue(now));
    setMisinfoList(initialMisinformationItems.map((m) => ({ ...m })));
    setRescueAssets(initialRescueAssets.map((a) => ({ ...a })));
    setGlobalSupervisorAlert(null);
    setSelectedIncident(null);
    setLiveArrivalBanner(null);
    resetServerLiveState();
  };

  const handleSelectPortalMode = (mode: 'citizen' | 'official') => {
    if (mode === 'official' && !authenticatedOfficer) {
      setIsOfficialAuthOpen(true);
      return;
    }
    setPortalMode(mode);
  };

  const handleRefreshIncidentPing = (incidentId: string) => {
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === incidentId) {
          const freshTime = Math.max(simulatedTime, Date.now());
          const updatedPackets = inc.provenanceTrail.map((p, idx) =>
            idx === 0 ? { ...p, timestamp: freshTime } : p
          );

          const { currentReliability, ageMinutes, freshnessStatus, fallbackInstructions } =
            calculateDecayedReliability(
              inc.baseReliability,
              freshTime,
              freshTime,
              inc.decayHalfLifeMin
            );

          return {
            ...inc,
            lastUpdatedAt: freshTime,
            provenanceTrail: updatedPackets,
            currentReliability,
            ageMinutes,
            freshnessStatus,
            fallbackInstructions
          };
        }
        return inc;
      })
    );
  };

  const handleIngestNewPacket = (
    packet: ReportPacket,
    targetIncidentId?: string,
    isConflicting?: boolean,
    conflictClaim?: string
  ) => {
    const record: LivePacketRecord = {
      packet,
      targetIncidentId,
      isConflicting,
      conflictClaim,
      receivedAt: Date.now()
    };

    setIncidents((prev) => mergePacketRecordIdempotently(prev, record, simulatedTime));

    // If injected by an Officer or Developer, also sync to the shared Officer server feed
    if (portalMode !== 'citizen' && !isOffline) {
      pushOfficerPacketToServer(packet, targetIncidentId, isConflicting, conflictClaim);
    }
  };

  const applyLocalConflictResolution = (incidentId: string, resolutionNote: string) => {
    const nowTime = Math.max(simulatedTime, Date.now());
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id !== incidentId) return inc;
        if (inc.state === 'verified' && !inc.conflictingReports) return inc;

        const pktId = `REP-JOINT-${incidentId}`;
        const jointPacket: ReportPacket = {
          id: pktId,
          incidentClusterId: inc.id,
          timestamp: nowTime,
          channel: 'ndrf_agent',
          reporterName: 'Joint PWD + SDRF Team',
          reporterRole: 'Joint Inspection Lead',
          isOfficial: true,
          isAuthorizedFieldAgent: true,
          district: inc.district,
          landmark: inc.landmark,
          coordinates: inc.coordinates,
          category: inc.category,
          headline: resolutionNote,
          details: resolutionNote,
          rawPayload: JSON.stringify({ joint_recon: true, resolved_at: nowTime }),
          provenanceHash: generateProvenanceHash(pktId, nowTime, 'ndrf_agent'),
          contactMasked: '+91 94350 *****',
          exactAddress: inc.landmark
        };

        const updatedTrail = [
          jointPacket,
          ...inc.provenanceTrail.filter((p) => p.id !== pktId)
        ];
        const { state, baseReliability, corroborationCount } = evaluateCredibilityState(
          updatedTrail,
          null
        );
        const { currentReliability, ageMinutes, freshnessStatus, fallbackInstructions } =
          calculateDecayedReliability(
            baseReliability,
            nowTime,
            nowTime,
            inc.decayHalfLifeMin
          );

        return {
          ...inc,
          state,
          baseReliability,
          currentReliability,
          lastUpdatedAt: nowTime,
          ageMinutes,
          freshnessStatus,
          fallbackInstructions,
          provenanceTrail: updatedTrail,
          corroborationCount,
          conflictingReports: null
        };
      })
    );
  };

  const handleResolveIncidentConflict = (incidentId: string, resolutionNote: string) => {
    applyLocalConflictResolution(incidentId, resolutionNote);
    if (!isOffline) {
      pushConflictResolutionToServer(incidentId, resolutionNote);
    }
  };

  const applyLocalPriorityOverride = (
    incidentId: string,
    newScore: number,
    reason: string,
    responderName: string
  ) => {
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === incidentId) {
          return {
            ...inc,
            triagePriorityScore: newScore,
            responderOverride: {
              responderId: 'NDRF-OPS-LEAD-01',
              responderName,
              role: 'Rescue Lead',
              originalScore: inc.triagePriorityScore,
              overriddenScore: newScore,
              reason,
              timestamp: simulatedTime
            }
          };
        }
        return inc;
      })
    );
  };

  const handleUpdateIncidentOverride = (
    incidentId: string,
    newScore: number,
    reason: string,
    responderName: string
  ) => {
    applyLocalPriorityOverride(incidentId, newScore, reason, responderName);
    if (!isOffline) {
      pushPriorityOverrideToServer(incidentId, newScore, reason, responderName);
    }
  };

  const handleDebunkAndBroadcast = (
    incidentId: string,
    debunkNotice: string,
    misinfoId?: string
  ) => {
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === incidentId) {
          return {
            ...inc,
            isDebunked: true,
            debunkNotice,
            broadcastReachCount: Math.max(inc.broadcastReachCount || 0, 1420)
          };
        }
        return inc;
      })
    );

    setMisinfoList((prev) =>
      prev.map((item) => {
        if (!misinfoId || item.id === misinfoId) {
          return {
            ...item,
            humanReviewDecision: 'CONFIRMED_HOAX',
            reviewerName: 'Duty Officer',
            reviewerNotes: 'Checked against river sensors. SMS correction sent.',
            debunkBroadcast: {
              sentAt: simulatedTime,
              smsDelivered: item.exposedCitizenCount,
              ivrCallsMade: Math.floor(item.exposedCitizenCount * 0.85),
              pictographsRendered: item.exposedCitizenCount,
              reachRatePercentage: 100
            }
          };
        }
        return item;
      })
    );
  };

  const syncSingleStoreForwardToIncidents = (msg: StoreForwardMessage) => {
    const packetId = `REP-SYNC-${msg.id}`;
    const lowerLoc = msg.locationText.toLowerCase();
    const districtGuess = lowerLoc.includes('cachar')
      ? 'Cachar'
      : lowerLoc.includes('barpeta') || lowerLoc.includes('milan') || lowerLoc.includes('sarthebari')
      ? 'Barpeta'
      : lowerLoc.includes('patna')
      ? 'Patna'
      : lowerLoc.includes('puri')
      ? 'Puri'
      : lowerLoc.includes('wayanad') || lowerLoc.includes('kalpetta')
      ? 'Wayanad'
      : 'Morigaon';

    const stateGuess = msg.stateName || inferStateFromDistrict(districtGuess);
    const stateCenter = getStateInfo(stateGuess)?.viewCenter || ALL_INDIA_CENTER;

    const readableTitle =
      msg.lastKnownSafeStatus === 'OXYGEN_NEEDED'
        ? `Urgent Oxygen Needed — ${msg.locationText}`
        : msg.lastKnownSafeStatus === 'NEED_RESCUE'
        ? `Rescue Boat Needed — ${msg.locationText}`
        : `Rising Water — ${msg.locationText}`;

    const packet: ReportPacket = {
      id: packetId,
      incidentClusterId: `INC-SF-${msg.id.slice(-3)}`,
      timestamp: msg.timestamp,
      channel: msg.channel === 'USSD' ? 'citizen_ussd' : 'citizen_sms',
      reporterName: `Resident (${msg.phoneNumber.slice(-4)})`,
      reporterRole: 'Resident',
      isOfficial: false,
      isAuthorizedFieldAgent: false,
      stateName: stateGuess,
      district: districtGuess,
      landmark: msg.locationText,
      coordinates: stateCenter,
      category: msg.lastKnownSafeStatus === 'OXYGEN_NEEDED' ? 'medical_oxygen' : 'flood_surge',
      headline: readableTitle,
      details: `Received via offline ${msg.channel} from ${msg.locationText}.`,
      rawPayload: JSON.stringify(msg),
      provenanceHash: `0xSF${Math.floor(Math.random() * 90000).toString(16)}`,
      vulnerabilityFactors: {
        needsOxygen: msg.lastKnownSafeStatus === 'OXYGEN_NEEDED',
        isBedridden: msg.lastKnownSafeStatus === 'NEED_RESCUE',
        householdId: msg.householdId
      },
      contactMasked: msg.referenceNo
        ? `+91 ••••• •••${msg.phoneNumber.replace(/\D/g, '').slice(-2)} (Ref: ${msg.referenceNo})`
        : `+91 ••••• •••${msg.phoneNumber.replace(/\D/g, '').slice(-2)}`,
      exactAddress: msg.locationText
    };

    handleIngestNewPacket(packet);
  };

  const handleSyncStoreForwardMessage = (msgId: string) => {
    const target = storeForwardMessages.find((m) => m.id === msgId);
    if (!target || target.status !== 'queued_locally') return;
    syncSingleStoreForwardToIncidents(target);
    setStoreForwardMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, status: 'synced' } : m))
    );
  };

  const handleSyncAllStoreForward = () => {
    const pending = storeForwardMessages.filter((m) => m.status === 'queued_locally');
    for (const msg of pending) {
      syncSingleStoreForwardToIncidents(msg);
    }
    setStoreForwardMessages((prev) =>
      prev.map((m) => (m.status === 'queued_locally' ? { ...m, status: 'synced' } : m))
    );
  };

  const handleTriggerPrivacyBreach = async () => {
    // Attempt low-privilege escalation attack against Master Registry Database Array
    const attackRole = 'Role: Guest_09';
    const alertObj = {
      id: `AUD-SEC-CRIT-${Math.floor(Math.random() * 9000 + 1000)}`,
      timestamp: Date.now(),
      userId: 'GUEST-ATTACKER-09',
      userName: `Adversary Probe (${attackRole})`,
      role: 'Guest_09',
      requestedScope: 'Write/Mutate -> MASTER_REGISTRY_DATABASE_ARRAY',
      ipAddress: '198.51.100.42'
    };
    // Force active system block and toggle emergency amber glow
    setGlobalSupervisorAlert(alertObj);

    if (!isOffline) {
      const result = await attemptPrivilegeEscalationOnServer(attackRole);
      if (result.log) {
        setGlobalSupervisorAlert({
          id: result.log.id,
          timestamp: result.log.timestamp,
          userId: result.log.userId,
          userName: result.log.userName,
          role: result.log.role,
          requestedScope: result.log.requestedScope,
          ipAddress: result.log.ipAddress || '198.51.100.42'
        });
      }
    }
  };

  const handleReallocateFleet = () => {
    setRescueAssets((prev) => reallocateRescueAssets(incidents, prev));
  };

  const handleInspectFromDeveloper = (
    segment: 'citizen' | 'official',
    officialTab?: 'map' | 'feed' | 'triage' | 'misinfo' | 'storeforward' | 'privacy' | 'media',
    incidentToSelect?: FusedIncident
  ) => {
    if (segment === 'citizen') {
      setPortalMode('citizen');
      return;
    }
    if (officialTab) setActiveTab(officialTab);
    if (incidentToSelect) setSelectedIncident(incidentToSelect);
    if (authenticatedOfficer) {
      setPortalMode('official');
    } else {
      setIsOfficialAuthOpen(true);
    }
  };

  const handleTriggerPresenterBridgeDispute = () => {
    const nowTime = Math.max(simulatedTime, Date.now());
    const pkt: ReportPacket = {
      id: `REP-SDRF-DISPUTE-${Date.now()}`,
      incidentClusterId: 'INC-BRIDGE-01',
      timestamp: nowTime,
      channel: 'sdrf_radio',
      reporterName: 'SDRF Boat Patrol Bravo',
      reporterRole: 'Boat Commander',
      isOfficial: true,
      isAuthorizedFieldAgent: true,
      district: 'Kamrup',
      landmark: 'NH-27 Puthimari River Bridge Abutment',
      coordinates: { lat: 26.3412, lng: 91.7389 },
      category: 'bridge_collapse',
      headline: 'CONTRADICTION: Abutment washed out, bridge completely impassable!',
      details: 'SDRF patrol on water confirms northern bridge pillar foundation scour is critical. PWD light vehicle pass is inaccurate.',
      rawPayload: JSON.stringify({ scour_m: 3.2, passable: false }),
      provenanceHash: generateProvenanceHash(`REP-SDRF-${Date.now()}`, nowTime, 'sdrf_radio'),
      contactMasked: '+91 94350 *****',
      exactAddress: 'Puthimari River Crossing, NH-27, Kamrup'
    };
    handleIngestNewPacket(
      pkt,
      'INC-BRIDGE-01',
      true,
      'CONTRADICTION: Abutment washed out, bridge completely impassable!'
    );
  };

  const handleTriggerPresenterViralHoax = () => {
    const nowTime = Math.max(simulatedTime, Date.now());
    const newHoax: MisinformationItem = {
      id: 'MIS-01',
      timestamp: nowTime,
      sourceText:
        'VIRAL AUDIO FORWARD: Kapili river dam burst gates collapsed! 10ft surge entering Morigaon within 20 mins! Evacuate immediately!',
      originChannel: 'WhatsApp / 2G SMS Blast',
      viralityVelocityScore: 96,
      authorVerificationStatus: 'OFFICIAL_KEY_MISSING',
      isQuarantined: true,
      humanReviewDecision: 'PENDING',
      exposedCitizenCount: 1420,
      exposedCitizenList: ['+91 94350 *****', '+91 98640 *****', '+91 99541 *****']
    };
    setMisinfoList((prev) => [newHoax, ...prev.filter((m) => m.id !== 'MIS-01')]);
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === 'INC-VIRAL-03') {
          return {
            ...inc,
            isQuarantined: true,
            isDebunked: false,
            broadcastReachCount: 1420
          };
        }
        return inc;
      })
    );
  };

  const handleTriggerPresenterStaleShelter = () => {
    const freshNow = Math.max(simulatedTime, Date.now()) + 94 * 60 * 1000;
    setSimulatedTime(freshNow);
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === 'INC-SHELTER-04' || inc.district === 'Morigaon') {
          return {
            ...inc,
            ageMinutes: 94,
            currentReliability: 0.38,
            freshnessStatus: 'stale',
            fallbackInstructions: 'Telemetry expired (>90m). Evacuate to Morigaon District College Camp instead.'
          };
        }
        return inc;
      })
    );
  };

  const handleTriggerPresenterOxygenDedup = () => {
    const nowTime = Math.max(simulatedTime, Date.now());
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === 'INC-OXYGEN-02' || inc.category === 'medical_oxygen') {
          return {
            ...inc,
            triagePriorityScore: 100,
            corroborationCount: 3,
            provenanceTrail:
              inc.provenanceTrail.length >= 3
                ? inc.provenanceTrail
                : [
                    ...inc.provenanceTrail,
                    {
                      id: `REP-USSD-${Date.now()}`,
                      incidentClusterId: inc.id,
                      timestamp: nowTime,
                      channel: 'citizen_ussd',
                      reporterName: 'Resident Neighbor',
                      reporterRole: 'Resident',
                      isOfficial: false,
                      isAuthorizedFieldAgent: false,
                      district: 'Barpeta',
                      landmark: 'Milan Nagar Ward 4',
                      coordinates: { lat: 26.3211, lng: 91.0049 },
                      category: 'medical_oxygen',
                      headline: 'Neighbor confirmation: elderly patient oxygen generator battery failing',
                      details: 'Reported via offline *1070# USSD beacon.',
                      rawPayload: JSON.stringify({ oxygen: true, bedridden: true }),
                      provenanceHash: generateProvenanceHash(`REP-USSD-${Date.now()}`, nowTime, 'citizen_ussd'),
                      contactMasked: '+91 98801 *****',
                      exactAddress: 'Milan Nagar, Barpeta'
                    }
                  ]
          };
        }
        return inc;
      })
    );
  };

  const handleResetPresenterScenarios = () => {
    const nowMs = Date.now();
    setSimulatedTime(nowMs);
    setIsLowNetwork(false);
    setIsOffline(false);
    setGlobalSupervisorAlert(null);
    setIncidents(createInitialDisasterScenario(nowMs));
    setMisinfoList(initialMisinformationItems.map((m) => ({ ...m })));
    setStoreForwardMessages(createInitialStoreForwardQueue(nowMs));
    resetServerLiveState();
  };

  // Strictly filter out any live citizen device reports from CitizenPortal props
  // so real-time data from other devices stays 100% inside the Common Officer Tab only.
  const citizenIsolatedIncidents = incidents.filter(
    (inc) => !inc.provenanceTrail.some((p) => p.fromLiveDevice)
  );

  return (
    <AppMapsProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      language={language}
    >
      <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] flex flex-col antialiased">
        {mapsQuotaExceeded && !isQuotaBannerDismissed && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm sticky top-0 z-50 shadow-sm flex items-center justify-between gap-3">
            <span className="flex-1 text-center font-medium">
              Unable to load map data. Please check your network connection or API quota in Google Cloud Console.
            </span>
            <button
              type="button"
              onClick={() => setIsQuotaBannerDismissed(true)}
              className="p-1 rounded hover:bg-amber-200/60 text-amber-900 shrink-0 transition-colors"
              aria-label="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. ResQnet Header */}
        <Header
          isOffline={isOffline}
          setIsOffline={setIsOffline}
          isLowNetwork={isLowNetwork}
          setIsLowNetwork={setIsLowNetwork}
          language={language}
          setLanguage={setLanguage}
          portalMode={portalMode}
          onSelectPortalMode={handleSelectPortalMode}
          onLogoutOfficial={() => {
            setPortalMode('citizen');
            setLiveArrivalBanner(null);
          }}
          authenticatedOfficer={authenticatedOfficer}
          onOpenIngestModal={() => setIsIngestModalOpen(true)}
          liveConnectedOfficerTabs={liveConnectedOfficerTabs}
          isOfficerRealtimeConnected={isOfficerRealtimeConnected}
        />

        {/* 2. CITIZEN PORTAL (Default View) */}
        {portalMode === 'citizen' && (
          <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
            <CitizenPortal
              incidents={citizenIsolatedIncidents}
              onIngestCitizenReport={(packet) => handleIngestNewPacket(packet)}
              language={language}
              isLowNetwork={isLowNetwork}
              onOpenOfficialLogin={() => setIsOfficialAuthOpen(true)}
            />
          </main>
        )}

        {/* 3. COMMON OFFICER SEGMENT (Receives all real-time data from connected devices) */}
        {portalMode === 'official' && authenticatedOfficer && (
          <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-5">
            {liveArrivalBanner && (
              <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950">
                <div>
                  <strong className="font-bold">Live Request Received in Common Officer Tab:</strong>{' '}
                  <span>
                    {liveArrivalBanner.headline} ({liveArrivalBanner.district})
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStateFilter('live_devices');
                      setActiveTab('feed');
                      setLiveArrivalBanner(null);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    Open Live Reports
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveArrivalBanner(null)}
                    className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg font-medium transition-colors whitespace-nowrap"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <KPIStrip
              incidents={incidents}
              language={language}
              onFilterState={(state) => {
                setSelectedStateFilter(state);
                setActiveTab('feed');
              }}
              selectedStateFilter={selectedStateFilter}
              securityBreachAlert={globalSupervisorAlert}
              onDismissSecurityBreach={() => setGlobalSupervisorAlert(null)}
            />

            {globalSupervisorAlert && (
              <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-950">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>Blocked Access:</strong> Unauthorized attempt to download citizen phone numbers or mutate registry ({globalSupervisorAlert.role}).
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('privacy')}
                    className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-900 rounded-lg font-semibold border border-rose-200 transition-colors whitespace-nowrap"
                  >
                    View Log
                  </button>
                  <button
                    onClick={() => setGlobalSupervisorAlert(null)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <nav className="flex border-b border-slate-200 overflow-x-auto text-sm" aria-label="Officer sections">
              <button
                onClick={() => setActiveTab('feed')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 tabular-nums ${
                  activeTab === 'feed'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>{t.navFeed} ({incidents.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  activeTab === 'map'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Map className="w-4 h-4" />
                <span>{t.navMap}</span>
              </button>

              <button
                onClick={() => setActiveTab('triage')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  activeTab === 'triage'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <HeartHandshake className="w-4 h-4" />
                <span>{t.navTriage}</span>
              </button>

              <button
                onClick={() => setActiveTab('media')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  activeTab === 'media'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>{language === 'hi' ? 'मीडिया वायर' : 'Media Wire'}</span>
              </button>

              <button
                onClick={() => setActiveTab('misinfo')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  activeTab === 'misinfo'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{t.navMisinfo}</span>
              </button>

              <button
                onClick={() => setActiveTab('storeforward')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 tabular-nums ${
                  activeTab === 'storeforward'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>
                  {t.navStoreForward} ({storeForwardMessages.filter((m) => m.status === 'queued_locally').length})
                </span>
              </button>

              <button
                onClick={() => setActiveTab('privacy')}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  activeTab === 'privacy'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>{t.navPrivacy}</span>
              </button>
            </nav>

            <div>
              {activeTab === 'map' && (
                <InteractiveMap
                  incidents={incidents}
                  selectedIncident={selectedIncident}
                  onSelectIncident={setSelectedIncident}
                  language={language}
                  onOpenProvenance={(inc) => setInspectedIncidentForProvenance(inc)}
                  onResolveBridgeConflict={() =>
                    handleResolveIncidentConflict(
                      'INC-BRIDGE-01',
                      'Joint PWD + SDRF check complete: Puthimari Bridge verified safe and reopened.'
                    )
                  }
                />
              )}

              {activeTab === 'feed' && (
                <FusionFeed
                  incidents={incidents}
                  onOpenProvenance={(inc) => setInspectedIncidentForProvenance(inc)}
                  onRefreshIncidentPing={handleRefreshIncidentPing}
                  language={language}
                  selectedStateFilter={selectedStateFilter}
                  setSelectedStateFilter={setSelectedStateFilter}
                  isRealtimeConnected={isOfficerRealtimeConnected}
                  connectedOfficerTabs={liveConnectedOfficerTabs}
                />
              )}

              {activeTab === 'triage' && (
                <TriageConsole
                  incidents={incidents}
                  onUpdateIncidentOverride={handleUpdateIncidentOverride}
                  language={language}
                  onOpenProvenance={(inc) => setInspectedIncidentForProvenance(inc)}
                />
              )}

              {activeTab === 'misinfo' && (
                <MisinformationQuarantine
                  incidents={incidents}
                  misinfoList={misinfoList}
                  setMisinfoList={setMisinfoList}
                  onDebunkAndBroadcast={handleDebunkAndBroadcast}
                  language={language}
                />
              )}

              {activeTab === 'storeforward' && (
                <StoreForwardConsole
                  language={language}
                  messages={storeForwardMessages}
                  onSyncMessage={handleSyncStoreForwardMessage}
                  onSyncAllMessages={handleSyncAllStoreForward}
                />
              )}

              {activeTab === 'media' && (
                <MediaPriorityConsole
                  incidents={incidents}
                  language={language}
                />
              )}

              {activeTab === 'privacy' && (
                <PrivacyScopeConsole
                  incidents={incidents}
                  language={language}
                />
              )}
            </div>
          </main>
        )}

        {/* Modals */}
        <OfficialAuthModal
          isOpen={isOfficialAuthOpen}
          onClose={() => setIsOfficialAuthOpen(false)}
          onSuccessfulLogin={(officerName, role, badgeId) => {
            setAuthenticatedOfficer({ name: officerName, role, badgeId });
            setPortalMode('official');
          }}
          onFailedAttempt={(attemptedId) => {
            recordAuditLogOnServer({
              userId: attemptedId || 'UNKNOWN_BADGE',
              userName: 'Unauthorized Applicant',
              role: 'Unverified Visitor',
              requestedScope: 'Officer Portal Sign-In Attempt',
              outcome: 'denied_unauthorized',
              reason: 'Failed passkey authentication'
            });
          }}
        />

        <ProvenanceInspectorModal
          incident={inspectedIncidentForProvenance}
          onClose={() => setInspectedIncidentForProvenance(null)}
        />

        <SimulateReportModal
          isOpen={isIngestModalOpen}
          onClose={() => setIsIngestModalOpen(false)}
          existingIncidents={incidents}
          onIngestNewPacket={handleIngestNewPacket}
        />

        {/* Unified ResQnet Footer */}
        <footer className="bg-black text-neutral-300 border-t border-neutral-900 py-5 px-4 text-xs mt-12">
          <div className="max-w-5xl mx-auto flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src="/assets/aistudio/ResQnet_Medical_Connectivity_Logo_c2ba50c4.png"
                    alt="ResQnet Logo"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain scale-110"
                  />
                </div>
                <div>
                  <div className="font-semibold text-white">
                    {t.footerTitle}
                  </div>
                  <div className="text-neutral-400 text-[11px]">
                    {t.footerHelpline}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                <span>{t.footerMapsNotice}</span>
                <span aria-hidden="true">·</span>
                <a
                  href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-neutral-200 underline underline-offset-2"
                >
                  {t.footerTerms}
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-neutral-200 underline underline-offset-2"
                >
                  {t.footerPrivacy}
                </a>
              </div>
            </div>

            <div className="border-t border-neutral-900 pt-2.5 text-[11px] text-neutral-400">
              {t.footerDisclaimer}
            </div>
          </div>
        </footer>
      </div>
    </AppMapsProvider>
  );
}
