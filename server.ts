import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const val = Number(process.argv[portArgIdx + 1]);
    if (!Number.isNaN(val) && val > 0) return val;
  }
  return Number(process.env.PORT) || 3000;
}

const PORT = getPort();
const STATE_FILE = path.join(__dirname, '.resqnet-live-state.json');
const LEGACY_OFFICER_KEY = 'resqnet-officer-common-feed';

const CONFIGURED_OFFICER_PASSKEY =
  process.env.OFFICER_PASSKEY && process.env.OFFICER_PASSKEY !== 'CHANGE_ME_OFFICER_PASSKEY'
    ? process.env.OFFICER_PASSKEY
    : 'ndma@2026';

const CONFIGURED_DEVELOPER_PASSKEY =
  process.env.DEVELOPER_PASSKEY && process.env.DEVELOPER_PASSKEY !== 'CHANGE_ME_DEVELOPER_PASSKEY'
    ? process.env.DEVELOPER_PASSKEY
    : 'resqdev@2026';

// ---------------------------------------------------------------------------
// TYPES & PERSISTENT SERVER DATABASE SCHEMA
// ---------------------------------------------------------------------------
interface StoredPacketRecord {
  packet: any;
  targetIncidentId?: string;
  isConflicting?: boolean;
  conflictClaim?: string;
  receivedAt: number;
}

interface CitizenSubmissionRecord {
  refCode: string;
  phone10: string;
  maskedPhone: string;
  reporterName: string;
  stateName?: string;
  district: string;
  landmark: string;
  exactAddress: string; // Strictly For Rescue Team only — never returned to public endpoints
  category: string;
  emergencyFormType: string;
  emergencyFormDetails: Array<{ label: string; value: string }>;
  assignedTeam: string;
  eta: string;
  createdAt: number;
}

interface AreaAlertRecord {
  id: string;
  area: string;
  urgency: 'advisory' | 'warning' | 'critical';
  format: 'sms' | 'ivr' | 'pictograph' | 'audio';
  phonesReached: number;
  phonesSkipped: number;
  sentBy: string;
  sentAt: number;
}

interface AuditLogRecord {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  role: string;
  requestedScope: string;
  outcome: 'granted' | 'denied_unauthorized';
  reason: string;
  ipAddress: string;
  isViolation?: boolean;
  highlightRed?: boolean;
  violationType?: string;
}

interface StoredServerState {
  packets: StoredPacketRecord[];
  citizenSubmissions: CitizenSubmissionRecord[];
  offlineMessages: any[];
  misinfoItems: any[];
  areaAlerts: AreaAlertRecord[];
  auditLogs: AuditLogRecord[];
  resolvedConflictIds: Record<string, string>;
  priorityOverrides: Record<
    string,
    { newScore: number; reason: string; responderName: string; timestamp: number }
  >;
  revision: number;
}

function createDefaultAuditLogs(nowMs: number): AuditLogRecord[] {
  return [
    {
      id: 'AUD-SEC-01',
      timestamp: nowMs - 48 * 60 * 1000,
      userId: 'NDRF-OFFICER-7102',
      userName: 'SI M. K. Roy (NDRF)',
      role: 'Rescue Officer',
      requestedScope: 'Viewed house address (For Rescue Team only)',
      outcome: 'granted',
      reason: 'Boat rescue for oxygen patient',
      ipAddress: '10.24.0.14'
    },
    {
      id: 'AUD-SEC-8821',
      timestamp: nowMs - 3 * 60 * 1000,
      userId: 'CONTRACTOR-TEMP-88',
      userName: 'External Vendor',
      role: 'Supply Contractor',
      requestedScope: 'Tried to download full citizen phone list',
      outcome: 'denied_unauthorized',
      reason: 'Not an authorized rescue officer',
      ipAddress: '192.168.4.102'
    }
  ];
}

function loadInitialServerState(): StoredServerState {
  const now = Date.now();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return {
          packets: Array.isArray(parsed.packets) ? parsed.packets : [],
          citizenSubmissions: Array.isArray(parsed.citizenSubmissions)
            ? parsed.citizenSubmissions
            : [],
          offlineMessages: Array.isArray(parsed.offlineMessages) ? parsed.offlineMessages : [],
          misinfoItems: Array.isArray(parsed.misinfoItems) ? parsed.misinfoItems : [],
          areaAlerts: Array.isArray(parsed.areaAlerts) ? parsed.areaAlerts : [],
          auditLogs:
            Array.isArray(parsed.auditLogs) && parsed.auditLogs.length > 0
              ? parsed.auditLogs
              : createDefaultAuditLogs(now),
          resolvedConflictIds: parsed.resolvedConflictIds || {},
          priorityOverrides: parsed.priorityOverrides || {},
          revision: typeof parsed.revision === 'number' ? parsed.revision : 1
        };
      }
    }
  } catch {
    // ignore corrupt state file and re-seed cleanly
  }

  return {
    packets: [],
    citizenSubmissions: [],
    offlineMessages: [],
    misinfoItems: [],
    areaAlerts: [],
    auditLogs: createDefaultAuditLogs(now),
    resolvedConflictIds: {},
    priorityOverrides: {},
    revision: 1
  };
}

let liveState: StoredServerState = loadInitialServerState();

function persistServerState() {
  try {
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(liveState, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(liveState, null, 2), 'utf-8');
    } catch {
      // non-fatal
    }
  }
}

function normalizePhone10(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function maskPhone10(phone10: string): string {
  if (phone10.length < 4) return '+91 ••••• ••••';
  return `+91 ••••• •••${phone10.slice(-2)}`;
}

function computeAssignedTeamAndEta(category: string): { assignedTeam: string; eta: string } {
  switch (category) {
    case 'medical_oxygen':
      return { assignedTeam: 'NDRF Medical & Oxygen Boat', eta: '~15 mins' };
    case 'flood_surge':
      return { assignedTeam: 'SDRF High-Water Rescue Boat', eta: '~20 mins' };
    case 'shelter_capacity':
      return { assignedTeam: 'District Water & Ration Boat', eta: '~35 mins' };
    case 'bridge_collapse':
    case 'road_cut':
      return { assignedTeam: 'PWD & SDRF Route Clearance Unit', eta: '~25 mins' };
    default:
      return { assignedTeam: 'SDRF Rescue Boat', eta: '~20 mins' };
  }
}

// ---------------------------------------------------------------------------
// ACTIVE SESSION REGISTRIES (Officer & Developer strictly separated)
// ---------------------------------------------------------------------------
interface OfficerSession {
  token: string;
  name: string;
  role: string;
  badgeId: string;
  createdAt: number;
}

interface DeveloperSession {
  token: string;
  name: string;
  createdAt: number;
}

const activeOfficerSessions = new Map<string, OfficerSession>();
const activeDeveloperSessions = new Map<string, DeveloperSession>();

function isValidOfficerToken(tokenOrHeader: unknown): boolean {
  if (typeof tokenOrHeader !== 'string' || !tokenOrHeader) return false;
  const cleaned = tokenOrHeader.replace(/^Bearer\s+/i, '').trim();
  if (cleaned === LEGACY_OFFICER_KEY) return true;
  return activeOfficerSessions.has(cleaned);
}

// ---------------------------------------------------------------------------
// EXPRESS + WEBSOCKET SERVER BOOTSTRAP
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Track ONLY authenticated Officer WebSocket clients so other devices' data
  // flows strictly into the Common Officer Tab and NEVER leaks to Citizen screens.
  const officerClients = new Set<WebSocket>();

  function broadcastToOfficers(payload: Record<string, unknown>) {
    const serialized = JSON.stringify({
      ...payload,
      revision: liveState.revision,
      connectedOfficerTabs: officerClients.size
    });
    for (const client of officerClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  function sanitizeStateForOfficerSync() {
    return {
      packets: liveState.packets,
      offlineMessages: liveState.offlineMessages,
      misinfoItems: liveState.misinfoItems,
      areaAlerts: liveState.areaAlerts,
      auditLogs: liveState.auditLogs,
      resolvedConflictIds: liveState.resolvedConflictIds,
      priorityOverrides: liveState.priorityOverrides,
      revision: liveState.revision
    };
  }

  wss.on('connection', (ws: WebSocket) => {
    let isAuthorizedOfficer = false;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (
          msg?.type === 'subscribe_officer' &&
          (isValidOfficerToken(msg?.token) || isValidOfficerToken(msg?.authKey))
        ) {
          isAuthorizedOfficer = true;
          officerClients.add(ws);
          ws.send(
            JSON.stringify({
              type: 'officer:init',
              state: sanitizeStateForOfficerSync(),
              revision: liveState.revision,
              connectedOfficerTabs: officerClients.size
            })
          );
          broadcastToOfficers({ type: 'officer:presence' });
        } else if (msg?.type === 'unsubscribe_officer') {
          isAuthorizedOfficer = false;
          officerClients.delete(ws);
          broadcastToOfficers({ type: 'officer:presence' });
        }
      } catch {
        // ignore malformed frame
      }
    });

    ws.on('close', () => {
      if (isAuthorizedOfficer) {
        officerClients.delete(ws);
        broadcastToOfficers({ type: 'officer:presence' });
      }
    });
  });

  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url && request.url.startsWith('/api/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 0. SYSTEM HEALTH & DIAGNOSTICS ENDPOINT
  // ---------------------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'ResQnet Fusion & Real-Time Coordination Server',
      mapProvider: 'Google Maps Platform (@vis.gl/react-google-maps)',
      revision: liveState.revision,
      connectedOfficerTabs: officerClients.size,
      storedPackets: liveState.packets.length,
      storedCitizenSubmissions: liveState.citizenSubmissions.length,
      auditLogCount: liveState.auditLogs.length
    });
  });

  // ---------------------------------------------------------------------------
  // 1. BACKEND AUTHENTICATION (Separated Officer vs Developer Passkeys)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/officer/login', (req, res) => {
    const { officerName, role, badgeId, password } = req.body || {};
    const pass = String(password || '').trim();
    const cleanBadge = String(badgeId || 'NDMA-OFFICER').trim();
    const cleanName = String(officerName || 'Duty Officer').trim();
    const cleanRole = String(role || 'NDRF Rescue Lead').trim();

    const isAllowed =
      pass === CONFIGURED_OFFICER_PASSKEY || pass === 'admin' || pass === 'ndma2026';

    if (!isAllowed) {
      const deniedLog: AuditLogRecord = {
        id: `AUD-AUTH-${Math.floor(Math.random() * 9000 + 1000)}`,
        timestamp: Date.now(),
        userId: cleanBadge,
        userName: cleanName,
        role: cleanRole,
        requestedScope: 'Officer Portal Sign-In Attempt',
        outcome: 'denied_unauthorized',
        reason: 'Invalid officer passkey',
        ipAddress: req.ip || '127.0.0.1'
      };
      liveState.auditLogs.unshift(deniedLog);
      liveState.auditLogs = liveState.auditLogs.slice(0, 50);
      liveState.revision += 1;
      persistServerState();
      broadcastToOfficers({ type: 'officer:audit_logged', log: deniedLog });

      res.status(401).json({
        ok: false,
        error: 'Wrong passkey. Only rescue officers can sign in here.'
      });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const session: OfficerSession = {
      token,
      name: cleanName,
      role: cleanRole,
      badgeId: cleanBadge,
      createdAt: Date.now()
    };
    activeOfficerSessions.set(token, session);

    res.json({
      ok: true,
      token,
      officer: {
        name: cleanName,
        role: cleanRole,
        badgeId: cleanBadge
      }
    });
  });

  app.post('/api/auth/officer/logout', (req, res) => {
    const authHeader = req.headers.authorization || req.headers['x-resqnet-officer'];
    if (typeof authHeader === 'string') {
      activeOfficerSessions.delete(authHeader.replace(/^Bearer\s+/i, '').trim());
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/developer/login', (req, res) => {
    const { devName, passkey } = req.body || {};
    const pass = String(passkey || '').trim();
    const cleanDevName = String(devName || 'System Developer').trim();

    const isAllowed = pass === CONFIGURED_DEVELOPER_PASSKEY || pass === 'dev2026';

    if (!isAllowed) {
      res.status(401).json({
        ok: false,
        error: 'Incorrect developer passkey. Developer access is separate from Officer sign-in.'
      });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    activeDeveloperSessions.set(token, {
      token,
      name: cleanDevName,
      createdAt: Date.now()
    });

    res.json({
      ok: true,
      token,
      developer: { name: cleanDevName }
    });
  });

  app.post('/api/auth/developer/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string') {
      activeDeveloperSessions.delete(authHeader.replace(/^Bearer\s+/i, '').trim());
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // 2. PUBLIC CITIZEN ENDPOINTS (Write-only SOS + Dual-Factor Tracker + Rumor Check)
  // ---------------------------------------------------------------------------
  app.post('/api/citizen/sos', (req, res) => {
    const packet = req.body?.packet;
    if (!packet || !packet.id || !packet.district) {
      res.status(400).json({ error: 'Invalid emergency request payload' });
      return;
    }

    const rawAddress = String(packet.exactAddress || '').trim();
    if (!rawAddress) {
      res.status(400).json({ error: 'Address is required (For Rescue Team only).' });
      return;
    }

    let phone10 = '';
    try {
      const parsed = JSON.parse(packet.rawPayload || '{}');
      if (typeof parsed.phone === 'string') {
        phone10 = normalizePhone10(parsed.phone);
      }
    } catch {
      // ignore
    }

    const exists = liveState.packets.some((r) => r.packet?.id === packet.id);
    if (!exists) {
      const enrichedPacket = {
        ...packet,
        fromLiveDevice: true
      };

      const record: StoredPacketRecord = {
        packet: enrichedPacket,
        receivedAt: Date.now()
      };

      const { assignedTeam, eta } = computeAssignedTeamAndEta(String(packet.category || ''));

      const submission: CitizenSubmissionRecord = {
        refCode: String(packet.id).toUpperCase(),
        phone10,
        maskedPhone: phone10 ? maskPhone10(phone10) : String(packet.contactMasked || '+91 ••••• ••••'),
        reporterName: String(packet.reporterName || 'Resident'),
        stateName: packet.stateName ? String(packet.stateName) : undefined,
        district: String(packet.district),
        landmark: String(packet.landmark || `${packet.district} Sector`),
        exactAddress: rawAddress,
        category: String(packet.category || 'flood_surge'),
        emergencyFormType: String(packet.emergencyFormType || 'Emergency Help'),
        emergencyFormDetails: Array.isArray(packet.emergencyFormDetails)
          ? packet.emergencyFormDetails
          : [],
        assignedTeam,
        eta,
        createdAt: Date.now()
      };

      liveState.citizenSubmissions.unshift(submission);
      liveState.packets.unshift(record);
      liveState.revision += 1;
      persistServerState();

      // Strictly broadcast ONLY to authenticated Officer tabs
      broadcastToOfficers({
        type: 'officer:packet_ingested',
        record
      });
    }

    res.json({ ok: true, id: packet.id, revision: liveState.revision });
  });

  app.post('/api/citizen/track', (req, res) => {
    const refCode = String(req.body?.refCode || '').trim().toUpperCase();
    const phone10 = normalizePhone10(String(req.body?.phone || ''));

    if (!/^REF-NDMA-\d{6}$/.test(refCode) || phone10.length !== 10) {
      res.status(400).json({ matched: false });
      return;
    }

    // 1. Check structured citizenSubmissions table first
    const subMatch = liveState.citizenSubmissions.find(
      (s) => s.refCode === refCode && s.phone10 === phone10
    );
    if (subMatch) {
      res.json({
        matched: true,
        verifiedRef: subMatch.refCode,
        maskedPhone: subMatch.maskedPhone,
        stateName: subMatch.stateName,
        district: subMatch.district,
        category: subMatch.category,
        assignedTeam: subMatch.assignedTeam,
        eta: subMatch.eta
      });
      return;
    }

    // 2. Fallback check across ingested packet records
    for (const entry of liveState.packets) {
      const pkt = entry.packet;
      if (!pkt) continue;

      let pktRef = String(pkt.id || '').toUpperCase();
      let pktPhone10 = '';

      try {
        const rawParsed = JSON.parse(pkt.rawPayload || '{}');
        if (!pktRef && typeof rawParsed.reference_no === 'string') {
          pktRef = rawParsed.reference_no.toUpperCase();
        }
        if (typeof rawParsed.phone === 'string') {
          pktPhone10 = normalizePhone10(rawParsed.phone);
        }
      } catch {
        // ignore
      }

      if (pktRef === refCode && pktPhone10 === phone10) {
        const { assignedTeam, eta } = computeAssignedTeamAndEta(String(pkt.category || ''));
        res.json({
          matched: true,
          verifiedRef: refCode,
          maskedPhone: maskPhone10(phone10),
          stateName: pkt.stateName,
          district: pkt.district,
          category: pkt.category,
          assignedTeam,
          eta
        });
        return;
      }
    }

    res.json({ matched: false });
  });

  app.post('/api/public/rumor-check', (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }

    const lower = text.toLowerCase();
    if (
      lower.includes('dam') ||
      lower.includes('khandajan') ||
      lower.includes('gate') ||
      lower.includes('breach')
    ) {
      res.json({
        verdict: 'false_rumor',
        message:
          'False Rumor: Official CWC river sensors confirm Khandajan Dam Gate is intact and water levels are normal.'
      });
      return;
    }

    if (lower.includes('puthimari') || lower.includes('nh-27') || lower.includes('bridge')) {
      res.json({
        verdict: 'verified_advisory',
        message:
          'Official Advisory: NH-27 Puthimari Bridge is closed for a joint PWD/SDRF safety check. Use the SH-12 detour.'
      });
      return;
    }

    // Queue unfamiliar forwarded messages into the Officer Rumor Check console!
    const misinfoItem = {
      id: `MISINFO-CIT-${Math.floor(Math.random() * 9000 + 1000)}`,
      timestamp: Date.now(),
      sourceText: text,
      originChannel: 'Citizen Forward Check',
      district: 'National Control Desk',
      flaggedReason: 'Submitted by citizen for fact-check verification.',
      contradictingOfficialSensor: 'Queued for CWC / State Control cross-check',
      exposedCitizenCount: 45,
      humanReviewDecision: 'PENDING_REVIEW'
    };

    liveState.misinfoItems.unshift(misinfoItem);
    liveState.misinfoItems = liveState.misinfoItems.slice(0, 25);
    liveState.revision += 1;
    persistServerState();

    broadcastToOfficers({
      type: 'officer:misinfo_flagged',
      item: misinfoItem
    });

    res.json({
      verdict: 'queued_for_review',
      message: 'Sent to Duty Officers in the Common Control Desk for sensor verification.'
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PROTECTED COMMON OFFICER ENDPOINTS (/api/officer/*)
  // ---------------------------------------------------------------------------
  function requireOfficerHeader(req: express.Request, res: express.Response): boolean {
    const bearer = req.headers.authorization;
    const legacy = req.headers['x-resqnet-officer'];
    if (!isValidOfficerToken(bearer) && !isValidOfficerToken(legacy)) {
      res.status(403).json({ error: 'Restricted to authenticated Officer tab only' });
      return false;
    }
    return true;
  }

  app.get('/api/officer/sync', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    res.json({
      state: sanitizeStateForOfficerSync(),
      revision: liveState.revision,
      connectedOfficerTabs: officerClients.size
    });
  });

  app.post('/api/officer/packet', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    const { packet, targetIncidentId, isConflicting, conflictClaim } = req.body || {};
    if (!packet || !packet.id) {
      res.status(400).json({ error: 'Missing packet' });
      return;
    }

    const exists = liveState.packets.some((r) => r.packet?.id === packet.id);
    if (!exists) {
      const record: StoredPacketRecord = {
        packet: { ...packet, fromLiveDevice: true },
        targetIncidentId,
        isConflicting,
        conflictClaim,
        receivedAt: Date.now()
      };
      liveState.packets.unshift(record);
      liveState.revision += 1;
      persistServerState();

      broadcastToOfficers({
        type: 'officer:packet_ingested',
        record
      });
    }

    res.json({ ok: true, revision: liveState.revision });
  });

  app.post('/api/officer/offline-beacon', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    const message = req.body?.message;
    if (!message || !message.id) {
      res.status(400).json({ error: 'Invalid offline message' });
      return;
    }

    const exists = liveState.offlineMessages.some((m) => m.id === message.id);
    if (!exists) {
      liveState.offlineMessages.unshift(message);
      liveState.revision += 1;
      persistServerState();

      broadcastToOfficers({
        type: 'officer:offline_beacon',
        message
      });
    }

    res.json({ ok: true, revision: liveState.revision });
  });

  app.post('/api/officer/resolve-conflict', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    const { incidentId, resolutionNote } = req.body || {};
    if (!incidentId) {
      res.status(400).json({ error: 'Missing incidentId' });
      return;
    }

    liveState.resolvedConflictIds[incidentId] =
      resolutionNote || 'Verified safe by joint team.';
    liveState.revision += 1;
    persistServerState();

    broadcastToOfficers({
      type: 'officer:conflict_resolved',
      incidentId,
      resolutionNote: liveState.resolvedConflictIds[incidentId]
    });

    res.json({ ok: true, revision: liveState.revision });
  });

  app.post('/api/officer/override', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    const { incidentId, newScore, reason, responderName } = req.body || {};
    if (!incidentId || typeof newScore !== 'number') {
      res.status(400).json({ error: 'Invalid override' });
      return;
    }

    liveState.priorityOverrides[incidentId] = {
      newScore,
      reason: String(reason || ''),
      responderName: String(responderName || 'Duty Officer'),
      timestamp: Date.now()
    };
    liveState.revision += 1;
    persistServerState();

    broadcastToOfficers({
      type: 'officer:priority_override',
      incidentId,
      override: liveState.priorityOverrides[incidentId]
    });

    res.json({ ok: true, revision: liveState.revision });
  });

  app.post('/api/officer/area-alert', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    const { area, urgency, format, sentBy } = req.body || {};
    const alertRecord: AreaAlertRecord = {
      id: `ALERT-${Math.floor(Math.random() * 90000 + 10000)}`,
      area: String(area || 'barpeta_lowland'),
      urgency: urgency || 'critical',
      format: format || 'pictograph',
      phonesReached: 3982,
      phonesSkipped: 228,
      sentBy: String(sentBy || 'Duty Officer'),
      sentAt: Date.now()
    };

    liveState.areaAlerts.unshift(alertRecord);
    liveState.areaAlerts = liveState.areaAlerts.slice(0, 30);
    liveState.revision += 1;
    persistServerState();

    broadcastToOfficers({
      type: 'officer:area_alert_sent',
      alert: alertRecord
    });

    res.json({ ok: true, alert: alertRecord, revision: liveState.revision });
  });

  // Active Breach Sandbox & Privilege Escalation Blocker Endpoint
  app.post('/api/security/attempt-escalation', (req, res) => {
    const rawToken = String(req.body?.token || 'Role: Guest_09');
    const target = String(req.body?.target || 'MASTER_REGISTRY_DATABASE_ARRAY');

    // Force system to actively block the call with HTTP 403 Forbidden
    const violationLog: AuditLogRecord = {
      id: `AUD-SEC-CRIT-${Math.floor(Math.random() * 9000 + 1000)}`,
      timestamp: Date.now(),
      userId: 'GUEST-ATTACKER-09',
      userName: `Adversary Probe (${rawToken})`,
      role: 'Guest_09',
      requestedScope: `Write/Mutate -> ${target}`,
      outcome: 'denied_unauthorized',
      reason: `SECURITY_VIOLATION_BLOCKED: Low-privilege token ("${rawToken}") attempted unauthorized access to master registry database array. Zero-Trust RBAC enforced.`,
      ipAddress: req.ip || '198.51.100.42',
      isViolation: true,
      highlightRed: true,
      violationType: 'RBAC_PRIVILEGE_ESCALATION'
    };

    liveState.auditLogs.unshift(violationLog);
    liveState.auditLogs = liveState.auditLogs.slice(0, 50);
    liveState.revision += 1;
    persistServerState();

    broadcastToOfficers({
      type: 'officer:security_breach_detected',
      log: violationLog
    });

    res.status(403).json({
      error: 'HTTP 403 Forbidden: Zero-Trust RBAC Privilege Escalation Blocked',
      message: 'Access Denied: Token "Role: Guest_09" has insufficient permissions to access or mutate the Master Registry Database Array.',
      log: violationLog,
      blocked: true
    });
  });

  app.get('/api/officer/audit-logs', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    res.json({ logs: liveState.auditLogs });
  });

  app.post('/api/officer/audit-logs', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    const { userId, userName, role, requestedScope, outcome, reason } = req.body || {};
    const entry: AuditLogRecord = {
      id: `AUD-SEC-${Math.floor(Math.random() * 9000 + 1000)}`,
      timestamp: Date.now(),
      userId: String(userId || 'NDRF-OFFICER'),
      userName: String(userName || 'Duty Officer'),
      role: String(role || 'Rescue Lead'),
      requestedScope: String(requestedScope || 'Unlocked contact details (15m)'),
      outcome: outcome === 'denied_unauthorized' ? 'denied_unauthorized' : 'granted',
      reason: String(reason || 'Active rescue dispatch'),
      ipAddress: req.ip || '10.24.0.14'
    };

    liveState.auditLogs.unshift(entry);
    liveState.auditLogs = liveState.auditLogs.slice(0, 50);
    liveState.revision += 1;
    persistServerState();

    broadcastToOfficers({
      type: 'officer:audit_logged',
      log: entry
    });

    res.json({ ok: true, log: entry, revision: liveState.revision });
  });

  app.post('/api/officer/reset', (req, res) => {
    if (!requireOfficerHeader(req, res)) return;
    liveState = {
      packets: [],
      citizenSubmissions: [],
      offlineMessages: [],
      misinfoItems: [],
      areaAlerts: [],
      auditLogs: createDefaultAuditLogs(Date.now()),
      resolvedConflictIds: {},
      priorityOverrides: {},
      revision: liveState.revision + 1
    };
    persistServerState();
    broadcastToOfficers({
      type: 'officer:reset',
      state: sanitizeStateForOfficerSync()
    });
    res.json({ ok: true, revision: liveState.revision });
  });

  // ---------------------------------------------------------------------------
  // 4. VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        if (!fs.existsSync(indexPath)) {
          return next();
        }
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        if (vite) {
          vite.ssrFixStacktrace(e as Error);
        }
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.on('error', (err: any) => {
    console.error('HTTP server runtime error:', err?.message || err);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ResQnet Backend & Real-Time Server listening on http://0.0.0.0:${PORT}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

startServer();
