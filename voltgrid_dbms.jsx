// ══════════════════════════════════════════════════════════════
//  VOLTGRID — React Frontend (VoltGrid.jsx)
//  Requires backend running at http://localhost:4000
//  All data mutations go through the API. Local `db` state is
//  refreshed after every write so the UI stays in sync.
// ══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";

// ─── API LAYER ────────────────────────────────────────────────
const API = "http://localhost:4000/api";

const api = {
  get:   (path)         => fetch(`${API}${path}`).then(r => r.json()),
  post:  (path, body)   => fetch(`${API}${path}`, { method:"POST",  headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }).then(r => r.json()),
  patch: (path, body)   => fetch(`${API}${path}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }).then(r => r.json()),
  del:   (path)         => fetch(`${API}${path}`, { method:"DELETE" }).then(r => r.json()),
};

// ─── HELPERS ─────────────────────────────────────────────────
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

// ─── PALETTE ─────────────────────────────────────────────────
const ORANGE = "#FF6B35";
const TEAL   = "#00B894";
const SKY    = "#0984E3";

const C = {
  bg:"#F5F0E8", surface:"#FFFFFF", card:"#FFFDF8", border:"#E8DDD0", border2:"#D4C4B0",
  orange:ORANGE, teal:TEAL, sky:SKY, amber:"#F9A825", coral:"#E84393", grass:"#27AE60",
  text:"#1A1209", sub:"#6B5B47", dim:"#B8A898",
  sidebar:"#1A1209", sideB:"#2D2318", sideT:"#F5F0E8", sideMu:"#9D8B79",
};

const SC = {
  available:C.teal, busy:C.sky, reserved:C.amber, offline:C.dim,
  online:C.teal, active:C.sky, completed:C.teal, pending:C.amber,
  cancelled:C.coral, inactive:C.coral,
};
const SB = {
  available:"rgba(0,184,148,0.12)",  busy:"rgba(9,132,227,0.12)",
  reserved:"rgba(249,168,37,0.12)",  offline:"rgba(184,168,152,0.12)",
  online:"rgba(0,184,148,0.12)",     active:"rgba(9,132,227,0.12)",
  completed:"rgba(0,184,148,0.12)", pending:"rgba(249,168,37,0.12)",
  cancelled:"rgba(232,67,147,0.12)",inactive:"rgba(232,67,147,0.12)",
};

const S = {
  panel:  { background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(26,18,9,0.06)" },
  card:   { background:C.card,    border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:"0 1px 8px rgba(26,18,9,0.05)" },
  input:  { width:"100%", background:"#FAF7F2", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:12, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" },
  select: { width:"100%", background:"#FAF7F2", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:12, outline:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" },
  label:  { fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:C.sub, display:"block", marginBottom:7, fontWeight:700 },
  th:     { padding:"10px 16px", textAlign:"left", fontSize:9, letterSpacing:2, textTransform:"uppercase", color:C.sub, borderBottom:`1px solid ${C.border}`, fontWeight:700, background:"#FAF7F2" },
  td:     { padding:"11px 16px", borderBottom:`1px solid ${C.border}`, color:C.sub },
  sectionLabel: { fontSize:9, color:C.dim, letterSpacing:2.5, textTransform:"uppercase", marginBottom:12, fontWeight:700 },
};

// ─── GEO HELPERS ─────────────────────────────────────────────
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const useGeolocation = () => {
  const [loc,    setLoc]    = useState(null);
  const [status, setStatus] = useState("idle");
  const request = useCallback(() => {
    if (!navigator.geolocation) { setStatus("unavailable"); return; }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      pos => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setStatus("granted"); },
      ()  => setStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);
  return { loc, status, request };
};

// ─── SHARED UI COMPONENTS ────────────────────────────────────
const Badge = ({ status, label }) => (
  <span style={{ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:20, fontSize:9, fontWeight:700, letterSpacing:1, background:SB[status]||"rgba(184,168,152,0.15)", color:SC[status]||C.dim, border:`1px solid ${(SC[status]||C.dim)}33`, whiteSpace:"nowrap", textTransform:"uppercase" }}>
    {label||status}
  </span>
);

const Btn = ({ onClick, children, variant="primary", style={}, disabled=false }) => {
  const vs = {
    primary:   { background:C.orange, color:"#fff", border:"none", boxShadow:"0 4px 16px rgba(255,107,53,0.35)" },
    secondary: { background:"transparent", color:C.sub, border:`1px solid ${C.border2}` },
    danger:    { background:"rgba(232,67,147,0.1)", color:C.coral, border:`1px solid rgba(232,67,147,0.3)` },
    green:     { background:C.teal, color:"#fff", border:"none", boxShadow:"0 4px 16px rgba(0,184,148,0.3)" },
    ghost:     { background:"rgba(255,107,53,0.08)", color:C.orange, border:`1px solid rgba(255,107,53,0.3)` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding:"8px 18px", borderRadius:10, cursor:disabled?"not-allowed":"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, fontWeight:700, letterSpacing:"1px", textTransform:"uppercase", transition:"all 0.2s", opacity:disabled?0.45:1, whiteSpace:"nowrap", ...vs[variant], ...style }}>
      {children}
    </button>
  );
};

const InfoRow = ({ label, value, valueStyle={} }) => (
  <div style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
    <span style={{ color:C.sub }}>{label}</span>
    <span style={{ color:C.text, fontWeight:600, ...valueStyle }}>{value}</span>
  </div>
);

const PanelHead = ({ title, right }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${C.border}`, background:"#FAF7F2" }}>
    <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:800, color:C.text, textTransform:"uppercase", letterSpacing:2 }}>{title}</span>
    {right && <div>{right}</div>}
  </div>
);

const StatCard = ({ label, value, color, icon }) => (
  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:22, position:"relative", overflow:"hidden", boxShadow:`0 4px 20px ${color}18` }}>
    <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }}/>
    <div style={{ fontSize:9, letterSpacing:2, textTransform:"uppercase", color:C.sub, marginBottom:10, fontWeight:700 }}>{label}</div>
    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
      <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:30, fontWeight:800, color:C.text, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:28, opacity:0.18 }}>{icon}</div>
    </div>
    <div style={{ position:"absolute", bottom:0, right:0, width:60, height:60, borderRadius:"50%", background:color, opacity:0.08, transform:"translate(20px,20px)" }}/>
  </div>
);

const Modal = ({ title, subtitle, onClose, children, footer }) => (
  <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position:"fixed", inset:0, background:"rgba(26,18,9,0.5)", backdropFilter:"blur(8px)", zIndex:9000, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:28, maxWidth:520, width:"90%", maxHeight:"88vh", overflowY:"auto", position:"relative", animation:"modalUp 0.25s ease", boxShadow:"0 24px 60px rgba(26,18,9,0.2)" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.orange},${C.teal})`, borderRadius:"20px 20px 0 0" }}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, paddingTop:8 }}>
        <div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, fontWeight:800, color:C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize:11, color:C.sub, marginTop:3 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ background:"#FEF0F0", border:"1px solid #FCCACA", color:C.coral, cursor:"pointer", fontSize:16, lineHeight:1, padding:"4px 9px", borderRadius:8, fontWeight:700 }}>×</button>
      </div>
      <div>{children}</div>
      {footer && <div style={{ display:"flex", gap:10, marginTop:22, justifyContent:"flex-end" }}>{footer}</div>}
    </div>
  </div>
);

const ConfirmModal = ({ title, msg, danger, onConfirm, onClose }) => (
  <Modal title={title} onClose={onClose} footer={[
    <Btn key="no"  variant="secondary" onClick={onClose}>Cancel</Btn>,
    <Btn key="yes" variant={danger?"danger":"primary"} onClick={onConfirm}>Confirm</Btn>,
  ]}>
    <p style={{ fontSize:13, color:C.sub, lineHeight:1.7 }}>{msg}</p>
  </Modal>
);

// ─── LEAFLET MAP ─────────────────────────────────────────────
const LeafletMapInternal = ({ stations, ports, selectedStation, onStationClick, isAdmin, sessions, admins, userLocation, navTarget }) => {
  const mapRef       = useRef(null);
  const mapInstance  = useRef(null);
  const markersRef   = useRef({});
  const userMarkerRef = useRef(null);
  const routeLineRef  = useRef(null);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const link = document.createElement("link"); link.rel="stylesheet"; link.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(link);
    const script = document.createElement("script"); script.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; script.onload=()=>setLeafletReady(true); document.head.appendChild(script);
  }, []);

 useEffect(() => {
  if (!leafletReady || !mapRef.current || mapInstance.current) return;

  const L = window.L;

  const map = L.map(mapRef.current, {
    center:[13.03,80.21],
    zoom:11
  });

  mapInstance.current = map;

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:"©CartoDB",
    subdomains:"abcd",
    maxZoom:19
  }).addTo(map);

  // ✅ SAFE CLICK HANDLER
  map.on("click", function (e) {
    const { lat, lng } = e.latlng;

    // 👇 send event safely
    if (window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent("mapClick", { detail: { lat, lng } })
      );
    }
  });

}, [leafletReady]);

  useEffect(() => {
    if (!leafletReady || !mapInstance.current) return;
    const L = window.L; const map = mapInstance.current;
    Object.values(markersRef.current).forEach(m => m.remove()); markersRef.current = {};
    stations.forEach(st => {
      const stPorts = ports.filter(p => p.stationId === st.id);
      const av = stPorts.filter(p => p.status==="available").length;
      const busy = stPorts.filter(p => p.status==="busy").length;
      const reserved = stPorts.filter(p => p.status==="reserved").length;
      const offline = stPorts.filter(p => p.status==="offline").length;
      const isSelected = selectedStation?.id === st.id;
      const color = av > 0 ? "#00B894" : "#E84393";
      const adminName = admins?.find(a => a.id === st.adminId)?.name || st.adminId;
      const activeSes = sessions?.filter(s => s.stationId === st.id && s.status === "active") || [];
      const tooltipHtml = isAdmin
        ? `<div style="background:#fff;border:1.5px solid ${color}55;border-radius:14px;padding:14px 16px;min-width:230px;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 8px 24px rgba(26,18,9,0.13)"><div style="font-weight:800;font-size:13px;color:#1A1209;margin-bottom:8px">${st.name}</div><div style="font-size:10px;color:#9D8B79;margin-bottom:10px">📍 ${st.location}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div style="background:#F5F0E8;border-radius:8px;padding:7px;text-align:center"><div style="font-size:17px;font-weight:800;color:#00B894">${av}</div><div style="font-size:8px;color:#9D8B79;text-transform:uppercase">Free</div></div><div style="background:#F5F0E8;border-radius:8px;padding:7px;text-align:center"><div style="font-size:17px;font-weight:800;color:#0984E3">${busy}</div><div style="font-size:8px;color:#9D8B79;text-transform:uppercase">Busy</div></div><div style="background:#F5F0E8;border-radius:8px;padding:7px;text-align:center"><div style="font-size:17px;font-weight:800;color:#F9A825">${reserved}</div><div style="font-size:8px;color:#9D8B79;text-transform:uppercase">Reserved</div></div><div style="background:#F5F0E8;border-radius:8px;padding:7px;text-align:center"><div style="font-size:17px;font-weight:800;color:#B8A898">${offline}</div><div style="font-size:8px;color:#9D8B79;text-transform:uppercase">Offline</div></div></div><div style="border-top:1px solid #E8DDD0;padding-top:8px;margin-top:10px;font-size:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#9D8B79">Admin</span><span style="font-weight:600">${adminName}</span></div><div style="display:flex;justify-content:space-between"><span style="color:#9D8B79">Revenue</span><span style="color:#00B894;font-weight:700">₹${st.revenue.toLocaleString("en-IN")}</span></div></div></div>`
        : `<div style="background:#fff;border:1.5px solid ${color}55;border-radius:14px;padding:14px 16px;min-width:220px;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 8px 24px rgba(26,18,9,0.13)"><div style="font-weight:800;font-size:13px;color:#1A1209;margin-bottom:8px">${st.name}</div><div style="font-size:10px;color:#9D8B79;margin-bottom:10px">📍 ${st.location}</div><div style="display:flex;gap:8px;margin-bottom:10px"><div style="flex:1;background:#F5F0E8;border-radius:8px;padding:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:#00B894">${av}</div><div style="font-size:8px;color:#9D8B79;text-transform:uppercase">Available</div></div><div style="flex:1;background:#F5F0E8;border-radius:8px;padding:8px;text-align:center"><div style="font-size:20px;font-weight:800;color:#1A1209">${stPorts.length}</div><div style="font-size:8px;color:#9D8B79;text-transform:uppercase">Total Ports</div></div></div>${av > 0 ? `<div style="background:rgba(0,184,148,0.1);border:1px solid rgba(0,184,148,0.3);border-radius:8px;padding:7px 10px;font-size:10px;color:#00B894;text-align:center;font-weight:700">⚡ Click to select</div>` : `<div style="background:rgba(232,67,147,0.08);border:1px solid rgba(232,67,147,0.25);border-radius:8px;padding:7px 10px;font-size:10px;color:#E84393;text-align:center">All ports occupied</div>`}</div>`;
      const svgIcon = `<svg width="${isSelected?52:44}" height="${isSelected?52:44}" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">${isSelected?`<circle cx="22" cy="22" r="20" fill="${color === "#00B894" ? "rgba(0,184,148,0.3)" : "rgba(232,67,147,0.3)"}" opacity="0.5"><animate attributeName="r" values="18;22;18" dur="2s" repeatCount="indefinite"/></circle>`:""}<circle cx="22" cy="22" r="${isSelected?11:9}" fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="2"/><text x="22" y="26" text-anchor="middle" font-family="'Syne',sans-serif" font-size="9" font-weight="800" fill="#000">${av}</text></svg>`;
      const icon = L.divIcon({ html:svgIcon, className:"", iconSize:[isSelected?52:44,isSelected?52:44], iconAnchor:[isSelected?26:22,isSelected?26:22] });
      const marker = L.marker([st.lat, st.lng], { icon }).addTo(map);
      marker.bindTooltip(L.tooltip({ permanent:false, direction:"top", offset:[0,-20], opacity:1 }).setContent(tooltipHtml));
      marker.on("click", () => onStationClick(st));
      markersRef.current[st.id] = marker;
    });
  }, [leafletReady, stations, ports, selectedStation, isAdmin, sessions, admins]);

  useEffect(() => {
    if (!leafletReady || !mapInstance.current) return;
    const L = window.L; const map = mapInstance.current;
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
    if (routeLineRef.current)  { routeLineRef.current.remove();  routeLineRef.current  = null; }
    if (!userLocation) return;
    const youSvg = `<svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="10" fill="#FF6B35" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="18" r="4" fill="#fff"/></svg>`;
    const youIcon = L.divIcon({ html:youSvg, className:"", iconSize:[36,44], iconAnchor:[18,40] });
    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon:youIcon, zIndexOffset:1000 }).addTo(map).bindTooltip("📍 You are here");
    if (navTarget) {
      routeLineRef.current = L.polyline([[userLocation.lat,userLocation.lng],[navTarget.lat,navTarget.lng]], { color:"#FF6B35", weight:3.5, opacity:0.85, dashArray:"10 7" }).addTo(map);
      map.fitBounds([[userLocation.lat,userLocation.lng],[navTarget.lat,navTarget.lng]], { padding:[50,50] });
    } else {
      map.setView([userLocation.lat, userLocation.lng], 13, { animate:true });
    }
  }, [leafletReady, userLocation, navTarget]);

  if (!leafletReady) return <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1117", borderRadius:12 }}><div style={{ fontSize:12, color:"#9D8B79" }}>Loading map…</div></div>;
  return (
    <>
      <style>{`.leaflet-container{background:#0d1117!important}.leaflet-tooltip{background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important}.leaflet-tooltip-top:before,.leaflet-tooltip-bottom:before,.leaflet-tooltip-left:before,.leaflet-tooltip-right:before{display:none!important}`}</style>
      <div ref={mapRef} style={{ width:"100%", height:"100%", borderRadius:12, overflow:"hidden" }} />
    </>
  );
};

const ChennaiMap = (props) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div style={{ width:"100%", height:"100%", background:"#0d1117", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ fontSize:12, color:"#9D8B79" }}>Initializing map…</div></div>;
  return <LeafletMapInternal {...props} />;
};

// ─── DATABASE VIEWER ─────────────────────────────────────────
const DatabaseViewer = ({ db }) => {
  const [activeTable, setActiveTable] = useState("stations");
  const [searchQ, setSearchQ] = useState("");
  const tables = [
    { key:"stations",     label:"Stations",     icon:"🏗", count:db.stations.length },
    { key:"ports",        label:"Ports",        icon:"🔌", count:db.ports.length },
    { key:"sessions",     label:"Sessions",     icon:"⚡", count:db.sessions.length },
    { key:"reservations", label:"Reservations", icon:"📅", count:db.reservations.length },
    { key:"users",        label:"Users",        icon:"👥", count:db.users.length },
    { key:"vehicles",     label:"Vehicles",     icon:"🚗", count:db.vehicles.length },
    { key:"admins",       label:"Admins",       icon:"🛡", count:db.admins.length },
  ];
  const data = db[activeTable] || [];
  const keys = data.length ? Object.keys(data[0]).filter(k => k !== "password") : [];
  const filtered = searchQ ? data.filter(r => JSON.stringify(r).toLowerCase().includes(searchQ.toLowerCase())) : data;
  const stats = { totalRecords:Object.values(db).reduce((a,t)=>a+t.length,0), activeSessions:db.sessions.filter(s=>s.status==="active").length, availablePorts:db.ports.filter(p=>p.status==="available").length, totalRevenue:db.stations.reduce((a,s)=>a+s.revenue,0) };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
        {[["Total Records",stats.totalRecords,"#00f5ff","📦"],["Active Sessions",stats.activeSessions,"#aaff00","⚡"],["Free Ports",stats.availablePorts,"#ffb300","🔌"],["Total Revenue",inr(stats.totalRevenue),"#ff3da0","💰"]].map(([l,v,c,ic])=>(
          <StatCard key={l} label={l} value={v} color={c} icon={ic}/>
        ))}
      </div>
      <div style={{ display:"flex", gap:16 }}>
        <div style={{ width:158, flexShrink:0 }}>
          <div style={S.sectionLabel}>Tables</div>
          {tables.map(t => (
            <div key={t.key} onClick={() => { setActiveTable(t.key); setSearchQ(""); }}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 12px", borderRadius:8, cursor:"pointer", marginBottom:3, background:activeTable===t.key?"rgba(0,229,255,0.08)":"transparent", border:activeTable===t.key?"1px solid rgba(0,229,255,0.2)":"1px solid transparent", color:activeTable===t.key?"#00f5ff":"#7a5fa8", fontSize:12, transition:"all 0.2s" }}>
              <span>{t.icon} {t.label}</span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, background:"rgba(0,0,0,0.3)", padding:"1px 6px", borderRadius:10 }}>{t.count}</span>
            </div>
          ))}
        </div>
        <div style={{ flex:1, ...S.panel }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid #2d1a4a" }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:700, color:"#f0e6ff", textTransform:"uppercase", letterSpacing:1 }}>{tables.find(t=>t.key===activeTable)?.icon} {activeTable.toUpperCase()}</span>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search records…" style={{ ...S.input, width:180, padding:"6px 10px" }}/>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{keys.map(k=><th key={k} style={S.th}>{k}</th>)}</tr></thead>
              <tbody>
                {filtered.map((row,i) => (
                  <tr key={i}>{keys.map(k => <td key={k} style={{ ...S.td, color:k.includes("Id")||k==="id"?"#00f5ff":k==="status"?SC[row[k]]||"#c8b0e8":"#c8b0e8", fontFamily:k.includes("Id")||k==="id"||k.toLowerCase().includes("time")?"'DM Mono',monospace":"inherit", fontSize:k.includes("Id")||k==="id"?11:12 }}>{row[k]!==undefined?String(row[k]):"—"}</td>)}</tr>
                ))}
                {filtered.length===0 && <tr><td colSpan={keys.length} style={{ textAlign:"center", padding:24, color:"#7a5fa8" }}>No matches for "{searchQ}"</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ER SCHEMA ───────────────────────────────────────────────
const ERSchema = () => {
  const [tab, setTab] = useState("er");
  const rels = [
    { e1:"USER",            rel:"OWNS",      e2:"VEHICLE",          card:"1:N", p1:"Partial", p2:"Total", desc:"A user owns zero or more vehicles." },
    { e1:"USER",            rel:"MAKES",     e2:"RESERVATION",      card:"1:N", p1:"Partial", p2:"Total", desc:"Every reservation must have a user." },
    { e1:"USER",            rel:"INITIATES", e2:"CHARGING SESSION", card:"1:N", p1:"Partial", p2:"Total", desc:"Every session must be linked to a user." },
    { e1:"ADMIN",           rel:"MANAGES",   e2:"CHARGING STATION", card:"1:N", p1:"Total",   p2:"Total", desc:"Each admin manages one or more stations." },
    { e1:"CHARGING STATION",rel:"HAS",       e2:"CHARGING PORT",    card:"1:N", p1:"Total",   p2:"Total", desc:"Every port belongs to exactly one station." },
    { e1:"CHARGING PORT",   rel:"RESERVES",  e2:"RESERVATION",      card:"1:N", p1:"Partial", p2:"Total", desc:"Every reservation has a specific port." },
    { e1:"CHARGING PORT",   rel:"USED IN",   e2:"CHARGING SESSION", card:"1:N", p1:"Partial", p2:"Total", desc:"Every session uses exactly one port." },
  ];
  return (
    <div>
      <div style={{ display:"flex", gap:2, borderBottom:"1px solid #2d1a4a", marginBottom:20 }}>
        {[["er","ER Model"],["rel","Relational Schema"],["rels","Relationships"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"9px 18px", background:"none", border:"none", borderBottom:`2px solid ${tab===k?"#00f5ff":"transparent"}`, color:tab===k?"#00f5ff":"#7a5fa8", cursor:"pointer", fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:-1 }}>{l}</button>
        ))}
      </div>
      {tab==="er" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
          <div><div style={S.sectionLabel}>Strong Entities</div>
            {[["USER","user_id(PK)","name, email, phone"],["ADMIN","admin_id(PK)","name, email"],["VEHICLE","v_id(PK)","v_type, batteryKwh, user_id(FK)"],["CHARGING STATION","station_id(PK)","name, location, admin_id(FK)"],["CHARGING PORT","port_id(PK)","type, kw, price, status, station_id(FK)"]].map(([n,pk,at])=>(
              <div key={n} style={{ background:"#100820", border:"1px solid #2d1a4a", borderRadius:9, padding:14, marginBottom:8, fontFamily:"'DM Mono',monospace", fontSize:12, lineHeight:1.9 }}><span style={{ color:"#00f5ff", fontWeight:700 }}>{n}</span><br/><span style={{ color:"#ffb300" }}>{pk}</span>, <span style={{ color:"#c8b0e8" }}>{at}</span></div>
            ))}
          </div>
          <div><div style={S.sectionLabel}>Weak Entities</div>
            {[["RESERVATION","reserve_id(Partial Key)","reserved_date, reserved_time, status, user_id(FK), port_id(FK)","PK = (reserve_id, user_id)"],["CHARGING SESSION","session_id(Partial Key)","start_time, end_time, energy_consumed(P×T), total_cost, user_id(FK), port_id(FK)","PK = (session_id, user_id)"]].map(([n,pk,at,desc])=>(
              <div key={n} style={{ background:"#100820", border:"1px solid rgba(255,112,67,0.35)", borderRadius:9, padding:14, marginBottom:8, fontFamily:"'DM Mono',monospace", fontSize:12, lineHeight:1.9 }}><span style={{ color:"#ff3da0", fontWeight:700 }}>{n} (Weak)</span><br/><span style={{ color:"#ffb300" }}>{pk}</span>, <span style={{ color:"#c8b0e8" }}>{at}</span><div style={{ fontSize:10, color:"#7a5fa8", fontFamily:"'DM Sans',sans-serif", marginTop:6 }}>{desc}</div></div>
            ))}
          </div>
        </div>
      )}
      {tab==="rels" && rels.map(r => (
        <div key={r.rel+r.e1} style={{ display:"flex", flexDirection:"column", gap:6, padding:"12px 16px", background:"#100820", border:"1px solid #2d1a4a", borderRadius:9, marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ color:"#00f5ff", fontFamily:"'DM Mono',monospace", fontSize:11 }}>{r.e1}</span>
            <span style={{ color:"#7a5fa8" }}>──[</span><span style={{ color:"#ffb300", fontSize:11 }}>{r.rel}</span><span style={{ color:"#7a5fa8" }}>]──</span>
            <span style={{ color:"#00f5ff", fontFamily:"'DM Mono',monospace", fontSize:11 }}>{r.e2}</span>
            <span style={{ marginLeft:"auto", background:"rgba(255,215,64,0.1)", color:"#ffb300", padding:"2px 8px", borderRadius:4, fontSize:10, fontFamily:"'DM Mono',monospace" }}>{r.card}</span>
          </div>
          <div style={{ fontSize:11, color:"#7a5fa8" }}>{r.desc}</div>
        </div>
      ))}
    </div>
  );
};

// ─── ADMIN PAGES ─────────────────────────────────────────────
const PageAdminStations = ({ db, refreshDb, setModal, toast, setStationPanelStation, stationPanelStation, setSelectedStation }) => {

  const [tab, setTab] = useState("list");

  const [form, setForm] = useState({
    name:"",
    location:"",
    ports:"4",
    chargerType:"Super"
  });

  useEffect(() => {
  const handler = (e) => {
    setSelectedCoords(e.detail);
    console.log("Selected:", e.detail);
  };

  window.addEventListener("mapClick", handler);

  return () => window.removeEventListener("mapClick", handler);
}, []);

  // ✅ NEW (important)
  const [selectedCoords, setSelectedCoords] = useState(null);

  const stPorts = (sid) => db.ports.filter(p => p.stationId === sid);

  const deploy = async () => {
  if (!form.name || !form.location) {
    toast("Fill all required fields","error");
    return;
  }

  // ✅ Use clicked location OR default
  const lat = selectedCoords?.lat || 13.0827;
  const lng = selectedCoords?.lng || 80.2707;

  const res = await api.post("/stations", {
    name: form.name,
    location: form.location,
    lat,
    lng,
    ports: form.ports,
    chargerType: form.chargerType
  });

  if (res.error) {
    toast(res.error, "error");
    return;
  }

  await refreshDb();

  toast(`Station "${form.name}" deployed!`,"success","🏗️");

  setForm({ name:"", location:"", ports:"4", chargerType:"Super" });
  setSelectedCoords(null);
  setTab("list");
};

  const removeStation = (stid) => {
    const st = db.stations.find(s => s.id === stid);
    setModal(<ConfirmModal title="Remove Station" msg={<>Remove <b>{st?.name}</b>?</>} danger onConfirm={async () => {
      await api.del(`/stations/${stid}`);
      await refreshDb();
      toast("Station removed","warning","🗑️");
      setStationPanelStation(null);
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  const togglePort = async (pid, ns) => {
    await api.patch(`/ports/${pid}/status`, { status: ns });
    await refreshDb();
    toast(`Port ${pid} → ${ns}`,"info","🔧");
  };

  return (
    <div>
      <div style={{ display:"flex", gap:2, borderBottom:"1px solid #2d1a4a", marginBottom:20 }}>
        {[["list","All Stations"],["add","+ Deploy New"],["map","📍 Map View"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding:"9px 18px", background:"none", border:"none", borderBottom:`2px solid ${tab===k?"#00f5ff":"transparent"}`, color:tab===k?"#00f5ff":"#7a5fa8", cursor:"pointer", fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:-1 }}>{l}</button>
        ))}
      </div>
      {tab==="list" && (
        <div style={S.panel}>
          <PanelHead title={`All Stations (${db.stations.length})`} right={<Btn variant="ghost" onClick={() => toast("CSV exported","info","📤")}>Export CSV</Btn>}/>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["ID","Name","Location","Ports","Available","Revenue","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {db.stations.map(s => {
                const sps = stPorts(s.id); const av = sps.filter(p => p.status==="available").length;
                return (
                  <tr key={s.id}>
                    <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{s.id}</td>
                    <td style={{ ...S.td, color:"#f0e6ff", fontWeight:500 }}>{s.name}</td>
                    <td style={{ ...S.td, color:"#7a5fa8" }}>{s.location}</td>
                    <td style={S.td}>{sps.length}</td>
                    <td style={{ ...S.td, color:"#aaff00" }}>{av}/{sps.length}</td>
                    <td style={S.td}>{inr(s.revenue)}</td>
                    <td style={S.td}><Badge status="online"/></td>
                    <td style={S.td}><Btn variant="secondary" style={{ padding:"5px 12px", fontSize:10 }} onClick={() => { setStationPanelStation(s); setSelectedStation(s); setTab("map"); }}>Manage</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab==="add" && (
        <div style={{ maxWidth:500, ...S.panel }}>
          <PanelHead title="Deploy New Station"/>
          <div style={{ padding:20 }}>
            {[["Station Name *","name","text","e.g. EVGRID North Hub"],["Location *","location","text","e.g. Adyar, Chennai"]].map(([l,k,t,ph]) => (
              <div key={k} style={{ marginBottom:14 }}>
                <label style={S.label}>{l}</label>
                <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]:e.target.value }))} type={t} placeholder={ph} style={S.input}/>
              </div>
            ))}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div><label style={S.label}>Ports</label><input value={form.ports} onChange={e => setForm(f => ({ ...f, ports:e.target.value }))} type="number" min="1" max="12" style={S.input}/></div>
              <div><label style={S.label}>Charger Type</label><select value={form.chargerType} onChange={e => setForm(f => ({ ...f, chargerType:e.target.value }))} style={S.select}><option>Super</option><option>Regular</option></select></div>
            </div>
            <div style={{ display:"flex", gap:10 }}><Btn variant="primary" onClick={deploy}>🚀 Deploy Station</Btn><Btn variant="secondary" onClick={() => setTab("list")}>Cancel</Btn></div>
          </div>
        </div>
      )}
      {tab==="map" && (
        <div>
          <div style={{ height:420, borderRadius:14, overflow:"hidden", marginBottom:18, border:"1px solid #2d1a4a" }}>
            <ChennaiMap stations={db.stations} ports={db.ports} selectedStation={stationPanelStation} isAdmin sessions={db.sessions} admins={db.admins} onStationClick={st => { setSelectedStation(st); setStationPanelStation(st); }}/>
          </div>
          {stationPanelStation ? (() => {
            const st  = db.stations.find(s => s.id === stationPanelStation.id);
            const sps = stPorts(st.id);
            return (
              <div style={{ ...S.card, border:"1px solid rgba(0,229,255,0.3)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:"#f0e6ff" }}>📍 {st.name}</div><div style={{ fontSize:11, color:"#7a5fa8", marginTop:2 }}>{st.location}</div></div>
                  <div style={{ display:"flex", gap:8 }}><Btn variant="danger" onClick={() => removeStation(st.id)}>Remove</Btn><Btn variant="secondary" onClick={() => setStationPanelStation(null)}>✕</Btn></div>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {sps.map(p => (
                    <div key={p.id} style={{ background:"#070f1a", border:`1px solid ${SC[p.status]}22`, borderRadius:9, padding:"10px 14px", minWidth:150 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#00f5ff" }}>{p.id}</span><Badge status={p.status}/></div>
                      <div style={{ fontSize:11, color:"#c8b0e8", marginBottom:8 }}>{p.type} · {p.kw}kW · ₹{p.price}/kWh</div>
                      {p.status==="available" && <Btn variant="danger" style={{ padding:"4px 10px", fontSize:9 }} onClick={() => togglePort(p.id,"offline")}>Set Offline</Btn>}
                      {p.status==="offline"   && <Btn variant="green"  style={{ padding:"4px 10px", fontSize:9 }} onClick={() => togglePort(p.id,"available")}>Restore</Btn>}
                      {p.status==="busy"      && <span style={{ fontSize:10, color:"#00f5ff" }}>⚡ In use</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : <div style={{ textAlign:"center", padding:28, color:"#7a5fa8", fontSize:13 }}>👆 Click a station pin on the map to manage it</div>}
        </div>
      )}
    </div>
  );
};

const PageAdminSessions = ({ db, refreshDb, setModal, toast, userName, stName }) => {
  const [search, setSearch] = useState("");
  const active   = db.sessions.filter(s => s.status==="active");
  const filtered = search ? db.sessions.filter(s => JSON.stringify(s).toLowerCase().includes(search.toLowerCase())) : db.sessions;

  const endSession = (sid) => {
    const s = db.sessions.find(x => x.id === sid);
    setModal(<ConfirmModal title="Force End Session" msg={<>End <b>{sid}</b>? Final: <b>{inr(s?.cost||0)}</b></>} danger onConfirm={async () => {
      await api.patch(`/sessions/${sid}/end`, {});
      await refreshDb();
      toast(`Session ${sid} ended`,"warning","⛔");
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ fontSize:11, color:"#7a5fa8", marginBottom:16, fontFamily:"'DM Mono',monospace" }}>● LIVE · <span style={{ color:"#00f5ff" }}>{active.length} active sessions</span></div>
      {active.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
          {active.map(s => (
            <div key={s.id} style={{ ...S.card, borderLeft:"3px solid #00f5ff" }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#00f5ff", marginBottom:6 }}>{s.id}</div>
              <div style={{ fontSize:13, color:"#f0e6ff", fontWeight:500, marginBottom:3 }}>{userName(s.userId)}</div>
              <div style={{ fontSize:11, color:"#7a5fa8", marginBottom:10 }}>{stName(s.stationId)} · {s.portId}</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#7a5fa8", marginBottom:10 }}><span>Started {s.startTime}</span><span style={{ color:"#00f5ff" }}>{s.energy} kWh · {inr(s.cost)}</span></div>
              <Btn variant="danger" style={{ width:"100%", padding:7, fontSize:10 }} onClick={() => endSession(s.id)}>⏹ Force End</Btn>
            </div>
          ))}
        </div>
      )}
      <div style={S.panel}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid #2d1a4a" }}>
          <span style={{ fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, color:"#f0e6ff", textTransform:"uppercase", letterSpacing:1 }}>All Sessions ({db.sessions.length})</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...S.input, width:180, padding:"6px 10px" }}/>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["Session ID","User","Station","Port","Start","End","kWh","Cost","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{s.id}</td>
                <td style={S.td}>{userName(s.userId)}</td>
                <td style={{ ...S.td, color:"#7a5fa8", fontSize:11 }}>{stName(s.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{s.portId}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.startTime}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.endTime}</td>
                <td style={{ ...S.td, color:"#00f5ff" }}>{s.energy}</td>
                <td style={S.td}>{inr(s.cost)}</td>
                <td style={S.td}><Badge status={s.status}/></td>
                <td style={S.td}>{s.status==="active" ? <Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => endSession(s.id)}>End</Btn> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageAdminReservations = ({ db, refreshDb, setModal, toast, userName, stName }) => {
  const [uid,  setUid]  = useState(db.users[0]?.id||"");
  const [stid, setStid] = useState(db.stations[0]?.id||"");
  const [pid,  setPid]  = useState(db.ports.find(p => p.stationId===db.stations[0]?.id)?.id||"");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const stPorts = db.ports.filter(p => p.stationId === stid);

  const confirm = async () => {
    if (!date || !time) { toast("Select date and time","error"); return; }
    const rv = await api.post("/reservations", { userId:uid, portId:pid, stationId:stid, date, time });
    await refreshDb();
    toast(`Reservation ${rv.id} confirmed`,"success","📅");
    setDate(""); setTime("");
  };

  const cancel = (rid) => {
    const r = db.reservations.find(x => x.id === rid);
    setModal(<ConfirmModal title="Cancel Reservation" msg={<>Cancel <b>{rid}</b> for <b>{userName(r?.userId)}</b>?</>} danger onConfirm={async () => {
      await api.patch(`/reservations/${rid}/cancel`, {});
      await refreshDb();
      toast(`${rid} cancelled`,"warning","📅");
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:18 }}>
      <div style={{ ...S.panel, alignSelf:"start" }}>
        <PanelHead title="New Reservation"/>
        <div style={{ padding:20 }}>
          <div style={{ marginBottom:14 }}><label style={S.label}>User</label>
            <select value={uid} onChange={e => setUid(e.target.value)} style={S.select}>{db.users.map(u => <option key={u.id} value={u.id}>{u.id} — {u.name}</option>)}</select>
          </div>
          <div style={{ marginBottom:14 }}><label style={S.label}>Station</label>
            <select value={stid} onChange={e => { setStid(e.target.value); setPid(db.ports.find(p => p.stationId===e.target.value)?.id||""); }} style={S.select}>{db.stations.map(s => <option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}</select>
          </div>
          <div style={{ marginBottom:14 }}><label style={S.label}>Port</label>
            <select value={pid} onChange={e => setPid(e.target.value)} style={S.select}>{stPorts.map(p => <option key={p.id} value={p.id}>{p.id} — {p.type} {p.kw}kW · {p.status}</option>)}</select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div><label style={S.label}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.input}/></div>
            <div><label style={S.label}>Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} style={S.input}/></div>
          </div>
          <Btn variant="primary" onClick={confirm}>📅 Confirm Reservation</Btn>
        </div>
      </div>
      <div style={S.panel}>
        <PanelHead title={`All Reservations (${db.reservations.length})`}/>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["ID","User","Station","Port","Date/Time","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {db.reservations.map(r => (
              <tr key={r.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{r.id}</td>
                <td style={S.td}>{userName(r.userId)}</td>
                <td style={{ ...S.td, color:"#7a5fa8", fontSize:11 }}>{stName(r.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{r.portId}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#c8b0e8" }}>{r.datetime}</td>
                <td style={S.td}><Badge status={r.status}/></td>
                <td style={S.td}>{r.status==="pending" && <Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => cancel(r.id)}>Cancel</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageAdminUsers = ({ db, refreshDb, setModal, toast }) => {
  const [search, setSearch] = useState("");
  const filtered = search ? db.users.filter(u => JSON.stringify(u).toLowerCase().includes(search.toLowerCase())) : db.users;

  const showUser = (u) => {
    const uSess = db.sessions.filter(s => s.userId === u.id);
    const uRes  = db.reservations.filter(r => r.userId===u.id && r.status==="pending");
    const toggle = async () => {
      await api.patch(`/users/${u.id}/status`, { status: u.status==="active" ? "inactive" : "active" });
      await refreshDb();
      toast(`${u.name} toggled`,"info","👤");
      setModal(null);
    };
    setModal(
      <Modal title={`👤 ${u.name}`} subtitle={u.id} onClose={() => setModal(null)}
        footer={[<Btn key="tog" variant={u.status==="active"?"danger":"green"} onClick={toggle}>{u.status==="active"?"Deactivate":"Activate"}</Btn>,<Btn key="cl" variant="primary" onClick={() => setModal(null)}>Close</Btn>]}>
        <InfoRow label="Email"              value={u.email}/>
        <InfoRow label="Phone"              value={u.phone}/>
        <InfoRow label="Vehicles"           value={u.vehicles}/>
        <InfoRow label="Total Sessions"     value={uSess.length}/>
        <InfoRow label="Pending Reservations" value={uRes.length}/>
        <InfoRow label="Total Spent"        value={inr(uSess.reduce((a,s) => a+s.cost, 0))} valueStyle={{ color:"#aaff00", fontWeight:700 }}/>
        <InfoRow label="Status"             value={<Badge status={u.status}/>}/>
      </Modal>
    );
  };

  const addUser = () => {
    let name="", email="", phone="";
    const submit = async () => {
      if (!name || !email) { toast("Name and email required","error"); return; }
      await api.post("/users", { name, email, phone });
      await refreshDb();
      toast(`"${name}" added`,"success","👤");
      setModal(null);
    };
    setModal(
      <Modal title="➕ Add New User" onClose={() => setModal(null)}
        footer={[<Btn key="cancel" variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>,<Btn key="add" variant="primary" onClick={submit}>Add User</Btn>]}>
        {[["Full Name","text",v=>name=v,"e.g. Priya Sharma"],["Email","email",v=>email=v,"priya@example.com"],["Phone","text",v=>phone=v,"98XXX XXXXX"]].map(([l,t,cb,ph]) => (
          <div key={l} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input type={t} onChange={e => cb(e.target.value)} placeholder={ph} style={S.input}/></div>
        ))}
      </Modal>
    );
  };

  return (
    <div style={S.panel}>
      <PanelHead title={`Users (${db.users.length})`} right={
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...S.input, width:180, padding:"6px 10px" }}/>
          <Btn variant="primary" style={{ padding:"7px 16px" }} onClick={addUser}>+ Add User</Btn>
        </div>
      }/>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead><tr>{["ID","Name","Email","Phone","Vehicles","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id}>
              <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{u.id}</td>
              <td style={{ ...S.td, color:"#f0e6ff", fontWeight:500 }}>{u.name}</td>
              <td style={{ ...S.td, color:"#7a5fa8" }}>{u.email}</td>
              <td style={S.td}>{u.phone}</td>
              <td style={S.td}>{u.vehicles}</td>
              <td style={S.td}><Badge status={u.status}/></td>
              <td style={S.td}><Btn variant="secondary" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => showUser(u)}>View</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PageAdminBilling = ({ db, setModal, toast, userName, stName }) => {
  const bill     = db.sessions.filter(s => s.status==="completed" || s.status==="active");
  const totalRev = bill.reduce((a,s) => a+s.cost, 0);
  const invoice  = (s) => {
    setModal(
      <Modal title={`🧾 Invoice — ${s.id}`} onClose={() => setModal(null)}
        footer={[<Btn key="cl" variant="secondary" onClick={() => setModal(null)}>Close</Btn>,<Btn key="dl" variant="primary" onClick={() => { toast("Invoice downloaded","success","📄"); setModal(null); }}>Download PDF</Btn>]}>
        <div style={{ background:"#100820", borderRadius:10, padding:16 }}>
          <InfoRow label="User"     value={userName(s.userId)}/>
          <InfoRow label="Station"  value={stName(s.stationId)}/>
          <InfoRow label="Port"     value={s.portId}/>
          <InfoRow label="Power"    value={`${s.power} kW`}/>
          <InfoRow label="Duration" value={s.duration}/>
          <InfoRow label="Energy"   value={`${s.energy} kWh`} valueStyle={{ color:"#00f5ff" }}/>
          <InfoRow label="Rate"     value="₹18/kWh"/>
          <div style={{ borderTop:"1px solid #2d1a4a", marginTop:8, paddingTop:10 }}>
            <InfoRow label="Total" value={inr(s.cost)} valueStyle={{ color:"#aaff00", fontSize:20, fontWeight:800 }}/>
          </div>
        </div>
      </Modal>
    );
  };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Monthly Revenue" value="₹3.24L"        color="#00f5ff" icon="💰"/>
        <StatCard label="Avg Session"     value="₹247"          color="#aaff00" icon="📊"/>
        <StatCard label="Shown Revenue"   value={inr(totalRev)} color="#ff3da0" icon="🧾"/>
        <StatCard label="Active Sessions" value={String(db.sessions.filter(s=>s.status==="active").length)} color="#ffb300" icon="⚡"/>
      </div>
      <div style={S.panel}>
        <PanelHead title="Billing Records — Energy = Power × Duration" right={<Btn variant="ghost" onClick={() => toast("Downloading CSV…","info","📤")}>Download CSV</Btn>}/>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["Session ID","User","Station","Duration","Power(kW)","Energy(kWh)","Rate","Total","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {bill.map(s => (
              <tr key={s.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{s.id}</td>
                <td style={S.td}>{userName(s.userId)}</td>
                <td style={{ ...S.td, color:"#7a5fa8", fontSize:11 }}>{stName(s.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.duration}</td>
                <td style={S.td}>{s.power}</td>
                <td style={{ ...S.td, color:"#00f5ff" }}>{s.energy}</td>
                <td style={S.td}>₹18</td>
                <td style={{ ...S.td, color:"#aaff00", fontWeight:700 }}>{inr(s.cost)}</td>
                <td style={S.td}><Badge status={s.status}/></td>
                <td style={S.td}><Btn variant="secondary" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => invoice(s)}>Invoice</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageAdminDashboard = ({ db, refreshDb, revCounter, setModal, toast, setSelectedStation, setStationPanelStation, stationPanelStation }) => {
  const activeSessions = db.sessions.filter(s => s.status==="active");
  const avPorts = db.ports.filter(p => p.status==="available").length;
  const buPorts = db.ports.filter(p => p.status==="busy").length;
  const rePorts = db.ports.filter(p => p.status==="reserved").length;
  const ofPorts = db.ports.filter(p => p.status==="offline").length;
  const util    = Math.round((buPorts+rePorts)/db.ports.length*100);
  const bars    = [12,8,5,4,9,22,45,68,72,65,58,70,84,88,76,69,74,80,72,60,45,38,28,18];
  const bmax    = Math.max(...bars);

  const togglePort = async (pid, ns) => {
    await api.patch(`/ports/${pid}/status`, { status: ns });
    await refreshDb();
    toast(`Port ${pid} → ${ns}`,"info","🔧");
  };
  const removeStation = (stid) => {
    const st = db.stations.find(s => s.id === stid);
    setModal(<ConfirmModal title="Remove Station" msg={<>Remove <b>{st?.name}</b>?</>} danger onConfirm={async () => {
      await api.del(`/stations/${stid}`);
      await refreshDb();
      toast("Station removed","warning","🗑️");
      setStationPanelStation(null);
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Total Stations"   value={db.stations.length}                                    color="#00f5ff" icon="🏗"/>
        <StatCard label="Active Sessions"  value={activeSessions.length}                                  color="#aaff00" icon="⚡"/>
        <StatCard label="Revenue Today"    value={`₹${revCounter.toLocaleString("en-IN")}`}               color="#ff3da0" icon="💰"/>
        <StatCard label="Energy Delivered" value="847 kWh"                                                color="#ffb300" icon="🔋"/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:18, marginBottom:18 }}>
        <div style={S.panel}>
          <PanelHead title="Station Network Map"/>
          <div style={{ height:310 }}>
            <ChennaiMap stations={db.stations} ports={db.ports} selectedStation={stationPanelStation} isAdmin sessions={db.sessions} admins={db.admins} onStationClick={st => { setSelectedStation(st); setStationPanelStation(st); }}/>
          </div>
        </div>
        <div style={S.panel}>
          <PanelHead title="Activity Feed"/>
          <div style={{ overflowY:"auto", maxHeight:350 }}>
            {[["⚡","Arjun Menon started charging at ST001·P002","09:14","rgba(0,229,255,0.1)"],["📅","Divya Sharma reserved ST003·P013 for 16:30","09:02","rgba(255,215,64,0.1)"],["✓","Shreya Iyer completed — 31.5 kWh · ₹567","10:10","rgba(5,240,160,0.1)"],["⚠","Port ST002·P010 went offline","10:05","rgba(255,82,82,0.1)"],["⚡","Rahul Nair started at ST006·P022","11:05","rgba(0,229,255,0.1)"]].map(([ic,tx,ti,bg],i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 16px", borderBottom:"1px solid rgba(45,26,74,0.4)" }}>
                <div style={{ width:30, height:30, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, background:bg, flexShrink:0 }}>{ic}</div>
                <div><div style={{ fontSize:12, color:"#c8b0e8", marginBottom:2 }}>{tx}</div><div style={{ fontSize:10, color:"#7a5fa8", fontFamily:"'DM Mono',monospace" }}>{ti}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {stationPanelStation && (() => {
        const st  = db.stations.find(s => s.id === stationPanelStation.id);
        const sps = db.ports.filter(p => p.stationId === st.id);
        return (
          <div style={{ ...S.card, border:"1px solid rgba(0,229,255,0.3)", marginBottom:18 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
              <div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:"#f0e6ff" }}>📍 {st.name}</div><div style={{ fontSize:11, color:"#7a5fa8", marginTop:2 }}>{st.location}</div></div>
              <div style={{ display:"flex", gap:8 }}><Btn variant="danger" onClick={() => removeStation(st.id)}>Remove</Btn><Btn variant="secondary" onClick={() => setStationPanelStation(null)}>✕</Btn></div>
            </div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {sps.map(p => (
                <div key={p.id} style={{ background:"#070f1a", border:`1px solid ${SC[p.status]}22`, borderRadius:9, padding:"10px 14px", minWidth:150 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#00f5ff" }}>{p.id}</span><Badge status={p.status}/></div>
                  <div style={{ fontSize:11, color:"#c8b0e8", marginBottom:8 }}>{p.type} · {p.kw}kW · ₹{p.price}/kWh</div>
                  {p.status==="available" && <Btn variant="danger" style={{ padding:"4px 10px", fontSize:9 }} onClick={() => togglePort(p.id,"offline")}>Set Offline</Btn>}
                  {p.status==="offline"   && <Btn variant="green"  style={{ padding:"4px 10px", fontSize:9 }} onClick={() => togglePort(p.id,"available")}>Restore</Btn>}
                  {p.status==="busy"      && <span style={{ fontSize:10, color:"#00f5ff" }}>⚡ In use</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:18 }}>
        <div style={S.panel}>
          <PanelHead title="Hourly Energy (kWh)"/>
          <div style={{ padding:16, display:"flex", alignItems:"flex-end", gap:4, height:130 }}>
            {bars.map((v,i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", gap:3, height:"100%" }}>
                <div style={{ width:"100%", borderRadius:"3px 3px 0 0", background:"linear-gradient(180deg,#00f5ff,rgba(0,229,255,0.2))", height:`${(v/bmax)*100}px` }} title={`${v} kWh`}/>
                {i%6===0 && <div style={{ fontSize:9, color:"#7a5fa8", fontFamily:"'DM Mono',monospace" }}>{String(i).padStart(2,"0")}h</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={S.panel}>
          <PanelHead title="Port Utilization"/>
          <div style={{ padding:16 }}>
            <div style={{ textAlign:"center", marginBottom:12 }}>
              <svg width="140" height="90" viewBox="0 0 140 90">
                <defs><linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#00f5ff"/><stop offset="100%" stopColor="#aaff00"/></linearGradient></defs>
                <path d="M15 85 A55 55 0 0 1 125 85" fill="none" stroke="#2d1a4a" strokeWidth="10" strokeLinecap="round"/>
                <path d="M15 85 A55 55 0 0 1 125 85" fill="none" stroke="url(#gg)" strokeWidth="10" strokeLinecap="round" strokeDasharray="172" strokeDashoffset={172-172*(util/100)}/>
                <text x="70" y="74" textAnchor="middle" fill="#f0e6ff" fontFamily="Syne" fontSize="22" fontWeight="800">{util}%</text>
                <text x="70" y="87" textAnchor="middle" fill="#7a5fa8" fontSize="9">UTILIZATION</text>
              </svg>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {[["Available",avPorts,"#aaff00"],["Busy",buPorts,"#00f5ff"],["Reserved",rePorts,"#ffb300"],["Offline",ofPorts,"#7a5fa8"]].map(([l,v,c]) => (
                <div key={l} style={{ background:"#070f1a", borderRadius:8, padding:8, textAlign:"center" }}><div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:c }}>{v}</div><div style={{ fontSize:9, color:"#7a5fa8", textTransform:"uppercase", letterSpacing:1 }}>{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── USER PAGES ──────────────────────────────────────────────
const PageUserOverview = ({ db, refreshDb, currentUser, setPage, setModal, toast }) => {
  const uid     = currentUser.id;
  const u       = db.users.find(x => x.id === uid);
  const mySess  = db.sessions.filter(s => s.userId === uid);
  const activeS = mySess.filter(s => s.status === "active");
  const totalE  = mySess.reduce((a,s) => a+s.energy, 0);
  const totalC  = mySess.reduce((a,s) => a+s.cost, 0);
  const initials = currentUser.name.split(" ").map(n=>n[0]).join("");
  const stName  = id => db.stations.find(s => s.id===id)?.name || id;

  const endSession = (sid) => {
    const s = db.sessions.find(x => x.id === sid);
    setModal(<ConfirmModal title="End Session" msg={<>End <b>{sid}</b>? Bill: <b>{inr(s?.cost||0)}</b></>} danger={false} onConfirm={async () => {
      await api.patch(`/sessions/${sid}/end`, {});
      await refreshDb();
      toast(`Session ended · ${inr(s?.cost||0)}`,"success","✅");
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:"#110920", border:"1px solid #2d1a4a", borderRadius:16, padding:28, marginBottom:20, display:"flex", alignItems:"center", gap:24 }}>
        <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,rgba(0,229,255,0.3),rgba(0,229,255,0.05))", border:"2px solid rgba(0,229,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:"#00f5ff", flexShrink:0 }}>{initials}</div>
        <div style={{ flex:1 }}><div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#f0e6ff", marginBottom:4 }}>{currentUser.name}</div><div style={{ fontSize:12, color:"#7a5fa8" }}>{currentUser.email} · <Badge status="active"/></div></div>
        <div style={{ display:"flex", gap:20 }}>
          {[["Vehicles",u?.vehicles||0],["Sessions",mySess.length],["Spent",inr(totalC)]].map(([l,v]) => (
            <div key={l} style={{ textAlign:"center" }}><div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#f0e6ff" }}>{v}</div><div style={{ fontSize:9, color:"#7a5fa8", letterSpacing:1.5, textTransform:"uppercase", marginTop:2 }}>{l}</div></div>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:20 }}>
        <div>
          <div style={S.sectionLabel}>Current Session</div>
          {activeS.length ? activeS.map(s => (
            <div key={s.id} style={{ ...S.card, borderLeft:"3px solid #00f5ff", marginBottom:10 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#00f5ff", marginBottom:6 }}>{s.id}</div>
              <div style={{ fontSize:13, color:"#f0e6ff", fontWeight:500, marginBottom:3 }}>⚡ Charging in Progress</div>
              <div style={{ fontSize:11, color:"#7a5fa8", marginBottom:10 }}>{stName(s.stationId)} · {s.portId}</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#7a5fa8", marginBottom:12 }}><span>Started {s.startTime}</span><span style={{ color:"#00f5ff" }}>{s.energy} kWh · {inr(s.cost)}</span></div>
              <Btn variant="danger" style={{ width:"100%", padding:7 }} onClick={() => endSession(s.id)}>⏹ End Session</Btn>
            </div>
          )) : (
            <div style={{ ...S.card, textAlign:"center", padding:28 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🔋</div>
              <div style={{ fontSize:13, color:"#7a5fa8", marginBottom:14 }}>No active session</div>
              <Btn variant="primary" onClick={() => setPage("book")}>⚡ Book a Slot</Btn>
            </div>
          )}
        </div>
        <div style={S.panel}>
          <PanelHead title="This Month"/>
          <div style={{ padding:20 }}>
            {[[`${totalE.toFixed(1)} kWh`,"Energy Used",Math.min(90,totalE*2)],[inr(totalC),"Cost Incurred",Math.min(90,totalC/100)],[`${Math.round(totalE*0.15)} kg`,"CO₂ Saved",40]].map(([v,l,p]) => (
              <div key={l} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}><span style={{ color:"#7a5fa8" }}>{l}</span><span style={{ color:"#f0e6ff", fontWeight:500 }}>{v}</span></div>
                <div style={{ height:8, background:"#100820", borderRadius:4, overflow:"hidden" }}><div style={{ height:"100%", borderRadius:4, background:"linear-gradient(90deg,#00f5ff,#aaff00)", width:`${Math.min(100,p)}%` }}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={S.panel}>
        <PanelHead title="Recent Sessions" right={<button onClick={() => setPage("my-sessions")} style={{ color:"#00f5ff", background:"none", border:"none", cursor:"pointer", fontSize:11 }}>View All →</button>}/>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["ID","Station","Start","Energy","Cost","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {mySess.slice(0,4).map(s => (
              <tr key={s.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{s.id}</td>
                <td style={{ ...S.td, fontSize:11 }}>{stName(s.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.startTime}</td>
                <td style={{ ...S.td, color:"#00f5ff" }}>{s.energy} kWh</td>
                <td style={S.td}>{inr(s.cost)}</td>
                <td style={S.td}><Badge status={s.status}/></td>
              </tr>
            ))}
            {mySess.length===0 && <tr><td colSpan={6} style={{ textAlign:"center", padding:20, color:"#7a5fa8" }}>No sessions yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageUserSessions = ({ db, refreshDb, currentUser, setModal, toast }) => {
  const uid   = currentUser.id;
  const sess  = db.sessions.filter(s => s.userId === uid);
  const stName = id => db.stations.find(s => s.id===id)?.name || id;
  const totE  = sess.reduce((a,s) => a+s.energy, 0);
  const totC  = sess.reduce((a,s) => a+s.cost, 0);

  const endSession = (sid) => {
    const s = db.sessions.find(x => x.id === sid);
    setModal(<ConfirmModal title="End Session" msg={<>End <b>{sid}</b>? Bill: <b>{inr(s?.cost||0)}</b></>} danger={false} onConfirm={async () => {
      await api.patch(`/sessions/${sid}/end`, {});
      await refreshDb();
      toast(`Session ended · ${inr(s?.cost||0)}`,"success","✅");
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Total Sessions" value={String(sess.length)}       color="#00f5ff" icon="⚡"/>
        <StatCard label="Energy Used"    value={`${totE.toFixed(1)} kWh`} color="#aaff00" icon="🔋"/>
        <StatCard label="Total Spent"    value={inr(totC)}                 color="#ff3da0" icon="💰"/>
      </div>
      <div style={S.panel}>
        <PanelHead title={`My Sessions (${sess.length})`}/>
        {sess.length===0 ? <div style={{ textAlign:"center", padding:40, color:"#7a5fa8", fontSize:13 }}>No sessions yet</div> : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["ID","Station","Port","Start","End","kWh","Cost","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {sess.map(s => (
                <tr key={s.id}>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#00f5ff" }}>{s.id}</td>
                  <td style={{ ...S.td, fontSize:11 }}>{stName(s.stationId)}</td>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{s.portId}</td>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.startTime}</td>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.endTime}</td>
                  <td style={{ ...S.td, color:"#00f5ff" }}>{s.energy}</td>
                  <td style={S.td}>{inr(s.cost)}</td>
                  <td style={S.td}><Badge status={s.status}/></td>
                  <td style={S.td}>{s.status==="active" ? <Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => endSession(s.id)}>End</Btn> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const PageUserReservations = ({ db, refreshDb, currentUser, setModal, toast }) => {
  const uid    = currentUser.id;
  const myRes  = db.reservations.filter(r => r.userId === uid);
  const stName = id => db.stations.find(s => s.id===id)?.name || id;
  const { loc, status, request } = useGeolocation();
  const [stid, setStid] = useState(db.stations[0]?.id||"");
  const [pid,  setPid]  = useState(db.ports.find(p => p.stationId===db.stations[0]?.id)?.id||"");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const sortedStations = useCallback(() => {
    if (!loc) return db.stations;
    return [...db.stations].sort((a,b) => haversineKm(loc.lat,loc.lng,a.lat,a.lng) - haversineKm(loc.lat,loc.lng,b.lat,b.lng));
  }, [loc, db.stations])();

  useEffect(() => {
    if (!loc) return;
    const nearest = sortedStations[0];
    if (nearest) { setStid(nearest.id); setPid(db.ports.find(p => p.stationId===nearest.id)?.id||""); }
  }, [loc]);

  const stPorts    = db.ports.filter(p => p.stationId === stid);
  const selectedSt = db.stations.find(s => s.id === stid);
  const distKm     = loc && selectedSt ? haversineKm(loc.lat, loc.lng, selectedSt.lat, selectedSt.lng) : null;

  const confirm = async () => {
    if (!date || !time) { toast("Select date and time","error"); return; }
    const rv = await api.post("/reservations", { userId:uid, portId:pid, stationId:stid, date, time });
    await refreshDb();
    toast(`Reservation ${rv.id} confirmed!`,"success","📅");
    setDate(""); setTime("");
  };

  const cancel = (rid) => {
    const r = db.reservations.find(x => x.id === rid);
    setModal(<ConfirmModal title="Cancel Reservation" msg={<>Cancel <b>{rid}</b>?</>} danger onConfirm={async () => {
      await api.patch(`/reservations/${rid}/cancel`, {});
      await refreshDb();
      toast("Reservation cancelled.","warning","📅");
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:status==="granted"?"rgba(0,184,148,0.08)":"rgba(9,132,227,0.06)", border:`1px solid ${status==="granted"?"rgba(0,184,148,0.3)":"rgba(9,132,227,0.2)"}`, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:status==="granted"?"rgba(0,184,148,0.1)":"rgba(9,132,227,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{status==="granted"?"✅":"📍"}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text, marginBottom:2 }}>{status==="granted"?"Location acquired — nearest station pre-selected":"Reserve at the nearest station"}</div>
          <div style={{ fontSize:11, color:C.sub }}>{status==="requesting"?"Getting your location…":status==="denied"?"Location denied.":status==="granted"?"Stations ranked by distance":"Share your location to find the closest charger."}</div>
        </div>
        {status==="idle" && <Btn variant="primary" onClick={request} style={{ flexShrink:0 }}>📍 Locate Me</Btn>}
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20, height:300, boxShadow:"0 4px 20px rgba(26,18,9,0.08)" }}>
        <ChennaiMap stations={db.stations} ports={db.ports} selectedStation={selectedSt} isAdmin={false} sessions={db.sessions} admins={db.admins} userLocation={loc} navTarget={loc && selectedSt ? selectedSt : null} onStationClick={st => { setStid(st.id); setPid(db.ports.find(p => p.stationId===st.id)?.id||""); }}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:18 }}>
        <div style={{ ...S.panel, alignSelf:"start" }}>
          <PanelHead title="New Reservation"/>
          <div style={{ padding:20 }}>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Station {loc?"(by distance)":""}</label>
              <select value={stid} onChange={e => { setStid(e.target.value); setPid(db.ports.find(p => p.stationId===e.target.value)?.id||""); }} style={S.select}>
                {sortedStations.map((s,i) => { const d = loc ? haversineKm(loc.lat,loc.lng,s.lat,s.lng) : null; return <option key={s.id} value={s.id}>{i===0&&loc?"⭐ ":""}{s.name}{d!==null?` (${d.toFixed(1)}km)`:""}</option>; })}
              </select>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Port</label>
              <select value={pid} onChange={e => setPid(e.target.value)} style={S.select}>{stPorts.map(p => <option key={p.id} value={p.id}>{p.id} — {p.type} {p.kw}kW · ₹{p.price}/kWh · {p.status}</option>)}</select>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div><label style={S.label}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.input}/></div>
              <div><label style={S.label}>Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} style={S.input}/></div>
            </div>
            <Btn variant="primary" onClick={confirm}>📅 Confirm Reservation</Btn>
          </div>
        </div>
        <div style={S.panel}>
          <PanelHead title={`My Reservations (${myRes.length})`}/>
          {myRes.length===0 ? <div style={{ textAlign:"center", padding:40, color:C.sub, fontSize:13 }}>No reservations yet</div> : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["ID","Station","Port","Date/Time","Status","Nav",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {myRes.map(r => {
                  const st = db.stations.find(s => s.id===r.stationId);
                  return (
                    <tr key={r.id}>
                      <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{r.id}</td>
                      <td style={{ ...S.td, fontSize:11 }}>{stName(r.stationId)}</td>
                      <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{r.portId}</td>
                      <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sub }}>{r.datetime}</td>
                      <td style={S.td}><Badge status={r.status}/></td>
                      <td style={S.td}>{st && <a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" style={{ color:C.sky, fontSize:10, fontWeight:700, textDecoration:"none" }}>↗ Maps</a>}</td>
                      <td style={S.td}>{r.status==="pending" && <Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => cancel(r.id)}>Cancel</Btn>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const PageUserBook = ({ db, refreshDb, currentUser, setModal, toast, setPage }) => {
  const { loc, status, request } = useGeolocation();
  const [stid, setStid] = useState("");
  const [pid,  setPid]  = useState("");

  const sortedStations = useCallback(() => {
    if (!loc) return db.stations;
    return [...db.stations].sort((a,b) => haversineKm(loc.lat,loc.lng,a.lat,a.lng) - haversineKm(loc.lat,loc.lng,b.lat,b.lng));
  }, [loc, db.stations])();

  useEffect(() => {
    if (!loc || stid) return;
    const nearest = sortedStations.find(s => db.ports.some(p => p.stationId===s.id && p.status==="available"));
    if (nearest) { setStid(nearest.id); toast(`📍 Nearest station: ${nearest.name}`,"success","🎯"); }
  }, [loc]);

  const selectedSt = db.stations.find(s => s.id === stid);
  const availPorts = db.ports.filter(p => p.stationId===stid && p.status==="available");
  const selPort    = db.ports.find(p => p.id === pid);
  const distKm     = loc && selectedSt ? haversineKm(loc.lat,loc.lng,selectedSt.lat,selectedSt.lng) : null;

  const book = (sid, portId) => {
    const st = db.stations.find(s => s.id === sid);
    const p  = db.ports.find(x => x.id === portId);
    setModal(<ConfirmModal title="Start Charging?" msg={<>Start at <b>{st?.name}</b>, Port <b>{portId}</b> ({p?.kw}kW)?</>} danger={false} onConfirm={async () => {
      await api.post("/sessions", { userId:currentUser.id, portId, stationId:sid });
      await refreshDb();
      toast(`Charging started at ${st?.name} ⚡`,"success","⚡");
      setModal(null);
      setPage("my-sessions");
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:status==="granted"?"rgba(0,184,148,0.08)":"rgba(255,107,53,0.06)", border:`1px solid ${status==="granted"?"rgba(0,184,148,0.3)":"rgba(255,107,53,0.25)"}`, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:status==="granted"?"rgba(0,184,148,0.12)":"rgba(255,107,53,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{status==="granted"?"✅":"📍"}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text, marginBottom:2 }}>{status==="granted"?"Location acquired — stations sorted by distance":"Find the nearest charger to you"}</div>
          <div style={{ fontSize:11, color:C.sub }}>{status==="requesting"?"Getting your location…":status==="denied"?"Location denied.":status==="granted"?"Nearest available station highlighted":"Share your location to auto-suggest the closest available station."}</div>
        </div>
        {status==="idle" && <Btn variant="primary" onClick={request} style={{ flexShrink:0 }}>📍 Use My Location</Btn>}
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20, height:340, boxShadow:"0 4px 20px rgba(26,18,9,0.08)" }}>
        <ChennaiMap stations={db.stations} ports={db.ports} selectedStation={selectedSt} isAdmin={false} sessions={db.sessions} admins={db.admins} userLocation={loc} navTarget={loc && selectedSt ? selectedSt : null} onStationClick={st => { setStid(st.id); setPid(""); }}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:18, alignItems:"start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {sortedStations.map((s, idx) => {
            const av = db.ports.filter(p => p.stationId===s.id && p.status==="available").length;
            const dist = loc ? haversineKm(loc.lat,loc.lng,s.lat,s.lng) : null;
            const isSel = stid === s.id;
            return (
              <div key={s.id} onClick={() => { setStid(s.id); setPid(""); }}
                style={{ background:isSel?"rgba(0,184,148,0.06)":C.surface, border:`2px solid ${isSel?C.teal:C.border}`, borderRadius:14, padding:"12px 16px", cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:av>0?"rgba(0,184,148,0.1)":"rgba(232,67,147,0.08)", border:`1.5px solid ${av>0?"rgba(0,184,148,0.3)":"rgba(232,67,147,0.2)"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, fontWeight:800, color:av>0?C.teal:C.coral }}>{av}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text, marginBottom:3 }}>{s.name}{loc&&idx===0?<span style={{ marginLeft:8, fontSize:8, color:C.orange, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Nearest</span>:null}</div>
                    <div style={{ fontSize:11, color:C.sub }}>📍 {s.location} · {av} free port{av!==1?"s":""}</div>
                  </div>
                  {dist !== null && <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:800, color:dist<3?C.teal:dist<8?C.amber:C.dim }}>{dist.toFixed(1)}<span style={{ fontSize:10, fontWeight:400 }}> km</span></div>}
                  {isSel && <div style={{ width:8, height:8, borderRadius:"50%", background:C.teal, flexShrink:0 }}/>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ ...S.panel, alignSelf:"start" }}>
          <PanelHead title="⚡ Book Now"/>
          <div style={{ padding:18 }}>
            {selectedSt ? (
              <>
                <div style={{ background:"rgba(0,184,148,0.06)", border:"1px solid rgba(0,184,148,0.2)", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
                  <div style={{ fontSize:12, color:C.text, fontWeight:700, marginBottom:4 }}>{selectedSt.name}</div>
                  {distKm !== null && <div style={{ fontSize:11, color:C.amber, fontWeight:700 }}>📍 {distKm.toFixed(1)} km away</div>}
                </div>
                {availPorts.length > 0 ? (
                  <>
                    <div style={{ marginBottom:14 }}>
                      <label style={S.label}>Select Port</label>
                      <select value={pid} onChange={e => setPid(e.target.value)} style={S.select}>
                        <option value="">-- Choose a port --</option>
                        {availPorts.map(p => <option key={p.id} value={p.id}>{p.id} — {p.type} {p.kw}kW · ₹{p.price}/kWh</option>)}
                      </select>
                    </div>
                    {selPort && (
                      <div style={{ background:"rgba(9,132,227,0.06)", border:"1px solid rgba(9,132,227,0.2)", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                        <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Estimated cost (1h at {selPort.kw}kW)</div>
                        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:20, fontWeight:800, color:C.sky }}>{inr(selPort.price * selPort.kw)}</div>
                      </div>
                    )}
                    <Btn variant="primary" style={{ width:"100%", padding:13 }} disabled={!pid} onClick={() => book(stid, pid)}>⚡ Start Charging</Btn>
                  </>
                ) : (
                  <div style={{ textAlign:"center", padding:20, color:C.coral, fontSize:13, fontWeight:600 }}>No available ports at this station</div>
                )}
              </>
            ) : (
              <div style={{ textAlign:"center", padding:24, color:C.sub, fontSize:13 }}>Select a station to book</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const PageUserFindStations = ({ db, refreshDb, currentUser, setModal, toast }) => {
  const { loc, status, request } = useGeolocation();
  const [selected, setSelected] = useState(null);

  const sortedStations = useCallback(() => {
    if (!loc) return db.stations;
    return [...db.stations].sort((a,b) => haversineKm(loc.lat,loc.lng,a.lat,a.lng) - haversineKm(loc.lat,loc.lng,b.lat,b.lng));
  }, [loc, db.stations])();

  const book = (stid, portId) => {
    const st = db.stations.find(s => s.id === stid);
    const p  = db.ports.find(x => x.id === portId);
    setModal(<ConfirmModal title="Start Charging?" msg={<>Start at <b>{st?.name}</b>, Port <b>{portId}</b> ({p?.kw}kW)?</>} danger={false} onConfirm={async () => {
      await api.post("/sessions", { userId:currentUser.id, portId, stationId:stid });
      await refreshDb();
      toast(`Charging started at ${st?.name} ⚡`,"success","⚡");
      setModal(null);
    }} onClose={() => setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:status==="granted"?"rgba(0,184,148,0.08)":"rgba(255,107,53,0.06)", border:`1px solid ${status==="granted"?"rgba(0,184,148,0.3)":"rgba(255,107,53,0.25)"}`, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ flex:1 }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text }}>{status==="granted"?"Location acquired — stations sorted by distance":"Find stations near you"}</div></div>
        {status==="idle" && <Btn variant="primary" onClick={request} style={{ flexShrink:0 }}>📍 Use My Location</Btn>}
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20, height:360, boxShadow:"0 4px 20px rgba(26,18,9,0.08)" }}>
        <ChennaiMap stations={db.stations} ports={db.ports} selectedStation={selected} isAdmin={false} sessions={db.sessions} admins={db.admins} userLocation={loc} navTarget={loc && selected ? selected : null} onStationClick={st => setSelected(st)}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {sortedStations.map((st, idx) => {
          const sps  = db.ports.filter(p => p.stationId === st.id);
          const av   = sps.filter(p => p.status==="available").length;
          const dist = loc ? haversineKm(loc.lat,loc.lng,st.lat,st.lng) : null;
          const isSel = selected?.id === st.id;
          return (
            <div key={st.id} onClick={() => setSelected(st)}
              style={{ background:C.surface, border:`2px solid ${isSel?C.orange:C.border}`, borderRadius:16, padding:16, cursor:"pointer", transition:"all 0.2s" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:800, color:C.text }}>{st.name}{loc&&idx===0?<span style={{ display:"block", fontSize:8, color:C.orange, fontWeight:700 }}>📍 Nearest</span>:null}</div>
                <Badge status={av>0?"available":"busy"} label={av>0?`${av} free`:"Full"}/>
              </div>
              <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>📍 {st.location}{dist!==null?` · ${dist.toFixed(1)} km`:""}</div>
              <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:12 }}>
                {sps.map(p => <div key={p.id} title={`${p.id} — ${p.status}`} style={{ width:22, height:22, borderRadius:5, background:SB[p.status], border:`1px solid ${SC[p.status]}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:SC[p.status] }}>{p.type[0]}</div>)}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <Btn variant="primary" style={{ flex:1, padding:"7px 0", fontSize:10 }} disabled={av===0} onClick={e => { e.stopPropagation(); const fp=sps.find(p=>p.status==="available"); if(fp) book(st.id,fp.id); }}>⚡ Book</Btn>
                {loc && <a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"7px 10px", borderRadius:9, background:"rgba(9,132,227,0.08)", border:`1px solid rgba(9,132,227,0.2)`, color:C.sky, fontSize:11, fontWeight:700, textDecoration:"none" }}>↗</a>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── LOGIN SCREEN ────────────────────────────────────────────
const LoginScreen = ({ onLogin }) => {
  const [stage, setStage] = useState("splash");
  const [role,  setRole]  = useState(null);
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [error, setError] = useState("");
  const goBack = () => { setStage(s => s==="form"?"roles":"splash"); setError(""); };
  const pickRole = (r) => { setRole(r); setStage("form"); setEmail(""); setPass(""); setError(""); };
  const attempt = async () => {
    const ok = await onLogin(role, email, pass);
    if (!ok) setError("Invalid credentials. Check the demo credentials above.");
  };
  return (
    <div style={{ minHeight:"100vh", background:"#F5F0E8", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');@keyframes slideIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ width:"100%", maxWidth:420, padding:"0 20px" }}>
        <div style={{ background:"#fff", borderRadius:28, padding:40, boxShadow:"0 20px 60px rgba(26,18,9,0.12)", border:"1px solid #E8DDD0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
            <div style={{ width:48, height:48, borderRadius:15, background:ORANGE, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, boxShadow:`0 6px 20px ${ORANGE}44` }}>⚡</div>
            <div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:24, fontWeight:800, color:"#1A1209", letterSpacing:"-0.5px" }}>EV<span style={{ color:ORANGE }}>GRID</span></div><div style={{ fontSize:9, color:"#9D8B79", letterSpacing:2.5, textTransform:"uppercase" }}>EV Infrastructure</div></div>
          </div>
          {stage==="splash" && (
            <div style={{ animation:"slideIn 0.3s ease" }}>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:26, fontWeight:800, color:"#1A1209", marginBottom:8 }}>Welcome back</div>
              <div style={{ fontSize:13, color:"#9D8B79", marginBottom:32 }}>Chennai's smartest EV charging platform.</div>
              <button onClick={() => setStage("roles")} style={{ width:"100%", padding:"18px", borderRadius:16, border:"none", background:ORANGE, color:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:800, cursor:"pointer", boxShadow:`0 6px 24px ${ORANGE}44` }}>Get Started →</button>
            </div>
          )}
          {stage==="roles" && (
            <div style={{ animation:"slideIn 0.35s ease" }}>
              <button onClick={goBack} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:"#9D8B79", cursor:"pointer", fontSize:12, marginBottom:28, fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:600 }}>← Back</button>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:28, fontWeight:800, color:"#1A1209", marginBottom:6 }}>Sign in as</div>
              <div style={{ fontSize:13, color:"#9D8B79", marginBottom:28 }}>Choose your account type.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {[["user","👤","User Account","Book slots, track sessions & reservations",TEAL],["admin","🛡️","Admin Console","Manage stations, sessions, users & billing",ORANGE]].map(([r,ic,title,desc,col]) => (
                  <div key={r} onClick={() => pickRole(r)} style={{ background:"#fff", border:"2px solid #E8DDD0", borderRadius:18, padding:"22px", cursor:"pointer", transition:"all 0.2s", boxShadow:"0 4px 16px rgba(26,18,9,0.07)", display:"flex", alignItems:"center", gap:16 }}>
                    <div style={{ width:52, height:52, borderRadius:15, background:`${col}15`, border:`1.5px solid ${col}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{ic}</div>
                    <div style={{ flex:1 }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:800, color:"#1A1209", marginBottom:3 }}>{title}</div><div style={{ fontSize:11, color:"#9D8B79" }}>{desc}</div></div>
                    <div style={{ width:30, height:30, borderRadius:"50%", background:col, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:14, flexShrink:0 }}>→</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stage==="form" && role && (
            <div style={{ animation:"slideIn 0.3s ease" }}>
              <button onClick={goBack} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:"#9D8B79", cursor:"pointer", fontSize:12, marginBottom:28, fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:600 }}>← Back</button>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:"#1A1209", marginBottom:20 }}>{role==="user"?"User Login":"Admin Login"}</div>
              <div style={{ background:`${role==="user"?TEAL:ORANGE}10`, border:`1.5px dashed ${role==="user"?TEAL:ORANGE}44`, borderRadius:12, padding:"10px 14px", marginBottom:22 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:role==="user"?TEAL:ORANGE, marginBottom:6 }}>Demo Credentials</div>
                {[["Email",role==="user"?"arjun@evgrid.in":"admin@evgrid.in"],["Password","user123"]].map(([l,v]) => (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#9D8B79", marginBottom:2 }}><span>{l}</span><span style={{ fontFamily:"'DM Mono',monospace", color:role==="user"?TEAL:ORANGE, fontWeight:600 }}>{v}</span></div>
                ))}
              </div>
              {[["Email","email",email,setEmail,"📧"],["Password","password",pass,setPass,"🔒"]].map(([l,t,v,sv,ic]) => (
                <div key={l} style={{ marginBottom:16 }}>
                  <label style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:"#9D8B79", display:"block", marginBottom:7, fontWeight:700 }}>{l}</label>
                  <input type={t} value={v} onChange={e => sv(e.target.value)} onKeyDown={e => e.key==="Enter" && attempt()} style={{ width:"100%", background:"#fff", border:"1.5px solid #E8DDD0", borderRadius:12, padding:"13px 16px 13px 40px", color:"#1A1209", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", boxSizing:"border-box" }} placeholder={t==="email"?"your@email.com":"••••••••"}/>
                </div>
              ))}
              {error && <div style={{ background:"#FFF0F5", border:"1px solid #FCCADA", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#E84393", marginBottom:14, fontWeight:600 }}>{error}</div>}
              <button onClick={attempt} style={{ width:"100%", padding:"15px", borderRadius:14, border:"none", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14, fontWeight:800, cursor:"pointer", background:role==="user"?`linear-gradient(135deg,${TEAL},${SKY})`:`linear-gradient(135deg,${ORANGE},#FF9A00)`, color:"#fff" }}>
                {role==="user"?"⚡ Sign In":"🛡️ Access Dashboard"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  ROOT APP
// ══════════════════════════════════════════════════════════════
export default function EVGRID() {
  const [db,          setDb]          = useState(null);      // loaded from API
  const [loading,     setLoading]     = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [page,        setPage]        = useState("dashboard");
  const [modal,       setModal]       = useState(null);
  const [toasts,      setToasts]      = useState([]);
  const [selectedSt,  setSelectedSt]  = useState(null);
  const [panelSt,     setPanelSt]     = useState(null);
  const [revCounter,  setRevCounter]  = useState(0);
  const [clock,       setClock]       = useState("");

  // ── Fetch full DB snapshot from backend ──
  const refreshDb = useCallback(async () => {
    const data = await api.get("/db");
    setDb(data);
    setRevCounter(data.stations.reduce((a,s) => a+s.revenue, 0));
  }, []);

  useEffect(() => { refreshDb().finally(() => setLoading(false)); }, []);
  useEffect(() => { const t = setInterval(() => setRevCounter(v => v + Math.floor(Math.random()*50+10)), 8000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setClock(new Date().toLocaleTimeString("en-IN")), 1000); return () => clearInterval(t); }, []);

  const toast = useCallback((msg, type="info", icon=null) => {
    const icons = { success:"✅", error:"❌", info:"ℹ️", warning:"⚠️" };
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type, icon:icon||icons[type] }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3400);
  }, []);

  const doLogin = async (role, email, pass) => {
  try {
    const res = await api.post("/auth/login", {
      role,
      email,
      password: pass
    });

    const user = res.user || res;

    if (!user || !user.name) {
      throw new Error("Invalid response");
    }

    setCurrentUser({ ...user });
    setPage(role === "admin" ? "dashboard" : "my-overview");

    toast(`Welcome back, ${user.name.split(" ")[0]}! 👋`, "success");

    return true;
  } catch (e) {
    console.error(e);
    toast("Login failed", "error");
    return false;
  }
};
  const doLogout = () => { setCurrentUser(null); setPage("dashboard"); toast("Signed out","info"); };

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F0E8" }}>
      <div style={{ textAlign:"center" }}><div style={{ fontSize:36, marginBottom:12 }}>⚡</div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14, color:"#6B5B47" }}>Connecting to EVGRID…</div></div>
    </div>
  );

  if (!currentUser) return <LoginScreen onLogin={doLogin}/>;

  const isAdmin  = currentUser.role === "admin";
  const stName   = id => db.stations.find(s => s.id===id)?.name || id;
  const userName = id => db.users.find(u => u.id===id)?.name || id;

  const sharedProps = { db, refreshDb, setModal, toast };

  const pageMap = {
    dashboard:          isAdmin ? <PageAdminDashboard  {...sharedProps} revCounter={revCounter} selectedStation={selectedSt} setSelectedStation={setSelectedSt} stationPanelStation={panelSt} setStationPanelStation={setPanelSt}/> : null,
    stations:           isAdmin ? <PageAdminStations   {...sharedProps} selectedStation={selectedSt} setSelectedStation={setSelectedSt} stationPanelStation={panelSt} setStationPanelStation={setPanelSt}/> : null,
    sessions:           isAdmin ? <PageAdminSessions   {...sharedProps} userName={userName} stName={stName}/> : null,
    reservations:       isAdmin ? <PageAdminReservations {...sharedProps} userName={userName} stName={stName}/> : null,
    users:              isAdmin ? <PageAdminUsers      {...sharedProps}/> : null,
    billing:            isAdmin ? <PageAdminBilling    {...sharedProps} userName={userName} stName={stName}/> : null,
    database:           isAdmin ? <DatabaseViewer db={db}/> : null,
    schema:             isAdmin ? <ERSchema/> : null,
    "my-overview":     !isAdmin ? <PageUserOverview    {...sharedProps} currentUser={currentUser} setPage={setPage}/> : null,
    "my-sessions":     !isAdmin ? <PageUserSessions    {...sharedProps} currentUser={currentUser}/> : null,
    "my-reservations": !isAdmin ? <PageUserReservations {...sharedProps} currentUser={currentUser}/> : null,
    book:              !isAdmin ? <PageUserBook        {...sharedProps} currentUser={currentUser} setPage={setPage}/> : null,
    "find-stations":   !isAdmin ? <PageUserFindStations {...sharedProps} currentUser={currentUser}/> : null,
  };

  const pageTitles = { dashboard:"Network Dashboard", stations:"Charging Stations", sessions:"Live Sessions", reservations:"Reservations", users:"User Management", billing:"Billing & Revenue", database:"Database Viewer", schema:"ER Schema", "my-overview":"My Dashboard", "my-sessions":"My Sessions", "my-reservations":"My Reservations", book:"Book a Slot", "find-stations":"Find Stations" };

  const adminNav = [
    { section:"Overview",      items:[["dashboard","🏠","Dashboard"],["stations","⚡","Stations"],["sessions","🔄","Live Sessions"],["reservations","📅","Reservations"]] },
    { section:"Management",    items:[["users","👥","Users"],["billing","💳","Billing"]] },
    { section:"Data & Schema", items:[["database","🗄","Database Viewer"],["schema","📐","ER Schema"]] },
  ];
  const userNav = [
    { section:"My Account", items:[["my-overview","🏠","Overview"],["my-sessions","🔄","My Sessions"],["my-reservations","📅","Reservations"],["book","➕","Book a Slot"]] },
    { section:"Stations",   items:[["find-stations","⚡","Find Stations"]] },
  ];
  const navSections = isAdmin ? adminNav : userNav;
  const initials    = currentUser.name.split(" ").map(n=>n[0]).join("");

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes modalUp { from{opacity:0;transform:translateY(14px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes progPulse { 0%{width:25%} 100%{width:85%} }
        @keyframes toastIn  { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#F0EBE3}
        ::-webkit-scrollbar-thumb{background:#D4C4B0;border-radius:4px}
        select option{background:#fff;color:#1A1209}
      `}</style>

      {/* Sidebar */}
      <aside style={{ width:252, background:C.sidebar, display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, bottom:0, zIndex:100, boxShadow:"4px 0 24px rgba(26,18,9,0.15)" }}>
        <div style={{ padding:"24px 20px 18px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:C.orange, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, boxShadow:`0 4px 16px ${C.orange}55`, flexShrink:0 }}>⚡</div>
            <div>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:"#fff", letterSpacing:"-0.5px" }}>EV<span style={{ color:C.orange }}>GRID</span></div>
              <div style={{ fontSize:9, color:C.sideMu, letterSpacing:2.5, textTransform:"uppercase" }}>EV Infrastructure</div>
            </div>
          </div>
          <div style={{ marginTop:16, background:C.sideB, borderRadius:12, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:isAdmin?C.orange:C.teal, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:800, color:"#fff", flexShrink:0 }}>{initials}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, color:C.sideT, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize:9, color:C.sideMu, letterSpacing:1, textTransform:"uppercase", display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:isAdmin?C.orange:C.teal }}/>
                {isAdmin?"Administrator":"EV User"}
              </div>
            </div>
          </div>
        </div>
        <nav style={{ padding:"16px 12px", flex:1, overflowY:"auto" }}>
          {navSections.map(({ section, items }) => (
            <div key={section} style={{ marginBottom:24 }}>
              <div style={{ fontSize:8, color:C.sideMu, letterSpacing:3, textTransform:"uppercase", padding:"0 8px 8px", fontWeight:700 }}>{section}</div>
              {items.map(([p, , label]) => {
                const active = page === p;
                return (
                  <button key={p} onClick={() => setPage(p)} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 12px", borderRadius:10, background:active?`rgba(255,107,53,0.15)`:"transparent", border:active?`1px solid rgba(255,107,53,0.3)`:"1px solid transparent", color:active?C.orange:C.sideMu, cursor:"pointer", marginBottom:3, transition:"all 0.2s", textAlign:"left", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:active?700:500 }}>
                    <span style={{ fontSize:14, opacity:active?1:0.6 }}>{["🏠","⚡","🔄","📅","👥","💳","🗄","📐","➕"][["dashboard","my-overview","stations","find-stations","sessions","my-sessions","reservations","my-reservations","users","billing","database","schema","book"].indexOf(p)] || "•"}</span>
                    {label}
                    {active && <div style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:C.orange }}/>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding:"16px 20px", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize:9, color:C.sideMu, fontFamily:"'DM Mono',monospace", marginBottom:10 }}>{clock}</div>
          <button onClick={doLogout} style={{ width:"100%", padding:"10px", borderRadius:10, border:"1px solid rgba(255,107,53,0.3)", background:"rgba(255,107,53,0.08)", color:C.orange, cursor:"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>Sign Out</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft:252, flex:1, padding:28, maxWidth:"calc(100vw - 252px)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:C.text, letterSpacing:"-0.3px" }}>{pageTitles[page]||page}</div>
            <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>EVGRID · {isAdmin?"Admin Console":"User Portal"}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"7px 14px" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:C.teal, animation:"liveDot 2s ease infinite" }}/>
              <span style={{ fontSize:11, color:C.sub, fontWeight:600 }}>Live</span>
            </div>
          </div>
        </div>
        {pageMap[page] || <div style={{ textAlign:"center", padding:60, color:C.sub }}>Page not found</div>}
      </main>

      {/* Modal */}
      {modal}

      {/* Toasts */}
      <div style={{ position:"fixed", top:20, right:20, zIndex:9999, display:"flex", flexDirection:"column", gap:10 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px", boxShadow:"0 8px 24px rgba(26,18,9,0.12)", display:"flex", alignItems:"center", gap:10, animation:"toastIn 0.3s ease", minWidth:260 }}>
            <span style={{ fontSize:16 }}>{t.icon}</span>
            <span style={{ fontSize:12, color:C.text, fontWeight:500 }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
