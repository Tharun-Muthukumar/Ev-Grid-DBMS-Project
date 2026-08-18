const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASS || "9229";
const DB_NAME = process.env.DB_NAME || "evgrid";
const PORT = Number(process.env.PORT || 4000);
const AUTH_SECRET = process.env.AUTH_SECRET || "evgrid-dev-secret-change-me";
const ALLOW_WRITE_SQL = process.env.ALLOW_WRITE_SQL === "true";

const STATION_STATUSES = ["online", "offline", "maintenance", "inactive"];
const PORT_STATUSES = ["available", "reserved", "occupied", "maintenance", "offline", "out_of_service"];
const ALL_PERMISSIONS = [
  "admins.view", "admins.create", "admins.edit", "admins.delete",
  "stations.view", "stations.create", "stations.edit", "stations.delete", "stations.assign",
  "chargers.view", "chargers.create", "chargers.edit", "chargers.delete", "chargers.status",
  "reservations.view", "reservations.manage",
  "sessions.view", "sessions.manage",
  "users.view", "users.manage",
  "billing.view", "reports.view",
  "database.view", "database.query",
];
const STATION_ADMIN_PERMISSIONS = [
  "stations.view", "stations.edit",
  "chargers.view", "chargers.create", "chargers.edit", "chargers.status",
  "reservations.view", "reservations.manage",
  "sessions.view", "sessions.manage",
  "billing.view", "reports.view",
];

let pool;

function quoteIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error("DB_NAME may only contain letters, numbers, and underscores");
  }
  return `\`${value}\``;
}

function makeId(prefix) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
}

function toMysqlDatetime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function displayTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function parsePermissions(value, role = "custom") {
  if (role === "super_admin") return ALL_PERMISSIONS;
  if (!value && role === "station_admin") return STATION_ADMIN_PERMISSIONS;
  if (!value) return [];
  return String(value).split(",").map((p) => p.trim()).filter(Boolean);
}

function serializePermissions(list) {
  return [...new Set(list)].filter((p) => ALL_PERMISSIONS.includes(p)).join(",");
}

function stripPassword(row) {
  if (!row) return row;
  const copy = { ...row };
  delete copy.password;
  return copy;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const text = String(stored);
  if (!text.startsWith("pbkdf2$")) return text === String(password);
  const [, salt, expected] = text.split("$");
  if (!salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `evg.${encoded}.${sig}`;
}

function parseToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "evg") return null;
  const [, encoded, sig] = parts;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (_error) {
    return null;
  }
  if (payload.exp && payload.exp < Date.now()) return null;
  return payload;
}

function issueToken(kind, row) {
  return signPayload({ kind, sub: row.id, exp: Date.now() + 1000 * 60 * 60 * 10 });
}

async function loadAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = parseToken(token);
  if (!payload) return null;

  if (payload.kind === "admin") {
    const [[admin]] = await pool.query("SELECT * FROM admins WHERE id = ? AND status = 'active'", [payload.sub]);
    if (!admin) return null;
    const [access] = await pool.query("SELECT stationId FROM admin_station_access WHERE adminId = ?", [admin.id]);
    return {
      kind: "admin",
      id: admin.id,
      name: admin.name,
      role: admin.role,
      permissions: parsePermissions(admin.permissions, admin.role),
      stationIds: access.map((row) => row.stationId),
    };
  }

  if (payload.kind === "user") {
    const [[user]] = await pool.query("SELECT * FROM users WHERE id = ? AND status = 'active'", [payload.sub]);
    if (!user) return null;
    return { kind: "user", id: user.id, role: "user", permissions: [] };
  }

  return null;
}

function requireAuth(handler) {
  return async (req, res) => {
    try {
      const auth = await loadAuth(req);
      if (!auth) return res.status(401).json({ error: "Authentication required" });
      req.auth = auth;
      return handler(req, res);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };
}

function hasPermission(auth, permission) {
  return auth?.kind === "admin" && auth.permissions.includes(permission);
}

function requirePermission(permission, handler) {
  return requireAuth(async (req, res) => {
    if (!hasPermission(req.auth, permission)) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    return handler(req, res);
  });
}

async function ensureColumn(table, column, definition) {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [DB_NAME, table, column]
  );
  if (row.cnt === 0) {
    await pool.query(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`);
  }
}

async function nextNumericId(table, prefix, digits = 3) {
  const [[row]] = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(id, ?) AS UNSIGNED)) AS mx FROM ${quoteIdentifier(table)} WHERE id LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  return `${prefix}${String((row.mx || 0) + 1).padStart(digits, "0")}`;
}

async function initSchema() {
  const server = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
  });
  try {
    await server.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await server.end();
  }

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id VARCHAR(10) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'station_admin',
      permissions TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(10) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      phone VARCHAR(30),
      password VARCHAR(255) NOT NULL,
      vehicles INT NOT NULL DEFAULT 0,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      location VARCHAR(200) NOT NULL,
      lat DOUBLE NOT NULL,
      lng DOUBLE NOT NULL,
      adminId VARCHAR(10),
      status VARCHAR(20) NOT NULL DEFAULT 'online',
      revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (adminId) REFERENCES admins(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ports (
      id VARCHAR(30) PRIMARY KEY,
      stationId VARCHAR(20) NOT NULL,
      slotNo INT NOT NULL DEFAULT 1,
      type VARCHAR(30) NOT NULL,
      kw INT NOT NULL,
      price DECIMAL(8,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (stationId) REFERENCES stations(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(20) PRIMARY KEY,
      userId VARCHAR(10) NOT NULL,
      portId VARCHAR(30) NOT NULL,
      stationId VARCHAR(20) NOT NULL,
      startTime VARCHAR(20),
      endTime VARCHAR(20) DEFAULT '-',
      startAt DATETIME NULL,
      endAt DATETIME NULL,
      energy DECIMAL(10,2) NOT NULL DEFAULT 0,
      cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      power INT NOT NULL DEFAULT 22,
      duration VARCHAR(30) DEFAULT 'Active',
      revenuePosted TINYINT(1) NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (portId) REFERENCES ports(id) ON DELETE CASCADE,
      FOREIGN KEY (stationId) REFERENCES stations(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id VARCHAR(20) PRIMARY KEY,
      userId VARCHAR(10) NOT NULL,
      portId VARCHAR(30) NOT NULL,
      stationId VARCHAR(20) NOT NULL,
      datetime VARCHAR(50),
      startAt DATETIME NULL,
      endAt DATETIME NULL,
      durationMinutes INT NOT NULL DEFAULT 60,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (portId) REFERENCES ports(id) ON DELETE CASCADE,
      FOREIGN KEY (stationId) REFERENCES stations(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id VARCHAR(10) PRIMARY KEY,
      userId VARCHAR(10) NOT NULL,
      make VARCHAR(50),
      model VARCHAR(50),
      year INT,
      batteryKwh DECIMAL(8,2),
      connectorType VARCHAR(30) DEFAULT 'CCS2',
      isDefault TINYINT(1) NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_station_access (
      id INT AUTO_INCREMENT PRIMARY KEY,
      adminId VARCHAR(10) NOT NULL,
      stationId VARCHAR(20) NOT NULL,
      permissionLevel VARCHAR(30) NOT NULL DEFAULT 'manager',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_admin_station (adminId, stationId),
      FOREIGN KEY (adminId) REFERENCES admins(id) ON DELETE CASCADE,
      FOREIGN KEY (stationId) REFERENCES stations(id) ON DELETE CASCADE
    )
  `);

  await pool.query("ALTER TABLE admins MODIFY password VARCHAR(255) NOT NULL");
  await pool.query("ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL");
  await ensureColumn("admins", "permissions", "TEXT");
  await ensureColumn("admins", "status", "VARCHAR(20) NOT NULL DEFAULT 'active'");
  await ensureColumn("admins", "createdAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("users", "createdAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("ports", "slotNo", "INT NOT NULL DEFAULT 1");
  await ensureColumn("ports", "updatedAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  await pool.query("ALTER TABLE ports MODIFY slotNo INT NOT NULL DEFAULT 1").catch(() => {});
  await ensureColumn("sessions", "startAt", "DATETIME NULL");
  await ensureColumn("sessions", "endAt", "DATETIME NULL");
  await ensureColumn("sessions", "revenuePosted", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("reservations", "startAt", "DATETIME NULL");
  await ensureColumn("reservations", "endAt", "DATETIME NULL");
  await ensureColumn("reservations", "durationMinutes", "INT NOT NULL DEFAULT 60");
  await ensureColumn("reservations", "createdAt", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("vehicles", "connectorType", "VARCHAR(30) DEFAULT 'CCS2'");
  await ensureColumn("vehicles", "isDefault", "TINYINT(1) NOT NULL DEFAULT 0");

  await seedData();
  await pool.query("UPDATE ports SET status = 'occupied' WHERE status = 'busy'");
  await pool.query("UPDATE ports SET status = 'out_of_service' WHERE status IN ('broken','not_working','not working','unavailable')");
}

async function seedData() {
  await pool.query(
    `INSERT INTO admins (id,name,email,password,role,permissions,status)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password=VALUES(password), role=VALUES(role), permissions=VALUES(permissions), status=VALUES(status)`,
    ["A001", "Admin", "admin", hashPassword("admin123"), "super_admin", serializePermissions(ALL_PERMISSIONS), "active"]
  );

  await pool.query(
    `INSERT INTO users (id,name,email,phone,password,vehicles,role,status)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password=VALUES(password), role=VALUES(role), status=VALUES(status)`,
    ["U001", "User", "user", "90000 00000", hashPassword("user123"), 1, "user", "active"]
  );

  await pool.query(`INSERT INTO admins (id,name,email,password,role,permissions,status) VALUES
    ('A002','Station Manager','manager@evgrid.local',?,'station_admin',?,'active'),
    ('A003','Operations Admin','ops@evgrid.local',?,'station_admin',?,'active')
    ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password=VALUES(password), role=VALUES(role), permissions=VALUES(permissions), status=VALUES(status)`,
    [hashPassword("admin123"), serializePermissions(STATION_ADMIN_PERMISSIONS), hashPassword("admin123"), serializePermissions(STATION_ADMIN_PERMISSIONS)]
  );

  await pool.query(`
    INSERT INTO admin_station_access (adminId,stationId,permissionLevel)
    SELECT 'A002', id, 'manager' FROM stations WHERE id IN ('ST002','ST005')
    ON DUPLICATE KEY UPDATE permissionLevel=VALUES(permissionLevel)
  `);
  await pool.query(`
    INSERT INTO admin_station_access (adminId,stationId,permissionLevel)
    SELECT 'A003', id, 'manager' FROM stations WHERE id IN ('ST004')
    ON DUPLICATE KEY UPDATE permissionLevel=VALUES(permissionLevel)
  `);

  const [[{ stations }]] = await pool.query("SELECT COUNT(*) AS stations FROM stations");
  if (stations > 0) return;

  await pool.query(`INSERT INTO admins (id,name,email,password,role,permissions,status) VALUES
    ('A002','Station Manager','manager@evgrid.local',?,'station_admin',?,'active'),
    ('A003','Operations Admin','ops@evgrid.local',?,'station_admin',?,'active')
    ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password=VALUES(password), role=VALUES(role), permissions=VALUES(permissions), status=VALUES(status)`,
    [hashPassword("admin123"), serializePermissions(STATION_ADMIN_PERMISSIONS), hashPassword("admin123"), serializePermissions(STATION_ADMIN_PERMISSIONS)]
  );

  await pool.query(`INSERT INTO users (id,name,email,phone,password,vehicles,role,status) VALUES
    ('U002','Divya Sharma','divya@evgrid.local','90000 67890',?,1,'user','active'),
    ('U003','Kiran Patel','kiran@evgrid.local','91234 56789',?,1,'user','active'),
    ('U004','Shreya Iyer','shreya@evgrid.local','99876 54321',?,2,'user','active')
    ON DUPLICATE KEY UPDATE password=VALUES(password), status=VALUES(status)`,
    [hashPassword("user123"), hashPassword("user123"), hashPassword("user123")]
  );

  await pool.query(`INSERT INTO stations (id,name,location,lat,lng,adminId,status,revenue) VALUES
    ('ST001','EVGRID Central Hub','Anna Nagar, Chennai',13.0827,80.2707,'A001','online',3200),
    ('ST002','OMR Tech Corridor','OMR, Sholinganallur',12.9010,80.2279,'A002','online',4100),
    ('ST003','T.Nagar Mall Point','T.Nagar, Chennai',13.0418,80.2341,'A001','online',1800),
    ('ST004','Velachery Metro Hub','Velachery, Chennai',12.9815,80.2180,'A003','online',2050),
    ('ST005','Tambaram EV Plaza','Tambaram, Chennai',12.9249,80.1000,'A002','maintenance',750)
  `);

  await pool.query(`INSERT INTO ports (id,stationId,type,kw,price,status) VALUES
    ('P001','ST001','CCS2',150,18,'occupied'),
    ('P002','ST001','Type 2',22,12,'available'),
    ('P003','ST001','CCS2',150,18,'reserved'),
    ('P004','ST001','CHAdeMO',50,15,'available'),
    ('P005','ST002','CCS2',150,18,'available'),
    ('P006','ST002','CCS2',150,18,'occupied'),
    ('P007','ST002','Type 2',22,12,'available'),
    ('P008','ST002','Type 2',22,12,'offline'),
    ('P009','ST003','CCS2',150,18,'available'),
    ('P010','ST003','Type 2',22,12,'reserved'),
    ('P011','ST004','CCS2',150,18,'occupied'),
    ('P012','ST004','Type 2',22,12,'available'),
    ('P013','ST005','CCS2',150,18,'maintenance'),
    ('P014','ST005','Type 2',22,12,'available')
  `);

  await pool.query(`INSERT INTO admin_station_access (adminId,stationId,permissionLevel) VALUES
    ('A002','ST002','manager'),
    ('A002','ST005','manager'),
    ('A003','ST004','manager')
    ON DUPLICATE KEY UPDATE permissionLevel=VALUES(permissionLevel)
  `);

  await pool.query(`INSERT INTO sessions (id,userId,portId,stationId,startTime,endTime,startAt,endAt,energy,cost,status,power,duration,revenuePosted) VALUES
    ('SES-7821','U001','P002','ST001','09:14','10:42',NULL,NULL,24.6,443,'completed',22,'1h 28m',1),
    ('SES-7822','U002','P006','ST002','10:02','-',NULL,NULL,18.2,327,'active',150,'Active',0),
    ('SES-7823','U004','P011','ST004','10:30','-',NULL,NULL,9.4,169,'active',150,'Active',0)
  `);

  await pool.query(`INSERT INTO reservations (id,userId,portId,stationId,datetime,status) VALUES
    ('RES-4401','U001','P003','ST001','Today 14:00','pending'),
    ('RES-4402','U002','P010','ST003','Today 16:30','pending')
  `);

  await pool.query(`INSERT INTO vehicles (id,userId,make,model,year,batteryKwh,connectorType,isDefault) VALUES
    ('VH001','U001','Tata','Nexon EV',2023,40,'CCS2',1),
    ('VH002','U002','Hyundai','Ioniq 5',2023,72,'CCS2',1),
    ('VH003','U004','BYD','Atto 3',2023,60,'CCS2',1)
  `);
}

function normalizeAdmin(row, token) {
  return {
    ...stripPassword(row),
    role: "admin",
    adminRole: row.role,
    permissions: parsePermissions(row.permissions, row.role),
    token,
  };
}

function normalizeUser(row, token) {
  return { ...stripPassword(row), role: "user", token };
}

async function visibleStationIds(auth) {
  if (!auth || auth.kind !== "admin") return [];
  if (auth.role === "super_admin" || hasPermission(auth, "stations.assign")) return null;
  return auth.stationIds;
}

async function visibleStationClause(auth, alias = "stationId") {
  const ids = await visibleStationIds(auth);
  if (ids === null) return { sql: "", params: [] };
  if (!ids.length) return { sql: " AND 1 = 0", params: [] };
  return { sql: ` AND ${alias} IN (${ids.map(() => "?").join(",")})`, params: ids };
}

function canAccessStation(auth, stationId) {
  if (!auth || auth.kind !== "admin") return false;
  if (auth.role === "super_admin" || hasPermission(auth, "stations.assign")) return true;
  return auth.stationIds.includes(stationId);
}

function normalizeLocationQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(t\s*\.?\s*nagar|tnagar|tngar)\b/gi, "T Nagar")
    .replace(/\bpondy\b/gi, "Puducherry")
    .replace(/\bvit chennai\b/gi, "Vellore Institute of Technology Chennai");
}

function locationSearchVariants(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeLocationQuery(raw);
  const lower = normalized.toLowerCase();
  const variants = [raw, normalized, `${normalized}, India`];

  if (/\bt nagar\b/i.test(normalized)) {
    variants.push(
      normalized.replace(/\bt nagar\b/gi, "Thiyagaraya Nagar"),
      `${normalized}, Chennai, Tamil Nadu, India`,
      "T Nagar, Chennai, Tamil Nadu, India",
      "Thiyagaraya Nagar, Chennai, Tamil Nadu, India"
    );
  }
  if (/vellore institute|vit/i.test(lower) && /chennai/i.test(lower)) {
    variants.push(
      "Vellore Institute of Technology - Chennai, Vandalur Kelambakkam Road, Chennai, Tamil Nadu, India",
      "VIT Chennai, Kelambakkam, Chennai, Tamil Nadu, India"
    );
  }
  if (/ilango|puducherry|pondicherry/i.test(lower)) {
    variants.push(`${normalized}, Puducherry, India`, "Ilango Nagar, Puducherry, India");
  }
  if (!/(chennai|puducherry|pondicherry|india|tamil nadu)/i.test(normalized)) {
    variants.push(`${normalized}, Chennai, Tamil Nadu, India`, `${normalized}, Tamil Nadu, India`);
  }

  return [...new Set(variants.map((v) => v.trim()).filter(Boolean))];
}

function geocodeTokens(value) {
  return normalizeLocationQuery(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["india", "tamil", "nadu", "the"].includes(token));
}

function scoreGeocodeResult(result, query) {
  const haystack = `${result.name || ""} ${result.display_name || ""}`.toLowerCase();
  const normalized = normalizeLocationQuery(query).toLowerCase();
  let score = geocodeTokens(query).reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
  if (/\bt nagar\b/.test(normalized)) {
    if (/(t\.?\s*nagar|thiyagaraya|chennai|600017)/i.test(haystack)) score += 8;
    else score -= 8;
  }
  if (/chennai/.test(normalized)) {
    if (/chennai|chengalpattu|tamil nadu/i.test(haystack)) score += 4;
    else score -= 5;
  }
  if (/puducherry|pondicherry|ilango/.test(normalized)) {
    if (/puducherry|pondicherry|oulgaret|ozhukarai/i.test(haystack)) score += 6;
    else score -= 5;
  }
  if (/vellore institute|vit/.test(normalized) && /chennai/.test(normalized)) {
    if (/vellore institute|vit|kelambakkam|chennai/i.test(haystack)) score += 10;
    else score -= 8;
  }
  return score;
}

function addLocalGeocodeFallbacks(query, results) {
  const text = normalizeLocationQuery(query).toLowerCase();
  if (/vellore institute|vit/.test(text) && /chennai/.test(text)) {
    results.push({
      place_id: "local-vit-chennai",
      name: "Vellore Institute of Technology - Chennai",
      display_name: "Vellore Institute of Technology - Chennai, Kelambakkam, Chennai, Tamil Nadu, India",
      lat: 12.842946,
      lon: 80.15541,
      provider: "local",
    });
  }
  if (/\bt nagar\b/.test(text)) {
    results.push({
      place_id: "local-t-nagar",
      name: "T Nagar",
      display_name: "T Nagar, Chennai, Tamil Nadu, India",
      lat: 13.037829,
      lon: 80.231836,
      provider: "local",
    });
  }
  if (/ilango|puducherry|pondicherry/.test(text)) {
    results.push({
      place_id: "local-ilango-nagar",
      name: "Ilango Nagar",
      display_name: "Ilango Nagar, Puducherry, India",
      lat: 11.937529,
      lon: 79.819366,
      provider: "local",
    });
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "EVGRID charging station discovery local development",
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapNominatimResult(item, provider = "nominatim") {
  return {
    place_id: `${provider}-${item.place_id || item.osm_id || `${item.lat},${item.lon}`}`,
    name: item.name || item.address?.amenity || item.address?.suburb || item.display_name?.split(",")[0] || "Location",
    display_name: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    provider,
  };
}

function mapPhotonResult(feature) {
  const p = feature.properties || {};
  const parts = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.locality, p.district, p.city, p.state, p.postcode, p.country]
    .filter(Boolean)
    .filter((part, idx, arr) => arr.indexOf(part) === idx);
  const [lon, lat] = feature.geometry?.coordinates || [];
  return {
    place_id: `photon-${p.osm_type || "x"}-${p.osm_id || `${lat},${lon}`}`,
    name: p.name || p.street || p.city || "Location",
    display_name: parts.join(", "),
    lat: Number(lat),
    lon: Number(lon),
    provider: "photon",
  };
}

function dedupeGeocodeResults(results, query) {
  const seen = new Set();
  return results
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.display_name)
    .map((item, index) => ({ ...item, score: scoreGeocodeResult(item, query), order: index }))
    .sort((a, b) => (b.score - a.score) || ((a.provider === "local" ? 1 : 0) - (b.provider === "local" ? 1 : 0)) || (a.order - b.order))
    .filter((item) => {
      const key = `${item.name.toLowerCase()}|${item.lat.toFixed(4)}|${item.lon.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

async function searchIndiaLocations(query) {
  const results = [];
  for (const variant of locationSearchVariants(query)) {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&dedupe=1&accept-language=en&countrycodes=in&q=${encodeURIComponent(variant)}`;
    const nominatim = await fetchJson(nominatimUrl);
    if (Array.isArray(nominatim)) results.push(...nominatim.map((item) => mapNominatimResult(item)));
    if (dedupeGeocodeResults(results, query).length >= 5) break;
  }

  for (const variant of locationSearchVariants(query).slice(0, 5)) {
    const photonUrl = `https://photon.komoot.io/api/?limit=8&lang=en&q=${encodeURIComponent(variant)}`;
    const photon = await fetchJson(photonUrl);
    const features = Array.isArray(photon?.features) ? photon.features : [];
    results.push(...features.filter((f) => f.properties?.countrycode === "IN").map(mapPhotonResult));
    if (dedupeGeocodeResults(results, query).length >= 6) break;
  }

  addLocalGeocodeFallbacks(query, results);
  return dedupeGeocodeResults(results, query);
}

async function dbSnapshot(auth) {
  const [publicStations] = await pool.query("SELECT * FROM stations ORDER BY id");
  const [publicPorts] = await pool.query("SELECT * FROM ports ORDER BY stationId, id");
  const stationMapper = (s) => ({ ...s, revenue: Number(s.revenue) });
  const portMapper = (p) => ({ ...p, kw: Number(p.kw), price: Number(p.price) });
  const sessionMapper = (s) => ({ ...s, energy: Number(s.energy), cost: Number(s.cost), power: Number(s.power) });

  if (!auth) {
    return { users: [], admins: [], stations: publicStations.map(stationMapper), ports: publicPorts.map(portMapper), sessions: [], reservations: [], vehicles: [] };
  }

  if (auth.kind === "user") {
    const [sessions] = await pool.query("SELECT * FROM sessions WHERE userId = ? ORDER BY id DESC", [auth.id]);
    const [reservations] = await pool.query("SELECT * FROM reservations WHERE userId = ? ORDER BY id DESC", [auth.id]);
    const [vehicles] = await pool.query("SELECT * FROM vehicles WHERE userId = ? ORDER BY isDefault DESC, id", [auth.id]);
    const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [auth.id]);
    return {
      users: [stripPassword(user)],
      admins: [],
      stations: publicStations.map(stationMapper),
      ports: publicPorts.map(portMapper),
      sessions: sessions.map(sessionMapper),
      reservations,
      vehicles: vehicles.map((v) => ({ ...v, batteryKwh: Number(v.batteryKwh), isDefault: Boolean(v.isDefault) })),
    };
  }

  const ids = await visibleStationIds(auth);
  const filter = ids === null ? "" : ids.length ? ` WHERE id IN (${ids.map(() => "?").join(",")})` : " WHERE 1 = 0";
  const params = ids === null ? [] : ids;
  const [stations] = await pool.query(`SELECT * FROM stations${filter} ORDER BY id`, params);
  const stationIds = stations.map((s) => s.id);
  const byStation = stationIds.length ? ` WHERE stationId IN (${stationIds.map(() => "?").join(",")})` : " WHERE 1 = 0";
  const [ports] = await pool.query(`SELECT * FROM ports${byStation} ORDER BY stationId,id`, stationIds);
  const [sessions] = await pool.query(`SELECT * FROM sessions${byStation} ORDER BY id DESC`, stationIds);
  const [reservations] = await pool.query(`SELECT * FROM reservations${byStation} ORDER BY id DESC`, stationIds);
  const [users] = hasPermission(auth, "users.view") ? await pool.query("SELECT * FROM users ORDER BY id") : [[]];
  const [vehicles] = hasPermission(auth, "users.view") ? await pool.query("SELECT * FROM vehicles ORDER BY userId,id") : [[]];
  const [admins] = hasPermission(auth, "admins.view") ? await pool.query("SELECT id,name,email,role,permissions,status,createdAt FROM admins ORDER BY id") : [[]];

  return {
    users: users.map(stripPassword),
    admins: admins.map((a) => ({ ...a, permissions: parsePermissions(a.permissions, a.role) })),
    stations: stations.map(stationMapper),
    ports: ports.map(portMapper),
    sessions: sessions.map(sessionMapper),
    reservations,
    vehicles: vehicles.map((v) => ({ ...v, batteryKwh: Number(v.batteryKwh), isDefault: Boolean(v.isDefault) })),
  };
}

app.get("/api/health", async (_req, res) => {
  const [[row]] = await pool.query("SELECT 1 AS ok");
  res.json({ ok: row.ok === 1, database: DB_NAME });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { role, email, password } = req.body;
    if (!role || !email || !password) return res.status(400).json({ error: "Role, username/email, and password are required" });
    const table = role === "admin" ? "admins" : "users";
    const [[row]] = await pool.query(`SELECT * FROM ${table} WHERE email = ? OR id = ? LIMIT 1`, [email, email]);
    if (!row || row.status !== "active" || !verifyPassword(password, row.password)) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }
    const token = issueToken(role === "admin" ? "admin" : "user", row);
    res.json({ token, user: role === "admin" ? normalizeAdmin(row, token) : normalizeUser(row, token) });
  } catch (_error) {
    res.status(500).json({ error: "Unable to sign in" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone = "", password, confirmPassword, vehicle = {} } = req.body;
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: "Name is required" });
    if (!email || String(email).trim().length < 3) return res.status(400).json({ error: "Username or email is required" });
    if (!password || String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (confirmPassword !== undefined && password !== confirmPassword) return res.status(400).json({ error: "Passwords do not match" });
    const [[dupe]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (dupe) return res.status(409).json({ error: "Account already exists" });
    const id = await nextNumericId("users", "U", 3);
    await pool.query(
      "INSERT INTO users (id,name,email,phone,password,vehicles,role,status) VALUES (?,?,?,?,?,0,'user','active')",
      [id, name.trim(), email.trim(), phone.trim(), hashPassword(password)]
    );
    if (vehicle.make || vehicle.model) {
      const vehicleId = await nextNumericId("vehicles", "VH", 3);
      await pool.query(
        "INSERT INTO vehicles (id,userId,make,model,year,batteryKwh,connectorType,isDefault) VALUES (?,?,?,?,?,?,?,1)",
        [vehicleId, id, vehicle.make || "", vehicle.model || "", Number(vehicle.year) || null, Number(vehicle.batteryKwh) || null, vehicle.connectorType || "CCS2"]
      );
      await pool.query("UPDATE users SET vehicles = 1 WHERE id = ?", [id]);
    }
    const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    const token = issueToken("user", user);
    res.status(201).json({ token, user: normalizeUser(user, token) });
  } catch (error) {
    const code = error.code === "ER_DUP_ENTRY" ? 409 : 500;
    res.status(code).json({ error: code === 409 ? "Account already exists" : error.message });
  }
});

app.get("/api/db", async (req, res) => {
  try {
    req.auth = await loadAuth(req);
    res.json(await dbSnapshot(req.auth));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/geocode/search", requireAuth(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Search text is required" });
  const results = await searchIndiaLocations(q);
  res.json(results);
}));

app.get("/api/geocode/reverse", requireAuth(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "Valid latitude and longitude are required" });
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=en&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const data = await fetchJson(url);
  res.json({ display_name: data?.display_name || "" });
}));

app.post("/api/query", requirePermission("database.query", async (req, res) => {
  const rawSql = String(req.body.sql || "").trim();
  if (!rawSql) return res.status(400).json({ error: "No query provided" });
  const first = rawSql.split(/\s+/)[0].toUpperCase();
  const readOnly = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"].includes(first);
  if (!readOnly && !ALLOW_WRITE_SQL) {
    return res.status(403).json({ error: "Write SQL is disabled. Set ALLOW_WRITE_SQL=true to enable it for development." });
  }
  if (/password/i.test(rawSql)) return res.status(403).json({ error: "Password fields cannot be queried from the console" });
  try {
    const [rows, fields] = await pool.query(rawSql);
    if (Array.isArray(rows)) return res.json({ type: "select", rows, fields: fields?.map((f) => f.name) || [] });
    res.json({ type: "mutation", affectedRows: rows.affectedRows, insertId: rows.insertId, info: rows.info });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

app.get("/api/stations", requireAuth(async (req, res) => {
  const data = await dbSnapshot(req.auth);
  res.json(data.stations);
}));

app.post("/api/stations", requirePermission("stations.create", async (req, res) => {
  const { name, location, lat, lng, ports: numPorts = 4, chargerType = "CCS2", adminId = req.auth.id } = req.body;
  if (!name || !location || lat === undefined || lng === undefined) return res.status(400).json({ error: "Station name, location, latitude, and longitude are required" });
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: "Coordinates must be valid numbers" });
  const totalPorts = Math.max(1, Math.min(20, Number(numPorts) || 4));
  const id = await nextNumericId("stations", "ST", 3);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "INSERT INTO stations (id,name,location,lat,lng,adminId,status,revenue) VALUES (?,?,?,?,?,?, 'online', 0)",
      [id, name.trim(), location.trim(), latitude, longitude, adminId]
    );
    const portRows = [];
    for (let i = 1; i <= totalPorts; i += 1) {
      const pid = `${id}-P${i}`;
      const kw = chargerType === "Type 2" ? 22 : chargerType === "CHAdeMO" ? 50 : 150;
      const price = kw >= 100 ? 18 : kw >= 50 ? 15 : 12;
      await conn.query("INSERT INTO ports (id,stationId,slotNo,type,kw,price,status) VALUES (?,?,?,?,?,?,'available')", [pid, id, i, chargerType, kw, price]);
      portRows.push({ id: pid, stationId: id, slotNo: i, type: chargerType, kw, price, status: "available" });
    }
    await conn.query(
      "INSERT INTO admin_station_access (adminId,stationId,permissionLevel) VALUES (?,?, 'manager') ON DUPLICATE KEY UPDATE permissionLevel=VALUES(permissionLevel)",
      [adminId, id]
    );
    await conn.commit();
    const [[station]] = await pool.query("SELECT * FROM stations WHERE id = ?", [id]);
    res.status(201).json({ message: "Station created successfully", station, ports: portRows });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
}));

app.patch("/api/stations/:id", requirePermission("stations.edit", async (req, res) => {
  const { name, location, lat, lng, status } = req.body;
  if (status && !STATION_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid station status" });
  if (!canAccessStation(req.auth, req.params.id)) return res.status(403).json({ error: "You do not have access to this station" });
  await pool.query(
    `UPDATE stations SET
      name = COALESCE(?, name),
      location = COALESCE(?, location),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      status = COALESCE(?, status)
     WHERE id = ?`,
    [name || null, location || null, lat === undefined ? null : Number(lat), lng === undefined ? null : Number(lng), status || null, req.params.id]
  );
  const [[station]] = await pool.query("SELECT * FROM stations WHERE id = ?", [req.params.id]);
  if (!station) return res.status(404).json({ error: "Station not found" });
  res.json(station);
}));

app.delete("/api/stations/:id", requirePermission("stations.delete", async (req, res) => {
  if (!canAccessStation(req.auth, req.params.id)) return res.status(403).json({ error: "You do not have access to this station" });
  const [[active]] = await pool.query("SELECT COUNT(*) AS cnt FROM sessions WHERE stationId = ? AND status = 'active'", [req.params.id]);
  if (active.cnt > 0) return res.status(409).json({ error: "Cannot delete a station with active charging sessions" });
  await pool.query("DELETE FROM stations WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

app.get("/api/ports", requireAuth(async (req, res) => {
  const { stationId } = req.query;
  const filter = await visibleStationClause(req.auth, "stationId");
  const params = stationId ? [stationId, ...filter.params] : filter.params;
  const sql = stationId ? `SELECT * FROM ports WHERE stationId = ?${filter.sql}` : `SELECT * FROM ports WHERE 1 = 1${filter.sql}`;
  const [rows] = await pool.query(`${sql} ORDER BY stationId,id`, params);
  res.json(rows.map((p) => ({ ...p, kw: Number(p.kw), price: Number(p.price) })));
}));

app.post("/api/ports", requirePermission("chargers.create", async (req, res) => {
  const { stationId, type = "CCS2", kw = 150, price = 18 } = req.body;
  if (!stationId) return res.status(400).json({ error: "Station is required" });
  if (!canAccessStation(req.auth, stationId)) return res.status(403).json({ error: "You do not have access to this station" });
  const id = await nextNumericId("ports", "P", 3);
  const [[slot]] = await pool.query("SELECT COALESCE(MAX(slotNo), 0) + 1 AS nextSlot FROM ports WHERE stationId = ?", [stationId]);
  await pool.query("INSERT INTO ports (id,stationId,slotNo,type,kw,price,status) VALUES (?,?,?,?,?,?,'available')", [id, stationId, slot.nextSlot || 1, type, Number(kw), Number(price)]);
  const [[port]] = await pool.query("SELECT * FROM ports WHERE id = ?", [id]);
  res.status(201).json(port);
}));

app.patch("/api/ports/:id/status", requirePermission("chargers.status", async (req, res) => {
  const { status } = req.body;
  if (!PORT_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid charger status" });
  const [[port]] = await pool.query("SELECT * FROM ports WHERE id = ?", [req.params.id]);
  if (!port) return res.status(404).json({ error: "Charger not found" });
  if (!canAccessStation(req.auth, port.stationId)) return res.status(403).json({ error: "You do not have access to this station" });
  if (["maintenance", "offline", "out_of_service"].includes(status)) {
    const [[active]] = await pool.query("SELECT COUNT(*) AS cnt FROM sessions WHERE portId = ? AND status = 'active'", [req.params.id]);
    if (active.cnt > 0) return res.status(409).json({ error: "Cannot disable a charger with an active session" });
  }
  await pool.query("UPDATE ports SET status = ? WHERE id = ?", [status, req.params.id]);
  const [[updated]] = await pool.query("SELECT * FROM ports WHERE id = ?", [req.params.id]);
  res.json(updated);
}));

app.get("/api/sessions", requireAuth(async (req, res) => {
  if (req.auth.kind === "user") {
    const [rows] = await pool.query("SELECT * FROM sessions WHERE userId = ? ORDER BY id DESC", [req.auth.id]);
    return res.json(rows.map((s) => ({ ...s, energy: Number(s.energy), cost: Number(s.cost), power: Number(s.power) })));
  }
  const filter = await visibleStationClause(req.auth, "stationId");
  const requestedUser = req.query.userId;
  const params = requestedUser ? [requestedUser, ...filter.params] : filter.params;
  const sql = requestedUser ? `SELECT * FROM sessions WHERE userId = ?${filter.sql}` : `SELECT * FROM sessions WHERE 1 = 1${filter.sql}`;
  const [rows] = await pool.query(`${sql} ORDER BY id DESC`, params);
  res.json(rows.map((s) => ({ ...s, energy: Number(s.energy), cost: Number(s.cost), power: Number(s.power) })));
}));

app.post("/api/sessions", requireAuth(async (req, res) => {
  const userId = req.auth.kind === "user" ? req.auth.id : req.body.userId;
  const { portId, stationId } = req.body;
  if (!userId || !portId || !stationId) return res.status(400).json({ error: "User, station, and charger are required" });
  if (req.auth.kind === "admin" && !hasPermission(req.auth, "sessions.manage")) return res.status(403).json({ error: "You do not have permission for this action" });
  if (req.auth.kind === "admin" && !canAccessStation(req.auth, stationId)) return res.status(403).json({ error: "You do not have access to this station" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[station]] = await conn.query("SELECT * FROM stations WHERE id = ? FOR UPDATE", [stationId]);
    const [[port]] = await conn.query("SELECT * FROM ports WHERE id = ? AND stationId = ? FOR UPDATE", [portId, stationId]);
    if (!station || station.status !== "online") throw new Error("Station is not available for charging");
    if (!port || port.status !== "available") throw new Error("Charger is not available");
    const [[active]] = await conn.query("SELECT COUNT(*) AS cnt FROM sessions WHERE portId = ? AND status = 'active'", [portId]);
    if (active.cnt > 0) throw new Error("Charger already has an active session");
    const id = `SES-${await nextNumericId("sessions", "SES-", 4).then((v) => v.slice(4))}`;
    const now = new Date();
    await conn.query(
      "INSERT INTO sessions (id,userId,portId,stationId,startTime,endTime,startAt,energy,cost,status,power,duration) VALUES (?,?,?,?,?,'-',?,0,0,'active',?,'Active')",
      [id, userId, portId, stationId, displayTime(now), toMysqlDatetime(now), Number(port.kw)]
    );
    await conn.query("UPDATE ports SET status = 'occupied' WHERE id = ?", [portId]);
    await conn.commit();
    const [[session]] = await pool.query("SELECT * FROM sessions WHERE id = ?", [id]);
    res.status(201).json({ ...session, energy: Number(session.energy), cost: Number(session.cost) });
  } catch (error) {
    await conn.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    conn.release();
  }
}));

app.patch("/api/sessions/:id/end", requireAuth(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[session]] = await conn.query("SELECT * FROM sessions WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.auth.kind === "user" && session.userId !== req.auth.id) return res.status(403).json({ error: "You can only end your own sessions" });
    if (req.auth.kind === "admin" && !hasPermission(req.auth, "sessions.manage")) return res.status(403).json({ error: "You do not have permission for this action" });
    if (req.auth.kind === "admin" && !canAccessStation(req.auth, session.stationId)) return res.status(403).json({ error: "You do not have access to this station" });
    if (session.status === "completed") {
      await conn.commit();
      return res.json({ ...session, energy: Number(session.energy), cost: Number(session.cost) });
    }
    const [[port]] = await conn.query("SELECT * FROM ports WHERE id = ? FOR UPDATE", [session.portId]);
    const now = new Date();
    const start = session.startAt ? new Date(session.startAt) : now;
    const minutes = Math.max(15, Math.round((now.getTime() - start.getTime()) / 60000));
    const duration = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    const energy = Number(session.energy) > 0 ? Number(session.energy) : Number(((Number(session.power) * minutes) / 60).toFixed(2));
    const cost = Number(session.cost) > 0 ? Number(session.cost) : Number((energy * Number(port?.price || 0)).toFixed(2));
    await conn.query(
      "UPDATE sessions SET status='completed', endTime=?, endAt=?, duration=?, energy=?, cost=?, revenuePosted=1 WHERE id=?",
      [displayTime(now), toMysqlDatetime(now), duration, energy, cost, req.params.id]
    );
    await conn.query("UPDATE ports SET status='available' WHERE id=?", [session.portId]);
    if (!session.revenuePosted) await conn.query("UPDATE stations SET revenue = revenue + ? WHERE id = ?", [cost, session.stationId]);
    await conn.commit();
    const [[updated]] = await pool.query("SELECT * FROM sessions WHERE id = ?", [req.params.id]);
    res.json({ ...updated, energy: Number(updated.energy), cost: Number(updated.cost) });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
}));

app.get("/api/reservations", requireAuth(async (req, res) => {
  if (req.auth.kind === "user") {
    const [rows] = await pool.query("SELECT * FROM reservations WHERE userId = ? ORDER BY id DESC", [req.auth.id]);
    return res.json(rows);
  }
  const filter = await visibleStationClause(req.auth, "stationId");
  const [rows] = await pool.query(`SELECT * FROM reservations WHERE 1 = 1${filter.sql} ORDER BY id DESC`, filter.params);
  res.json(rows);
}));

app.post("/api/reservations", requireAuth(async (req, res) => {
  const userId = req.auth.kind === "user" ? req.auth.id : req.body.userId;
  const { portId, stationId, date, time, durationMinutes = 60 } = req.body;
  if (!userId || !portId || !stationId || !date || !time) return res.status(400).json({ error: "User, station, charger, date, and time are required" });
  if (req.auth.kind === "admin" && !hasPermission(req.auth, "reservations.manage")) return res.status(403).json({ error: "You do not have permission for this action" });
  if (req.auth.kind === "admin" && !canAccessStation(req.auth, stationId)) return res.status(403).json({ error: "You do not have access to this station" });
  const start = new Date(`${date}T${time}`);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: "Reservation date/time is invalid" });
  const end = new Date(start.getTime() + Number(durationMinutes) * 60000);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[station]] = await conn.query("SELECT * FROM stations WHERE id = ? FOR UPDATE", [stationId]);
    const [[port]] = await conn.query("SELECT * FROM ports WHERE id = ? AND stationId = ? FOR UPDATE", [portId, stationId]);
    if (!station || station.status !== "online") throw new Error("Station is not accepting reservations");
    if (!port || port.status !== "available") throw new Error("Charger is no longer available");
    const [[conflict]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM reservations
       WHERE portId = ? AND status IN ('pending','confirmed','active')
       AND ((startAt IS NOT NULL AND startAt < ? AND endAt > ?) OR (startAt IS NULL AND datetime = ?))`,
      [portId, toMysqlDatetime(end), toMysqlDatetime(start), `${date} ${time}`]
    );
    if (conflict.cnt > 0) throw new Error("This charger already has a reservation for that time");
    const id = `RES-${await nextNumericId("reservations", "RES-", 4).then((v) => v.slice(4))}`;
    await conn.query(
      "INSERT INTO reservations (id,userId,portId,stationId,datetime,startAt,endAt,durationMinutes,status) VALUES (?,?,?,?,?,?,?,?, 'pending')",
      [id, userId, portId, stationId, `${date} ${time}`, toMysqlDatetime(start), toMysqlDatetime(end), Number(durationMinutes)]
    );
    await conn.query("UPDATE ports SET status='reserved' WHERE id=?", [portId]);
    await conn.commit();
    const [[reservation]] = await pool.query("SELECT * FROM reservations WHERE id = ?", [id]);
    res.status(201).json(reservation);
  } catch (error) {
    await conn.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    conn.release();
  }
}));

app.patch("/api/reservations/:id/cancel", requireAuth(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[reservation]] = await conn.query("SELECT * FROM reservations WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    if (req.auth.kind === "user" && reservation.userId !== req.auth.id) return res.status(403).json({ error: "You can only cancel your own reservations" });
    if (req.auth.kind === "admin" && !hasPermission(req.auth, "reservations.manage")) return res.status(403).json({ error: "You do not have permission for this action" });
    if (req.auth.kind === "admin" && !canAccessStation(req.auth, reservation.stationId)) return res.status(403).json({ error: "You do not have access to this station" });
    await conn.query("UPDATE reservations SET status='cancelled' WHERE id=?", [req.params.id]);
    const [[active]] = await conn.query("SELECT COUNT(*) AS cnt FROM sessions WHERE portId = ? AND status = 'active'", [reservation.portId]);
    const [[otherReservations]] = await conn.query("SELECT COUNT(*) AS cnt FROM reservations WHERE portId = ? AND id <> ? AND status IN ('pending','confirmed','active')", [reservation.portId, req.params.id]);
    if (active.cnt === 0 && otherReservations.cnt === 0) await conn.query("UPDATE ports SET status='available' WHERE id=?", [reservation.portId]);
    await conn.commit();
    const [[updated]] = await pool.query("SELECT * FROM reservations WHERE id = ?", [req.params.id]);
    res.json(updated);
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
}));

app.get("/api/users", requirePermission("users.view", async (_req, res) => {
  const [rows] = await pool.query("SELECT * FROM users ORDER BY id");
  res.json(rows.map(stripPassword));
}));

app.post("/api/users", requirePermission("users.manage", async (req, res) => {
  const { name, email, phone = "", password = "user123" } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and username/email are required" });
  const id = await nextNumericId("users", "U", 3);
  await pool.query("INSERT INTO users (id,name,email,phone,password,vehicles,role,status) VALUES (?,?,?,?,?,0,'user','active')", [id, name.trim(), email.trim(), phone.trim(), hashPassword(password)]);
  const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  res.status(201).json(stripPassword(user));
}));

app.patch("/api/users/:id/status", requirePermission("users.manage", async (req, res) => {
  const status = req.body.status === "inactive" ? "inactive" : "active";
  await pool.query("UPDATE users SET status=? WHERE id=?", [status, req.params.id]);
  const [[user]] = await pool.query("SELECT * FROM users WHERE id=?", [req.params.id]);
  res.json(stripPassword(user));
}));

app.patch("/api/profile", requireAuth(async (req, res) => {
  if (req.auth.kind !== "user") return res.status(400).json({ error: "Profile updates are available for user accounts" });
  const { name, email, phone = "" } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and username/email are required" });
  const [[dupe]] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [email, req.auth.id]);
  if (dupe) return res.status(409).json({ error: "Another account already uses that username/email" });
  await pool.query("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?", [name.trim(), email.trim(), phone.trim(), req.auth.id]);
  const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [req.auth.id]);
  res.json(normalizeUser(user, null));
}));

app.patch("/api/profile/password", requireAuth(async (req, res) => {
  if (req.auth.kind !== "user") return res.status(400).json({ error: "Password changes are available for user accounts" });
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: "Passwords do not match" });
  const [[user]] = await pool.query("SELECT * FROM users WHERE id = ?", [req.auth.id]);
  if (!verifyPassword(currentPassword, user.password)) return res.status(401).json({ error: "Current password is incorrect" });
  await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword(newPassword), req.auth.id]);
  res.json({ ok: true });
}));

app.get("/api/vehicles", requireAuth(async (req, res) => {
  if (req.auth.kind === "admin" && !hasPermission(req.auth, "users.view")) return res.status(403).json({ error: "You do not have permission for vehicle records" });
  const userId = req.auth.kind === "user" ? req.auth.id : req.query.userId;
  const [rows] = userId ? await pool.query("SELECT * FROM vehicles WHERE userId = ? ORDER BY isDefault DESC,id", [userId]) : await pool.query("SELECT * FROM vehicles ORDER BY userId,id");
  res.json(rows.map((v) => ({ ...v, batteryKwh: Number(v.batteryKwh), isDefault: Boolean(v.isDefault) })));
}));

app.post("/api/vehicles", requireAuth(async (req, res) => {
  if (req.auth.kind === "admin" && !hasPermission(req.auth, "users.manage")) return res.status(403).json({ error: "You do not have permission to manage vehicles" });
  const userId = req.auth.kind === "user" ? req.auth.id : req.body.userId;
  const { make = "", model = "", year = null, batteryKwh = null, connectorType = "CCS2", isDefault = false } = req.body;
  if (!make || !model) return res.status(400).json({ error: "Vehicle make and model are required" });
  const id = await nextNumericId("vehicles", "VH", 3);
  if (isDefault) await pool.query("UPDATE vehicles SET isDefault = 0 WHERE userId = ?", [userId]);
  await pool.query("INSERT INTO vehicles (id,userId,make,model,year,batteryKwh,connectorType,isDefault) VALUES (?,?,?,?,?,?,?,?)", [id, userId, make, model, Number(year) || null, Number(batteryKwh) || null, connectorType, isDefault ? 1 : 0]);
  await pool.query("UPDATE users SET vehicles = (SELECT COUNT(*) FROM vehicles WHERE userId = ?) WHERE id = ?", [userId, userId]);
  const [[vehicle]] = await pool.query("SELECT * FROM vehicles WHERE id = ?", [id]);
  res.status(201).json(vehicle);
}));

app.patch("/api/vehicles/:id", requireAuth(async (req, res) => {
  const [[vehicle]] = await pool.query("SELECT * FROM vehicles WHERE id = ?", [req.params.id]);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
  if (req.auth.kind === "user" && vehicle.userId !== req.auth.id) return res.status(403).json({ error: "You can only edit your own vehicles" });
  if (req.auth.kind === "admin" && !hasPermission(req.auth, "users.manage")) return res.status(403).json({ error: "You do not have permission to manage vehicles" });
  const { make, model, year, batteryKwh, connectorType, isDefault } = req.body;
  if (isDefault) await pool.query("UPDATE vehicles SET isDefault = 0 WHERE userId = ?", [vehicle.userId]);
  await pool.query(
    `UPDATE vehicles SET
      make = COALESCE(?, make),
      model = COALESCE(?, model),
      year = COALESCE(?, year),
      batteryKwh = COALESCE(?, batteryKwh),
      connectorType = COALESCE(?, connectorType),
      isDefault = COALESCE(?, isDefault)
     WHERE id = ?`,
    [make || null, model || null, year === undefined ? null : Number(year), batteryKwh === undefined ? null : Number(batteryKwh), connectorType || null, isDefault === undefined ? null : (isDefault ? 1 : 0), req.params.id]
  );
  const [[updated]] = await pool.query("SELECT * FROM vehicles WHERE id = ?", [req.params.id]);
  res.json({ ...updated, batteryKwh: Number(updated.batteryKwh), isDefault: Boolean(updated.isDefault) });
}));

app.delete("/api/vehicles/:id", requireAuth(async (req, res) => {
  const [[vehicle]] = await pool.query("SELECT * FROM vehicles WHERE id = ?", [req.params.id]);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
  if (req.auth.kind === "user" && vehicle.userId !== req.auth.id) return res.status(403).json({ error: "You can only delete your own vehicles" });
  if (req.auth.kind === "admin" && !hasPermission(req.auth, "users.manage")) return res.status(403).json({ error: "You do not have permission to manage vehicles" });
  await pool.query("DELETE FROM vehicles WHERE id = ?", [req.params.id]);
  await pool.query("UPDATE users SET vehicles = (SELECT COUNT(*) FROM vehicles WHERE userId = ?) WHERE id = ?", [vehicle.userId, vehicle.userId]);
  res.json({ ok: true });
}));

app.get("/api/admins", requirePermission("admins.view", async (_req, res) => {
  const [rows] = await pool.query("SELECT id,name,email,role,permissions,status,createdAt FROM admins ORDER BY id");
  const [access] = await pool.query("SELECT adminId, stationId FROM admin_station_access ORDER BY adminId, stationId");
  res.json(rows.map((admin) => ({
    ...admin,
    permissions: parsePermissions(admin.permissions, admin.role),
    assignedStations: access.filter((row) => row.adminId === admin.id).map((row) => row.stationId),
  })));
}));

app.post("/api/admins", requirePermission("admins.create", async (req, res) => {
  const { name, email, password = "admin123", role = "station_admin", permissions = STATION_ADMIN_PERMISSIONS, stationIds = [] } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and username/email are required" });
  const id = await nextNumericId("admins", "A", 3);
  await pool.query("INSERT INTO admins (id,name,email,password,role,permissions,status) VALUES (?,?,?,?,?,?, 'active')", [id, name.trim(), email.trim(), hashPassword(password), role, serializePermissions(role === "super_admin" ? ALL_PERMISSIONS : permissions)]);
  for (const stationId of stationIds) {
    await pool.query("INSERT INTO admin_station_access (adminId,stationId,permissionLevel) VALUES (?,?, 'manager') ON DUPLICATE KEY UPDATE permissionLevel=VALUES(permissionLevel)", [id, stationId]);
  }
  const [[admin]] = await pool.query("SELECT id,name,email,role,permissions,status,createdAt FROM admins WHERE id = ?", [id]);
  res.status(201).json({ ...admin, permissions: parsePermissions(admin.permissions, admin.role), assignedStations: stationIds });
}));

app.patch("/api/admins/:id", requirePermission("admins.edit", async (req, res) => {
  const { name, email, role, permissions, status, stationIds } = req.body;
  if (status && req.params.id === req.auth.id && status !== "active") return res.status(400).json({ error: "You cannot deactivate your own admin account" });
  await pool.query(
    `UPDATE admins SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      permissions = COALESCE(?, permissions),
      status = COALESCE(?, status)
     WHERE id = ?`,
    [name || null, email || null, role || null, permissions ? serializePermissions(permissions) : null, status || null, req.params.id]
  );
  if (Array.isArray(stationIds)) {
    await pool.query("DELETE FROM admin_station_access WHERE adminId = ?", [req.params.id]);
    for (const stationId of stationIds) {
      await pool.query("INSERT INTO admin_station_access (adminId,stationId,permissionLevel) VALUES (?,?, 'manager')", [req.params.id, stationId]);
    }
  }
  const [[admin]] = await pool.query("SELECT id,name,email,role,permissions,status,createdAt FROM admins WHERE id = ?", [req.params.id]);
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  const [access] = await pool.query("SELECT stationId FROM admin_station_access WHERE adminId = ?", [req.params.id]);
  res.json({ ...admin, permissions: parsePermissions(admin.permissions, admin.role), assignedStations: access.map((row) => row.stationId) });
}));

initSchema()
  .then(() => app.listen(PORT, () => console.log(`EVGRID API ready at http://localhost:${PORT}/api`)))
  .catch((error) => {
    console.error("Schema init failed:", error);
    process.exit(1);
  });
