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
  CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPUS_CENTER = { longitude: 78.2571511, latitude: 17.7252584 };

const CATEGORY_META = {
  Building: { color: '#4f46e5', bg: '#eef2ff', border: '#4f46e5', icon: Building2,  label: 'Building'  },
  Room:     { color: '#0891b2', bg: '#ecfeff', border: '#0891b2', icon: DoorOpen,   label: 'Room'      },
  Hostel:   { color: '#7c3aed', bg: '#f5f3ff', border: '#7c3aed', icon: BedDouble,  label: 'Hostel'    },
  Outdoor:  { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a', icon: Trees,      label: 'Outdoor'   },
  Gate:     { color: '#d97706', bg: '#fffbeb', border: '#d97706', icon: MapPin,     label: 'Gate'      },
  Parking:  { color: '#64748b', bg: '#f8fafc', border: '#64748b', icon: ParkingCircle, label: 'Parking' },
};

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toGeoJSONLine(coords) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords }
    }]
  };
}

function metersToText(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function secondsToText(s) {
  const mins = Math.round(s / 60);
  return mins < 1 ? '< 1 min' : `${mins} min`;
}

// ─── Custom Map Marker ────────────────────────────────────────────────────────

const PinMarker = ({ location, isFrom, isTo, isSelected, onClick }) => {
  const meta = CATEGORY_META[location.category] || CATEGORY_META.Building;
  const Icon = meta.icon;

  let ring = '';
  if (isFrom) ring = 'ring-4 ring-green-400';
  else if (isTo) ring = 'ring-4 ring-red-400';
  else if (isSelected) ring = 'ring-4 ring-yellow-400';

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer group select-none"
      onClick={onClick}
      style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-110 ${ring}`}
        style={{ background: meta.bg, border: `2px solid ${meta.border}` }}
      >
        <Icon size={18} style={{ color: meta.color }} />
      </div>
      <div
        className="w-0 h-0 -mt-0.5"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `9px solid ${meta.border}`,
        }}
      />
    </div>
  );
};

// ─── Admin: Add/Edit Location Form ────────────────────────────────────────────

const LocationForm = ({ initial, allLocations, onSave, onCancel, isSaving }) => {
  const [form, setForm] = useState({
    location_name: '',
    description: '',
    category: 'Building',
    floor_number: '',
    image_url: '',
    building_id: '',
    ...initial,
  });

  const buildings = allLocations.filter(l => l.category === 'Building');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.location_name}
          onChange={e => set('location_name', e.target.value)}
          placeholder="e.g. Main Block, Room 204"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Category *</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.category}
          onChange={e => set('category', e.target.value)}
        >
          {Object.keys(CATEGORY_META).map(c => (
            <option key={c} value={c}>{CATEGORY_META[c].label}</option>
          ))}
        </select>
      </div>

      {form.category === 'Room' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Floor Number</label>
            <input
              type="number"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={form.floor_number}
              onChange={e => set('floor_number', e.target.value)}
              placeholder="e.g. 2"
              min={0}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Inside Building</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={form.building_id}
              onChange={e => set('building_id', e.target.value)}
            >
              <option value="">— Select building —</option>
              {buildings.map(b => <option key={b.id} value={b.id}>{b.location_name}</option>)}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          rows={2}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Brief description..."
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Image URL</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={form.image_url}
          onChange={e => set('image_url', e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          disabled={isSaving || !form.location_name}
          onClick={() => onSave(form)}
          className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {initial?.id ? 'Update' : 'Save Location'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Turn-by-Turn Directions Panel ───────────────────────────────────────────

const DirectionsPanel = ({ steps, summary, onClose }) => (
  <div className="flex flex-col h-full">
    <div className="flex items-center justify-between mb-3">
      <h4 className="font-bold text-gray-900 text-sm">Walking Directions</h4>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
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
        <div key={i} className="flex gap-2 items-start p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
            {i + 1}
          </div>
          <div>
            <div className="text-sm text-gray-800">{step.maneuver?.instruction || step.name || 'Continue'}</div>
            {step.distance > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">{metersToText(step.distance)}</div>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2 items-start p-2 rounded-lg bg-green-50">
        <div className="w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          ✓
        </div>
        <div className="text-sm text-green-700 font-medium">You have arrived at your destination.</div>
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const CampusMap = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrator';

  // Map state
  const [viewState, setViewState] = useState({
    ...CAMPUS_CENTER,
    zoom: 17,
    pitch: 0,
    bearing: 0,
  });

  // Data
  const [locations, setLocations] = useState([]);
  const [loadingLocs, setLoadingLocs] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState('navigate'); // 'navigate' | 'admin'
  const [popupInfo, setPopupInfo] = useState(null);
  const [searchQ, setSearchQ] = useState('');

  // Navigation
  const [fromLoc, setFromLoc] = useState(null);
  const [toLoc, setToLoc]     = useState(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [directions, setDirections]     = useState(null);
  const [routeSummary, setRouteSummary] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError]     = useState('');
  const [selectingFor, setSelectingFor] = useState(null); // 'from' | 'to' | null

  // Admin
  const [pendingPin, setPendingPin]   = useState(null); // { lat, lng } from map click
  const [editingLoc, setEditingLoc]   = useState(null); // location object being edited
  const [showForm, setShowForm]       = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [adminMsg, setAdminMsg]       = useState(null); // { type, text }

  // ── Fetch locations ────────────────────────────────────────────────────────

  const fetchLocations = useCallback(async () => {
    try {
      setLoadingLocs(true);
      const { data } = await axios.get('/api/locations');
      setLocations(data.data || []);
    } catch {
      setLocations([]);
    } finally {
      setLoadingLocs(false);
    }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  // ── Routing via OSRM ──────────────────────────────────────────────────────

  const fetchRoute = useCallback(async (from, to) => {
    setRouteLoading(true);
    setRouteError('');
    setRouteGeoJSON(null);
    setDirections(null);
    setRouteSummary(null);
    try {
      const url = `${OSRM_BASE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=true&annotations=false`;
      const res  = await fetch(url);
      const json = await res.json();

      if (json.code !== 'Ok' || !json.routes?.length) {
        setRouteError('Could not find a walking route between these points.');
        return;
      }

      const route = json.routes[0];
      setRouteGeoJSON(toGeoJSONLine(route.geometry.coordinates));
      setRouteSummary({ distance: route.distance, duration: route.duration });

      const steps = route.legs.flatMap(leg => leg.steps);
      setDirections(steps);

      // Fit map to route
      const coords = route.geometry.coordinates;
      const lngs = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      setViewState(v => ({
        ...v,
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitude:  (Math.min(...lats) + Math.max(...lats)) / 2,
      }));
    } catch {
      setRouteError('Routing service unavailable. Please try again.');
    } finally {
      setRouteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fromLoc && toLoc) fetchRoute(fromLoc, toLoc);
  }, [fromLoc, toLoc, fetchRoute]);

  const clearRoute = () => {
    setFromLoc(null); setToLoc(null);
    setRouteGeoJSON(null); setDirections(null);
    setRouteSummary(null); setRouteError('');
    setSelectingFor(null);
  };

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  const handleMapClick = useCallback((evt) => {
    if (activeTab !== 'admin' || !isAdmin) {
      // In navigate mode: picking from/to by clicking marker is handled at marker level
      return;
    }
    if (editingLoc) return; // don't drop new pin while editing
    const { lng, lat } = evt.lngLat;
    setPendingPin({ lat, lng });
    setShowForm(true);
    setEditingLoc(null);
  }, [activeTab, isAdmin, editingLoc]);

  const handleSaveLocation = async (form) => {
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        latitude:  editingLoc ? editingLoc.latitude  : pendingPin.lat,
        longitude: editingLoc ? editingLoc.longitude : pendingPin.lng,
        floor_number: form.floor_number !== '' ? Number(form.floor_number) : null,
        building_id:  form.building_id  !== '' ? Number(form.building_id)  : null,
      };

      if (editingLoc?.id) {
        await axios.put(`/api/locations/${editingLoc.id}`, payload);
        setAdminMsg({ type: 'success', text: 'Location updated!' });
      } else {
        await axios.post('/api/locations', payload);
        setAdminMsg({ type: 'success', text: 'Location saved!' });
      }

      await fetchLocations();
      setPendingPin(null);
      setEditingLoc(null);
      setShowForm(false);
    } catch {
      setAdminMsg({ type: 'error', text: 'Failed to save. Please try again.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setAdminMsg(null), 3000);
    }
  };

  const handleDeleteLocation = async (loc) => {
    if (!window.confirm(`Delete "${loc.location_name}"?`)) return;
    try {
      await axios.delete(`/api/locations/${loc.id}`);
      setAdminMsg({ type: 'success', text: 'Location deleted.' });
      await fetchLocations();
      setPopupInfo(null);
    } catch {
      setAdminMsg({ type: 'error', text: 'Failed to delete.' });
    }
    setTimeout(() => setAdminMsg(null), 3000);
  };

  // ── Filtered locations for search ──────────────────────────────────────────

  const filteredLocations = useMemo(() => {
    if (!searchQ.trim()) return locations;
    const q = searchQ.toLowerCase();
    return locations.filter(l =>
      l.location_name.toLowerCase().includes(q) ||
      l.category?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q)
    );
  }, [locations, searchQ]);

  // ── Marker click ───────────────────────────────────────────────────────────

  const handleMarkerClick = (loc) => {
    if (activeTab === 'navigate' && selectingFor) {
      if (selectingFor === 'from') { setFromLoc(loc); setSelectingFor(null); }
      else                         { setToLoc(loc);   setSelectingFor(null); }
      return;
    }
    setPopupInfo(loc);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[90vh] animate-fade-in">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campus Navigator</h1>
          <p className="text-gray-500 mt-1">Interactive map with walking directions across campus.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('navigate')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'navigate' ? 'bg-brand-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Navigation size={14} className="inline mr-1" /> Navigate
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'admin' ? 'bg-brand-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Plus size={14} className="inline mr-1" /> Manage Pins
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-grow min-h-0">

        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden">

          {/* Admin: flash message */}
          {adminMsg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${adminMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {adminMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {adminMsg.text}
            </div>
          )}

          {/* Navigate Tab */}
          {activeTab === 'navigate' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Navigation size={15} className="text-brand-500" /> Get Directions
              </h3>

              {/* From */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">From</label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                    value={fromLoc?.id || ''}
                    onChange={e => {
                      const loc = locations.find(l => l.id === Number(e.target.value));
                      setFromLoc(loc || null);
                    }}
                  >
                    <option value="">Select starting point</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                  </select>
                  <button
                    title="Pick on map"
                    onClick={() => setSelectingFor(selectingFor === 'from' ? null : 'from')}
                    className={`px-2 rounded-lg border transition-colors ${selectingFor === 'from' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <MapPin size={14} />
                  </button>
                </div>
                {fromLoc && <div className="text-xs text-green-600 mt-1 font-medium">✓ {fromLoc.location_name}</div>}
              </div>

              {/* To */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">To</label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                    value={toLoc?.id || ''}
                    onChange={e => {
                      const loc = locations.find(l => l.id === Number(e.target.value));
                      setToLoc(loc || null);
                    }}
                  >
                    <option value="">Select destination</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                  </select>
                  <button
                    title="Pick on map"
                    onClick={() => setSelectingFor(selectingFor === 'to' ? null : 'to')}
                    className={`px-2 rounded-lg border transition-colors ${selectingFor === 'to' ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <MapPin size={14} />
                  </button>
                </div>
                {toLoc && <div className="text-xs text-red-500 mt-1 font-medium">✓ {toLoc.location_name}</div>}
              </div>

              {selectingFor && (
                <div className="text-xs text-center bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg py-2 px-3 font-medium animate-pulse">
                  Click a pin on the map to select {selectingFor === 'from' ? 'start' : 'destination'}
                </div>
              )}

              {routeLoading && (
                <div className="flex items-center gap-2 text-sm text-brand-600 font-medium">
                  <Loader2 size={14} className="animate-spin" /> Finding best walking route…
                </div>
              )}

              {routeError && (
                <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                  {routeError}
                </div>
              )}

              {(fromLoc || toLoc) && (
                <button onClick={clearRoute} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
                  <X size={12} /> Clear route
                </button>
              )}
            </div>
          )}

          {/* Directions panel */}
          {activeTab === 'navigate' && directions && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 overflow-hidden flex flex-col">
              <DirectionsPanel
                steps={directions}
                summary={routeSummary}
                onClose={clearRoute}
              />
            </div>
          )}

          {/* Admin mode: form or location list */}
          {activeTab === 'admin' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              {showForm ? (
                <>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Plus size={15} className="text-brand-500" />
                    {editingLoc?.id ? 'Edit Location' : 'New Location'}
                  </h3>
                  <LocationForm
                    initial={editingLoc || {}}
                    allLocations={locations}
                    onSave={handleSaveLocation}
                    onCancel={() => { setShowForm(false); setPendingPin(null); setEditingLoc(null); }}
                    isSaving={isSaving}
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">All Pins ({locations.length})</h3>
                    <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1">Click map to add</div>
                  </div>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <input
                      className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      placeholder="Search locations..."
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
                    {filteredLocations.map(loc => {
                      const meta = CATEGORY_META[loc.category] || CATEGORY_META.Building;
                      const Icon = meta.icon;
                      return (
                        <div
                          key={loc.id}
                          className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group"
                          onClick={() => {
                            setViewState(v => ({ ...v, longitude: Number(loc.longitude), latitude: Number(loc.latitude), zoom: 18 }));
                            setPopupInfo(loc);
                          }}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                            <Icon size={14} style={{ color: meta.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{loc.location_name}</div>
                            <div className="text-xs text-gray-400">{loc.category}{loc.floor_number ? ` · Floor ${loc.floor_number}` : ''}</div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); setEditingLoc(loc); setShowForm(true); }}
                              className="p-1 rounded hover:bg-blue-50 text-blue-500"
                            ><Edit3 size={12} /></button>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteLocation(loc); }}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                            ><Trash2 size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                    {filteredLocations.length === 0 && (
                      <div className="text-center text-gray-400 text-sm py-6">No locations found.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Navigate tab: location list when no directions */}
          {activeTab === 'navigate' && !directions && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 overflow-hidden flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <Layers size={14} className="text-brand-500" />
                <h3 className="font-bold text-gray-900 text-sm">Campus Locations</h3>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="Search..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
              </div>
              <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
                {filteredLocations.map(loc => {
                  const meta = CATEGORY_META[loc.category] || CATEGORY_META.Building;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={loc.id}
                      className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => {
                        setViewState(v => ({ ...v, longitude: Number(loc.longitude), latitude: Number(loc.latitude), zoom: 18 }));
                        setPopupInfo(loc);
                      }}
                    >
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
        </div>

        {/* ── Map ──────────────────────────────────────────────────────── */}
        <div className="flex-grow rounded-2xl overflow-hidden shadow-xl border border-gray-200 relative">

          {/* Admin banner */}
          {activeTab === 'admin' && isAdmin && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
              <Plus size={12} /> Click anywhere on the map to drop a new pin
            </div>
          )}

          {/* Selecting mode banner */}
          {selectingFor && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-yellow-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <MapPin size={12} />
              Click a location pin to set as {selectingFor === 'from' ? 'starting point' : 'destination'}
              <button onClick={() => setSelectingFor(null)} className="ml-1 hover:text-yellow-200"><X size={12} /></button>
            </div>
          )}

          <Map
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            onClick={handleMapClick}
            mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
            style={{ width: '100%', height: '100%' }}
            cursor={activeTab === 'admin' ? 'crosshair' : 'grab'}
          >
            <FullscreenControl position="top-left" />
            <NavigationControl position="top-left" />
            <GeolocateControl position="top-left" />

            {/* Route line */}
            {routeGeoJSON && (
              <Source id="route" type="geojson" data={routeGeoJSON}>
                <Layer
                  id="route-casing"
                  type="line"
                  paint={{ 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.8 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="route-line"
                  type="line"
                  paint={{ 'line-color': '#4f46e5', 'line-width': 5, 'line-opacity': 1 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {/* Pending pin (admin, before saving) */}
            {pendingPin && (
              <Marker longitude={pendingPin.lng} latitude={pendingPin.lat} anchor="bottom">
                <div className="w-8 h-8 rounded-full bg-yellow-400 border-2 border-yellow-600 flex items-center justify-center animate-bounce shadow-lg">
                  <Plus size={16} className="text-yellow-900" />
                </div>
              </Marker>
            )}

            {/* Location markers */}
            {filteredLocations.map(loc => (
              <Marker
                key={`m-${loc.id}`}
                longitude={Number(loc.longitude)}
                latitude={Number(loc.latitude)}
                anchor="bottom"
              >
                <PinMarker
                  location={loc}
                  isFrom={fromLoc?.id === loc.id}
                  isTo={toLoc?.id === loc.id}
                  isSelected={popupInfo?.id === loc.id}
                  onClick={() => handleMarkerClick(loc)}
                />
              </Marker>
            ))}

            {/* FROM marker label */}
            {fromLoc && (
              <Marker longitude={Number(fromLoc.longitude)} latitude={Number(fromLoc.latitude)} anchor="top" offset={[0, 8]}>
                <div className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow pointer-events-none">A</div>
              </Marker>
            )}

            {/* TO marker label */}
            {toLoc && (
              <Marker longitude={Number(toLoc.longitude)} latitude={Number(toLoc.latitude)} anchor="top" offset={[0, 8]}>
                <div className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow pointer-events-none">B</div>
              </Marker>
            )}

            {/* Popup */}
            {popupInfo && (
              <Popup
                anchor="top"
                longitude={Number(popupInfo.longitude)}
                latitude={Number(popupInfo.latitude)}
                onClose={() => setPopupInfo(null)}
                closeOnClick={false}
                className="z-[500]"
                maxWidth="260px"
              >
                <div className="p-1 w-[240px]">
                  {popupInfo.image_url && (
                    <img
                      src={popupInfo.image_url}
                      alt={popupInfo.location_name}
                      className="w-full h-28 object-cover rounded-lg mb-2"
                      onError={e => e.target.style.display = 'none'}
                    />
                  )}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-base leading-tight">{popupInfo.location_name}</h3>
                    {activeTab === 'admin' && isAdmin && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditingLoc(popupInfo); setShowForm(true); setPopupInfo(null); }} className="p-1 rounded hover:bg-blue-50 text-blue-500"><Edit3 size={13} /></button>
                        <button onClick={() => handleDeleteLocation(popupInfo)} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: CATEGORY_META[popupInfo.category]?.bg, color: CATEGORY_META[popupInfo.category]?.color }}
                    >
                      {popupInfo.category}
                    </span>
                    {popupInfo.floor_number && (
                      <span className="text-xs text-gray-500">Floor {popupInfo.floor_number}</span>
                    )}
                  </div>
                  {popupInfo.description && <p className="text-gray-600 text-xs mb-3">{popupInfo.description}</p>}
                  {popupInfo.building_name && (
                    <p className="text-xs text-gray-400 mb-2">📍 Inside {popupInfo.building_name}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                      onClick={() => { setFromLoc(popupInfo); setActiveTab('navigate'); setPopupInfo(null); }}
                    >Start here</button>
                    <button
                      className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                      onClick={() => { setToLoc(popupInfo); setActiveTab('navigate'); setPopupInfo(null); }}
                    >Go here</button>
                  </div>

                  <button
                    className="mt-2 w-full bg-brand-600 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-brand-700 transition-colors"
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${popupInfo.latitude},${popupInfo.longitude}`, '_blank')}
                  >
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
                    <Icon size={12} style={{ color: meta.color }} />
                    {meta.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampusMap;
