// ══════════════════════════════════════════════════════════════
//  EVGRID — EV Charging Station Discovery & Reservation
//  Requires backend running at http://localhost:4000
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
let authToken = "";
const apiRequest = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch (_err) {
    throw new Error("Unable to connect to the EVGRID API. Start the backend on port 4000.");
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_err) { data = { error: text || "Invalid server response" }; }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};
const api = {
  setToken: (token) => { authToken = token || ""; },
  get:   (path)       => apiRequest(path),
  post:  (path, body) => apiRequest(path, { method:"POST",  body:JSON.stringify(body || {}) }),
  patch: (path, body) => apiRequest(path, { method:"PATCH", body:JSON.stringify(body || {}) }),
  del:   (path)       => apiRequest(path, { method:"DELETE" }),
  query: (sql)        => apiRequest("/query", { method:"POST", body:JSON.stringify({ sql }) }),
};

const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

// ─── PALETTE ─────────────────────────────────────────────────
const ORANGE = "#FF6B35";
const TEAL   = "#00B894";
const SKY    = "#0984E3";
const VIOLET = "#6246FF";
const PINK   = "#FF3D81";

const C = {
  bg:"#F5F0E8", surface:"#FFFFFF", card:"#FFFDF8", border:"#E8DDD0", border2:"#D4C4B0",
  orange:ORANGE, teal:TEAL, sky:SKY, violet:VIOLET, pink:PINK, amber:"#F9A825", coral:"#E84393", grass:"#27AE60",
  text:"#1A1209", sub:"#6B5B47", dim:"#B8A898",
  sidebar:"#1A1209", sideB:"#2D2318", sideT:"#F5F0E8", sideMu:"#9D8B79",
  // Database console specific
  sqlBg:"#0D1117", sqlSurface:"#161B22", sqlBorder:"#30363D", sqlText:"#E6EDF3", sqlKeyword:"#FF7B72", sqlString:"#A5D6FF", sqlNumber:"#79C0FF", sqlComment:"#8B949E", sqlAccent:"#F78166",
};

const SC = {
  available:C.teal, occupied:C.sky, reserved:C.amber, maintenance:C.orange, offline:C.dim, out_of_service:C.coral,
  online:C.teal, active:C.sky, completed:C.teal, pending:C.amber,
  cancelled:C.coral, inactive:C.coral,
};
const SB = {
  available:"rgba(0,184,148,0.12)", occupied:"rgba(9,132,227,0.12)",
  reserved:"rgba(249,168,37,0.12)", maintenance:"rgba(255,107,53,0.12)", offline:"rgba(184,168,152,0.12)", out_of_service:"rgba(232,67,147,0.12)",
  online:"rgba(0,184,148,0.12)",    active:"rgba(9,132,227,0.12)",
  completed:"rgba(0,184,148,0.12)",pending:"rgba(249,168,37,0.12)",
  cancelled:"rgba(232,67,147,0.12)",inactive:"rgba(232,67,147,0.12)",
};

const S = {
  panel:  { background:"rgba(255,255,255,0.94)", border:"1px solid rgba(255,255,255,0.72)", borderRadius:20, overflow:"hidden", boxShadow:"0 24px 70px rgba(14,10,8,0.16)", backdropFilter:"blur(18px)" },
  card:   { background:"rgba(255,253,248,0.95)", border:"1px solid rgba(255,255,255,0.72)", borderRadius:18, padding:16, boxShadow:"0 18px 42px rgba(26,18,9,0.10)", backdropFilter:"blur(12px)" },
  input:  { width:"100%", background:"#FFFDFC", border:`1px solid ${C.border}`, borderRadius:12, padding:"11px 14px", color:C.text, fontSize:12, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" },
  select: { width:"100%", background:"#FFFDFC", border:`1px solid ${C.border}`, borderRadius:12, padding:"11px 14px", color:C.text, fontSize:12, outline:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" },
  label:  { fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:C.sub, display:"block", marginBottom:7, fontWeight:700 },
  th:     { padding:"10px 16px", textAlign:"left", fontSize:9, letterSpacing:2, textTransform:"uppercase", color:C.sub, borderBottom:`1px solid ${C.border}`, fontWeight:700, background:"#FAF7F2" },
  td:     { padding:"11px 16px", borderBottom:`1px solid ${C.border}`, color:C.sub },
  sectionLabel: { fontSize:9, color:C.dim, letterSpacing:2.5, textTransform:"uppercase", marginBottom:12, fontWeight:700 },
};

// ─── GEO HELPERS ─────────────────────────────────────────────
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};

const useGeolocation = () => {
  const [loc,status_,setStatus] = [useState(null), useState("idle")];
  const [loc2, setLoc] = useState(null);
  const [status, setStatus2] = useState("idle");
  const request = useCallback(() => {
    if (!navigator.geolocation) { setStatus2("unavailable"); return; }
    setStatus2("requesting");
    navigator.geolocation.getCurrentPosition(
      pos => { setLoc({ lat:pos.coords.latitude, lng:pos.coords.longitude }); setStatus2("granted"); },
      ()  => setStatus2("denied"),
      { enableHighAccuracy:true, timeout:8000 }
    );
  }, []);
  return { loc:loc2, status, request };
};

// ─── SHARED UI ────────────────────────────────────────────────
const Badge = ({ status, label }) => (
  <span style={{ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:20, fontSize:9, fontWeight:700, letterSpacing:1, background:SB[status]||"rgba(184,168,152,0.15)", color:SC[status]||C.dim, border:`1px solid ${(SC[status]||C.dim)}33`, whiteSpace:"nowrap", textTransform:"uppercase" }}>
    {label||status}
  </span>
);

const Btn = ({ onClick, children, variant="primary", style={}, disabled=false }) => {
  const vs = {
    primary:   { background:`linear-gradient(135deg,${C.orange},${C.pink})`, color:"#fff", border:"none", boxShadow:"0 14px 30px rgba(255,61,129,0.24)" },
    secondary: { background:"transparent", color:C.sub, border:`1px solid ${C.border2}` },
    danger:    { background:"rgba(232,67,147,0.1)", color:C.coral, border:`1px solid rgba(232,67,147,0.3)` },
    green:     { background:`linear-gradient(135deg,${C.teal},${C.sky})`, color:"#fff", border:"none", boxShadow:"0 14px 30px rgba(0,184,148,0.22)" },
    ghost:     { background:"rgba(255,107,53,0.08)", color:C.orange, border:`1px solid rgba(255,107,53,0.3)` },
    sql:       { background:"rgba(247,129,102,0.12)", color:"#F78166", border:"1px solid rgba(247,129,102,0.3)" },
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
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${C.border}`, background:`linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,107,53,0.07),rgba(0,184,148,0.06))` }}>
    <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:800, color:C.text, textTransform:"uppercase", letterSpacing:2 }}>{title}</span>
    {right && <div>{right}</div>}
  </div>
);

const CursorAura = () => {
  const auraRef = useRef(null);
  useEffect(() => {
    const move = (event) => {
      if (!auraRef.current) return;
      auraRef.current.style.left = `${event.clientX}px`;
      auraRef.current.style.top = `${event.clientY}px`;
      auraRef.current.style.opacity = "0.72";
    };
    const leave = () => {
      if (auraRef.current) auraRef.current.style.opacity = "0";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div ref={auraRef} style={{ position:"fixed", left:0, top:0, width:420, height:420, borderRadius:"50%", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:3, opacity:0, transition:"opacity 0.2s ease", mixBlendMode:"screen", filter:"blur(18px)", background:`radial-gradient(circle,rgba(98,70,255,0.22) 0%,rgba(255,61,129,0.18) 28%,rgba(0,184,148,0.12) 48%,rgba(9,132,227,0.08) 62%,transparent 74%)` }}/>
  );
};

const StatCard = ({ label, value, color, icon }) => (
  <div style={{ background:"rgba(255,255,255,0.94)", border:"1px solid rgba(255,255,255,0.7)", borderRadius:18, padding:22, position:"relative", overflow:"hidden", boxShadow:`0 22px 50px ${color}18`, backdropFilter:"blur(14px)" }}>
    <div style={{ position:"absolute", top:0, left:0, right:0, height:4, background:`linear-gradient(90deg,${color},${C.violet},${C.pink})` }}/>
    <div style={{ fontSize:9, letterSpacing:2, textTransform:"uppercase", color:C.sub, marginBottom:10, fontWeight:700 }}>{label}</div>
    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
      <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:30, fontWeight:800, color:C.text, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:28, opacity:0.18 }}>{icon}</div>
    </div>
  </div>
);

const Modal = ({ title, subtitle, onClose, children, footer }) => (
  <div onClick={e => e.target===e.currentTarget && onClose()} style={{ position:"fixed", inset:0, background:"rgba(26,18,9,0.5)", backdropFilter:"blur(8px)", zIndex:9000, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:28, maxWidth:520, width:"90%", maxHeight:"88vh", overflowY:"auto", position:"relative", boxShadow:"0 24px 60px rgba(26,18,9,0.2)" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.orange},${C.teal})`, borderRadius:"20px 20px 0 0" }}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, paddingTop:8 }}>
        <div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, fontWeight:800, color:C.text }}>{title}</div>{subtitle&&<div style={{ fontSize:11, color:C.sub, marginTop:3 }}>{subtitle}</div>}</div>
        <button onClick={onClose} style={{ background:"#FEF0F0", border:"1px solid #FCCACA", color:C.coral, cursor:"pointer", fontSize:16, lineHeight:1, padding:"4px 9px", borderRadius:8, fontWeight:700 }}>×</button>
      </div>
      <div>{children}</div>
      {footer && <div style={{ display:"flex", gap:10, marginTop:22, justifyContent:"flex-end" }}>{footer}</div>}
    </div>
  </div>
);

const ConfirmModal = ({ title, msg, danger, onConfirm, onClose }) => (
  <Modal title={title} onClose={onClose} footer={[
    <Btn key="no" variant="secondary" onClick={onClose}>Cancel</Btn>,
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
    if (!leafletReady||!mapRef.current||mapInstance.current) return;
    const L = window.L;
    mapInstance.current = L.map(mapRef.current, { center:[13.03,80.21], zoom:11, zoomControl:true, attributionControl:false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains:"abcd", maxZoom:19 }).addTo(mapInstance.current);
  }, [leafletReady]);

  useEffect(() => {
    if (!leafletReady||!mapInstance.current) return;
    const L=window.L, map=mapInstance.current;
    Object.values(markersRef.current).forEach(m=>m.remove()); markersRef.current={};
    stations.forEach(st => {
      const sps=ports.filter(p=>p.stationId===st.id);
      const av=sps.filter(p=>p.status==="available").length;
      const isSelected=selectedStation?.id===st.id;
      const color=av>0?"#00B894":"#E84393";
      const svgIcon=`<svg width="${isSelected?52:44}" height="${isSelected?52:44}" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">${isSelected?`<circle cx="22" cy="22" r="20" fill="${color}" opacity="0.25"><animate attributeName="r" values="18;22;18" dur="2s" repeatCount="indefinite"/></circle>`:""}<circle cx="22" cy="22" r="${isSelected?11:9}" fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="2"/><text x="22" y="26" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="800" fill="#000">${av}</text></svg>`;
      const icon=L.divIcon({ html:svgIcon, className:"", iconSize:[isSelected?52:44,isSelected?52:44], iconAnchor:[isSelected?26:22,isSelected?26:22] });
      const marker=L.marker([st.lat,st.lng],{icon}).addTo(map);
      marker.bindTooltip(`<div style="background:#fff;border:1px solid ${color}55;border-radius:10px;padding:10px 12px;font-family:sans-serif;font-size:12px;min-width:160px"><b>${st.name}</b><br/><span style="color:#999;font-size:10px">${av} ports available</span></div>`, { permanent:false, direction:"top", offset:[0,-20], opacity:1 });
      marker.on("click", ()=>onStationClick(st));
      markersRef.current[st.id]=marker;
    });
  }, [leafletReady,stations,ports,selectedStation]);

  useEffect(() => {
    if (!leafletReady||!mapInstance.current) return;
    const L=window.L, map=mapInstance.current;
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current=null; }
    if (routeLineRef.current)  { routeLineRef.current.remove();  routeLineRef.current=null; }
    if (!userLocation) return;
    const youSvg=`<svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="10" fill="#FF6B35" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="18" r="4" fill="#fff"/></svg>`;
    userMarkerRef.current=L.marker([userLocation.lat,userLocation.lng],{icon:L.divIcon({html:youSvg,className:"",iconSize:[36,44],iconAnchor:[18,40]}),zIndexOffset:1000}).addTo(map).bindTooltip("📍 You are here");
    if (navTarget) {
      routeLineRef.current=L.polyline([[userLocation.lat,userLocation.lng],[navTarget.lat,navTarget.lng]],{color:"#FF6B35",weight:3.5,opacity:0.85,dashArray:"10 7"}).addTo(map);
      map.fitBounds([[userLocation.lat,userLocation.lng],[navTarget.lat,navTarget.lng]],{padding:[50,50]});
    } else { map.setView([userLocation.lat,userLocation.lng],13,{animate:true}); }
  }, [leafletReady,userLocation,navTarget]);

  if (!leafletReady) return <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#0d1117",borderRadius:12 }}><span style={{ fontSize:12,color:"#9D8B79" }}>Loading map…</span></div>;
  return (
    <>
      <style>{`.leaflet-tooltip{background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important}.leaflet-tooltip-top:before{display:none!important}`}</style>
      <div ref={mapRef} style={{ width:"100%",height:"100%",borderRadius:12,overflow:"hidden" }}/>
    </>
  );
};

const ChargingStationMap = (props) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div style={{ width:"100%",height:"100%",background:"#0d1117",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center" }}><span style={{ fontSize:12,color:"#9D8B79" }}>Initializing…</span></div>;
  return <LeafletMapInternal {...props}/>;
};

const StationLocationPicker = ({ form, setForm, toast }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const googleMapRef = useRef(null);
  const googleMarkerRef = useRef(null);
  const googleGeocoderRef = useRef(null);
  const autocompleteRef = useRef(null);
  const searchInputRef = useRef(null);
  const [leafletReady,setLeafletReady]=useState(false);
  const [googleReady,setGoogleReady]=useState(false);
  const [query,setQuery]=useState("");
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const useGoogleMaps=Boolean(GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    if (useGoogleMaps) return;
    if (window.L) { setLeafletReady(true); return; }
    const link = document.createElement("link");
    link.rel="stylesheet";
    link.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload=()=>setLeafletReady(true);
    document.head.appendChild(script);
  }, [useGoogleMaps]);

  useEffect(() => {
    if (!useGoogleMaps) return;
    if (window.google?.maps) { setGoogleReady(true); return; }
    const existing=document.getElementById("google-maps-js");
    if (existing) {
      existing.addEventListener("load",()=>setGoogleReady(true),{once:true});
      return;
    }
    const script=document.createElement("script");
    script.id="google-maps-js";
    script.src=`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&v=weekly`;
    script.async=true;
    script.defer=true;
    script.onload=()=>setGoogleReady(true);
    script.onerror=()=>toast("Google Maps could not load. Check the API key.","error");
    document.head.appendChild(script);
  }, [useGoogleMaps,toast]);

  const applyLocation = useCallback(async(lat,lng,address="") => {
    const nextLat=Number(lat).toFixed(6);
    const nextLng=Number(lng).toFixed(6);
    let resolved=address;
    if (!resolved) {
      if (useGoogleMaps&&googleGeocoderRef.current) {
        try {
          const matches=await new Promise((resolve,reject)=>{
            googleGeocoderRef.current.geocode({location:{lat:Number(nextLat),lng:Number(nextLng)}},(items,status)=>{
              if (status==="OK") resolve(items||[]);
              else reject(new Error(status));
            });
          });
          resolved=matches?.[0]?.formatted_address||"";
        } catch (_err) {}
      }
      try {
        if (!resolved) {
          const data=await api.get(`/geocode/reverse?lat=${encodeURIComponent(nextLat)}&lng=${encodeURIComponent(nextLng)}`);
          resolved=data.display_name||"";
        }
      } catch (_err) {}
    }
    setForm(f=>({...f,lat:nextLat,lng:nextLng,location:resolved||f.location}));
  },[setForm,useGoogleMaps]);

  const placeMarker = useCallback((lat,lng,address="",zoom=16) => {
    if (!leafletReady||!mapInstance.current) return;
    const L=window.L;
    const map=mapInstance.current;
    const pickerIcon=L.divIcon({
      className:"",
      iconSize:[38,44],
      iconAnchor:[19,38],
      html:`<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${ORANGE};transform:rotate(-45deg);box-shadow:0 12px 26px rgba(255,107,53,0.35);border:3px solid #fff;display:flex;align-items:center;justify-content:center"><span style="width:9px;height:9px;border-radius:999px;background:#fff;display:block"></span></div>`
    });
    if (!markerRef.current) {
      markerRef.current=L.marker([lat,lng],{draggable:true,icon:pickerIcon}).addTo(map);
      markerRef.current.on("dragend",()=> {
        const pos=markerRef.current.getLatLng();
        applyLocation(pos.lat,pos.lng);
      });
    } else {
      markerRef.current.setIcon(pickerIcon);
      markerRef.current.setLatLng([lat,lng]);
    }
    map.setView([lat,lng],zoom,{animate:true});
    applyLocation(lat,lng,address);
  },[leafletReady,applyLocation]);

  const placeGoogleMarker = useCallback((lat,lng,address="",zoom=16) => {
    if (!googleMapRef.current||!googleMarkerRef.current) return;
    const position={lat:Number(lat),lng:Number(lng)};
    googleMarkerRef.current.setPosition(position);
    googleMarkerRef.current.setVisible(true);
    googleMapRef.current.panTo(position);
    googleMapRef.current.setZoom(zoom);
    applyLocation(lat,lng,address);
  },[applyLocation]);

  useEffect(() => {
    if (!useGoogleMaps||!googleReady||!mapRef.current||googleMapRef.current) return;
    const google=window.google;
    const start={lat:Number(form.lat)||20.5937,lng:Number(form.lng)||78.9629};
    const map=new google.maps.Map(mapRef.current,{
      center:start,
      zoom:form.lat&&form.lng?15:5,
      mapTypeControl:false,
      streetViewControl:false,
      fullscreenControl:true,
    });
    const marker=new google.maps.Marker({
      position:start,
      map,
      draggable:true,
      visible:Boolean(form.lat&&form.lng),
      title:"Station location",
      icon:{path:google.maps.SymbolPath.CIRCLE,scale:10,fillColor:ORANGE,fillOpacity:1,strokeColor:"#FFFFFF",strokeWeight:3},
    });
    googleMapRef.current=map;
    googleMarkerRef.current=marker;
    googleGeocoderRef.current=new google.maps.Geocoder();
    map.addListener("click",(event)=>{
      if (event.latLng) placeGoogleMarker(event.latLng.lat(),event.latLng.lng());
    });
    marker.addListener("dragend",()=>{
      const pos=marker.getPosition();
      if (pos) applyLocation(pos.lat(),pos.lng());
    });
    if (searchInputRef.current&&google.maps.places) {
      autocompleteRef.current=new google.maps.places.Autocomplete(searchInputRef.current,{
        componentRestrictions:{country:"in"},
        fields:["geometry","formatted_address","name","place_id"],
      });
      autocompleteRef.current.addListener("place_changed",()=>{
        const place=autocompleteRef.current.getPlace();
        const loc=place.geometry?.location;
        if (!loc) return;
        const address=place.formatted_address||place.name||"";
        placeGoogleMarker(loc.lat(),loc.lng(),address,16);
        setQuery(address);
        setResults([]);
        setForm(f=>({...f,location:address,name:f.name||place.name||f.name}));
      });
    }
    return () => {
      google.maps.event.clearInstanceListeners(map);
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
      googleMapRef.current=null;
      googleMarkerRef.current=null;
      googleGeocoderRef.current=null;
      autocompleteRef.current=null;
    };
  },[useGoogleMaps,googleReady,placeGoogleMarker,applyLocation,setForm]);

  useEffect(() => {
    if (useGoogleMaps||!leafletReady||!mapRef.current||mapInstance.current) return;
    const L=window.L;
    const startLat=Number(form.lat)||20.5937;
    const startLng=Number(form.lng)||78.9629;
    const startZoom=form.lat&&form.lng?15:5;
    const map=L.map(mapRef.current,{center:[startLat,startLng],zoom:startZoom,zoomControl:true,attributionControl:false});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
    map.on("click",(e)=>placeMarker(e.latlng.lat,e.latlng.lng));
    mapInstance.current=map;
    if (form.lat&&form.lng) placeMarker(Number(form.lat),Number(form.lng),form.location||"",15);
    return () => {
      map.remove();
      mapInstance.current=null;
      markerRef.current=null;
    };
  },[useGoogleMaps,leafletReady,placeMarker]);

  useEffect(() => {
    if (useGoogleMaps||!leafletReady||!mapInstance.current||!form.lat||!form.lng) return;
    const lat=Number(form.lat);
    const lng=Number(form.lng);
    const current=markerRef.current?.getLatLng();
    if (!current||Math.abs(current.lat-lat)>0.000001||Math.abs(current.lng-lng)>0.000001) {
      placeMarker(lat,lng,form.location||"",15);
    }
  },[useGoogleMaps,leafletReady,form.lat,form.lng,form.location,placeMarker]);

  useEffect(() => {
    if (!useGoogleMaps||!googleReady||!googleMapRef.current||!form.lat||!form.lng) return;
    const lat=Number(form.lat);
    const lng=Number(form.lng);
    const current=googleMarkerRef.current?.getPosition();
    if (!current||Math.abs(current.lat()-lat)>0.000001||Math.abs(current.lng()-lng)>0.000001) {
      placeGoogleMarker(lat,lng,form.location||"",15);
    }
  },[useGoogleMaps,googleReady,form.lat,form.lng,form.location,placeGoogleMarker]);

  const searchAddress=async()=>{
    const text=(query||form.location||"").trim();
    if (!text) { toast("Enter an address or area to search","error"); return; }
    setSearching(true);
    try {
      let data=[];
      if (useGoogleMaps&&googleReady&&googleGeocoderRef.current) {
        const matches=await new Promise((resolve,reject)=>{
          googleGeocoderRef.current.geocode({address:`${text}, India`,componentRestrictions:{country:"IN"}},(items,status)=>{
            if (status==="OK"||status==="ZERO_RESULTS") resolve(items||[]);
            else reject(new Error(status));
          });
        });
        data=matches.slice(0,6).map((item,idx)=>({
          place_id:item.place_id||`google-${idx}`,
          name:item.address_components?.[0]?.long_name||item.formatted_address?.split(",")[0]||text,
          display_name:item.formatted_address,
          lat:item.geometry.location.lat(),
          lon:item.geometry.location.lng(),
        }));
      } else {
        data=await api.get(`/geocode/search?q=${encodeURIComponent(text)}`);
      }
      setResults(data||[]);
      if (data?.[0]) {
        if (useGoogleMaps&&googleReady) placeGoogleMarker(Number(data[0].lat),Number(data[0].lon),data[0].display_name,17);
        else placeMarker(Number(data[0].lat),Number(data[0].lon),data[0].display_name,17);
        setQuery(data[0].display_name||text);
        setForm(f=>({...f,location:data[0].display_name,name:f.name||data[0].name||f.name}));
      } else {
        toast("No matching location found","warning");
      }
    } catch (_err) {
      toast("Map search is unavailable right now","error");
    } finally {
      setSearching(false);
    }
  };

  const directionsUrl=form.lat&&form.lng?`https://www.google.com/maps/dir/?api=1&destination=${form.lat},${form.lng}&travelmode=driving`:null;

  return (
    <div style={{ ...S.panel, overflow:"hidden" }}>
      <PanelHead title="Map Location Picker" right={directionsUrl?<a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, color:"#fff", background:`linear-gradient(135deg,${C.teal},${C.sky})`, boxShadow:"0 10px 24px rgba(9,132,227,0.25)", borderRadius:10, padding:"8px 12px", fontSize:10, fontWeight:900, textDecoration:"none", letterSpacing:0.8, textTransform:"uppercase" }}>Start Google Maps</a>:null}/>
      <div style={{ padding:16 }}>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <input ref={searchInputRef} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchAddress()} placeholder="Search area or exact address in India" style={{ ...S.input, height:42 }}/>
          <Btn variant="primary" disabled={searching} onClick={searchAddress} style={{ height:42, padding:"0 16px" }}>{searching?"Searching":"Search"}</Btn>
        </div>
        {results.length>0&&(
          <div style={{ display:"grid", gap:8, marginBottom:12, maxHeight:118, overflowY:"auto" }}>
            {results.slice(0,4).map((r,i)=>(
              <button key={`${r.place_id}-${i}`} onClick={()=>{if(useGoogleMaps&&googleReady) placeGoogleMarker(Number(r.lat),Number(r.lon),r.display_name,17); else placeMarker(Number(r.lat),Number(r.lon),r.display_name,17);setQuery(r.display_name||r.name||query);setForm(f=>({...f,location:r.display_name,name:f.name||r.name||f.name}));}} style={{ textAlign:"left", background:i===0?"linear-gradient(135deg,rgba(0,184,148,0.12),rgba(9,132,227,0.08))":"rgba(255,255,255,0.9)", border:`1px solid ${i===0?"rgba(0,184,148,0.32)":C.border}`, borderRadius:12, padding:"10px 12px", color:C.sub, cursor:"pointer", fontSize:11, lineHeight:1.4, boxShadow:i===0?"0 10px 24px rgba(0,184,148,0.08)":"none" }}>
                <b style={{ color:C.text }}>{r.name||r.display_name?.split(",")[0]}</b><br/>{r.display_name}
              </button>
            ))}
          </div>
        )}
        <div style={{ height:430, borderRadius:14, overflow:"hidden", border:`1px solid ${C.border}`, background:"#ECF3EE" }}>
          {useGoogleMaps
            ? (googleReady?<div ref={mapRef} style={{ width:"100%", height:"100%" }}/>:<div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:C.sub, fontSize:12 }}>Loading Google Maps...</div>)
            : (leafletReady?<div ref={mapRef} style={{ width:"100%", height:"100%" }}/>:<div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:C.sub, fontSize:12 }}>Loading map...</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:12 }}>
          <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 11px" }}><div style={S.label}>Latitude</div><div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:C.text }}>{form.lat||"Pick on map"}</div></div>
          <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 11px" }}><div style={S.label}>Longitude</div><div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:C.text }}>{form.lng||"Pick on map"}</div></div>
        </div>
        {directionsUrl&&<a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={{ display:"flex", alignItems:"center", justifyContent:"center", marginTop:12, borderRadius:12, padding:"12px 14px", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:900, letterSpacing:1, textTransform:"uppercase", background:`linear-gradient(135deg,${C.orange},#FF3D81,${C.sky})`, boxShadow:"0 16px 32px rgba(255,61,129,0.22)" }}>Start Google Maps Directions</a>}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  DATABASE QUERY WORKBENCH - kept internal; not exposed in navigation
// ══════════════════════════════════════════════════════════════

// Preset queries available to all (filtered by role)
const ADMIN_PRESETS = [
  { label:"All Stations",            sql:"SELECT * FROM stations;" },
  { label:"All Ports",               sql:"SELECT * FROM ports ORDER BY stationId;" },
  { label:"All Users",               sql:"SELECT id, name, email, phone, vehicles, status FROM users;" },
  { label:"All Sessions",            sql:"SELECT * FROM sessions ORDER BY startTime DESC;" },
  { label:"All Reservations",        sql:"SELECT * FROM reservations;" },
  { label:"All Vehicles",            sql:"SELECT * FROM vehicles;" },
  { label:"Active Sessions",         sql:"SELECT s.id, u.name AS user, st.name AS station, s.portId, s.startTime, s.energy, s.cost FROM sessions s JOIN users u ON s.userId=u.id JOIN stations st ON s.stationId=st.id WHERE s.status='active';" },
  { label:"Revenue by Station",      sql:"SELECT s.id, s.name, s.revenue, COUNT(p.id) AS ports FROM stations s LEFT JOIN ports p ON p.stationId=s.id GROUP BY s.id ORDER BY revenue DESC;" },
  { label:"Available Ports",         sql:"SELECT p.id, p.stationId, st.name AS station, p.type, p.kw, p.price FROM ports p JOIN stations st ON p.stationId=st.id WHERE p.status='available';" },
  { label:"Port Utilisation",        sql:"SELECT stationId, status, COUNT(*) AS count FROM ports GROUP BY stationId, status ORDER BY stationId;" },
  { label:"Pending Reservations",    sql:"SELECT r.id, u.name AS user, st.name AS station, r.portId, r.datetime FROM reservations r JOIN users u ON r.userId=u.id JOIN stations st ON r.stationId=st.id WHERE r.status='pending';" },
  { label:"Top Spenders",            sql:"SELECT u.name, SUM(s.cost) AS total_spent, COUNT(s.id) AS sessions FROM sessions s JOIN users u ON s.userId=u.id GROUP BY u.id ORDER BY total_spent DESC;" },
  { label:"Show All Tables",         sql:"SHOW TABLES;" },
  { label:"Describe stations",       sql:"DESCRIBE stations;" },
  { label:"Describe ports",          sql:"DESCRIBE ports;" },
  { label:"Describe sessions",       sql:"DESCRIBE sessions;" },
  { label:"Describe reservations",   sql:"DESCRIBE reservations;" },
  { label:"Describe users",          sql:"DESCRIBE users;" },
  { label:"Describe vehicles",       sql:"DESCRIBE vehicles;" },
  // Delete examples
  { label:"Delete cancelled reservations", sql:"DELETE FROM reservations WHERE status='cancelled';" },
  { label:"Delete offline ports (sample)", sql:"-- Uncomment to run:\n-- DELETE FROM ports WHERE status='offline';" },
];

const USER_PRESETS = (userId) => [
  { label:"My Sessions",     sql:`SELECT * FROM sessions WHERE userId='${userId}';` },
  { label:"My Reservations", sql:`SELECT * FROM reservations WHERE userId='${userId}';` },
  { label:"My Vehicles",     sql:`SELECT * FROM vehicles WHERE userId='${userId}';` },
  { label:"My Total Spend",  sql:`SELECT SUM(cost) AS total_spent, COUNT(*) AS sessions, SUM(energy) AS total_kwh FROM sessions WHERE userId='${userId}';` },
  { label:"Active Charging", sql:`SELECT s.*, st.name AS station_name FROM sessions s JOIN stations st ON s.stationId=st.id WHERE s.userId='${userId}' AND s.status='active';` },
  { label:"Available Ports", sql:"SELECT p.id, st.name AS station, p.type, p.kw, p.price FROM ports p JOIN stations st ON p.stationId=st.id WHERE p.status='available' ORDER BY st.name;" },
  { label:"Station List",    sql:"SELECT id, name, location FROM stations;" },
];

// SQL Syntax highlighter (simple)
const highlightSQL = (text) => {
  if (!text) return "";
  const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|ON|GROUP BY|ORDER BY|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|DROP|ALTER|TABLE|DATABASE|DESCRIBE|SHOW|TABLES|AS|AND|OR|NOT|IN|LIKE|IS|NULL|COUNT|SUM|MAX|MIN|AVG|DISTINCT|LIMIT|OFFSET|ASC|DESC|IF|EXISTS|USE)\b/gi;
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/('.*?')/g, `<span style="color:#A5D6FF">$1</span>`)
    .replace(/\b(\d+)\b/g, `<span style="color:#79C0FF">$1</span>`)
    .replace(/--.*/g, m => `<span style="color:#8B949E">${m}</span>`)
    .replace(keywords, m => `<span style="color:#FF7B72;font-weight:700">${m}</span>`);
};

// eslint-disable-next-line no-unused-vars
const DatabaseQueryWorkbench = ({ isAdmin, currentUser, refreshDb }) => {
  const [query,     setQuery]     = useState("");
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [history,   setHistory]   = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const textareaRef = useRef(null);

  const presets = isAdmin ? ADMIN_PRESETS : USER_PRESETS(currentUser.id);

  const runQuery = async (q) => {
    const sql = q || query;
    if (!sql.trim() || sql.trim().startsWith("--")) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api.query(sql);
      if (res.error) { setError(res.error); }
      else {
        setResult(res);
        setHistory(h => [{ sql, ts: new Date().toLocaleTimeString(), result: res }, ...h.slice(0,9)]);
        // Refresh db state so UI updates
        await refreshDb();
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const pickPreset = (p) => {
    setQuery(p.sql);
    setActivePreset(p.label);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
    if (e.key === "Tab") { e.preventDefault(); const s=e.target.selectionStart, end=e.target.selectionEnd; setQuery(q => q.substring(0,s)+"  "+q.substring(end)); setTimeout(()=>{ if(textareaRef.current){ textareaRef.current.selectionStart=s+2; textareaRef.current.selectionEnd=s+2; } },0); }
  };

  const isDestructive = /^\s*(DELETE|DROP|TRUNCATE)/i.test(query);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, height:"100%" }}>
      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:14, alignItems:"start" }}>
        {/* Preset sidebar */}
        <div style={{ background:C.sqlSurface, border:`1px solid ${C.sqlBorder}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.sqlBorder}`, background:"rgba(255,255,255,0.03)" }}>
            <div style={{ fontSize:9, color:C.sqlComment, letterSpacing:2.5, textTransform:"uppercase", fontWeight:700 }}>Quick Queries</div>
          </div>
          <div style={{ overflowY:"auto", maxHeight:420 }}>
            {presets.map((p,i) => (
              <button key={i} onClick={() => pickPreset(p)}
                style={{ display:"block", width:"100%", textAlign:"left", padding:"8px 14px", background:activePreset===p.label?"rgba(247,129,102,0.15)":"transparent", border:"none", borderBottom:`1px solid ${C.sqlBorder}22`, color:activePreset===p.label?"#F78166":C.sqlComment, cursor:"pointer", fontSize:11, fontFamily:"'DM Mono',monospace", transition:"all 0.15s", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {p.label.startsWith("Delete")||p.label.startsWith("Drop") ? "🗑 " : "▶ "}{p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor + result */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* Editor */}
          <div style={{ background:C.sqlSurface, border:`1px solid ${isDestructive?"rgba(232,67,147,0.5)":C.sqlBorder}`, borderRadius:12, overflow:"hidden", transition:"border-color 0.2s" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", borderBottom:`1px solid ${C.sqlBorder}`, background:"rgba(255,255,255,0.02)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#FF5F57" }}/>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#FEBC2E" }}/>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#28C840" }}/>
                <span style={{ marginLeft:8, fontSize:10, color:C.sqlComment, fontFamily:"'DM Mono',monospace" }}>database - evgrid</span>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {isDestructive && <span style={{ fontSize:9, color:C.coral, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>⚠ Destructive Query</span>}
                <button onClick={() => { setQuery(""); setResult(null); setError(""); setActivePreset(null); }} style={{ background:"transparent", border:`1px solid ${C.sqlBorder}`, color:C.sqlComment, cursor:"pointer", borderRadius:6, padding:"3px 8px", fontSize:10, fontFamily:"'DM Mono',monospace" }}>Clear</button>
                <Btn variant={isDestructive?"danger":"sql"} style={{ padding:"5px 14px", fontSize:10 }} onClick={() => runQuery()} disabled={loading}>
                  {loading ? "Running…" : "▶ Run  Ctrl+↵"}
                </Btn>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={"-- Write a database query here\n-- Ctrl+Enter to execute\nSELECT * FROM stations;"}
              style={{ width:"100%", minHeight:130, background:"transparent", border:"none", outline:"none", color:C.sqlText, fontFamily:"'DM Mono',monospace", fontSize:12, lineHeight:1.7, padding:"14px 16px", resize:"vertical", boxSizing:"border-box", caretColor:C.sqlAccent }}
              spellCheck={false}
            />
          </div>

          {/* Result */}
          {error && (
            <div style={{ background:"rgba(232,67,147,0.06)", border:"1px solid rgba(232,67,147,0.3)", borderRadius:10, padding:"12px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:14 }}>❌</span>
                <span style={{ fontSize:10, color:C.coral, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase" }}>Query Error</span>
              </div>
              <pre style={{ margin:0, color:C.coral, fontFamily:"'DM Mono',monospace", fontSize:11, lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{error}</pre>
            </div>
          )}

          {result && result.type === "select" && (
            <div style={{ background:C.sqlSurface, border:`1px solid ${C.sqlBorder}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 14px", borderBottom:`1px solid ${C.sqlBorder}`, background:"rgba(255,255,255,0.02)" }}>
                <span style={{ fontSize:10, color:"#3FB950", fontFamily:"'DM Mono',monospace" }}>✓ {result.rows.length} row{result.rows.length!==1?"s":""} returned</span>
                <span style={{ fontSize:10, color:C.sqlComment, fontFamily:"'DM Mono',monospace" }}>{result.fields?.length||0} columns</span>
              </div>
              <div style={{ overflowX:"auto", maxHeight:320 }}>
                {result.rows.length > 0 ? (
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                    <thead>
                      <tr>
                        {(result.fields||Object.keys(result.rows[0])).map(f => (
                          <th key={f} style={{ padding:"8px 14px", textAlign:"left", fontSize:9, letterSpacing:1.5, textTransform:"uppercase", color:"#8B949E", borderBottom:`1px solid ${C.sqlBorder}`, fontWeight:700, background:"rgba(255,255,255,0.03)", whiteSpace:"nowrap" }}>{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row,i) => (
                        <tr key={i} style={{ background: i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                          {(result.fields||Object.keys(row)).map(f => {
                            const v = row[f];
                            const isId = f.toLowerCase().includes("id") || f==="id";
                            const isStatus = f==="status";
                            const isNum = typeof v==="number";
                            return (
                              <td key={f} style={{ padding:"8px 14px", borderBottom:`1px solid ${C.sqlBorder}22`, whiteSpace:"nowrap", fontFamily:isId||isNum?"'DM Mono',monospace":"'DM Sans',sans-serif", color: isId?"#79C0FF": isStatus?(SC[v]||C.sqlText): isNum?"#A5D6FF": v===null?"#8B949E":C.sqlText, fontStyle:v===null?"italic":"normal", fontSize:11 }}>
                                {v === null ? "NULL" : String(v)}
                                {isStatus && v && <span style={{ marginLeft:6, display:"inline-block", width:6, height:6, borderRadius:"50%", background:SC[v]||C.dim, verticalAlign:"middle" }}/>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign:"center", padding:24, color:C.sqlComment, fontSize:12 }}>No rows returned</div>
                )}
              </div>
            </div>
          )}

          {result && result.type === "mutation" && (
            <div style={{ background:"rgba(63,185,80,0.06)", border:"1px solid rgba(63,185,80,0.3)", borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:18 }}>✅</span>
              <div>
                <div style={{ fontSize:12, color:"#3FB950", fontWeight:700, marginBottom:3 }}>Query executed successfully</div>
                <div style={{ fontSize:11, color:C.sqlComment, fontFamily:"'DM Mono',monospace" }}>Affected rows: {result.affectedRows}{result.insertId?" · Insert ID: "+result.insertId:""}</div>
                <div style={{ fontSize:10, color:C.sqlComment, marginTop:2 }}>UI has been refreshed to reflect changes.</div>
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ background:C.sqlSurface, border:`1px solid ${C.sqlBorder}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ padding:"8px 14px", borderBottom:`1px solid ${C.sqlBorder}`, fontSize:9, color:C.sqlComment, letterSpacing:2, textTransform:"uppercase", fontWeight:700 }}>Query History</div>
              {history.map((h,i) => (
                <div key={i} onClick={() => setQuery(h.sql)} style={{ padding:"8px 14px", borderBottom:`1px solid ${C.sqlBorder}22`, cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:9, color:C.sqlComment, fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>{h.ts}</span>
                  <span style={{ flex:1, fontSize:11, color:C.sqlText, fontFamily:"'DM Mono',monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.sql.replace(/\n/g," ")}</span>
                  <span style={{ fontSize:9, color:h.result.type==="select"?"#3FB950":"#A5D6FF", whiteSpace:"nowrap" }}>{h.result.type==="select"?`${h.result.rows.length} rows`:`${h.result.affectedRows} affected`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── DATABASE VIEWER ─────────────────────────────────────────
const DatabaseViewer = ({ db }) => {
  const [activeTable, setActiveTable] = useState("stations");
  const [searchQ, setSearchQ] = useState("");
  const tables = [
    { key:"stations", label:"Stations", icon:"🏗", count:db.stations.length },
    { key:"ports", label:"Ports", icon:"🔌", count:db.ports.length },
    { key:"sessions", label:"Sessions", icon:"⚡", count:db.sessions.length },
    { key:"reservations", label:"Reservations", icon:"📅", count:db.reservations.length },
    { key:"users", label:"Users", icon:"👥", count:db.users.length },
    { key:"vehicles", label:"Vehicles", icon:"🚗", count:db.vehicles.length },
    { key:"admins", label:"Admins", icon:"🛡", count:db.admins.length },
  ];
  const data = db[activeTable]||[];
  const keys = data.length ? Object.keys(data[0]).filter(k=>k!=="password") : [];
  const filtered = searchQ ? data.filter(r=>JSON.stringify(r).toLowerCase().includes(searchQ.toLowerCase())) : data;
  const stats = { totalRecords:Object.values(db).reduce((a,t)=>a+t.length,0), activeSessions:db.sessions.filter(s=>s.status==="active").length, availablePorts:db.ports.filter(p=>p.status==="available").length, totalRevenue:db.stations.reduce((a,s)=>a+s.revenue,0) };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
        {[["Total Records",stats.totalRecords,C.sky,"📦"],["Active Charging Sessions",stats.activeSessions,C.teal,"⚡"],["Available Chargers",stats.availablePorts,C.amber,"🔌"],["Total Revenue",inr(stats.totalRevenue),C.coral,"💰"]].map(([l,v,c,ic])=>(
          <StatCard key={l} label={l} value={v} color={c} icon={ic}/>
        ))}
      </div>
      <div style={{ display:"flex", gap:16 }}>
        <div style={{ width:158, flexShrink:0 }}>
          <div style={S.sectionLabel}>Tables</div>
          {tables.map(t=>(
            <div key={t.key} onClick={()=>{setActiveTable(t.key);setSearchQ("");}}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 12px", borderRadius:8, cursor:"pointer", marginBottom:3, background:activeTable===t.key?"rgba(255,107,53,0.08)":"transparent", border:activeTable===t.key?`1px solid rgba(255,107,53,0.25)`:"1px solid transparent", color:activeTable===t.key?C.orange:C.sub, fontSize:12, transition:"all 0.2s" }}>
              <span>{t.icon} {t.label}</span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, background:C.border, padding:"1px 6px", borderRadius:10 }}>{t.count}</span>
            </div>
          ))}
        </div>
        <div style={{ flex:1, ...S.panel }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:700, color:C.text, textTransform:"uppercase", letterSpacing:1 }}>{tables.find(t=>t.key===activeTable)?.icon} {activeTable.toUpperCase()} Records</span>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search records…" style={{ ...S.input, width:180, padding:"6px 10px" }}/>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{keys.map(k=><th key={k} style={S.th}>{k}</th>)}</tr></thead>
              <tbody>
                {filtered.map((row,i)=>(
                  <tr key={i}>{keys.map(k=><td key={k} style={{ ...S.td, color:k.includes("Id")||k==="id"?C.sky:k==="status"?SC[row[k]]||C.sub:C.sub, fontFamily:k.includes("Id")||k==="id"||k.toLowerCase().includes("time")?"'DM Mono',monospace":"inherit", fontSize:k.includes("Id")||k==="id"?11:12 }}>{row[k]!==undefined?String(row[k]):"—"}</td>)}</tr>
                ))}
                {filtered.length===0&&<tr><td colSpan={keys.length} style={{ textAlign:"center", padding:24, color:C.dim }}>No matches</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN PAGES ─────────────────────────────────────────────
const PageAdminDashboard = ({ db, refreshDb, revCounter, setModal, toast, setSelectedStation, setStationPanelStation, stationPanelStation }) => {
  const activeSessions=db.sessions.filter(s=>s.status==="active");
  const avPorts=db.ports.filter(p=>p.status==="available").length;
  const buPorts=db.ports.filter(p=>p.status==="occupied").length;
  const rePorts=db.ports.filter(p=>p.status==="reserved").length;
  const ofPorts=db.ports.filter(p=>p.status==="offline").length;
  const util=Math.round((buPorts+rePorts)/Math.max(1,db.ports.length)*100);
  const bars=[12,8,5,4,9,22,45,68,72,65,58,70,84,88,76,69,74,80,72,60,45,38,28,18];
  const bmax=Math.max(...bars);

  const togglePort=async(pid,ns)=>{ await api.patch(`/ports/${pid}/status`,{status:ns}); await refreshDb(); toast(`Port ${pid} → ${ns}`,"info","🔧"); };
  const removeStation=(stid)=>{
    const st=db.stations.find(s=>s.id===stid);
    setModal(<ConfirmModal title="Remove Station" msg={<>Remove <b>{st?.name}</b>? All charger ports will be deleted.</>} danger onConfirm={async()=>{ await api.del(`/stations/${stid}`); await refreshDb(); toast("Station removed","warning","🗑️"); setStationPanelStation(null); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Total Stations"   value={db.stations.length}       color={C.sky}   icon="🏗"/>
        <StatCard label="Active Sessions"  value={activeSessions.length}     color={C.teal}  icon="⚡"/>
        <StatCard label="Revenue Today"    value={`₹${revCounter.toLocaleString("en-IN")}`} color={C.coral} icon="💰"/>
        <StatCard label="Energy Delivered" value="847 kWh"                   color={C.amber} icon="🔋"/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:18, marginBottom:18 }}>
        <div style={S.panel}>
          <PanelHead title="Station Network Map"/>
          <div style={{ height:310 }}>
            <ChargingStationMap stations={db.stations} ports={db.ports} selectedStation={stationPanelStation} isAdmin sessions={db.sessions} admins={db.admins} onStationClick={st=>{setSelectedStation(st);setStationPanelStation(st);}}/>
          </div>
        </div>
        <div style={S.panel}>
          <PanelHead title="Activity Feed"/>
          <div style={{ overflowY:"auto", maxHeight:350 }}>
            {[["⚡","Arjun started charging at ST001·P002","09:14","rgba(0,184,148,0.1)"],["📅","Divya reserved ST003·P013 for 16:30","09:02","rgba(249,168,37,0.1)"],["✓","Shreya completed — 31.5 kWh · ₹567","10:10","rgba(0,184,148,0.1)"],["⚠","Port P010 went offline","10:05","rgba(232,67,147,0.1)"]].map(([ic,tx,ti,bg],i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 16px", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ width:30, height:30, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, background:bg, flexShrink:0 }}>{ic}</div>
                <div><div style={{ fontSize:12, color:C.sub, marginBottom:2 }}>{tx}</div><div style={{ fontSize:10, color:C.dim, fontFamily:"'DM Mono',monospace" }}>{ti}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {stationPanelStation && (() => {
        const st=db.stations.find(s=>s.id===stationPanelStation.id);
        if (!st) return null;
        const sps=db.ports.filter(p=>p.stationId===st.id);
        return (
          <div style={{ ...S.card, border:`1px solid rgba(0,184,148,0.3)`, marginBottom:18 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
              <div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:700, color:C.text }}>📍 {st.name}</div><div style={{ fontSize:11, color:C.sub }}>{st.location}</div></div>
              <div style={{ display:"flex", gap:8 }}><Btn variant="danger" onClick={()=>removeStation(st.id)}>Remove from DB</Btn><Btn variant="secondary" onClick={()=>setStationPanelStation(null)}>✕</Btn></div>
            </div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {sps.map(p=>(
                <div key={p.id} style={{ background:C.bg, border:`1px solid ${SC[p.status]}22`, borderRadius:9, padding:"10px 14px", minWidth:150 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.sky }}>{p.id}</span><Badge status={p.status}/></div>
                  <div style={{ fontSize:11, color:C.sub, marginBottom:8 }}>{p.type} · {p.kw}kW · ₹{p.price}/kWh</div>
                  {p.status==="available" && <Btn variant="danger" style={{ padding:"4px 10px", fontSize:9 }} onClick={()=>togglePort(p.id,"offline")}>Set Offline</Btn>}
                  {p.status==="offline"   && <Btn variant="green"  style={{ padding:"4px 10px", fontSize:9 }} onClick={()=>togglePort(p.id,"available")}>Restore</Btn>}
                  {p.status==="occupied"      && <span style={{ fontSize:10, color:C.sky }}>⚡ In use</span>}
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
            {bars.map((v,i)=>(
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", gap:3, height:"100%" }}>
                <div style={{ width:"100%", borderRadius:"3px 3px 0 0", background:`linear-gradient(180deg,${C.sky},rgba(9,132,227,0.2))`, height:`${(v/bmax)*100}px` }}/>
                {i%6===0 && <div style={{ fontSize:9, color:C.dim, fontFamily:"'DM Mono',monospace" }}>{String(i).padStart(2,"0")}h</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={S.panel}>
          <PanelHead title="Port Utilization"/>
          <div style={{ padding:16 }}>
            <div style={{ textAlign:"center", marginBottom:12 }}>
              <svg width="140" height="90" viewBox="0 0 140 90">
                <path d="M15 85 A55 55 0 0 1 125 85" fill="none" stroke={C.border} strokeWidth="10" strokeLinecap="round"/>
                <path d="M15 85 A55 55 0 0 1 125 85" fill="none" stroke={C.teal} strokeWidth="10" strokeLinecap="round" strokeDasharray="172" strokeDashoffset={172-172*(util/100)}/>
                <text x="70" y="74" textAnchor="middle" fill={C.text} fontFamily="Plus Jakarta Sans" fontSize="22" fontWeight="800">{util}%</text>
                <text x="70" y="87" textAnchor="middle" fill={C.sub} fontSize="9">UTILIZATION</text>
              </svg>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {[["Available",avPorts,C.teal],["Occupied",buPorts,C.sky],["Reserved",rePorts,C.amber],["Offline",ofPorts,C.dim]].map(([l,v,c])=>(
                <div key={l} style={{ background:C.bg, borderRadius:8, padding:8, textAlign:"center" }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:800, color:c }}>{v}</div><div style={{ fontSize:9, color:C.dim, textTransform:"uppercase", letterSpacing:1 }}>{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PageAdminStations = ({ db, refreshDb, setModal, toast, setStationPanelStation, stationPanelStation, setSelectedStation }) => {
  const [tab,setTab]=useState("list");
  const [form,setForm]=useState({name:"",location:"",lat:"",lng:"",ports:"4",chargerType:"CCS2"});
  const [saving,setSaving]=useState(false);
  const stPorts=(sid)=>db.ports.filter(p=>p.stationId===sid);

  const deploy=async()=>{
    if(!form.name||!form.location||!form.lat||!form.lng){toast("Station name, address, latitude, and longitude are required","error");return;}
    if(saving) return;
    setSaving(true);
    try {
      await api.post("/stations",{name:form.name.trim(),location:form.location.trim(),lat:form.lat,lng:form.lng,ports:form.ports,chargerType:form.chargerType});
      await refreshDb();
      toast(`Station "${form.name}" added`,"success","🏗️");
      setForm({name:"",location:"",lat:"",lng:"",ports:"4",chargerType:"CCS2"});
      setTab("list");
    } catch (e) {
      toast(e.message||"Unable to add station","error");
    } finally {
      setSaving(false);
    }
  };

  const removeStation=(stid)=>{
    const st=db.stations.find(s=>s.id===stid);
    setModal(<ConfirmModal title="Remove Station" msg={<>Delete <b>{st?.name}</b>? All charger ports will be removed.</>} danger onConfirm={async()=>{ await api.del(`/stations/${stid}`); await refreshDb(); toast("Station deleted","warning","🗑️"); setStationPanelStation(null); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  const togglePort=async(pid,ns)=>{ await api.patch(`/ports/${pid}/status`,{status:ns}); await refreshDb(); toast(`Port ${pid} updated to ${ns}`,"info","🔧"); };

  return (
    <div>
      <style>{`.station-add-layout{grid-template-columns:minmax(360px,460px) minmax(420px,1fr)}@media(max-width:980px){.station-add-layout{grid-template-columns:1fr!important}.station-add-layout input,.station-add-layout select{font-size:13px!important}}`}</style>
      <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {[["list","All Stations"],["add","+ Add Station"],["map","📍 Map View"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"9px 18px", background:"none", border:"none", borderBottom:`2px solid ${tab===k?C.orange:"transparent"}`, color:tab===k?C.orange:C.sub, cursor:"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:-1 }}>{l}</button>
        ))}
      </div>
      {tab==="list" && (
        <div style={S.panel}>
          <PanelHead title={`Station Directory (${db.stations.length})`}/>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["ID","Name","Location","Ports","Available","Revenue","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {db.stations.map(s=>{
                const sps=stPorts(s.id); const av=sps.filter(p=>p.status==="available").length;
                return (
                  <tr key={s.id}>
                    <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{s.id}</td>
                    <td style={{ ...S.td, color:C.text, fontWeight:500 }}>{s.name}</td>
                    <td style={{ ...S.td, color:C.sub }}>{s.location}</td>
                    <td style={S.td}>{sps.length}</td>
                    <td style={{ ...S.td, color:C.teal }}>{av}/{sps.length}</td>
                    <td style={S.td}>{inr(s.revenue)}</td>
                    <td style={S.td}><Badge status="online"/></td>
                    <td style={S.td}><Btn variant="secondary" style={{ padding:"5px 12px", fontSize:10 }} onClick={()=>{setStationPanelStation(s);setSelectedStation(s);setTab("map");}}>Manage</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab==="add" && (
        <div className="station-add-layout" style={{ display:"grid", gap:18, alignItems:"start" }}>
          <div style={S.panel}>
          <PanelHead title="Add Charging Station"/>
          <div style={{ padding:20 }}>
            {[["Station Name *","name","text","e.g. EVGRID City Hub"],["Address / Location *","location","text","Search or select the exact address on the map"]].map(([l,k,t,ph])=>(
              <div key={k} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} type={t} placeholder={ph} style={S.input}/></div>
            ))}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div><label style={S.label}>Latitude *</label><input value={form.lat} onChange={e=>setForm(f=>({...f,lat:e.target.value}))} type="number" step="any" placeholder="13.0827" style={S.input}/></div>
              <div><label style={S.label}>Longitude *</label><input value={form.lng} onChange={e=>setForm(f=>({...f,lng:e.target.value}))} type="number" step="any" placeholder="80.2707" style={S.input}/></div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div><label style={S.label}>Ports</label><input value={form.ports} onChange={e=>setForm(f=>({...f,ports:e.target.value}))} type="number" min="1" max="12" style={S.input}/></div>
              <div><label style={S.label}>Connector Type</label><select value={form.chargerType} onChange={e=>setForm(f=>({...f,chargerType:e.target.value}))} style={S.select}><option>CCS2</option><option>Type 2</option><option>CHAdeMO</option></select></div>
            </div>
            <div style={{ display:"flex", gap:10 }}><Btn variant="primary" disabled={saving} onClick={deploy}>{saving?"Adding...":"Add Charging Station"}</Btn><Btn variant="secondary" onClick={()=>setTab("list")}>Cancel</Btn></div>
          </div>
          </div>
          <StationLocationPicker form={form} setForm={setForm} toast={toast}/>
        </div>
      )}
      {tab==="map" && (
        <div>
          <div style={{ height:420, borderRadius:14, overflow:"hidden", marginBottom:18, border:`1px solid ${C.border}` }}>
            <ChargingStationMap stations={db.stations} ports={db.ports} selectedStation={stationPanelStation} isAdmin sessions={db.sessions} admins={db.admins} onStationClick={st=>{setSelectedStation(st);setStationPanelStation(st);}}/>
          </div>
          {stationPanelStation ? (() => {
            const st=db.stations.find(s=>s.id===stationPanelStation.id);
            if (!st) return null;
            const sps=stPorts(st.id);
            return (
              <div style={{ ...S.card, border:`1px solid rgba(0,184,148,0.3)` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:700, color:C.text }}>📍 {st.name}</div><div style={{ fontSize:11, color:C.sub }}>{st.location}</div></div>
                  <div style={{ display:"flex", gap:8 }}><Btn variant="danger" onClick={()=>removeStation(st.id)}>Delete from DB</Btn><Btn variant="secondary" onClick={()=>setStationPanelStation(null)}>✕</Btn></div>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {sps.map(p=>(
                    <div key={p.id} style={{ background:C.bg, border:`1px solid ${SC[p.status]}22`, borderRadius:9, padding:"10px 14px", minWidth:150 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.sky }}>{p.id}</span><Badge status={p.status}/></div>
                      <div style={{ fontSize:11, color:C.sub, marginBottom:8 }}>{p.type} · {p.kw}kW · ₹{p.price}/kWh</div>
                      {p.status==="available" && <Btn variant="danger" style={{ padding:"4px 10px", fontSize:9 }} onClick={()=>togglePort(p.id,"offline")}>Set Offline</Btn>}
                      {p.status==="offline"   && <Btn variant="green"  style={{ padding:"4px 10px", fontSize:9 }} onClick={()=>togglePort(p.id,"available")}>Restore</Btn>}
                      {p.status==="occupied"      && <span style={{ fontSize:10, color:C.sky }}>⚡ In use</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : <div style={{ textAlign:"center", padding:28, color:C.sub, fontSize:13 }}>👆 Click a station pin to manage</div>}
        </div>
      )}
    </div>
  );
};

const PageAdminSessions = ({ db, refreshDb, setModal, toast, userName, stName }) => {
  const [search,setSearch]=useState("");
  const active=db.sessions.filter(s=>s.status==="active");
  const filtered=search?db.sessions.filter(s=>JSON.stringify(s).toLowerCase().includes(search.toLowerCase())):db.sessions;

  const endSession=(sid)=>{
    const s=db.sessions.find(x=>x.id===sid);
    setModal(<ConfirmModal title="Force End Session" msg={<>End <b>{sid}</b>? The charger port will be released.</>} danger onConfirm={async()=>{ await api.patch(`/sessions/${sid}/end`,{}); await refreshDb(); toast(`${sid} ended`,"warning","⛔"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ fontSize:11, color:C.sub, marginBottom:16, fontFamily:"'DM Mono',monospace" }}>● LIVE · <span style={{ color:C.sky }}>{active.length} active charging sessions</span></div>
      {active.length>0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
          {active.map(s=>(
            <div key={s.id} style={{ ...S.card, borderLeft:`3px solid ${C.sky}` }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.sky, marginBottom:6 }}>{s.id}</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:500, marginBottom:3 }}>{userName(s.userId)}</div>
              <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>{stName(s.stationId)} · {s.portId}</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.sub, marginBottom:10 }}><span>Started {s.startTime}</span><span style={{ color:C.sky }}>{s.energy} kWh · {inr(s.cost)}</span></div>
              <Btn variant="danger" style={{ width:"100%", padding:7, fontSize:10 }} onClick={()=>endSession(s.id)}>⏹ Force End</Btn>
            </div>
          ))}
        </div>
      )}
      <div style={S.panel}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text, textTransform:"uppercase", letterSpacing:1 }}>Charging Sessions ({db.sessions.length})</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...S.input, width:180, padding:"6px 10px" }}/>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["Session ID","User","Station","Port","Start","End","kWh","Cost","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(s=>(
              <tr key={s.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{s.id}</td>
                <td style={S.td}>{userName(s.userId)}</td>
                <td style={{ ...S.td, color:C.sub, fontSize:11 }}>{stName(s.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{s.portId}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.startTime}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.endTime}</td>
                <td style={{ ...S.td, color:C.sky }}>{s.energy}</td>
                <td style={S.td}>{inr(s.cost)}</td>
                <td style={S.td}><Badge status={s.status}/></td>
                <td style={S.td}>{s.status==="active"?<Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>endSession(s.id)}>End</Btn>:null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageAdminReservations = ({ db, refreshDb, setModal, toast, userName, stName }) => {
  const [uid,setUid]=useState(db.users[0]?.id||"");
  const [stid,setStid]=useState(db.stations[0]?.id||"");
  const [pid,setPid]=useState(db.ports.find(p=>p.stationId===db.stations[0]?.id)?.id||"");
  const [date,setDate]=useState("");
  const [time,setTime]=useState("");
  const stPorts=db.ports.filter(p=>p.stationId===stid);

  const confirm=async()=>{
    if(!date||!time){toast("Select date and time","error");return;}
    const rv=await api.post("/reservations",{userId:uid,portId:pid,stationId:stid,date,time});
    await refreshDb();
    toast(`${rv.id} confirmed`,"success","📅");
    setDate(""); setTime("");
  };

  const cancel=(rid)=>{
    const r=db.reservations.find(x=>x.id===rid);
    setModal(<ConfirmModal title="Cancel Reservation" msg={<>Cancel <b>{rid}</b>? The charger port will be released.</>} danger onConfirm={async()=>{ await api.patch(`/reservations/${rid}/cancel`,{}); await refreshDb(); toast(`${rid} cancelled`,"warning","📅"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:18 }}>
      <div style={{ ...S.panel, alignSelf:"start" }}>
        <PanelHead title="New Reservation"/>
        <div style={{ padding:20 }}>
          <div style={{ marginBottom:14 }}><label style={S.label}>User</label><select value={uid} onChange={e=>setUid(e.target.value)} style={S.select}>{db.users.map(u=><option key={u.id} value={u.id}>{u.id} — {u.name}</option>)}</select></div>
          <div style={{ marginBottom:14 }}><label style={S.label}>Station</label><select value={stid} onChange={e=>{setStid(e.target.value);setPid(db.ports.find(p=>p.stationId===e.target.value)?.id||"");}} style={S.select}>{db.stations.map(s=><option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}</select></div>
          <div style={{ marginBottom:14 }}><label style={S.label}>Port</label><select value={pid} onChange={e=>setPid(e.target.value)} style={S.select}>{stPorts.map(p=><option key={p.id} value={p.id}>{p.id} — {p.type} {p.kw}kW · {p.status}</option>)}</select></div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div><label style={S.label}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.input}/></div>
            <div><label style={S.label}>Time</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} style={S.input}/></div>
          </div>
          <Btn variant="primary" onClick={confirm}>📅 Confirm Reservation</Btn>
        </div>
      </div>
      <div style={S.panel}>
        <PanelHead title={`Reservations (${db.reservations.length})`}/>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["ID","User","Station","Port","Date/Time","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {db.reservations.map(r=>(
              <tr key={r.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{r.id}</td>
                <td style={S.td}>{userName(r.userId)}</td>
                <td style={{ ...S.td, color:C.sub, fontSize:11 }}>{stName(r.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{r.portId}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sub }}>{r.datetime}</td>
                <td style={S.td}><Badge status={r.status}/></td>
                <td style={S.td}>{r.status==="pending"&&<Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>cancel(r.id)}>Cancel</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageAdminUsers = ({ db, refreshDb, setModal, toast }) => {
  const [search,setSearch]=useState("");
  const filtered=search?db.users.filter(u=>JSON.stringify(u).toLowerCase().includes(search.toLowerCase())):db.users;

  const showUser=(u)=>{
    const uSess=db.sessions.filter(s=>s.userId===u.id);
    const toggle=async()=>{ await api.patch(`/users/${u.id}/status`,{status:u.status==="active"?"inactive":"active"}); await refreshDb(); toast(`${u.name} status updated`,"info","👤"); setModal(null); };
    setModal(
      <Modal title={`👤 ${u.name}`} subtitle={u.id} onClose={()=>setModal(null)}
        footer={[<Btn key="tog" variant={u.status==="active"?"danger":"green"} onClick={toggle}>{u.status==="active"?"Deactivate":"Activate"}</Btn>,<Btn key="cl" variant="primary" onClick={()=>setModal(null)}>Close</Btn>]}>
        <InfoRow label="Email" value={u.email}/>
        <InfoRow label="Phone" value={u.phone}/>
        <InfoRow label="Vehicles" value={u.vehicles}/>
        <InfoRow label="Total Sessions" value={uSess.length}/>
        <InfoRow label="Total Spent" value={inr(uSess.reduce((a,s)=>a+s.cost,0))} valueStyle={{ color:C.teal, fontWeight:700 }}/>
        <InfoRow label="Status" value={<Badge status={u.status}/>}/>
      </Modal>
    );
  };

  const addUser=()=>{
    let name="",email="",phone="";
    const submit=async()=>{
      if(!name||!email){toast("Name and email required","error");return;}
      await api.post("/users",{name,email,phone});
      await refreshDb();
      toast(`"${name}" added`,"success","👤");
      setModal(null);
    };
    setModal(
      <Modal title="Add New User" onClose={()=>setModal(null)}
        footer={[<Btn key="cancel" variant="secondary" onClick={()=>setModal(null)}>Cancel</Btn>,<Btn key="add" variant="primary" onClick={submit}>Add User</Btn>]}>
        {[["Full Name","text",v=>name=v,"e.g. Priya Sharma"],["Email","email",v=>email=v,"priya@example.com"],["Phone","text",v=>phone=v,"98XXX XXXXX"]].map(([l,t,cb,ph])=>(
          <div key={l} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input type={t} onChange={e=>cb(e.target.value)} placeholder={ph} style={S.input}/></div>
        ))}
      </Modal>
    );
  };

  return (
    <div style={S.panel}>
      <PanelHead title={`Users (${db.users.length})`} right={
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...S.input, width:180, padding:"6px 10px" }}/>
          <Btn variant="primary" style={{ padding:"7px 16px" }} onClick={addUser}>+ Add User</Btn>
        </div>
      }/>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead><tr>{["ID","Name","Email","Phone","Vehicles","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {filtered.map(u=>(
            <tr key={u.id}>
              <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{u.id}</td>
              <td style={{ ...S.td, color:C.text, fontWeight:500 }}>{u.name}</td>
              <td style={{ ...S.td, color:C.sub }}>{u.email}</td>
              <td style={S.td}>{u.phone}</td>
              <td style={S.td}>{u.vehicles}</td>
              <td style={S.td}><Badge status={u.status}/></td>
              <td style={S.td}><Btn variant="secondary" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>showUser(u)}>View</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ADMIN_PERMISSION_OPTIONS = [
  "admins.view","admins.create","admins.edit","admins.delete",
  "stations.view","stations.create","stations.edit","stations.delete","stations.assign",
  "chargers.view","chargers.create","chargers.edit","chargers.delete","chargers.status",
  "reservations.view","reservations.manage","sessions.view","sessions.manage",
  "users.view","users.manage","billing.view","reports.view","database.view",
];

const PageAdminAdmins = ({ db, refreshDb, setModal, toast, currentUser }) => {
  const [admins,setAdmins]=useState(db.admins||[]);
  const [loading,setLoading]=useState(false);
  const canEdit=currentUser.permissions?.includes("admins.edit");
  const canCreate=currentUser.permissions?.includes("admins.create");
  const stationName=(id)=>db.stations.find(s=>s.id===id)?.name||id;
  const load=useCallback(async()=>{
    setLoading(true);
    try { setAdmins(await api.get("/admins")); }
    catch(e) { toast(e.message||"Unable to load admins","error"); }
    finally { setLoading(false); }
  },[toast]);
  useEffect(()=>{ load(); },[load]);

  const openAdminModal=(admin=null)=>{
    let name=admin?.name||"";
    let email=admin?.email||"";
    let password="";
    let role=admin?.role||"station_admin";
    let status=admin?.status||"active";
    let stationIds=[...(admin?.assignedStations||[])];
    let permissions=[...(admin?.permissions||["stations.view","chargers.view","reservations.view","sessions.view","billing.view"])];
    const toggleIn=(list,value,checked)=>checked?[...new Set([...list,value])]:list.filter(x=>x!==value);
    const submit=async()=>{
      if(!name||!email){toast("Name and username/email are required","error");return;}
      const body={name,email,role,status,stationIds,permissions};
      if(password) body.password=password;
      if(admin) await api.patch(`/admins/${admin.id}`,body);
      else await api.post("/admins",{...body,password:password||"admin123"});
      await load();
      await refreshDb();
      toast(admin?"Admin updated":"Admin created","success");
      setModal(null);
    };
    setModal(
      <Modal title={admin?"Edit Admin":"Add Admin"} subtitle={admin?.id||"Roles & Permissions"} onClose={()=>setModal(null)}
        footer={[<Btn key="cancel" variant="secondary" onClick={()=>setModal(null)}>Cancel</Btn>,<Btn key="save" variant="primary" onClick={submit}>{admin?"Save Changes":"Create Admin"}</Btn>]}>
        {[["Name","text",name,v=>name=v],["Username / Email","text",email,v=>email=v],["Password","password",password,v=>password=v]].map(([l,t,v,cb])=>(
          <div key={l} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input type={t} defaultValue={v} onChange={e=>cb(e.target.value)} placeholder={l==="Password"&&admin?"Leave blank to keep current password":""} style={S.input}/></div>
        ))}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
          <div><label style={S.label}>Role</label><select defaultValue={role} onChange={e=>{role=e.target.value; if(role==="super_admin") permissions=[...ADMIN_PERMISSION_OPTIONS];}} style={S.select}><option value="station_admin">Station Admin</option><option value="custom">Custom Admin</option><option value="super_admin">Super Admin</option></select></div>
          <div><label style={S.label}>Status</label><select defaultValue={status} onChange={e=>status=e.target.value} style={S.select}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Assigned Stations</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxHeight:130, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
            {db.stations.map(st=>(
              <label key={st.id} style={{ fontSize:11, color:C.sub, display:"flex", gap:8, alignItems:"center" }}>
                <input type="checkbox" defaultChecked={stationIds.includes(st.id)} onChange={e=>stationIds=toggleIn(stationIds,st.id,e.target.checked)}/>
                {st.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label style={S.label}>Permissions</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxHeight:180, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
            {ADMIN_PERMISSION_OPTIONS.map(p=>(
              <label key={p} style={{ fontSize:10, color:C.sub, display:"flex", gap:8, alignItems:"center", fontFamily:"'DM Mono',monospace" }}>
                <input type="checkbox" defaultChecked={permissions.includes(p)} onChange={e=>permissions=toggleIn(permissions,p,e.target.checked)}/>
                {p}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div style={S.panel}>
      <PanelHead title={`Admins (${admins.length})`} right={canCreate?<Btn variant="primary" style={{ padding:"7px 16px" }} onClick={()=>openAdminModal()}>+ Add Admin</Btn>:null}/>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead><tr>{["ID","Name","Username","Role","Stations","Permissions","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {admins.map(a=>(
            <tr key={a.id}>
              <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", color:C.sky }}>{a.id}</td>
              <td style={{ ...S.td, color:C.text, fontWeight:600 }}>{a.name}</td>
              <td style={S.td}>{a.email}</td>
              <td style={S.td}>{a.role==="super_admin"?"Super Admin":a.role==="station_admin"?"Station Admin":"Custom Admin"}</td>
              <td style={{ ...S.td, maxWidth:220 }}>{a.role==="super_admin"?"All Stations":(a.assignedStations||[]).map(stationName).join(", ")||"None"}</td>
              <td style={S.td}>{a.permissions?.length||0}</td>
              <td style={S.td}><Badge status={a.status}/></td>
              <td style={S.td}>{canEdit?<Btn variant="secondary" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>openAdminModal(a)}>Edit</Btn>:null}</td>
            </tr>
          ))}
          {!loading&&admins.length===0&&<tr><td colSpan="8" style={{ ...S.td, textAlign:"center" }}>No admins available</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

const PageAdminBilling = ({ db, setModal, toast, userName, stName }) => {
  const bill=db.sessions.filter(s=>s.status==="completed"||s.status==="active");
  const totalRev=bill.reduce((a,s)=>a+s.cost,0);
  const downloadInvoice=(s)=>{
    const rows=[
      ["Session ID",s.id],
      ["User",userName(s.userId)],
      ["Station",stName(s.stationId)],
      ["Charger",s.portId],
      ["Duration",s.duration],
      ["Power",`${s.power} kW`],
      ["Energy",`${s.energy} kWh`],
      ["Total",inr(s.cost)],
      ["Status",s.status],
    ];
    const csv=rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`invoice-${s.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const invoice=(s)=>{
    setModal(
      <Modal title={`🧾 Invoice — ${s.id}`} onClose={()=>setModal(null)}
        footer={[<Btn key="cl" variant="secondary" onClick={()=>setModal(null)}>Close</Btn>,<Btn key="dl" variant="primary" onClick={()=>{downloadInvoice(s);toast("Invoice downloaded","success");setModal(null);}}>Download CSV</Btn>]}>
        <InfoRow label="User"     value={userName(s.userId)}/>
        <InfoRow label="Station"  value={stName(s.stationId)}/>
        <InfoRow label="Port"     value={s.portId}/>
        <InfoRow label="Energy"   value={`${s.energy} kWh`} valueStyle={{ color:C.sky }}/>
        <InfoRow label="Rate"     value="₹18/kWh"/>
        <InfoRow label="Total"    value={inr(s.cost)} valueStyle={{ color:C.teal, fontSize:20, fontWeight:800 }}/>
      </Modal>
    );
  };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Monthly Revenue" value="₹3.24L"        color={C.sky}   icon="💰"/>
        <StatCard label="Avg Session"     value="₹247"          color={C.teal}  icon="📊"/>
        <StatCard label="Shown Revenue"   value={inr(totalRev)} color={C.coral} icon="🧾"/>
        <StatCard label="Active Sessions" value={String(db.sessions.filter(s=>s.status==="active").length)} color={C.amber} icon="⚡"/>
      </div>
      <div style={S.panel}>
        <PanelHead title="Billing Records"/>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["Session ID","User","Station","Duration","Power","Energy","Rate","Total","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {bill.map(s=>(
              <tr key={s.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{s.id}</td>
                <td style={S.td}>{userName(s.userId)}</td>
                <td style={{ ...S.td, color:C.sub, fontSize:11 }}>{stName(s.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.duration}</td>
                <td style={S.td}>{s.power}</td>
                <td style={{ ...S.td, color:C.sky }}>{s.energy}</td>
                <td style={S.td}>₹18</td>
                <td style={{ ...S.td, color:C.teal, fontWeight:700 }}>{inr(s.cost)}</td>
                <td style={S.td}><Badge status={s.status}/></td>
                <td style={S.td}><Btn variant="secondary" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>invoice(s)}>Invoice</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── USER PAGES ──────────────────────────────────────────────
const PageUserOverview = ({ db, refreshDb, currentUser, setPage, setModal, toast }) => {
  const uid=currentUser.id;
  const u=db.users.find(x=>x.id===uid);
  const mySess=db.sessions.filter(s=>s.userId===uid);
  const activeS=mySess.filter(s=>s.status==="active");
  const totalE=mySess.reduce((a,s)=>a+s.energy,0);
  const totalC=mySess.reduce((a,s)=>a+s.cost,0);
  const initials=currentUser.name.split(" ").map(n=>n[0]).join("");
  const stName=id=>db.stations.find(s=>s.id===id)?.name||id;

  const endSession=(sid)=>{
    const s=db.sessions.find(x=>x.id===sid);
    setModal(<ConfirmModal title="End Session" msg={<>End <b>{sid}</b>? Bill: <b>{inr(s?.cost||0)}</b></>} danger={false} onConfirm={async()=>{ await api.patch(`/sessions/${sid}/end`,{}); await refreshDb(); toast(`Session ended · ${inr(s?.cost||0)}`,"success","✅"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:`linear-gradient(135deg,rgba(0,184,148,0.08),rgba(9,132,227,0.06))`, border:`1px solid ${C.border}`, borderRadius:16, padding:28, marginBottom:20, display:"flex", alignItems:"center", gap:24 }}>
        <div style={{ width:72, height:72, borderRadius:"50%", background:`linear-gradient(135deg,${C.teal},${C.sky})`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:26, fontWeight:800, color:"#fff", flexShrink:0 }}>{initials}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:C.text, marginBottom:4 }}>{currentUser.name}</div>
          <div style={{ fontSize:12, color:C.sub }}>{currentUser.email} · <Badge status="active"/></div>
        </div>
        <div style={{ display:"flex", gap:20 }}>
          {[[`${u?.vehicles||0}`,"Vehicles"],[`${mySess.length}`,"Sessions"],[inr(totalC),"Spent"]].map(([v,l])=>(
            <div key={l} style={{ textAlign:"center" }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:C.text }}>{v}</div><div style={{ fontSize:9, color:C.sub, letterSpacing:1.5, textTransform:"uppercase", marginTop:2 }}>{l}</div></div>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:20 }}>
        <div>
          <div style={S.sectionLabel}>Current Session</div>
          {activeS.length ? activeS.map(s=>(
            <div key={s.id} style={{ ...S.card, borderLeft:`3px solid ${C.sky}`, marginBottom:10 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.sky, marginBottom:6 }}>{s.id}</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:500, marginBottom:3 }}>⚡ Charging in Progress</div>
              <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>{stName(s.stationId)} · {s.portId}</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.sub, marginBottom:12 }}><span>Started {s.startTime}</span><span style={{ color:C.sky }}>{s.energy} kWh · {inr(s.cost)}</span></div>
              <Btn variant="danger" style={{ width:"100%", padding:7 }} onClick={()=>endSession(s.id)}>⏹ End Session</Btn>
            </div>
          )) : (
            <div style={{ ...S.card, textAlign:"center", padding:28 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🔋</div>
              <div style={{ fontSize:13, color:C.sub, marginBottom:14 }}>No active session</div>
              <Btn variant="primary" onClick={()=>setPage("book")}>⚡ Book a Slot</Btn>
            </div>
          )}
        </div>
        <div style={S.panel}>
          <PanelHead title="This Month"/>
          <div style={{ padding:20 }}>
            {[[`${totalE.toFixed(1)} kWh`,"Energy Used",Math.min(90,totalE*2)],[inr(totalC),"Cost Incurred",Math.min(90,totalC/100)],[`${Math.round(totalE*0.15)} kg`,"CO₂ Saved",40]].map(([v,l,p])=>(
              <div key={l} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}><span style={{ color:C.sub }}>{l}</span><span style={{ color:C.text, fontWeight:500 }}>{v}</span></div>
                <div style={{ height:8, background:C.border, borderRadius:4, overflow:"hidden" }}><div style={{ height:"100%", borderRadius:4, background:`linear-gradient(90deg,${C.teal},${C.sky})`, width:`${Math.min(100,p)}%` }}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={S.panel}>
        <PanelHead title="Recent Sessions" right={<button onClick={()=>setPage("my-sessions")} style={{ color:C.sky, background:"none", border:"none", cursor:"pointer", fontSize:11 }}>View All →</button>}/>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr>{["ID","Station","Start","Energy","Cost","Status"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {mySess.slice(0,4).map(s=>(
              <tr key={s.id}>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{s.id}</td>
                <td style={{ ...S.td, fontSize:11 }}>{stName(s.stationId)}</td>
                <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.startTime}</td>
                <td style={{ ...S.td, color:C.sky }}>{s.energy} kWh</td>
                <td style={S.td}>{inr(s.cost)}</td>
                <td style={S.td}><Badge status={s.status}/></td>
              </tr>
            ))}
            {mySess.length===0&&<tr><td colSpan={6} style={{ textAlign:"center", padding:20, color:C.sub }}>No sessions yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PageUserSessions = ({ db, refreshDb, currentUser, setModal, toast }) => {
  const uid=currentUser.id;
  const sess=db.sessions.filter(s=>s.userId===uid);
  const stName=id=>db.stations.find(s=>s.id===id)?.name||id;
  const totE=sess.reduce((a,s)=>a+s.energy,0);
  const totC=sess.reduce((a,s)=>a+s.cost,0);
  const endSession=(sid)=>{
    const s=db.sessions.find(x=>x.id===sid);
    setModal(<ConfirmModal title="End Session" msg={<>End <b>{sid}</b>? Bill: <b>{inr(s?.cost||0)}</b></>} danger={false} onConfirm={async()=>{ await api.patch(`/sessions/${sid}/end`,{}); await refreshDb(); toast(`Session ended`,"success","✅"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Total Sessions" value={String(sess.length)} color={C.sky}   icon="⚡"/>
        <StatCard label="Energy Used"    value={`${totE.toFixed(1)} kWh`} color={C.teal} icon="🔋"/>
        <StatCard label="Total Spent"    value={inr(totC)}            color={C.coral} icon="💰"/>
      </div>
      <div style={S.panel}>
        <PanelHead title={`My Sessions (${sess.length})`}/>
        {sess.length===0?<div style={{ textAlign:"center", padding:40, color:C.sub, fontSize:13 }}>No sessions yet</div>:(
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["ID","Station","Port","Start","End","kWh","Cost","Status",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {sess.map(s=>(
                <tr key={s.id}>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{s.id}</td>
                  <td style={{ ...S.td, fontSize:11 }}>{stName(s.stationId)}</td>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{s.portId}</td>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.startTime}</td>
                  <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11 }}>{s.endTime}</td>
                  <td style={{ ...S.td, color:C.sky }}>{s.energy}</td>
                  <td style={S.td}>{inr(s.cost)}</td>
                  <td style={S.td}><Badge status={s.status}/></td>
                  <td style={S.td}>{s.status==="active"?<Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>endSession(s.id)}>End</Btn>:null}</td>
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
  const uid=currentUser.id;
  const myRes=db.reservations.filter(r=>r.userId===uid);
  const stName=id=>db.stations.find(s=>s.id===id)?.name||id;
  const { loc, status, request } = useGeolocation();
  const [stid,setStid]=useState(db.stations[0]?.id||"");
  const [pid,setPid]=useState(db.ports.find(p=>p.stationId===db.stations[0]?.id)?.id||"");
  const [date,setDate]=useState("");
  const [time,setTime]=useState("");

  const sortedStations=useCallback(()=>{
    if(!loc) return db.stations;
    return [...db.stations].sort((a,b)=>haversineKm(loc.lat,loc.lng,a.lat,a.lng)-haversineKm(loc.lat,loc.lng,b.lat,b.lng));
  },[loc,db.stations])();

  useEffect(()=>{ if(!loc) return; const n=sortedStations[0]; if(n){setStid(n.id);setPid(db.ports.find(p=>p.stationId===n.id)?.id||"");} },[loc]);

  const stPorts=db.ports.filter(p=>p.stationId===stid);
  const selectedSt=db.stations.find(s=>s.id===stid);

  const confirm=async()=>{
    if(!date||!time){toast("Select date and time","error");return;}
    const rv=await api.post("/reservations",{userId:uid,portId:pid,stationId:stid,date,time});
    await refreshDb();
    toast(`${rv.id} confirmed!`,"success","📅");
    setDate(""); setTime("");
  };

  const cancel=(rid)=>{
    setModal(<ConfirmModal title="Cancel Reservation" msg={<>Cancel <b>{rid}</b>?</>} danger onConfirm={async()=>{ await api.patch(`/reservations/${rid}/cancel`,{}); await refreshDb(); toast("Reservation cancelled","warning","📅"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:status==="granted"?"rgba(0,184,148,0.08)":"rgba(9,132,227,0.06)", border:`1px solid ${status==="granted"?"rgba(0,184,148,0.3)":"rgba(9,132,227,0.2)"}`, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ flex:1 }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text }}>{status==="granted"?"Location acquired — nearest station pre-selected":"Reserve at the nearest station"}</div></div>
        {status==="idle"&&<Btn variant="primary" onClick={request} style={{ flexShrink:0 }}>📍 Locate Me</Btn>}
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20, height:280 }}>
        <ChargingStationMap stations={db.stations} ports={db.ports} selectedStation={selectedSt} isAdmin={false} sessions={db.sessions} admins={db.admins} userLocation={loc} navTarget={loc&&selectedSt?selectedSt:null} onStationClick={st=>{setStid(st.id);setPid(db.ports.find(p=>p.stationId===st.id)?.id||"");}}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:18 }}>
        <div style={{ ...S.panel, alignSelf:"start" }}>
          <PanelHead title="New Reservation"/>
          <div style={{ padding:20 }}>
            <div style={{ marginBottom:14 }}><label style={S.label}>Station</label>
              <select value={stid} onChange={e=>{setStid(e.target.value);setPid(db.ports.find(p=>p.stationId===e.target.value)?.id||"");}} style={S.select}>
                {sortedStations.map((s,i)=>{ const d=loc?haversineKm(loc.lat,loc.lng,s.lat,s.lng):null; return <option key={s.id} value={s.id}>{i===0&&loc?"⭐ ":""}{s.name}{d!==null?` (${d.toFixed(1)}km)`:""}</option>; })}
              </select>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Port</label><select value={pid} onChange={e=>setPid(e.target.value)} style={S.select}>{stPorts.map(p=><option key={p.id} value={p.id}>{p.id} — {p.type} {p.kw}kW · {p.status}</option>)}</select></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div><label style={S.label}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.input}/></div>
              <div><label style={S.label}>Time</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} style={S.input}/></div>
            </div>
            <Btn variant="primary" onClick={confirm}>📅 Confirm Reservation</Btn>
          </div>
        </div>
        <div style={S.panel}>
          <PanelHead title={`My Reservations (${myRes.length})`}/>
          {myRes.length===0?<div style={{ textAlign:"center", padding:40, color:C.sub, fontSize:13 }}>No reservations yet</div>:(
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["ID","Station","Port","Date/Time","Status","Nav",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {myRes.map(r=>{
                  const st=db.stations.find(s=>s.id===r.stationId);
                  return (
                    <tr key={r.id}>
                      <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sky }}>{r.id}</td>
                      <td style={{ ...S.td, fontSize:11 }}>{stName(r.stationId)}</td>
                      <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{r.portId}</td>
                      <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.sub }}>{r.datetime}</td>
                      <td style={S.td}><Badge status={r.status}/></td>
                      <td style={S.td}>{st&&<a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" style={{ color:C.sky, fontSize:10, fontWeight:700, textDecoration:"none" }}>↗ Maps</a>}</td>
                      <td style={S.td}>{r.status==="pending"&&<Btn variant="danger" style={{ padding:"4px 10px", fontSize:10 }} onClick={()=>cancel(r.id)}>Cancel</Btn>}</td>
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

const PageUserVehicles = ({ db, refreshDb, currentUser, setModal, toast }) => {
  const vehicles=db.vehicles.filter(v=>v.userId===currentUser.id);
  const openVehicle=(vehicle=null)=>{
    let make=vehicle?.make||"";
    let model=vehicle?.model||"";
    let year=vehicle?.year||"";
    let batteryKwh=vehicle?.batteryKwh||"";
    let connectorType=vehicle?.connectorType||"CCS2";
    let isDefault=Boolean(vehicle?.isDefault);
    const save=async()=>{
      if(!make||!model){toast("Vehicle make and model are required","error");return;}
      const body={make,model,year,batteryKwh,connectorType,isDefault};
      if(vehicle) await api.patch(`/vehicles/${vehicle.id}`,body);
      else await api.post("/vehicles",body);
      await refreshDb();
      toast(vehicle?"Vehicle updated":"Vehicle added","success");
      setModal(null);
    };
    setModal(
      <Modal title={vehicle?"Edit Vehicle":"Add Vehicle"} subtitle="My Vehicles" onClose={()=>setModal(null)}
        footer={[<Btn key="cancel" variant="secondary" onClick={()=>setModal(null)}>Cancel</Btn>,<Btn key="save" variant="primary" onClick={save}>{vehicle?"Save":"Add Vehicle"}</Btn>]}>
        {[["Manufacturer","text",make,v=>make=v],["Model","text",model,v=>model=v],["Year","number",year,v=>year=v],["Battery Capacity (kWh)","number",batteryKwh,v=>batteryKwh=v]].map(([l,t,v,cb])=>(
          <div key={l} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input type={t} defaultValue={v} onChange={e=>cb(e.target.value)} style={S.input}/></div>
        ))}
        <div style={{ marginBottom:14 }}><label style={S.label}>Connector Type</label><select defaultValue={connectorType} onChange={e=>connectorType=e.target.value} style={S.select}><option>CCS2</option><option>Type 2</option><option>CHAdeMO</option><option>GB/T</option></select></div>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.sub }}><input type="checkbox" defaultChecked={isDefault} onChange={e=>isDefault=e.target.checked}/> Set as default vehicle</label>
      </Modal>
    );
  };
  const removeVehicle=(vehicle)=>{
    setModal(<ConfirmModal title="Remove Vehicle" msg={<>Remove <b>{vehicle.make} {vehicle.model}</b>?</>} danger onConfirm={async()=>{ await api.del(`/vehicles/${vehicle.id}`); await refreshDb(); toast("Vehicle removed","warning"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };
  const setDefault=async(vehicle)=>{
    await api.patch(`/vehicles/${vehicle.id}`,{isDefault:true});
    await refreshDb();
    toast(`${vehicle.make} ${vehicle.model} is now default`,"success");
  };
  return (
    <div style={S.panel}>
      <PanelHead title={`My Vehicles (${vehicles.length})`} right={<Btn variant="primary" style={{ padding:"7px 16px" }} onClick={()=>openVehicle()}>+ Add Vehicle</Btn>}/>
      {vehicles.length===0?<div style={{ textAlign:"center", padding:44, color:C.sub }}>No vehicles added yet</div>:(
        <div style={{ padding:18, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:14 }}>
          {vehicles.map(v=>(
            <div key={v.id} style={{ ...S.card, minHeight:150 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:12, marginBottom:8 }}>
                <div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:800, color:C.text }}>{v.make} {v.model}</div><div style={{ fontSize:11, color:C.sub }}>{v.year||"-"} · {v.connectorType||"CCS2"}</div></div>
                {v.isDefault?<Badge status="available" label="Default"/>:<Btn variant="secondary" style={{ padding:"4px 8px", fontSize:9 }} onClick={()=>setDefault(v)}>Default</Btn>}
              </div>
              <InfoRow label="Battery" value={`${v.batteryKwh||"-"} kWh`}/>
              <InfoRow label="Vehicle ID" value={v.id}/>
              <div style={{ display:"flex", gap:8, marginTop:12 }}><Btn variant="secondary" style={{ flex:1, padding:7 }} onClick={()=>openVehicle(v)}>Edit</Btn><Btn variant="danger" style={{ flex:1, padding:7 }} onClick={()=>removeVehicle(v)}>Remove</Btn></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PageUserProfile = ({ db, refreshDb, currentUser, setCurrentUser, toast }) => {
  const user=db.users.find(u=>u.id===currentUser.id)||currentUser;
  const [name,setName]=useState(user.name||"");
  const [email,setEmail]=useState(user.email||"");
  const [phone,setPhone]=useState(user.phone||"");
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [saving,setSaving]=useState(false);
  const saveProfile=async()=>{
    setSaving(true);
    try {
      const updated=await api.patch("/profile",{name,email,phone});
      setCurrentUser(prev=>({...prev,...updated,token:prev.token}));
      await refreshDb();
      toast("Profile updated","success");
    } catch(e) { toast(e.message||"Unable to update profile","error"); }
    finally { setSaving(false); }
  };
  const changePassword=async()=>{
    setSaving(true);
    try {
      await api.patch("/profile/password",{currentPassword,newPassword,confirmPassword});
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast("Password changed","success");
    } catch(e) { toast(e.message||"Unable to change password","error"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, alignItems:"start" }}>
      <div style={S.panel}>
        <PanelHead title="Profile"/>
        <div style={{ padding:20 }}>
          {[["Name",name,setName],["Username / Email",email,setEmail],["Phone",phone,setPhone]].map(([l,v,sv])=>(
            <div key={l} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input value={v} onChange={e=>sv(e.target.value)} style={S.input}/></div>
          ))}
          <Btn variant="primary" disabled={saving} onClick={saveProfile}>Save Profile</Btn>
        </div>
      </div>
      <div style={S.panel}>
        <PanelHead title="Change Password"/>
        <div style={{ padding:20 }}>
          {[["Current Password",currentPassword,setCurrentPassword],["New Password",newPassword,setNewPassword],["Confirm Password",confirmPassword,setConfirmPassword]].map(([l,v,sv])=>(
            <div key={l} style={{ marginBottom:14 }}><label style={S.label}>{l}</label><input type="password" value={v} onChange={e=>sv(e.target.value)} style={S.input}/></div>
          ))}
          <Btn variant="primary" disabled={saving} onClick={changePassword}>Update Password</Btn>
        </div>
      </div>
    </div>
  );
};

const PageUserBook = ({ db, refreshDb, currentUser, setModal, toast, setPage }) => {
  const { loc, status, request } = useGeolocation();
  const [stid,setStid]=useState("");
  const [pid,setPid]=useState("");

  const sortedStations=useCallback(()=>{
    if(!loc) return db.stations;
    return [...db.stations].sort((a,b)=>haversineKm(loc.lat,loc.lng,a.lat,a.lng)-haversineKm(loc.lat,loc.lng,b.lat,b.lng));
  },[loc,db.stations])();

  useEffect(()=>{ if(!loc||stid) return; const nearest=sortedStations.find(s=>db.ports.some(p=>p.stationId===s.id&&p.status==="available")); if(nearest){setStid(nearest.id);toast(`📍 Nearest: ${nearest.name}`,"success","🎯");} },[loc]);

  const selectedSt=db.stations.find(s=>s.id===stid);
  const availPorts=db.ports.filter(p=>p.stationId===stid&&p.status==="available");
  const selPort=db.ports.find(p=>p.id===pid);
  const distKm=loc&&selectedSt?haversineKm(loc.lat,loc.lng,selectedSt.lat,selectedSt.lng):null;

  const book=(sid,portId)=>{
    const st=db.stations.find(s=>s.id===sid);
    const p=db.ports.find(x=>x.id===portId);
    setModal(<ConfirmModal title="Start Charging?" msg={<>Start at <b>{st?.name}</b>, Port <b>{portId}</b> ({p?.kw}kW)?</>} danger={false} onConfirm={async()=>{ await api.post("/sessions",{userId:currentUser.id,portId,stationId:sid}); await refreshDb(); toast(`Charging started at ${st?.name} ⚡`,"success","⚡"); setModal(null); setPage("my-sessions"); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:status==="granted"?"rgba(0,184,148,0.08)":"rgba(255,107,53,0.06)", border:`1px solid ${status==="granted"?"rgba(0,184,148,0.3)":"rgba(255,107,53,0.25)"}`, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ flex:1 }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text }}>{status==="granted"?"Location acquired — nearest available station highlighted":"Find the nearest charger to you"}</div></div>
        {status==="idle"&&<Btn variant="primary" onClick={request} style={{ flexShrink:0 }}>📍 Use My Location</Btn>}
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20, height:300 }}>
        <ChargingStationMap stations={db.stations} ports={db.ports} selectedStation={selectedSt} isAdmin={false} sessions={db.sessions} admins={db.admins} userLocation={loc} navTarget={loc&&selectedSt?selectedSt:null} onStationClick={st=>{setStid(st.id);setPid("");}}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:18, alignItems:"start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {sortedStations.map((s,idx)=>{
            const av=db.ports.filter(p=>p.stationId===s.id&&p.status==="available").length;
            const dist=loc?haversineKm(loc.lat,loc.lng,s.lat,s.lng):null;
            const isSel=stid===s.id;
            return (
              <div key={s.id} onClick={()=>{setStid(s.id);setPid("");}} style={{ background:isSel?"rgba(0,184,148,0.04)":C.surface, border:`2px solid ${isSel?C.teal:C.border}`, borderRadius:14, padding:"12px 16px", cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:av>0?"rgba(0,184,148,0.1)":"rgba(232,67,147,0.08)", border:`1.5px solid ${av>0?"rgba(0,184,148,0.3)":"rgba(232,67,147,0.2)"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, fontWeight:800, color:av>0?C.teal:C.coral }}>{av}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text, marginBottom:3 }}>{s.name}{loc&&idx===0?<span style={{ marginLeft:8, fontSize:8, color:C.orange, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Nearest</span>:null}</div>
                    <div style={{ fontSize:11, color:C.sub }}>📍 {s.location} · {av} free port{av!==1?"s":""}</div>
                  </div>
                  {dist!==null&&<div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:800, color:dist<3?C.teal:dist<8?C.amber:C.dim }}>{dist.toFixed(1)}<span style={{ fontSize:10, fontWeight:400 }}> km</span></div>}
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
                  {distKm!==null&&<div style={{ fontSize:11, color:C.amber, fontWeight:700 }}>📍 {distKm.toFixed(1)} km away</div>}
                </div>
                {availPorts.length>0 ? (
                  <>
                    <div style={{ marginBottom:14 }}><label style={S.label}>Select Port</label>
                      <select value={pid} onChange={e=>setPid(e.target.value)} style={S.select}>
                        <option value="">-- Choose a port --</option>
                        {availPorts.map(p=><option key={p.id} value={p.id}>{p.id} — {p.type} {p.kw}kW · ₹{p.price}/kWh</option>)}
                      </select>
                    </div>
                    {selPort&&(
                      <div style={{ background:"rgba(9,132,227,0.06)", border:"1px solid rgba(9,132,227,0.2)", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                        <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Estimated cost (1h at {selPort.kw}kW)</div>
                        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:20, fontWeight:800, color:C.sky }}>{inr(selPort.price*selPort.kw)}</div>
                      </div>
                    )}
                    <Btn variant="primary" style={{ width:"100%", padding:13 }} disabled={!pid} onClick={()=>book(stid,pid)}>⚡ Start Charging</Btn>
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
  const [selected,setSelected]=useState(null);

  const sortedStations=useCallback(()=>{
    if(!loc) return db.stations;
    return [...db.stations].sort((a,b)=>haversineKm(loc.lat,loc.lng,a.lat,a.lng)-haversineKm(loc.lat,loc.lng,b.lat,b.lng));
  },[loc,db.stations])();

  const book=(stid,portId)=>{
    const st=db.stations.find(s=>s.id===stid);
    const p=db.ports.find(x=>x.id===portId);
    setModal(<ConfirmModal title="Start Charging?" msg={<>Start at <b>{st?.name}</b>, Port <b>{portId}</b> ({p?.kw}kW)?</>} danger={false} onConfirm={async()=>{ await api.post("/sessions",{userId:currentUser.id,portId,stationId:stid}); await refreshDb(); toast(`Charging started!`,"success","⚡"); setModal(null); }} onClose={()=>setModal(null)}/>);
  };

  return (
    <div>
      <div style={{ background:status==="granted"?"rgba(0,184,148,0.08)":"rgba(255,107,53,0.06)", border:`1px solid ${status==="granted"?"rgba(0,184,148,0.3)":"rgba(255,107,53,0.25)"}`, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ flex:1 }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:C.text }}>{status==="granted"?"Stations sorted by distance from you":"Find stations near you"}</div></div>
        {status==="idle"&&<Btn variant="primary" onClick={request} style={{ flexShrink:0 }}>📍 Use My Location</Btn>}
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20, height:340 }}>
        <ChargingStationMap stations={db.stations} ports={db.ports} selectedStation={selected} isAdmin={false} sessions={db.sessions} admins={db.admins} userLocation={loc} navTarget={loc&&selected?selected:null} onStationClick={st=>setSelected(st)}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {sortedStations.map((st,idx)=>{
          const sps=db.ports.filter(p=>p.stationId===st.id);
          const av=sps.filter(p=>p.status==="available").length;
          const dist=loc?haversineKm(loc.lat,loc.lng,st.lat,st.lng):null;
          const isSel=selected?.id===st.id;
          return (
            <div key={st.id} onClick={()=>setSelected(st)} style={{ background:C.surface, border:`2px solid ${isSel?C.orange:C.border}`, borderRadius:16, padding:16, cursor:"pointer", transition:"all 0.2s" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:800, color:C.text }}>{st.name}{loc&&idx===0?<span style={{ display:"block", fontSize:8, color:C.orange, fontWeight:700 }}>📍 Nearest</span>:null}</div>
                <Badge status={av>0?"available":"occupied"} label={av>0?`${av} free`:"Full"}/>
              </div>
              <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>📍 {st.location}{dist!==null?` · ${dist.toFixed(1)} km`:""}</div>
              <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:12 }}>
                {sps.map(p=><div key={p.id} title={`${p.id} — ${p.status}`} style={{ width:22, height:22, borderRadius:5, background:SB[p.status], border:`1px solid ${SC[p.status]}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:SC[p.status] }}>{p.type[0]}</div>)}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <Btn variant="primary" style={{ flex:1, padding:"7px 0", fontSize:10 }} disabled={av===0} onClick={e=>{ e.stopPropagation(); const fp=sps.find(p=>p.status==="available"); if(fp) book(st.id,fp.id); }}>⚡ Book</Btn>
                {loc&&<a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"7px 10px", borderRadius:9, background:"rgba(9,132,227,0.08)", border:`1px solid rgba(9,132,227,0.2)`, color:C.sky, fontSize:11, fontWeight:700, textDecoration:"none" }}>↗</a>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── LOGIN ───────────────────────────────────────────────────
const LoginScreen = ({ onLogin, onRegister }) => {
  const [stage,setStage]=useState("splash");
  const [role,setRole]=useState(null);
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const goBack=()=>{setStage(s=>s==="form"?"roles":"splash");setError("");};
  const pickRole=(r)=>{setRole(r);setStage("form");setMode("login");setEmail("");setPass("");setName("");setPhone("");setConfirm("");setError("");};
  const attempt=async()=>{
    setBusy(true); setError("");
    const ok=await onLogin(role,email,pass);
    if(!ok) setError("Invalid credentials.");
    setBusy(false);
  };
  const register=async()=>{
    setBusy(true); setError("");
    const ok=await onRegister({name,email,phone,password:pass,confirmPassword:confirm});
    if(!ok) setError("Could not create account.");
    setBusy(false);
  };
  return (
    <div className="login-shell" style={{ minHeight:"100vh", background:"#050509", display:"flex", alignItems:"center", justifyContent:"center", padding:24, position:"relative", overflow:"hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');@keyframes slideIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes auroraDrift{0%{transform:translate3d(-4%,-3%,0) scale(1)}50%{transform:translate3d(5%,4%,0) scale(1.05)}100%{transform:translate3d(-4%,-3%,0) scale(1)}}.login-shell:before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 18% 14%,rgba(98,70,255,.42),transparent 28%),radial-gradient(circle at 78% 24%,rgba(0,184,148,.34),transparent 26%),radial-gradient(circle at 48% 78%,rgba(255,61,129,.28),transparent 30%),linear-gradient(135deg,#050509,#130914 48%,#06130F);animation:auroraDrift 10s ease-in-out infinite}.login-shell:after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:46px 46px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.8),transparent 80%)}.login-shell button,.login-shell input{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.login-shell button:hover{transform:translateY(-2px)}.login-shell input:focus{border-color:rgba(98,70,255,.45)!important;box-shadow:0 0 0 4px rgba(98,70,255,.12)}`}</style>
      <CursorAura/>
      <div style={{ width:"100%", maxWidth:460, position:"relative", zIndex:4 }}>
        <div style={{ background:"linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,255,255,0.82))", borderRadius:30, padding:42, boxShadow:"0 34px 95px rgba(0,0,0,0.38), 0 0 60px rgba(98,70,255,0.14)", border:"1px solid rgba(255,255,255,0.78)", backdropFilter:"blur(22px)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
            <div style={{ width:48, height:48, borderRadius:15, background:`linear-gradient(135deg,${ORANGE},${PINK},${VIOLET})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, boxShadow:`0 16px 36px ${ORANGE}55` }}>⚡</div>
            <div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:25, fontWeight:900, color:C.text, letterSpacing:0 }}>EV<span style={{ color:ORANGE }}>GRID</span></div></div>
          </div>
          {stage==="splash" && (
            <div style={{ animation:"slideIn 0.3s ease" }}>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:34, fontWeight:900, color:C.text, margin:"10px 0 34px", lineHeight:1.05, letterSpacing:0 }}>Welcome back</div>
              <button onClick={()=>setStage("roles")} style={{ width:"100%", padding:"18px", borderRadius:16, border:"none", background:`linear-gradient(135deg,${ORANGE},${PINK},${VIOLET})`, color:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:900, cursor:"pointer", boxShadow:`0 18px 42px ${PINK}33`, letterSpacing:0 }}>Get Started</button>
            </div>
          )}
          {stage==="roles" && (
            <div style={{ animation:"slideIn 0.35s ease" }}>
              <button onClick={goBack} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:12, marginBottom:28, fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:600 }}>← Back</button>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:28, fontWeight:800, color:C.text, marginBottom:28 }}>Sign in as</div>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {[["user","U","User Account",TEAL],["admin","A","Admin Console",ORANGE]].map(([r,ic,title,col])=>(
                  <div key={r} onClick={()=>pickRole(r)} style={{ background:"rgba(255,255,255,0.96)", border:`1px solid ${r==="user"?"rgba(0,184,148,0.24)":"rgba(255,107,53,0.24)"}`, borderRadius:20, padding:"22px 24px", cursor:"pointer", display:"flex", alignItems:"center", gap:16, boxShadow:"0 14px 34px rgba(26,18,9,0.08)" }}>
                    <div style={{ width:52, height:52, borderRadius:16, background:`${col}12`, border:`1.5px solid ${col}38`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:900, color:col, flexShrink:0 }}>{ic}</div>
                    <div style={{ flex:1 }}><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:900, color:C.text }}>{title}</div></div>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:col, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:14, fontWeight:900, flexShrink:0 }}>&gt;</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stage==="form" && role && (
            <div style={{ animation:"slideIn 0.3s ease" }}>
              <button onClick={goBack} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:12, marginBottom:28, fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:600 }}>← Back</button>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:C.text, marginBottom:20 }}>{role==="user"?(mode==="register"?"Create Account":"User Login"):"Admin Login"}</div>
              {mode==="login"&&<div style={{ background:`${role==="user"?TEAL:ORANGE}10`, border:`1.5px dashed ${role==="user"?TEAL:ORANGE}44`, borderRadius:12, padding:"10px 14px", marginBottom:22 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:role==="user"?TEAL:ORANGE, marginBottom:6 }}>Demo Credentials</div>
                {[["Username",role==="user"?"user":"admin"],["Password",role==="user"?"user123":"admin123"]].map(([l,v])=>(
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.sub, marginBottom:2 }}><span>{l}</span><span style={{ fontFamily:"'DM Mono',monospace", color:role==="user"?TEAL:ORANGE, fontWeight:600 }}>{v}</span></div>
                ))}
              </div>}
              {mode==="register"&&role==="user"&&[["Full Name","text",name,setName],["Phone","tel",phone,setPhone]].map(([l,t,v,sv])=>(
                <div key={l} style={{ marginBottom:16 }}>
                  <label style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:C.sub, display:"block", marginBottom:7, fontWeight:700 }}>{l}</label>
                  <input type={t} value={v} onChange={e=>sv(e.target.value)} style={{ width:"100%", background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"13px 16px", color:C.text, fontSize:13, outline:"none", boxSizing:"border-box" }}/>
                </div>
              ))}
              {[["Username or Email","text",email,setEmail],["Password","password",pass,setPass]].map(([l,t,v,sv])=>(
                <div key={l} style={{ marginBottom:16 }}>
                  <label style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:C.sub, display:"block", marginBottom:7, fontWeight:700 }}>{l}</label>
                  <input type={t} value={v} onChange={e=>sv(e.target.value)} onKeyDown={e=>e.key==="Enter"&&attempt()} style={{ width:"100%", background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"13px 16px", color:C.text, fontSize:13, outline:"none", boxSizing:"border-box" }} placeholder={t==="email"?"your@email.com":"••••••••"}/>
                </div>
              ))}
              {mode==="register"&&role==="user"&&(
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:C.sub, display:"block", marginBottom:7, fontWeight:700 }}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&register()} style={{ width:"100%", background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"13px 16px", color:C.text, fontSize:13, outline:"none", boxSizing:"border-box" }}/>
                </div>
              )}
              {error&&<div style={{ background:"#FFF0F5", border:"1px solid #FCCADA", borderRadius:8, padding:"8px 12px", fontSize:11, color:C.coral, marginBottom:14, fontWeight:600 }}>{error}</div>}
              <button disabled={busy} onClick={mode==="register"?register:attempt} style={{ width:"100%", padding:"15px", borderRadius:14, border:"none", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14, fontWeight:800, cursor:busy?"not-allowed":"pointer", opacity:busy?0.7:1, background:role==="user"?`linear-gradient(135deg,${TEAL},${SKY})`:`linear-gradient(135deg,${ORANGE},#FF9A00)`, color:"#fff" }}>
                {busy?"Please wait...":mode==="register"?"Create Account":role==="user"?"Sign In":"Access Dashboard"}
              </button>
              {role==="user"&&(
                <button onClick={()=>{setMode(mode==="register"?"login":"register");setError("");}} style={{ width:"100%", marginTop:12, padding:"11px", borderRadius:12, border:`1px solid ${C.border}`, background:"#fff", color:C.teal, cursor:"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:700 }}>
                  {mode==="register"?"Already have an account? Sign in":"Create a new user account"}
                </button>
              )}
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
  const [db,setDb]=useState(null);
  const [loading,setLoading]=useState(true);
  const [currentUser,setCurrentUser]=useState(null);
  const [page,setPage]=useState("dashboard");
  const [modal,setModal]=useState(null);
  const [toasts,setToasts]=useState([]);
  const [selectedSt,setSelectedSt]=useState(null);
  const [panelSt,setPanelSt]=useState(null);
  const [revCounter,setRevCounter]=useState(0);
  const [clock,setClock]=useState("");

  const refreshDb=useCallback(async()=>{
    const data=await api.get("/db");
    setDb(data);
    setRevCounter(data.stations.reduce((a,s)=>a+s.revenue,0));
  },[]);

  useEffect(()=>{ refreshDb().finally(()=>setLoading(false)); },[]);
  useEffect(()=>{ if(!currentUser) return; const t=setInterval(()=>refreshDb().catch(()=>{}),10000); return ()=>clearInterval(t); },[currentUser,refreshDb]);
  useEffect(()=>{ const t=setInterval(()=>setClock(new Date().toLocaleTimeString("en-IN")),1000); return ()=>clearInterval(t); },[]);

  const toast=useCallback((msg,type="info",icon=null)=>{
    const icons={success:"✅",error:"❌",info:"ℹ️",warning:"⚠️"};
    const id=Date.now()+Math.random();
    setToasts(t=>[...t,{id,msg,type,icon:icon||icons[type]}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3400);
  },[]);

  const doLogin=async(role,email,pass)=>{
    try {
      const res=await api.post("/auth/login",{role,email,password:pass});
      const user=res.user||res;
      if(!user||!user.name) throw new Error("Invalid response");
      const token=res.token||user.token;
      api.setToken(token);
      setCurrentUser({...user, token});
      await refreshDb();
      setPage(role==="admin"?"dashboard":"my-overview");
      toast(`Welcome back, ${user.name.split(" ")[0]}! 👋`,"success");
      return true;
    } catch(e) { toast(e.message||"Login failed","error"); return false; }
  };

  const doRegister=async(payload)=>{
    try {
      const res=await api.post("/auth/register",payload);
      const user=res.user||res;
      if(!user||!user.name) throw new Error("Invalid response");
      const token=res.token||user.token;
      api.setToken(token);
      setCurrentUser({...user, token});
      await refreshDb();
      setPage("my-overview");
      toast(`Account created for ${user.name.split(" ")[0]}`,"success");
      return true;
    } catch(e) { toast(e.message||"Registration failed","error"); return false; }
  };

  const doLogout=()=>{ api.setToken(""); setCurrentUser(null); setPage("dashboard"); toast("Signed out","info"); };

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg }}>
      <div style={{ textAlign:"center" }}><div style={{ fontSize:36, marginBottom:12 }}>⚡</div><div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14, color:C.sub }}>Loading charging network...</div></div>
    </div>
  );

  if (!currentUser) return <LoginScreen onLogin={doLogin} onRegister={doRegister}/>;

  const isAdmin=currentUser.role==="admin";
  const hasAdminPermission=(permission)=>isAdmin&&currentUser.permissions?.includes(permission);
  const stName=id=>db.stations.find(s=>s.id===id)?.name||id;
  const userName=id=>db.users.find(u=>u.id===id)?.name||id;
  const sharedProps={ db, refreshDb, setModal, toast };

  const pageMap={
    dashboard:          isAdmin?<PageAdminDashboard  {...sharedProps} revCounter={revCounter} selectedStation={selectedSt} setSelectedStation={setSelectedSt} stationPanelStation={panelSt} setStationPanelStation={setPanelSt}/>:null,
    stations:           hasAdminPermission("stations.view")?<PageAdminStations   {...sharedProps} selectedStation={selectedSt} setSelectedStation={setSelectedSt} stationPanelStation={panelSt} setStationPanelStation={setPanelSt}/>:null,
    sessions:           hasAdminPermission("sessions.view")?<PageAdminSessions   {...sharedProps} userName={userName} stName={stName}/>:null,
    reservations:       hasAdminPermission("reservations.view")?<PageAdminReservations {...sharedProps} userName={userName} stName={stName}/>:null,
    users:              hasAdminPermission("users.view")?<PageAdminUsers      {...sharedProps}/>:null,
    admins:             hasAdminPermission("admins.view")?<PageAdminAdmins     {...sharedProps} currentUser={currentUser}/>:null,
    billing:            hasAdminPermission("billing.view")?<PageAdminBilling    {...sharedProps} userName={userName} stName={stName}/>:null,
    database:           hasAdminPermission("database.view")?<DatabaseViewer db={db}/>:null,
    "my-overview":     !isAdmin?<PageUserOverview    {...sharedProps} currentUser={currentUser} setPage={setPage}/>:null,
    "my-sessions":     !isAdmin?<PageUserSessions    {...sharedProps} currentUser={currentUser}/>:null,
    "my-reservations": !isAdmin?<PageUserReservations {...sharedProps} currentUser={currentUser}/>:null,
    "my-vehicles":     !isAdmin?<PageUserVehicles    {...sharedProps} currentUser={currentUser}/>:null,
    profile:           !isAdmin?<PageUserProfile     {...sharedProps} currentUser={currentUser} setCurrentUser={setCurrentUser}/>:null,
    book:              !isAdmin?<PageUserBook        {...sharedProps} currentUser={currentUser} setPage={setPage}/>:null,
    "find-stations":   !isAdmin?<PageUserFindStations {...sharedProps} currentUser={currentUser}/>:null,
  };

  const pageTitles={ dashboard:"Admin Dashboard", stations:"Charging Stations", sessions:"Active Charging Sessions", reservations:"Reservations", users:"User Management", admins:"Admin Management", billing:"Revenue", database:"Database", "my-overview":"My Dashboard", "my-sessions":"My Charging Sessions", "my-reservations":"My Reservations", "my-vehicles":"My Vehicles", profile:"Profile", book:"Reserve Charging Slot", "find-stations":"Discover Charging Stations" };

  const adminNav=[
    { section:"Overview",   items:[["dashboard","H","Dashboard"],["stations","S","Stations"],["sessions","L","Active Sessions"],["reservations","R","Reservations"]] },
    { section:"Management", items:[["users","U","Users"],["admins","A","Admins"],["billing","$","Revenue"]] },
    { section:"System",     items:[["database","D","Database"]] },
  ];
  const userNav=[
    { section:"Home",     items:[["my-overview","H","Dashboard"]] },
    { section:"Charging", items:[["find-stations","S","Find Stations"],["book","B","Book Charging Slot"],["my-reservations","R","Reservations"],["my-sessions","C","Charging Sessions"]] },
    { section:"Account",  items:[["my-vehicles","V","My Vehicles"],["profile","P","Profile"]] },
  ];
  const navSections=(isAdmin?adminNav:userNav).map(section=>({...section,items:section.items.filter(([p])=>pageMap[p])})).filter(section=>section.items.length);
  const initials=currentUser.name.split(" ").map(n=>n[0]).join("");

  return (
    <div className="app-shell" style={{ display:"flex", minHeight:"100vh", background:"#050509", color:C.text, fontFamily:"'DM Sans',sans-serif", position:"relative", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes modalUp{from{opacity:0;transform:translateY(14px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
        @keyframes auroraFlow{0%{transform:translate3d(-6%,-4%,0) scale(1)}50%{transform:translate3d(6%,4%,0) scale(1.05)}100%{transform:translate3d(-6%,-4%,0) scale(1)}}
        @keyframes softFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        .app-shell button,.app-shell a,.app-shell input,.app-shell select{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,filter .18s ease}
        .app-shell button:hover,.app-shell a:hover{transform:translateY(-1px);filter:saturate(1.08)}
        .app-shell input:focus,.app-shell select:focus{border-color:rgba(98,70,255,0.45)!important;box-shadow:0 0 0 4px rgba(98,70,255,0.10)}
        .app-shell main [style*="box-shadow"]:hover{transform:translateY(-2px)}
        .app-shell tbody tr:hover td{background:rgba(98,70,255,0.06)}
        .app-shell nav button:hover{background:rgba(255,255,255,0.08)!important;border-color:rgba(255,255,255,0.14)!important}
        .app-shell svg path:nth-child(2){filter:drop-shadow(0 0 10px rgba(0,184,148,.32))}
        .luxury-main{position:relative;isolation:isolate;background:radial-gradient(circle at 18% 6%,rgba(98,70,255,0.30),transparent 30%),radial-gradient(circle at 82% 0%,rgba(0,184,148,0.24),transparent 26%),radial-gradient(circle at 55% 72%,rgba(255,61,129,0.15),transparent 32%),linear-gradient(135deg,#07070D 0%,#15100F 48%,#070B13 100%)}
        .luxury-main:before{content:"";position:fixed;left:252px;right:0;top:0;bottom:0;pointer-events:none;background:linear-gradient(120deg,transparent 0%,rgba(255,255,255,0.08) 42%,transparent 55%);animation:auroraFlow 9s ease-in-out infinite;z-index:0}
        .luxury-main:after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,rgba(0,0,0,0.7),transparent 70%);z-index:0}
        .luxury-main>*{position:relative;z-index:2}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#F0EBE3}
        ::-webkit-scrollbar-thumb{background:#D4C4B0;border-radius:4px}
        select option{background:#fff;color:#1A1209}
      `}</style>
      <CursorAura/>

      {/* Sidebar */}
      <aside style={{ width:252, background:"linear-gradient(180deg,#07070C 0%,#1A1209 55%,#130914 100%)", display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, bottom:0, zIndex:100, boxShadow:"8px 0 34px rgba(0,0,0,0.35)", borderRight:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ padding:"24px 20px 18px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:`linear-gradient(135deg,${C.orange},${C.pink},${C.violet})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, boxShadow:`0 12px 30px ${C.orange}44`, flexShrink:0 }}>⚡</div>
            <div>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:"#fff", letterSpacing:"-0.5px" }}>EV<span style={{ color:C.orange }}>GRID</span></div>
              <div style={{ fontSize:8, color:C.sideMu, letterSpacing:1.6, textTransform:"uppercase" }}>Discovery & Reservation</div>
            </div>
          </div>
          <div style={{ marginTop:16, background:C.sideB, borderRadius:12, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:isAdmin?C.orange:C.teal, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:800, color:"#fff", flexShrink:0 }}>{initials}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, color:"#F5F0E8", fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize:9, color:C.sideMu, letterSpacing:1, textTransform:"uppercase", display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:isAdmin?C.orange:C.teal }}/>
                {isAdmin?"Administrator":"EV User"}
              </div>
            </div>
          </div>
        </div>
        <nav style={{ padding:"16px 12px", flex:1, overflowY:"auto" }}>
          {navSections.map(({section,items})=>(
            <div key={section} style={{ marginBottom:24 }}>
              <div style={{ fontSize:8, color:C.sideMu, letterSpacing:3, textTransform:"uppercase", padding:"0 8px 8px", fontWeight:700 }}>{section}</div>
              {items.map(([p,icon,label])=>{
                const active=page===p;
                return (
                  <button key={p} onClick={()=>setPage(p)}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 12px", borderRadius:10, background:active?"rgba(255,107,53,0.15)":"transparent", border:active?`1px solid rgba(255,107,53,0.3)`:"1px solid transparent", color:active?C.orange:C.sideMu, cursor:"pointer", marginBottom:3, transition:"all 0.2s", textAlign:"left", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:active?700:500 }}>
                    <span style={{ fontSize:12, opacity:active?1:0.7, fontFamily:"'DM Mono',monospace", width:14, textAlign:"center" }}>{icon||"*"}</span>
                    {label}
                    {active&&<div style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:C.orange }}/>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        {/* Database status indicator */}
        <div style={{ margin:"0 12px 8px", background:"rgba(63,185,80,0.08)", border:"1px solid rgba(63,185,80,0.2)", borderRadius:10, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:"#3FB950", flexShrink:0 }}/>
          <span style={{ fontSize:9, color:"#3FB950", fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>Live Database</span>
        </div>
        <div style={{ padding:"12px 20px 16px", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize:9, color:C.sideMu, fontFamily:"'DM Mono',monospace", marginBottom:10 }}>{clock}</div>
          <button onClick={doLogout} style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px solid rgba(255,107,53,0.3)`, background:"rgba(255,107,53,0.08)", color:C.orange, cursor:"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>Sign Out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="luxury-main" style={{ marginLeft:252, flex:1, padding:28, maxWidth:"calc(100vw - 252px)", minHeight:"100vh" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:24, fontWeight:900, color:"#fff", letterSpacing:0, textShadow:"0 12px 34px rgba(0,0,0,0.35)" }}>{pageTitles[page]||page}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.68)", marginTop:3 }}>EV Charging Station Discovery & Reservation · {isAdmin?"Admin":"User"} · <span style={{ color:"#65F2C8", fontWeight:800 }}>Live</span></div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.22)", borderRadius:12, padding:"7px 14px", backdropFilter:"blur(14px)" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:C.teal }}/>
              <span style={{ fontSize:11, color:"#fff", fontWeight:700 }}>Live</span>
            </div>
          </div>
        </div>
        {pageMap[page]||<div style={{ textAlign:"center", padding:60, color:C.sub }}>Page not found</div>}
      </main>

      {modal}

      <div style={{ position:"fixed", top:20, right:20, zIndex:9999, display:"flex", flexDirection:"column", gap:10 }}>
        {toasts.map(t=>(
          <div key={t.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px", boxShadow:"0 8px 24px rgba(26,18,9,0.12)", display:"flex", alignItems:"center", gap:10, animation:"toastIn 0.3s ease", minWidth:260 }}>
            <span style={{ fontSize:16 }}>{t.icon}</span>
            <span style={{ fontSize:12, color:C.text, fontWeight:500 }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
