import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Map, {
  Marker, Popup, NavigationControl, FullscreenControl,
  GeolocateControl, Source, Layer
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MapPin, Navigation, Info, Plus, Trash2, Edit3,
  X, ChevronRight, Building2, BedDouble, Trees,
  ParkingCircle, DoorOpen, Layers, Search, ArrowRight,
  CheckCircle, AlertCircle, Loader2, Route, Pencil, Eye,
  BookOpen, Coffee, FlaskConical, Trophy, Briefcase, Square
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPUS_CENTER = { longitude: 78.2571511, latitude: 17.7252584 };

const CATEGORY_META = {
  Academic: { color: '#2563eb', bg: '#dbeafe', border: '#2563eb', icon: BookOpen, label: 'Academic' },
  Hostel:   { color: '#7c3aed', bg: '#f5f3ff', border: '#7c3aed', icon: BedDouble, label: 'Hostel' },
  Canteen:  { color: '#ea580c', bg: '#ffedd5', border: '#ea580c', icon: Coffee, label: 'Canteen' },
  Lab:      { color: '#0891b2', bg: '#ecfeff', border: '#0891b2', icon: FlaskConical, label: 'Lab' },
  Sports:   { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a', icon: Trophy, label: 'Sports' },
  Admin:    { color: '#475569', bg: '#f1f5f9', border: '#475569', icon: Briefcase, label: 'Admin' },
  Building: { color: '#4f46e5', bg: '#eef2ff', border: '#4f46e5', icon: Building2,     label: 'Building'  },
  Room:     { color: '#0891b2', bg: '#ecfeff', border: '#0891b2', icon: DoorOpen,      label: 'Room'      },
  Outdoor:  { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a', icon: Trees,         label: 'Outdoor'   },
  Gate:     { color: '#d97706', bg: '#fffbeb', border: '#d97706', icon: MapPin,        label: 'Gate'      },
  Parking:  { color: '#64748b', bg: '#f8fafc', border: '#64748b', icon: ParkingCircle, label: 'Parking'   },
};

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
      ],
      tileSize: 256,
      maxzoom: 22,
      attribution: '© Google Maps'
    }
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toRad = d => d * Math.PI / 180;

function haversine(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function metersToText(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function secondsToText(s) {
  const mins = Math.round(s / 60);
  return mins < 1 ? '< 1 min' : `${mins} min`;
}

// ─── Graph Routing (Dijkstra over path segments) ──────────────────────────────

function buildGraph(paths) {
  // Each path is a polyline; we treat consecutive waypoints as graph edges
  const graph = {}; // nodeKey -> [{nodeKey, dist, coords}]
  const nodeCoords = {}; // nodeKey -> {lat, lng}

  const key = (pt) => `${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}`;

  paths.forEach(path => {
    const coords = typeof path.coordinates === 'string'
      ? JSON.parse(path.coordinates)
      : path.coordinates;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1];
      const ka = key(a), kb = key(b);
      nodeCoords[ka] = a;
      nodeCoords[kb] = b;
      const dist = haversine(a, b);
      if (!graph[ka]) graph[ka] = [];
      if (!graph[kb]) graph[kb] = [];
      graph[ka].push({ to: kb, dist });
      graph[kb].push({ to: ka, dist }); // bidirectional
    }
  });

  // Bridge disconnected paths by connecting any nodes within 15 meters
  const keys = Object.keys(nodeCoords);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const ka = keys[i], kb = keys[j];
      const dist = haversine(nodeCoords[ka], nodeCoords[kb]);
      if (dist > 0 && dist < 20) { // 20 meter snap radius
        // check if not already explicitly connected
        if (!graph[ka].find(e => e.to === kb)) {
          graph[ka].push({ to: kb, dist });
          graph[kb].push({ to: ka, dist });
        }
      }
    }
  }

  return { graph, nodeCoords };
}

function nearestNode(nodeCoords, point) {
  let best = null, bestDist = Infinity;
  for (const [k, c] of Object.entries(nodeCoords)) {
    const d = haversine(c, point);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  return { key: best, dist: bestDist };
}

function dijkstra(graph, nodeCoords, startKey, endKey) {
  const dist = { [startKey]: 0 };
  const prev = {};
  const visited = new Set();
  const queue = [[0, startKey]];

  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, u] = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endKey) break;
    for (const edge of (graph[u] || [])) {
      const nd = d + edge.dist;
      if (nd < (dist[edge.to] ?? Infinity)) {
        dist[edge.to] = nd;
        prev[edge.to] = u;
        queue.push([nd, edge.to]);
      }
    }
  }

  if (dist[endKey] === undefined) return null;

  // Reconstruct path
  const path = [];
  let cur = endKey;
  while (cur) { path.unshift(nodeCoords[cur]); cur = prev[cur]; }
  return { coords: path, distance: dist[endKey] };
}

function findRoute(paths, fromLoc, toLoc) {
  if (!paths.length) return null;
  const { graph, nodeCoords } = buildGraph(paths);
  if (!Object.keys(graph).length) return null;

  const fromPt = { lat: Number(fromLoc.latitude), lng: Number(fromLoc.longitude) };
  const toPt   = { lat: Number(toLoc.latitude),   lng: Number(toLoc.longitude)   };

  const { key: startKey } = nearestNode(nodeCoords, fromPt);
  const { key: endKey }   = nearestNode(nodeCoords, toPt);

  if (!startKey || !endKey) return null;

  const result = dijkstra(graph, nodeCoords, startKey, endKey);
  if (!result) return null;

  // Prepend from-point and append to-point for visual completeness
  const fullCoords = [fromPt, ...result.coords, toPt];
  const totalDist = fullCoords.reduce((sum, pt, i) => {
    if (i === 0) return 0;
    return sum + haversine(fullCoords[i - 1], pt);
  }, 0);

  return {
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'active_route',
        properties: { isRoute: true },
        geometry: {
          type: 'LineString',
          coordinates: fullCoords.map(p => [Number(p.lng), Number(p.lat)])
        }
      }]
    },
    distance: totalDist,
    duration: totalDist / 1.4, // avg walking speed 1.4 m/s
    steps: buildSteps(fullCoords)
  };
}

function buildSteps(coords) {
  const steps = [];
  for (let i = 1; i < coords.length; i++) {
    const dist = haversine(coords[i - 1], coords[i]);
    if (dist > 5) {
      steps.push({ instruction: `Continue for ${metersToText(dist)}`, distance: dist });
    }
  }
  return steps;
}

// ─── GeoJSON helpers ──────────────────────────────────────────────────────────

function pathsToGeoJSON(paths, highlightId) {
  return {
    type: 'FeatureCollection',
    features: paths.map(p => {
      const coords = typeof p.coordinates === 'string'
        ? JSON.parse(p.coordinates)
        : p.coordinates;
      return {
        type: 'Feature',
        id: `path_${p.id}`,
        properties: { id: p.id, name: p.name, highlight: p.id === highlightId },
        geometry: {
          type: 'LineString',
          coordinates: coords.map(c => [Number(c.lng), Number(c.lat)])
        }
      };
    })
  };
}

// ─── Custom Marker ────────────────────────────────────────────────────────────

const CategoryFilter = ({ value, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-1 mt-2 scrollbar-none">
    {['All', 'Academic', 'Hostel', 'Canteen', 'Lab', 'Sports', 'Admin', 'Building', 'Room', 'Outdoor', 'Gate', 'Parking'].map(cat => (
      <button
        key={cat}
        onClick={() => onChange(cat)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          value === cat 
            ? 'bg-brand-600 text-white shadow-sm' 
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {cat}
      </button>
    ))}
  </div>
);

const PinMarker = ({ location, isFrom, isTo, onClick }) => {
  const meta = CATEGORY_META[location.category] || CATEGORY_META.Building;
  const Icon = meta.icon;
  let ringStyle = {};
  if (isFrom) ringStyle = { boxShadow: '0 0 0 4px #22c55e' };
  else if (isTo) ringStyle = { boxShadow: '0 0 0 4px #ef4444' };

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer group select-none"
      onClick={onClick}
      style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-110"
        style={{ background: meta.bg, border: `2px solid ${meta.border}`, ...ringStyle }}
      >
        <Icon size={18} style={{ color: meta.color }} />
      </div>
      <div className="w-0 h-0 -mt-0.5"
        style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `9px solid ${meta.border}` }}
      />
    </div>
  );
};

// ─── Location Form ────────────────────────────────────────────────────────────

const LocationForm = ({ initial, allLocations, onSave, onCancel, isSaving }) => {
  const [form, setForm] = useState({
    location_name: '', description: '', category: 'Academic',
    floor_number: '', image_url: '', building_id: '', ...initial,
    opening_hours_text: initial?.opening_hours?.text || '',
    is_accessible: initial?.is_accessible || false,
  });
  const BUILDINGS = ['Building', 'Academic', 'Hostel', 'Sports', 'Admin'];
  const buildings = allLocations.filter(l => BUILDINGS.includes(l.category));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.location_name} onChange={e => set('location_name', e.target.value)} placeholder="e.g. Main Block" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Category *</label>
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.category} onChange={e => set('category', e.target.value)}>
          {Object.keys(CATEGORY_META).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Floor Number (Optional)</label>
        <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.floor_number} onChange={e => set('floor_number', e.target.value)} placeholder="e.g. 2" min={0} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Inside Building (Optional)</label>
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.building_id} onChange={e => set('building_id', e.target.value)}>
          <option value="">— Select building (leave blank if standalone) —</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.location_name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
        <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description..." />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Image URL</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Opening Hours (Optional)</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.opening_hours_text} onChange={e => set('opening_hours_text', e.target.value)} placeholder="e.g. 9:00 AM - 5:00 PM" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer pb-2 pt-1">
        <input type="checkbox" className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
          checked={form.is_accessible} onChange={e => set('is_accessible', e.target.checked)} />
        <span className="text-sm font-semibold text-gray-700">♿ Wheelchair Accessible</span>
      </label>
      <div className="flex gap-2 pt-1">
        <button disabled={isSaving || !form.location_name} onClick={() => onSave(form)}
          className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors">
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {initial?.id ? 'Update' : 'Save Location'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
};

// ─── Directions Panel ─────────────────────────────────────────────────────────

const DirectionsPanel = ({ steps, summary, fromName, toName, onClose }) => (
  <div className="flex flex-col h-full">
    <div className="flex items-center justify-between mb-3">
      <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1"><Route size={14} className="text-brand-500" /> Walking Directions</h4>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
    </div>
    <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
      <span className="w-5 h-5 rounded-full bg-green-500 text-white font-bold flex items-center justify-center flex-shrink-0">A</span>
      <span className="font-medium text-gray-700 truncate">{fromName}</span>
      <ArrowRight size={12} className="flex-shrink-0" />
      <span className="w-5 h-5 rounded-full bg-red-500 text-white font-bold flex items-center justify-center flex-shrink-0">B</span>
      <span className="font-medium text-gray-700 truncate">{toName}</span>
    </div>
    {summary && (
      <div className="flex gap-3 mb-3 p-3 bg-brand-50 rounded-xl border border-brand-100">
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-brand-700">{secondsToText(summary.duration)}</div>
          <div className="text-xs text-brand-500">walk</div>
        </div>
        <div className="w-px bg-brand-200" />
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-brand-700">{metersToText(summary.distance)}</div>
          <div className="text-xs text-brand-500">distance</div>
        </div>
      </div>
    )}
    <div className="overflow-y-auto flex-1 space-y-1 pr-1">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-2 items-start p-2 rounded-lg hover:bg-gray-50">
          <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
          <div>
            <div className="text-sm text-gray-800">{step.instruction}</div>
            {step.distance > 0 && <div className="text-xs text-gray-400 mt-0.5">{metersToText(step.distance)}</div>}
          </div>
        </div>
      ))}
      <div className="flex gap-2 items-start p-2 rounded-lg bg-green-50">
        <div className="w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">✓</div>
        <div className="text-sm text-green-700 font-medium">Arrived at {toName}</div>
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const CampusMap = () => {
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'Administrator';

  const [viewState, setViewState] = useState({ ...CAMPUS_CENTER, zoom: 17, pitch: 0, bearing: 0 });

  // Data
  const [locations, setLocations]   = useState([]);
  const [paths, setPaths]           = useState([]);

  // UI tabs: 'navigate' | 'pins' | 'paths'
  const [activeTab, setActiveTab]   = useState('navigate');
  const [popupInfo, setPopupInfo]   = useState(null);
  const [searchQ, setSearchQ]       = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [adminMsg, setAdminMsg]     = useState(null);

  // Navigation
  const [fromLoc, setFromLoc]       = useState(null);
  const [toLoc, setToLoc]           = useState(null);
  const [route, setRoute]           = useState(null);
  const [routeError, setRouteError] = useState('');
  const [selectingFor, setSelectingFor] = useState(null);

  // Live Location Tracking
  const [userLocation, setUserLocation] = useState(null);
  const [isUsingMyLocation, setIsUsingMyLocation] = useState(false);

  // Pin admin
  const [pendingPin, setPendingPin] = useState(null);
  const [editingLoc, setEditingLoc] = useState(null);
  const [showPinForm, setShowPinForm] = useState(false);
  const [isSaving, setIsSaving]     = useState(false);

  // Path drawing
  const [drawingPath, setDrawingPath]   = useState(false);
  const [pathPoints, setPathPoints]     = useState([]);
  const [pathName, setPathName]         = useState('');
  const [isSavingPath, setIsSavingPath] = useState(false);
  const [showPaths, setShowPaths]       = useState(true);

  // Boundary drawing
  const [boundaries, setBoundaries] = useState([]);
  const [drawingBoundary, setDrawingBoundary] = useState(false);
  const [boundaryPoints, setBoundaryPoints] = useState([]);
  const [boundaryName, setBoundaryName] = useState('');
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const authHeader = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchLocations = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/locations', { headers: authHeader });
      setLocations(data.data || []);
    } catch { setLocations([]); }
  }, [authHeader]);

  const fetchPaths = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/paths', { headers: authHeader });
      setPaths(data.data || []);
    } catch { setPaths([]); }
  }, [authHeader]);

  const fetchBoundaries = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/boundaries', { headers: authHeader });
      setBoundaries(data.data || []);
    } catch { setBoundaries([]); }
  }, [authHeader]);

  useEffect(() => { fetchLocations(); fetchPaths(); fetchBoundaries(); }, [fetchLocations, fetchPaths, fetchBoundaries]);

  // Track GPS Location continuously
  useEffect(() => {
    let watchId;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
        },
        (err) => console.log('Geolocation error:', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Update fromLoc continuously if "My Location" is active
  useEffect(() => {
    if (isUsingMyLocation && userLocation) {
      setFromLoc({
        id: 'mylocation',
        location_name: 'My Current Location 🎯',
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        category: 'Building' // Fallback for marker styling
      });
    }
  }, [isUsingMyLocation, userLocation]);

  const pinId = searchParams.get('pin');
  useEffect(() => {
    if (pinId && locations.length > 0 && !popupInfo) {
      const targetLoc = locations.find(l => l.id.toString() === pinId);
      if (targetLoc) {
        setPopupInfo(targetLoc);
        setViewState(prev => ({
          ...prev,
          longitude: Number(targetLoc.longitude),
          latitude: Number(targetLoc.latitude),
          zoom: 18
        }));
      }
    }
  }, [pinId, locations]);

  // ── Routing ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!fromLoc || !toLoc) { setRoute(null); setRouteError(''); return; }
    if (!paths.length) {
      setRouteError('No walkable paths defined yet. Ask an admin to draw campus paths.');
      return;
    }
    const result = findRoute(paths, fromLoc, toLoc);
    if (!result) {
      setRouteError('No connected path found between these points. Admin needs to draw more paths.');
      setRoute(null);
    } else {
      setRoute(result);
      setRouteError('');
    }
  }, [fromLoc, toLoc, paths]);

  const clearRoute = () => {
    setFromLoc(null); setToLoc(null);
    setRoute(null); setRouteError('');
    setSelectingFor(null);
    setIsUsingMyLocation(false);
  };

  // ── Map click ──────────────────────────────────────────────────────────────

  const handleMapClick = useCallback((evt) => {
    const { lng, lat } = evt.lngLat;

    if (drawingPath) {
      setPathPoints(pts => [...pts, { lat, lng }]);
      return;
    }
    if (drawingBoundary) {
      setBoundaryPoints(pts => [...pts, { lat, lng }]);
      return;
    }

    if (activeTab === 'pins' && isAdmin) {
      if (editingLoc) return;
      setPendingPin({ lat, lng });
      setShowPinForm(true);
      setEditingLoc(null);
    }
  }, [drawingPath, drawingBoundary, activeTab, isAdmin, editingLoc]);

  // ── Pin CRUD ───────────────────────────────────────────────────────────────

  const handleSavePin = async (form) => {
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        latitude:  editingLoc ? editingLoc.latitude  : pendingPin.lat,
        longitude: editingLoc ? editingLoc.longitude : pendingPin.lng,
        floor_number: form.floor_number !== '' ? Number(form.floor_number) : null,
        building_id:  form.building_id  !== '' ? Number(form.building_id)  : null,
        opening_hours: form.opening_hours_text ? { text: form.opening_hours_text } : null,
      };
      if (editingLoc?.id) {
        await axios.put(`/api/locations/${editingLoc.id}`, payload, { headers: authHeader });
        flash('success', 'Location updated!');
      } else {
        await axios.post('/api/locations', payload, { headers: authHeader });
        flash('success', 'Location saved!');
      }
      await fetchLocations();
      setPendingPin(null); setEditingLoc(null); setShowPinForm(false);
    } catch { flash('error', 'Failed to save. Please try again.'); }
    finally { setIsSaving(false); }
  };

  const handleDeletePin = async (loc) => {
    if (!window.confirm(`Delete "${loc.location_name}"?`)) return;
    try {
      await axios.delete(`/api/locations/${loc.id}`, { headers: authHeader });
      flash('success', 'Location deleted.');
      await fetchLocations();
      setPopupInfo(null);
    } catch { flash('error', 'Failed to delete.'); }
  };

  // ── Path CRUD ──────────────────────────────────────────────────────────────

  const handleSavePath = async () => {
    if (pathPoints.length < 2) { flash('error', 'Add at least 2 points.'); return; }
    if (!pathName.trim()) { flash('error', 'Enter a path name.'); return; }
    setIsSavingPath(true);
    try {
      await axios.post('/api/paths', { name: pathName, coordinates: pathPoints }, { headers: authHeader });
      flash('success', `Path "${pathName}" saved!`);
      await fetchPaths();
      setDrawingPath(false); setPathPoints([]); setPathName('');
    } catch { flash('error', 'Failed to save path.'); }
    finally { setIsSavingPath(false); }
  };

  const handleDeletePath = async (id, name) => {
    if (!window.confirm(`Delete path "${name}"?`)) return;
    try {
      await axios.delete(`/api/paths/${id}`, { headers: authHeader });
      flash('success', 'Path deleted.');
      await fetchPaths();
    } catch { flash('error', 'Failed to delete path.'); }
  };
  const handleSaveBoundary = async () => {
    if (boundaryPoints.length < 3) { flash('error', 'Add at least 3 points.'); return; }
    if (!boundaryName.trim()) { flash('error', 'Enter a boundary name.'); return; }
    setIsSavingBoundary(true);
    try {
      await axios.post('/api/boundaries', { name: boundaryName, coordinates: boundaryPoints }, { headers: authHeader });
      flash('success', `Boundary "${boundaryName}" saved!`);
      await fetchBoundaries();
      setDrawingBoundary(false); setBoundaryPoints([]); setBoundaryName('');
    } catch { flash('error', 'Failed to save boundary.'); }
    finally { setIsSavingBoundary(false); }
  };

  const handleDeleteBoundary = async (id) => {
    if (!window.confirm(`Delete this boundary?`)) return;
    try {
      await axios.delete(`/api/boundaries/${id}`, { headers: authHeader });
      flash('success', 'Boundary deleted.');
      await fetchBoundaries();
    } catch { flash('error', 'Failed to delete boundary.'); }
  };


  const flash = (type, text) => {
    setAdminMsg({ type, text });
    setTimeout(() => setAdminMsg(null), 3000);
  };

  // ── Marker click ───────────────────────────────────────────────────────────

  const handleMarkerClick = (loc) => {
    if (selectingFor) {
      if (selectingFor === 'from') setFromLoc(loc);
      else setToLoc(loc);
      setSelectingFor(null);
      return;
    }
    setPopupInfo(loc);
  };

  // ── GeoJSON for all saved paths ────────────────────────────────────────────

  const pathsGeoJSON = useMemo(() => pathsToGeoJSON(paths), [paths]);

  // Drawing path preview GeoJSON

  const boundariesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: boundaries.map(b => {
        const coords = typeof b.coordinates === 'string' ? JSON.parse(b.coordinates) : b.coordinates;
        // Maplibre Polygon strictly expects Array of Arrays of points [[lng, lat]] where first==last
        const points = coords.map(c => [Number(c.lng), Number(c.lat)]);
        if (points.length > 0 && (points[0][0] !== points[points.length-1][0] || points[0][1] !== points[points.length-1][1])) {
          points.push([...points[0]]); // close loop
        }
        return {
          type: 'Feature',
          id: `boundary_${b.id}`,
          properties: { id: b.id, name: b.name, color: b.color },
          geometry: {
            type: 'Polygon',
            coordinates: [points]
          }
        };
      })
    };
  }, [boundaries]);

  const drawingBoundaryGeoJSON = useMemo(() => {
    if (boundaryPoints.length < 2) return null;
    const points = boundaryPoints.map(p => [p.lng, p.lat]);
    if (boundaryPoints.length >= 3) points.push([boundaryPoints[0].lng, boundaryPoints[0].lat]); // Close polygon
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: boundaryPoints.length >= 3 ? 'Polygon' : 'LineString', coordinates: boundaryPoints.length >= 3 ? [points] : points }
      }]
    };
  }, [boundaryPoints]);

  const drawingGeoJSON = useMemo(() => {
    if (pathPoints.length < 2) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: pathPoints.map(p => [p.lng, p.lat]) }
      }]
    };
  }, [pathPoints]);

  const filteredLocations = useMemo(() => {
    let result = locations;
    if (categoryFilter !== 'All') {
      result = result.filter(l => l.category === categoryFilter);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(l =>
        l.location_name?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [locations, searchQ, categoryFilter]);

  // ── Cursor ─────────────────────────────────────────────────────────────────

  const mapCursor = (drawingPath || drawingBoundary) ? 'crosshair' : ((activeTab === 'pins' || activeTab === 'boundary') && isAdmin ? 'crosshair' : 'grab');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[90vh] animate-fade-in">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campus Navigator</h1>
          <p className="text-gray-500 mt-1">Interactive map with walking directions across campus.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setActiveTab('navigate')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'navigate' ? 'bg-brand-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Navigation size={14} className="inline mr-1" /> Navigate
          </button>
          {isAdmin && (
            <>
              <button onClick={() => setActiveTab('pins')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'pins' ? 'bg-brand-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <MapPin size={14} className="inline mr-1" /> Manage Pins
              </button>
              <button onClick={() => setActiveTab('paths')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'paths' ? 'bg-green-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <Route size={14} className="inline mr-1" /> Draw Paths
              </button>
              <button onClick={() => setActiveTab('boundary')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'boundary' ? 'bg-blue-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <Square size={14} className="inline mr-1" /> Draw Boundaries
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-4 flex-grow min-h-0">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden">

          {adminMsg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${adminMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {adminMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {adminMsg.text}
            </div>
          )}

          {/* ── NAVIGATE ── */}
          {activeTab === 'navigate' && (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Navigation size={15} className="text-brand-500" /> Get Directions
                </h3>
                {/* From */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">From</label>
                  <div className="flex gap-2">
                    <select className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                      value={fromLoc?.id || ''} onChange={e => {
                        const val = e.target.value;
                        if (val === 'mylocation') {
                          setIsUsingMyLocation(true);
                          // Initialize immediately if known
                          if (userLocation) {
                            setFromLoc({ id: 'mylocation', location_name: 'My Current Location 🎯', latitude: userLocation.latitude, longitude: userLocation.longitude, category: 'Building' });
                          }
                        } else {
                          setIsUsingMyLocation(false);
                          setFromLoc(locations.find(l => l.id === Number(val)) || null);
                        }
                      }}>
                      <option value="">Select starting point</option>
                      <option value="mylocation" className="font-bold text-blue-600">🎯 My Current Location</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                    </select>
                    <button title="Pick on map" onClick={() => setSelectingFor(s => s === 'from' ? null : 'from')}
                      className={`px-2 rounded-lg border transition-colors ${selectingFor === 'from' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      <MapPin size={14} />
                    </button>
                  </div>
                  {fromLoc && <div className="text-xs text-green-600 mt-1 font-medium">✓ {fromLoc.location_name}</div>}
                </div>
                {/* To */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">To</label>
                  <div className="flex gap-2">
                    <select className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                      value={toLoc?.id || ''} onChange={e => setToLoc(locations.find(l => l.id === Number(e.target.value)) || null)}>
                      <option value="">Select destination</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                    </select>
                    <button title="Pick on map" onClick={() => setSelectingFor(s => s === 'to' ? null : 'to')}
                      className={`px-2 rounded-lg border transition-colors ${selectingFor === 'to' ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      <MapPin size={14} />
                    </button>
                  </div>
                  {toLoc && <div className="text-xs text-red-500 mt-1 font-medium">✓ {toLoc.location_name}</div>}
                </div>

                {selectingFor && (
                  <div className="text-xs text-center bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg py-2 px-3 font-medium animate-pulse">
                    Click a pin on the map to set {selectingFor === 'from' ? 'start' : 'destination'}
                  </div>
                )}
                {routeError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{routeError}</div>}
                {(fromLoc || toLoc) && (
                  <button onClick={clearRoute} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                    <X size={12} /> Clear route
                  </button>
                )}
              </div>

              {route && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 overflow-hidden flex flex-col">
                  <DirectionsPanel
                    steps={route.steps}
                    summary={{ distance: route.distance, duration: route.duration }}
                    fromName={fromLoc?.location_name}
                    toName={toLoc?.location_name}
                    onClose={clearRoute}
                  />
                </div>
              )}

              {!route && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 overflow-hidden flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers size={14} className="text-brand-500" />
                    <h3 className="font-bold text-gray-900 text-sm">Campus Locations</h3>
                  </div>
                  <div className="relative text-black">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <input className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      placeholder="Search..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                  </div>
                  <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
                  <div className="overflow-y-auto flex-1 space-y-1">
                    {filteredLocations.map(loc => {
                      const meta = CATEGORY_META[loc.category] || CATEGORY_META.Building;
                      const Icon = meta.icon;
                      return (
                        <div key={loc.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 cursor-pointer"
                          onClick={() => { setViewState(v => ({ ...v, longitude: Number(loc.longitude), latitude: Number(loc.latitude), zoom: 18 })); setPopupInfo(loc); }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                            <Icon size={13} style={{ color: meta.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{loc.location_name}</div>
                            <div className="text-xs text-gray-400">{loc.category}</div>
                          </div>
                          <ChevronRight size={13} className="text-gray-300" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── PINS (admin) ── */}
          {activeTab === 'pins' && isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              {showPinForm ? (
                <>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Plus size={15} className="text-brand-500" />{editingLoc?.id ? 'Edit Location' : 'New Location'}
                  </h3>
                  <LocationForm initial={editingLoc || {}} allLocations={locations}
                    onSave={handleSavePin} onCancel={() => { setShowPinForm(false); setPendingPin(null); setEditingLoc(null); }}
                    isSaving={isSaving} />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">All Pins ({locations.length})</h3>
                    <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1">Click map to add</div>
                  </div>
                  <div className="relative text-black">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <input className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      placeholder="Search..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                  </div>
                  <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
                  <div className="overflow-y-auto flex-1 space-y-1">
                    {filteredLocations.map(loc => {
                      const meta = CATEGORY_META[loc.category] || CATEGORY_META.Building;
                      const Icon = meta.icon;
                      return (
                        <div key={loc.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 cursor-pointer group"
                          onClick={() => { setViewState(v => ({ ...v, longitude: Number(loc.longitude), latitude: Number(loc.latitude), zoom: 18 })); setPopupInfo(loc); }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                            <Icon size={14} style={{ color: meta.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{loc.location_name}</div>
                            <div className="text-xs text-gray-400">{loc.category}{loc.floor_number ? ` · Floor ${loc.floor_number}` : ''}</div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); setEditingLoc(loc); setShowPinForm(true); }} className="p-1 rounded hover:bg-blue-50 text-blue-500"><Edit3 size={12} /></button>
                            <button onClick={e => { e.stopPropagation(); handleDeletePin(loc); }} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── PATHS (admin) ── */}
          {activeTab === 'paths' && isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Route size={15} className="text-green-500" /> Walkable Paths
              </h3>

              {!drawingPath ? (
                <>
                  <button onClick={() => { setDrawingPath(true); setPathPoints([]); setPathName(''); }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    <Pencil size={14} /> Draw New Path
                  </button>
                  <button onClick={() => setShowPaths(s => !s)}
                    className="w-full border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50">
                    <Eye size={14} /> {showPaths ? 'Hide' : 'Show'} Paths on Map
                  </button>
                  <div className="overflow-y-auto flex-1 space-y-2 mt-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Saved Paths ({paths.length})</div>
                    {paths.length === 0 && <div className="text-sm text-gray-400 text-center py-4">No paths yet. Draw the campus roads!</div>}
                    {paths.map(p => (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-green-50 border border-green-100">
                        <Route size={13} className="text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                          <div className="text-xs text-gray-400">
                            {(typeof p.coordinates === 'string' ? JSON.parse(p.coordinates) : p.coordinates).length} waypoints
                          </div>
                        </div>
                        <button onClick={() => handleDeletePath(p.id, p.name)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 font-medium">
                    🖱️ Click on the map to add waypoints along the road. Click as many points as needed to trace the path accurately.
                  </div>
                  <div className="text-xs text-gray-500 font-semibold">{pathPoints.length} point{pathPoints.length !== 1 ? 's' : ''} added</div>
                  {pathPoints.length > 0 && (
                    <button onClick={() => setPathPoints(pts => pts.slice(0, -1))}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                      <X size={12} /> Undo last point
                    </button>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Path Name *</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      value={pathName} onChange={e => setPathName(e.target.value)} placeholder="e.g. Main Road" />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={isSavingPath || pathPoints.length < 2 || !pathName.trim()}
                      onClick={handleSavePath}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors">
                      {isSavingPath ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Save Path
                    </button>
                    <button onClick={() => { setDrawingPath(false); setPathPoints([]); setPathName(''); }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BOUNDARIES (admin) ── */}
          {activeTab === 'boundary' && isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Square size={15} className="text-blue-500" /> Campus Boundaries
              </h3>
              {!drawingBoundary ? (
                <button onClick={() => { setDrawingBoundary(true); setBoundaryPoints([]); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors">
                  <Plus size={14} /> Draw New Boundary
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 font-medium">
                    🖱️ Click on the map to define polygon corners.
                  </div>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={boundaryName} onChange={e => setBoundaryName(e.target.value)} placeholder="Boundary Name" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveBoundary} disabled={isSavingBoundary || boundaryPoints.length < 3 || !boundaryName.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
                      {isSavingBoundary ? 'Saving...' : 'Save Boundary'}
                    </button>
                    <button onClick={() => { setDrawingBoundary(false); setBoundaryPoints([]); }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}
              <div className="overflow-y-auto flex-1 space-y-2 mt-1">
                {boundaries.map(b => (
                  <div key={b.id} className="flex items-center gap-2 p-2 rounded-xl bg-blue-50 border border-blue-100">
                    <Square size={13} className="text-blue-600 flex-shrink-0" />
                    <div className="text-sm font-medium text-gray-800 truncate flex-1">{b.name}</div>
                    <button onClick={() => handleDeleteBoundary(b.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Map ──────────────────────────────────────────────────────── */}
        <div className="flex-grow rounded-2xl overflow-hidden shadow-xl border border-gray-200 relative">

          {/* Banners */}
          {activeTab === 'pins' && isAdmin && !showPinForm && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
              <Plus size={12} /> Click anywhere on the map to drop a new pin
            </div>
          )}
          {drawingPath && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-green-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <Pencil size={12} /> Drawing path — click along the road to add waypoints ({pathPoints.length} so far)
            </div>
          )}
          {drawingBoundary && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <Square size={12} /> Drawing boundary — click to add corners ({boundaryPoints.length} so far)
            </div>
          )}
          {selectingFor && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-yellow-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <MapPin size={12} /> Click a pin to set as {selectingFor === 'from' ? 'starting point' : 'destination'}
              <button onClick={() => setSelectingFor(null)} className="ml-1 hover:text-yellow-200"><X size={12} /></button>
            </div>
          )}

          <Map {...viewState} onMove={evt => setViewState(evt.viewState)}
            onClick={handleMapClick} mapStyle={SATELLITE_STYLE}
            style={{ width: '100%', height: '100%' }} cursor={mapCursor}>

            <FullscreenControl position="top-left" />
            <NavigationControl position="top-left" />
            <GeolocateControl position="top-left" />

            {/* Saved paths layer */}
            {showPaths && paths.length > 0 && (
              <Source id="all-paths" type="geojson" data={pathsGeoJSON}>
                <Layer id="paths-casing" source="all-paths" type="line"
                  paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.6 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                <Layer id="paths-line" source="all-paths" type="line"
                  paint={{ 'line-color': '#f59e0b', 'line-width': 3, 'line-opacity': 0.9 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              </Source>
            )}

            {/* Route line */}
            {route?.geojson && (
              <Source id="route-src" type="geojson" data={route.geojson}>
                <Layer id="route-casing" source="route-src" type="line"
                  paint={{ 'line-color': '#ffffff', 'line-width': 12, 'line-opacity': 0.9 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                <Layer id="route-line" source="route-src" type="line"
                  paint={{ 'line-color': '#1d4ed8', 'line-width': 6, 'line-opacity': 1 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              </Source>
            )}

            {/* Campus Boundaries */}
            {boundariesGeoJSON && (
              <Source id="boundaries-src" type="geojson" data={boundariesGeoJSON}>
                <Layer id="boundaries-fill" source="boundaries-src" type="fill"
                  paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }} />
                <Layer id="boundaries-line" source="boundaries-src" type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.8 }} />
              </Source>
            )}

            {/* Boundary drawing preview */}
            {drawingBoundaryGeoJSON && (
              <Source id="drawing-boundary" type="geojson" data={drawingBoundaryGeoJSON}>
                <Layer id="drawing-boundary-fill" source="drawing-boundary" type="fill"
                  paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.2 }} />
                <Layer id="drawing-boundary-line" source="drawing-boundary" type="line"
                  paint={{ 'line-color': '#3b82f6', 'line-width': 3, 'line-opacity': 1, 'line-dasharray': [2, 1] }} />
              </Source>
            )}

            {/* Drawing preview */}
            {drawingGeoJSON && (
              <Source id="drawing" type="geojson" data={drawingGeoJSON}>
                <Layer id="drawing-line" type="line"
                  paint={{ 'line-color': '#16a34a', 'line-width': 4, 'line-opacity': 1, 'line-dasharray': [2, 1] }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              </Source>
            )}

            {/* Drawing waypoint dots */}
            {pathPoints.map((pt, i) => (
              <Marker key={`dp-${i}`} longitude={pt.lng} latitude={pt.lat} anchor="center">
                <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-md" />
              </Marker>
            ))}

            {/* Boundary waypoint dots */}
            {drawingBoundary && boundaryPoints.map((pt, i) => (
              <Marker key={`db-${i}`} longitude={pt.lng} latitude={pt.lat} anchor="center">
                <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-md" />
              </Marker>
            ))}

            {/* Pending pin */}
            {pendingPin && (
              <Marker longitude={pendingPin.lng} latitude={pendingPin.lat} anchor="bottom">
                <div className="w-8 h-8 rounded-full bg-yellow-400 border-2 border-yellow-600 flex items-center justify-center animate-bounce shadow-lg">
                  <Plus size={16} className="text-yellow-900" />
                </div>
              </Marker>
            )}

            {/* Location markers */}
            {filteredLocations.map(loc => (
              <Marker key={`m-${loc.id}`} longitude={Number(loc.longitude)} latitude={Number(loc.latitude)} anchor="bottom">
                <PinMarker location={loc} isFrom={fromLoc?.id === loc.id} isTo={toLoc?.id === loc.id}
                  onClick={() => handleMarkerClick(loc)} />
              </Marker>
            ))}

            {/* A/B labels */}
            {fromLoc && (
              <Marker longitude={Number(fromLoc.longitude)} latitude={Number(fromLoc.latitude)} anchor="top" offset={[0, 8]}>
                <div className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow pointer-events-none">A</div>
              </Marker>
            )}
            {toLoc && (
              <Marker longitude={Number(toLoc.longitude)} latitude={Number(toLoc.latitude)} anchor="top" offset={[0, 8]}>
                <div className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow pointer-events-none">B</div>
              </Marker>
            )}

            {/* Popup */}
            {popupInfo && (
              <Popup anchor="top" longitude={Number(popupInfo.longitude)} latitude={Number(popupInfo.latitude)}
                onClose={() => setPopupInfo(null)} closeOnClick={false} className="z-[500]" maxWidth="260px">
                <div className="p-1 w-[240px]">
                  {popupInfo.image_url && (
                    <img src={popupInfo.image_url} alt={popupInfo.location_name}
                      className="w-full h-28 object-cover rounded-lg mb-2" onError={e => e.target.style.display = 'none'} />
                  )}
                  <h3 className="font-bold text-gray-900 text-base leading-tight mb-1">{popupInfo.location_name}</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: CATEGORY_META[popupInfo.category]?.bg, color: CATEGORY_META[popupInfo.category]?.color }}>
                      {popupInfo.category}
                    </span>
                    {popupInfo.floor_number && <span className="text-xs text-gray-500">Floor {popupInfo.floor_number}</span>}
                  </div>
                  {popupInfo.description && <p className="text-gray-600 text-xs mb-3">{popupInfo.description}</p>}
                  {(popupInfo.opening_hours?.text || popupInfo.is_accessible) && (
                    <div className="flex flex-col gap-1 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                      {popupInfo.opening_hours?.text && (
                        <div className="text-xs text-gray-700 font-medium whitespace-pre-wrap">⏱️ {popupInfo.opening_hours.text}</div>
                      )}
                      {popupInfo.is_accessible && (
                        <div className="text-xs text-green-700 font-medium">♿ Wheelchair Accessible</div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mb-2">
                    <button className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100"
                      onClick={() => { setFromLoc(popupInfo); setActiveTab('navigate'); setPopupInfo(null); }}>Start here</button>
                    <button className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
                      onClick={() => { setToLoc(popupInfo); setActiveTab('navigate'); setPopupInfo(null); }}>Go here</button>
                  </div>
                  {activeTab === 'pins' && isAdmin && (
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => { setEditingLoc(popupInfo); setShowPinForm(true); setPopupInfo(null); }}
                        className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center justify-center gap-1">
                        <Edit3 size={11} /> Edit
                      </button>
                      <button onClick={() => handleDeletePin(popupInfo)}
                        className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 flex items-center justify-center gap-1">
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  )}
                  <button className="w-full bg-brand-600 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-brand-700"
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${popupInfo.latitude},${popupInfo.longitude}`, '_blank')}>
                    <Navigation size={12} /> Open in Google Maps
                  </button>
                </div>
              </Popup>
            )}
          </Map>

          {/* Legend */}
          <div className="absolute bottom-4 right-4 z-[400] bg-white/90 backdrop-blur shadow-lg rounded-xl p-3 border border-gray-100 hidden md:block">
            <h4 className="font-bold text-gray-700 text-xs mb-2 flex items-center gap-1"><Layers size={11} /> Legend</h4>
            <ul className="space-y-1">
              {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                const Icon = meta.icon;
                return (
                  <li key={cat} className="flex items-center gap-2 text-xs text-gray-600">
                    <Icon size={12} style={{ color: meta.color }} /> {meta.label}
                  </li>
                );
              })}
              <li className="flex items-center gap-2 text-xs text-gray-600 border-t border-gray-100 pt-1 mt-1">
                <div className="w-4 h-0.5 bg-yellow-400 border-t border-dashed border-yellow-400"></div> Walkable Path
              </li>
              <li className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-4 h-0.5 bg-cyan-400"></div> Active Route
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampusMap;
