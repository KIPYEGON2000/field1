import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { API_URL, DEFAULT_MAP_CENTER, MAX_DISTANCE_METRES, MAX_GPS_ACCURACY_METRES } from "./config";
import { getPoints, markAttended } from "./api";

function markerIcon(color) {
  return L.divIcon({
    className: "custom-marker",
    html: `<span style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}
const pendingIcon = markerIcon("#dc3545");
const userIcon = L.divIcon({
  className: "user-marker",
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function Recenter({ position }) {
  const map = useMap();
  useEffect(() => { if (position) map.setView(position, Math.max(map.getZoom(), 16)); }, [position, map]);
  return null;
}

export default function App() {
  const [points, setPoints] = useState([]);
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [officer, setOfficer] = useState(localStorage.getItem("fieldOfficer") || "");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);

  async function refresh() {
    try {
      const rows = await getPoints();
      setPoints(rows.filter(p => p.status.toLowerCase() !== "attended"));
      setLastRefresh(new Date());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("This browser does not support GPS location.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPosition([p.coords.latitude, p.coords.longitude]);
        setAccuracy(p.coords.accuracy);
      },
      (e) => setError(`GPS error: ${e.message}. Allow location access and use HTTPS.`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const selectedDistance = useMemo(() => {
    if (!selected || !position) return null;
    return haversine(position[0], position[1], selected.y, selected.x);
  }, [selected, position]);

  const gpsAccurate = accuracy !== null && accuracy <= MAX_GPS_ACCURACY_METRES;
  const withinRange = selectedDistance !== null && selectedDistance <= MAX_DISTANCE_METRES && gpsAccurate;
  const mapCenter = position || DEFAULT_MAP_CENTER;

  function openPoint(point) {
    setSelected(point);
    setComments("");
    setNotice("");
  }

  async function saveAttendance() {
    if (!selected || !position || !withinRange || !officer.trim()) return;
    setSaving(true);
    setError("");
    try {
      localStorage.setItem("fieldOfficer", officer.trim());
      await markAttended({
        taskId: selected.taskId,
        latitude: position[0],
        longitude: position[1],
        accuracy,
        officer: officer.trim(),
        comments: comments.trim()
      });
      setPoints(current => current.filter(p => p.taskId !== selected.taskId));
      setSelected(null);
      setNotice(`Task ${selected.taskId} marked as attended. It has been removed from the active map.`);
      setComments("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const directionsUrl = selected
    ? `https://www.google.com/maps/dir/?api=1&destination=${selected.y},${selected.x}&travelmode=walking`
    : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">FIELD OPERATIONS</div>
          <h1>Inspection Map</h1>
          <p>Navigate to assigned points and record attendance.</p>
        </div>
        <button className="refresh" onClick={refresh}>↻ Refresh</button>
      </header>

      <section className="summary">
        <div className="metric"><strong>{points.length}</strong><span>Active points</span></div>
        <div className="metric"><strong>{position ? "GPS on" : "Waiting"}</strong><span>Officer location</span></div>
        <div className="metric"><strong>{accuracy == null ? "—" : `${Math.round(accuracy)} m`}</strong><span>GPS accuracy</span></div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      {API_URL.includes("PASTE_") && <div className="alert warning">Configure the Apps Script URL in <code>src/config.js</code> before using the map.</div>}

      <section className="map-wrap">
        <MapContainer center={mapCenter} zoom={13} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter position={position} />
          {position && <>
            <Marker position={position} icon={userIcon}>
              <Popup><b>Your current location</b><br/>GPS accuracy: {Math.round(accuracy || 0)} m</Popup>
            </Marker>
            <Circle center={position} radius={MAX_DISTANCE_METRES} pathOptions={{ color: "#1684d8", fillOpacity: 0.06 }} />
          </>}
          {points.map(point => (
            <Marker key={point.taskId} position={[point.y, point.x]} icon={pendingIcon} eventHandlers={{ click: () => openPoint(point) }}>
              <Popup>
                <b>{point.taskId}</b><br/>
                {point.name || "Inspection point"}<br/>
                <button className="popup-button" onClick={() => openPoint(point)}>View task</button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="legend">
          <span><i className="dot red"></i> Pending</span>
          <span><i className="dot blue"></i> Your location</span>
          <span><i className="ring"></i> 50 m attendance boundary</span>
        </div>
      </section>

      <section className="bottom-panel">
        <div className="panel-heading">
          <div><h2>{selected ? `Task ${selected.taskId}` : "Selected inspection"}</h2><p>{selected ? (selected.name || "Inspection location") : "Select a red marker on the map to view its details."}</p></div>
          {selected && <button className="close" onClick={() => setSelected(null)}>×</button>}
        </div>

        {selected ? <>
          <div className="details-grid">
            <div><small>Longitude (X)</small><b>{selected.x}</b></div>
            <div><small>Latitude (Y)</small><b>{selected.y}</b></div>
            <div><small>Distance</small><b>{selectedDistance == null ? "Waiting for GPS" : `${Math.round(selectedDistance)} m`}</b></div>
            <div><small>GPS accuracy</small><b>{accuracy == null ? "—" : `${Math.round(accuracy)} m`}</b></div>
          </div>
          <a className="directions" href={directionsUrl} target="_blank" rel="noreferrer">↗ Navigate with Google Maps</a>
          <label className="field-label" htmlFor="officer">Officer name / ID</label>
          <input id="officer" value={officer} onChange={e => setOfficer(e.target.value)} placeholder="Enter your name or officer ID"/>
          <label className="field-label" htmlFor="comments">Inspection comments</label>
          <textarea id="comments" rows="3" value={comments} onChange={e => setComments(e.target.value)} placeholder="Record findings or observations..."/>
          {!position && <div className="alert warning">Waiting for GPS. Allow location permission on your device.</div>}
          {position && !gpsAccurate && <div className="alert warning">GPS accuracy must be 25 m or better. Current accuracy: {Math.round(accuracy)} m. Move to an open area and wait for a better GPS fix.</div>}
          {position && gpsAccurate && !withinRange && <div className="alert warning">You are outside the 50 m attendance boundary. Current distance: {Math.round(selectedDistance)} m.</div>}
          {withinRange && <div className="alert success">You are within 50 metres. Attendance update is enabled.</div>}
          <button className="attend" disabled={!withinRange || !officer.trim() || saving} onClick={saveAttendance}>
            {saving ? "Saving..." : "✓ Mark as attended"}
          </button>
          <p className="fine-print">The server rechecks your GPS distance before updating the sheet. Attended points are removed from the active map.</p>
        </> : <div className="empty-state">{loading ? "Loading locations from Google Sheets…" : `${points.length} pending locations are currently displayed.`}</div>}
      </section>
      <footer>Last refreshed: {lastRefresh ? lastRefresh.toLocaleTimeString() : "Not yet refreshed"} · Map refreshes every 30 seconds</footer>
    </main>
  );
}