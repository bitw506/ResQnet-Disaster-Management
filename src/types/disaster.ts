/**
 * NDMA Disaster Information Fusion Portal - Domain Types
 * Defines multi-source data packet structures, provenance trails, credibility tiers,
 * and time-decay reliability parameters.
 */

export type CredibilityState = 'unconfirmed' | 'corroborated' | 'verified' | 'disputed';

export type SourceChannel = 
  | 'citizen_sms' 
  | 'citizen_ussd' 
  | 'citizen_web' 
  | 'sdrf_radio' 
  | 'ndrf_agent' 
  | 'pwd_official' 
  | 'cwc_gauge' 
  | 'imd_feed' 
  | 'district_magistrate';

export type IncidentCategory = 
  | 'flood_surge' 
  | 'bridge_collapse' 
  | 'road_cut' 
  | 'medical_oxygen' 
  | 'shelter_capacity' 
  | 'evacuation_order';

export type DistrictName = string;
export type IndianStateName = string;

export interface VulnerabilityFactors {
  isBedridden?: boolean;
  needsOxygen?: boolean;
  isElderlyAlone?: boolean;
  infantsPresent?: boolean;
  mobilityImpaired?: boolean;
  waterLevelFeet?: number;
  trappedFloor?: string;
  householdId?: string;
}

export interface ReportPacket {
  id: string;
  incidentClusterId: string;
  timestamp: number; // Simulated epoch ms
  channel: SourceChannel;
  reporterName: string;
  reporterRole: string;
  isOfficial: boolean;
  isAuthorizedFieldAgent: boolean;
  stateName?: IndianStateName;
  district: DistrictName;
  landmark: string;
  coordinates: { lat: number; lng: number };
  category: IncidentCategory;
  headline: string;
  details: string;
  rawPayload: string;
  provenanceHash: string;
  vulnerabilityFactors?: VulnerabilityFactors;
  contactMasked: string;
  exactAddress: string;
  emergencyFormType?: string;
  emergencyFormDetails?: Array<{ label: string; value: string }>;
  fromLiveDevice?: boolean;
}

export interface ConflictingReportData {
  sourceA: string;
  claimA: string;
  channelA: SourceChannel;
  timestampA: number;
  sourceB: string;
  claimB: string;
  channelB: SourceChannel;
  timestampB: number;
  conflictDescription: string;
  conservativeAction: string;
}

export interface ResponderOverrideAudit {
  responderId: string;
  responderName: string;
  role: string;
  originalScore: number;
  overriddenScore: number;
  reason: string;
  timestamp: number;
}

export interface FusedIncident {
  id: string;
  clusterCode: string;
  title: string;
  category: IncidentCategory;
  stateName?: IndianStateName;
  district: DistrictName;
  landmark: string;
  coordinates: { lat: number; lng: number };
  state: CredibilityState;
  
  // Reliability and Time Decay
  baseReliability: number; // 0 to 100
  currentReliability: number; // 0 to 100, decayed by time
  decayHalfLifeMin: number; // e.g. 45 min
  lastUpdatedAt: number; // epoch ms
  ageMinutes: number;
  freshnessStatus: 'fresh' | 'aging' | 'stale';
  fallbackInstructions: string;

  // Provenance & Corroboration
  provenanceTrail: ReportPacket[];
  corroborationCount: number;
  conflictingReports?: ConflictingReportData | null;

  // Triage & Priority (0 to 100)
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilityScore: number;
  triagePriorityScore: number;
  assignedTeam?: string;
  responderOverride?: ResponderOverrideAudit | null;

  // Misinformation & Quarantine
  isQuarantined: boolean;
  quarantineReason?: string;
  isDebunked: boolean;
  debunkNotice?: string;
  broadcastReachCount?: number;

  // Shelter specific
  shelterCapacity?: {
    total: number;
    occupied: number;
    availableFoodHours: number;
    cleanWaterAvailable: boolean;
  };
}

export interface StoreForwardMessage {
  id: string;
  referenceNo?: string;
  channel: 'SMS' | 'USSD';
  phoneNumber: string;
  timestamp: number;
  payload: string;
  status: 'queued_locally' | 'transmitting' | 'synced' | 'conflict_resolved';
  lastKnownSafeStatus: 'SAFE' | 'NEED_RESCUE' | 'WATER_RISING' | 'OXYGEN_NEEDED';
  householdId: string;
  locationText: string;
  stateName?: IndianStateName;
  vectorClock?: { device: number; network: number };
}

export interface UssdCompressedToken {
  id: string; // e.g. "904"
  rawString: string; // e.g. "ID=904;MED=OXYGEN;LOC=D3;TS=1718910;VC=1;SAFE_STAT=OXYGEN_NEEDED"
  byteSize: number;
  category: IncidentCategory;
  med: string;
  locSector: string;
  timestamp: number;
  vectorClock: { device: number; network: number };
  lastKnownSafeStatus: 'SAFE' | 'NEED_RESCUE' | 'WATER_RISING' | 'OXYGEN_NEEDED';
  householdId?: string;
  phoneNumber?: string;
  synced?: boolean;
}

export interface SecurityAuditLog {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  role: string;
  requestedScope: string;
  outcome: 'granted' | 'denied_unauthorized' | 'expired';
  reason: string;
  ipAddress: string;
  isViolation?: boolean;
  highlightRed?: boolean;
  violationType?: 'RBAC_PRIVILEGE_ESCALATION' | 'UNAUTHORIZED_DATA_ACCESS' | 'RATE_LIMIT_EXCEEDED';
}

export interface RescueAsset {
  id: string;
  name: string;
  type: 'rescue_boat' | 'amphibious_truck' | 'paramedic_van';
  status: 'available' | 'dispatched' | 'maintenance';
  capacityPersons: number;
  hasOxygenSupply: boolean;
  assignedIncidentId?: string | null;
  assignedIncidentTitle?: string;
  assignedStateName?: IndianStateName;
  assignedDistrict?: DistrictName;
  etaMinutes?: number;
  constrainedRouteNote?: string;
}

export type PictographType = 'flood_rising' | 'evacuation_high_ground' | 'boil_water' | 'stay_indoor' | 'boat_rescue';

export interface MultimodalAlert {
  id: string;
  stateName?: IndianStateName;
  polygonId: string;
  polygonName: string;
  polygonCoords: Array<{ x: number; y: number }>;
  severity: 'advisory' | 'warning' | 'critical';
  headline: string;
  smsText: string;
  ivrScript: string;
  audioSirenTriggered: boolean;
  pictographType: PictographType;
  sentAt: number;
  totalRecipientsTargeted: number;
  fatigueSuppressedCount: number;
  suppressionWindowMinutes: number;
}

export interface AlertFatigueLog {
  id: string;
  timestamp: number;
  recipientPhone: string;
  polygonId: string;
  alertId: string;
  status: 'delivered' | 'suppressed_fatigue';
  timeSinceLastAlertMinutes: number;
}

export interface MisinformationItem {
  id: string;
  timestamp: number;
  sourceText: string;
  originChannel: string;
  viralityVelocityScore: number; // 0-100 pings/min
  authorVerificationStatus: 'UNVERIFIED' | 'FAILED_HMAC' | 'OFFICIAL_KEY_MISSING';
  isQuarantined: boolean;
  humanReviewDecision?: 'CONFIRMED_HOAX' | 'GENUINE_EMERGENCY' | 'PENDING';
  reviewerName?: string;
  reviewerNotes?: string;
  exposedCitizenCount: number;
  exposedCitizenList: string[]; // Masked phone numbers who received the original hoax
  debunkBroadcast?: {
    sentAt: number;
    smsDelivered: number;
    ivrCallsMade: number;
    pictographsRendered: number;
    reachRatePercentage: number;
  };
}
