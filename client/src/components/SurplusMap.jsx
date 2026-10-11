import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Maximize2, Minimize2, RotateCcw, RefreshCw, AlertCircle, Search,
  Filter, Layers, MapPin, Eye, Send, X, ShieldAlert, CheckCircle2, ChevronDown,
  Building2, ArrowLeft, List, Map as MapIcon, Truck, Check, HelpCircle,
  Activity, Info, ExternalLink, ChevronUp, AlertTriangle
} from 'lucide-react';
import { getPlainLanguageExplanation } from '../utils/plainLanguageAlerts';
import allFacilitiesData from '../config/geo.json';

/**
 * TAMIL NADU HEALTHCARE STOCK & DISTRICT DRILL-DOWN LOGISTICS MAP
 * Coordinates & Bounds:
 * - Center: [10.9, 78.4]
 * - Initial Zoom: 7, Min Zoom: 7
 * - Bounds: SW [8.0, 76.2], NE [13.6, 80.4]
 * - MaxBoundsViscosity: 1.0
 */
const TAMIL_NADU_CENTER = [10.9, 78.4];
const TAMIL_NADU_ZOOM = 7;
const TAMIL_NADU_BOUNDS = [
  [8.0, 76.2],  // South-West (Kanyakumari / Cape Comorin border)
  [13.6, 80.4]  // North-East (Pulicat / Chennai coast)
];

const MEDICINE_LIST = [
  'Paracetamol Syrup',
  'ORS Sachets',
  'Amoxicillin Suspension',
  'Iron-Folic Acid',
  'Metformin 500mg',
  'Anti-Snake Venom (ASV)'
];

// All 38 District Drug Warehouses extracted from verified facilities dataset
const ALL_DISTRICT_WAREHOUSES = allFacilitiesData.filter(f => f.is_warehouse);

export default function SurplusMap({
  centres = [],
  selectedCentreCode,
  selectedMedicine = 'Paracetamol Syrup',
  selectedDistrict = null,
  transferRoutes = [],
  onSelectCentre,
  onInspectInventory,
  onRequestMedicine,
  onSelectRoute,
  onSelectMedicine,
  onSelectDistrict,
  height = '540px',
  mapMode = 'tiles', // 'tiles' | 'schematic'
  onToggleMapMode,
  isBackendOffline = false
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const geoJsonLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const wrapperRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(TAMIL_NADU_ZOOM);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [isAttentionCardOpen, setIsAttentionCardOpen] = useState(true);

  // District drill-down state
  const [drilledDistrict, setDrilledDistrict] = useState(selectedDistrict);
  const [showAllCentres, setShowAllCentres] = useState(false);
  const [showTransfers, setShowTransfers] = useState(true);

  // Filters State
  const [districtFilter, setDistrictFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facilityTypeFilter, setFacilityTypeFilter] = useState('all'); // 'all' | 'PHC' | 'CHC' | 'Warehouse'
  const [medicineFilter, setMedicineFilter] = useState(selectedMedicine);
  const [searchTerm, setSearchTerm] = useState('');

  // GeoJSON data for all 38 districts
  const [geoJsonData, setGeoJsonData] = useState(null);

  // Live districts metadata from backend API (/api/districts/summary)
  const [districtsMeta, setDistrictsMeta] = useState([]);

  // Fetch GeoJSON polygons for all 38 districts from /tamil_nadu_districts.geojson
  useEffect(() => {
    let isMounted = true;
    fetch('/tamil_nadu_districts.geojson')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load Tamil Nadu district boundaries');
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setGeoJsonData(data);
        }
      })
      .catch(err => {
        console.warn('Could not load /tamil_nadu_districts.geojson:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch districts metadata from backend API on mount / medicine change
  const fetchDistricts = useCallback(async (med) => {
    try {
      const res = await fetch(`http://localhost:5000/api/districts/summary?medicine=${encodeURIComponent(med || 'Paracetamol Syrup')}`);
      if (res.ok) {
        const data = await res.json();
        setDistrictsMeta(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Could not fetch /api/districts/summary from backend; using local computation:', err);
    }
  }, []);

  useEffect(() => {
    fetchDistricts(medicineFilter);
  }, [fetchDistricts, medicineFilter]);

  // Keep local medicine filter synchronized with prop if changed externally
  useEffect(() => {
    if (selectedMedicine && selectedMedicine !== medicineFilter) {
      setMedicineFilter(selectedMedicine);
    }
  }, [selectedMedicine]);

  // Merge provided centres prop with full geo dataset to guarantee all 38 districts have their 3-4 centres
  const allMergedCentres = useMemo(() => {
    const nonWarehouseGeo = allFacilitiesData.filter(f => !f.is_warehouse);
    const propCodesMap = new Map();
    centres.forEach(c => {
      if (c.code) propCodesMap.set(c.code, c);
      if (c.id) propCodesMap.set(c.id, c);
    });

    return nonWarehouseGeo.map(geoC => {
      const override = propCodesMap.get(geoC.code) || propCodesMap.get(geoC.id);
      if (override) {
        return {
          ...geoC,
          ...override,
          lat: override.lat || geoC.lat,
          lon: override.lon || geoC.lon,
          district: override.district || geoC.district
        };
      }
      return {
        ...geoC,
        stock: geoC.stock ?? 180,
        usage: geoC.usage ?? 5,
        days: geoC.days ?? 36,
        status: geoC.status ?? 'green',
        medicinesCount: 48,
        criticalCount: 0,
        lowStockCount: 1,
        nearExpiryCount: 0,
        lastUpdated: '15 mins ago'
      };
    });
  }, [centres]);

  // Available districts from the merged dataset (all 38 districts)
  const availableDistricts = useMemo(() => {
    const districts = new Set();
    allMergedCentres.forEach(c => {
      if (c.district && c.district !== 'District not set') districts.add(c.district);
    });
    return Array.from(districts).sort();
  }, [allMergedCentres]);

  // Filtered centres list
  const filteredCentres = useMemo(() => {
    return allMergedCentres.filter(centre => {
      // 1. If currently drilled down to a specific district, limit to that district
      if (drilledDistrict && centre.district !== drilledDistrict) {
        return false;
      }
      // 2. District Filter dropdown
      if (districtFilter !== 'all' && centre.district !== districtFilter) {
        return false;
      }
      // 3. Stock Status Filter
      if (statusFilter !== 'all') {
        const s = (centre.status || '').toLowerCase();
        if (statusFilter === 'red' && s !== 'red') return false;
        if (statusFilter === 'amber' && s !== 'amber' && s !== 'yellow') return false;
        if (statusFilter === 'green' && s !== 'green') return false;
        if (statusFilter === 'grey' && s !== 'grey') return false;
      }
      // 4. Facility Type Filter (All, PHC, CHC, Warehouse)
      if (facilityTypeFilter !== 'all') {
        const isWh = centre.is_warehouse || centre.type === 'DISTRICT' || centre.facility_type === 'DISTRICT';
        const isChc = (centre.facility_type === 'CHC' || (centre.name && centre.name.includes('CHC')) || (centre.label && centre.label.includes('CHC'))) && !isWh;
        const isPhc = !isWh && !isChc;
        if (facilityTypeFilter === 'Warehouse' && !isWh) return false;
        if (facilityTypeFilter === 'CHC' && !isChc) return false;
        if (facilityTypeFilter === 'PHC' && !isPhc) return false;
      }
      // 5. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchCode = (centre.code || '').toLowerCase().includes(q);
        const matchLabel = (centre.label || '').toLowerCase().includes(q);
        const matchName = (centre.name || '').toLowerCase().includes(q);
        const matchDistrict = (centre.district || '').toLowerCase().includes(q);
        const matchBlock = (centre.block || '').toLowerCase().includes(q);
        const matchId = (centre.id || '').toLowerCase().includes(q);
        if (!matchCode && !matchLabel && !matchName && !matchDistrict && !matchBlock && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [allMergedCentres, drilledDistrict, districtFilter, statusFilter, facilityTypeFilter, searchTerm]);

  // Computed district aggregates from dataset
  const districtAggregates = useMemo(() => {
    const map = {};
    availableDistricts.forEach(d => {
      map[d] = {
        name: d,
        centres: [],
        critical: 0,
        low: 0,
        healthy: 0,
        stale: 0,
        worstStatus: 'green',
        openRequests: d === 'Madurai' ? 2 : 0,
        centerLat: 0,
        centerLon: 0
      };
    });

    allMergedCentres.forEach(c => {
      if (!c.district || c.district === 'District not set' || !map[c.district]) return;
      map[c.district].centres.push(c);
      const s = (c.status || '').toLowerCase();
      if (s === 'red') map[c.district].critical++;
      else if (s === 'amber' || s === 'yellow') map[c.district].low++;
      else if (s === 'grey') map[c.district].stale++;
      else map[c.district].healthy++;
    });

    Object.values(map).forEach(d => {
      if (d.critical > 0) d.worstStatus = 'red';
      else if (d.low > 0) d.worstStatus = 'yellow';
      else if (d.stale > 0) d.worstStatus = 'grey';
      else d.worstStatus = 'green';

      if (d.centres.length > 0) {
        d.centerLat = d.centres.reduce((sum, c) => sum + (c.lat || 0), 0) / d.centres.length;
        d.centerLon = d.centres.reduce((sum, c) => sum + (c.lon || 0), 0) / d.centres.length;
      }
    });

    return map;
  }, [availableDistricts, allMergedCentres]);

  // Helper to determine status style colors
  const getMarkerStyle = useCallback((status) => {
    const s = (status || '').toLowerCase();
    if (s === 'red') {
      return { bg: '#DC2626', border: '#991B1B', text: '#FFFFFF', label: 'Critical Shortage (<3d)', isRed: true, hex: '#DC2626', fillHex: '#FEE2E2' };
    }
    if (s === 'amber' || s === 'yellow') {
      return { bg: '#F59E0B', border: '#D97706', text: '#FFFFFF', label: 'Low Stock (<14d)', isRed: false, hex: '#F59E0B', fillHex: '#FEF3C7' };
    }
    if (s === 'green') {
      return { bg: '#16A34A', border: '#15803D', text: '#FFFFFF', label: 'Healthy / Surplus', isRed: false, hex: '#16A34A', fillHex: '#DCFCE7' };
    }
    return { bg: '#64748B', border: '#475569', text: '#FFFFFF', label: 'Stale / Unknown Data', isRed: false, hex: '#64748B', fillHex: '#F1F5F9' };
  }, []);

  // Synchronize drilledDistrict with external selectedDistrict prop
  useEffect(() => {
    if (selectedDistrict !== undefined && selectedDistrict !== drilledDistrict) {
      setDrilledDistrict(selectedDistrict);
      if (selectedDistrict && mapInstanceRef.current) {
        const agg = districtAggregates[selectedDistrict];
        if (agg && agg.centerLat && agg.centerLon) {
          mapInstanceRef.current.setView([agg.centerLat, agg.centerLon], 10, { animate: true });
        }
      } else if (!selectedDistrict && mapInstanceRef.current) {
        mapInstanceRef.current.setView(TAMIL_NADU_CENTER, TAMIL_NADU_ZOOM, { animate: true });
      }
    }
  }, [selectedDistrict, districtAggregates, drilledDistrict]);

  // Drill down into a specific district
  const handleDrillDistrict = useCallback((distName) => {
    setDrilledDistrict(distName);
    if (onSelectDistrict) onSelectDistrict(distName);

    // If GeoJSON is present, zoom to district polygon bounds
    if (geoJsonData && mapInstanceRef.current) {
      const feat = geoJsonData.features?.find(f => f.properties.district === distName);
      if (feat) {
        const geoLayer = L.geoJSON(feat);
        mapInstanceRef.current.fitBounds(geoLayer.getBounds(), {
          padding: [35, 35],
          maxZoom: 11,
          animate: true
        });
        return;
      }
    }

    const agg = districtAggregates[distName];
    if (mapInstanceRef.current && agg && agg.centerLat && agg.centerLon) {
      mapInstanceRef.current.setView([agg.centerLat, agg.centerLon], 10, {
        animate: true
      });
    }
  }, [districtAggregates, geoJsonData, onSelectDistrict]);

  // Reset to Whole Tamil Nadu
  const handleResetToTamilNadu = useCallback(() => {
    setDrilledDistrict(null);
    if (onSelectDistrict) onSelectDistrict(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(TAMIL_NADU_CENTER, TAMIL_NADU_ZOOM, {
        animate: true
      });
    }
  }, [onSelectDistrict]);

  // Top 3 Critical Centres across Tamil Nadu (for Needs Attention Card)
  const topCriticalCentres = useMemo(() => {
    return allMergedCentres
      .filter(c => (c.status || '').toLowerCase() === 'red' || (c.days ?? 99) <= 3)
      .slice(0, 3);
  }, [allMergedCentres]);

  // Fit Bounds Helper
  const handleFitAllCentres = useCallback(() => {
    if (!mapInstanceRef.current || filteredCentres.length === 0) return;
    const validCoords = filteredCentres
      .filter(c => c.lat && c.lon)
      .map(c => [c.lat, c.lon]);

    if (validCoords.length > 0) {
      mapInstanceRef.current.fitBounds(validCoords, {
        padding: [50, 50],
        maxZoom: 13,
        animate: true
      });
    }
  }, [filteredCentres]);

  // Fullscreen Toggle
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);
  }, []);

  // Reset all filters
  const handleResetFilters = useCallback(() => {
    setDistrictFilter('all');
    setStatusFilter('all');
    setFacilityTypeFilter('all');
    setSearchTerm('');
    setDrilledDistrict(null);
    setShowAllCentres(false);
    setMedicineFilter('Paracetamol Syrup');
    if (onSelectMedicine) onSelectMedicine('Paracetamol Syrup');
    handleResetToTamilNadu();
  }, [handleResetToTamilNadu, onSelectMedicine]);

  // Jump to specific centre
  const handleJumpToCentre = useCallback((centre) => {
    if (!mapInstanceRef.current || !centre.lat || !centre.lon) return;
    setDrilledDistrict(centre.district);
    if (onSelectDistrict) onSelectDistrict(centre.district);
    if (onSelectCentre) onSelectCentre(centre.code);
    mapInstanceRef.current.setView([centre.lat, centre.lon], 12, { animate: true });
  }, [onSelectDistrict, onSelectCentre]);

  // 1. INITIALIZE LEAFLET MAP WITH STRICT TAMIL NADU RESTRICTIONS
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapContainerRef.current._leaflet_id) {
      mapContainerRef.current._leaflet_id = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: TAMIL_NADU_CENTER,
        zoom: TAMIL_NADU_ZOOM,
        minZoom: 7,
        maxBounds: TAMIL_NADU_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: false,
        scrollWheelZoom: true
      });

      // Zoom controls in top-left
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // OpenStreetMap Tiles Layer with official attribution
      const osmTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        minZoom: 7,
        bounds: TAMIL_NADU_BOUNDS,
        timeout: 9000
      });

      osmTiles.on('tileerror', () => {
        setTileError(true);
      });

      osmTiles.addTo(map);
      tileLayerRef.current = osmTiles;

      // Group Layers
      geoJsonLayerRef.current = L.layerGroup().addTo(map);
      routesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;

      map.on('zoomend', () => {
        const z = map.getZoom();
        setCurrentZoom(z);
        // Auto-exit drilled district if user zooms all the way back out to TN state level
        if (z <= 7 && !showAllCentres) {
          setDrilledDistrict(null);
        }
      });

      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
        setIsLoading(false);
      }, 150);

      const handleResize = () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
        if (mapContainerRef.current) {
          mapContainerRef.current._leaflet_id = null;
        }
      };
    } catch (err) {
      console.error('Error initializing Tamil Nadu map:', err);
      setIsLoading(false);
      setTileError(true);
    }
  }, []);

  // Handle Schematic vs Tiles Layer toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    const tileLayer = tileLayerRef.current;
    if (!map || !tileLayer) return;

    if (mapMode === 'schematic') {
      if (map.hasLayer(tileLayer)) map.removeLayer(tileLayer);
    } else {
      if (!map.hasLayer(tileLayer)) tileLayer.addTo(map);
    }
  }, [mapMode]);

  // 2. RENDER TAMIL NADU DISTRICT BOUNDARIES (GEOJSON POLYGONS)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const geoJsonLayer = geoJsonLayerRef.current;
    if (!map || !geoJsonLayer) return;

    geoJsonLayer.clearLayers();

    if (!geoJsonData || !geoJsonData.features) return;

    // Check if we are in statewide overview
    const isStatewideOverview = currentZoom <= 8 && !drilledDistrict && !showAllCentres && districtFilter === 'all';

    if (isStatewideOverview) {
      // -----------------------------------------------------------------
      // Render all 38 district polygons with worst-status fill color
      // -----------------------------------------------------------------
      const gLayer = L.geoJSON(geoJsonData, {
        style: (feature) => {
          const distName = feature.properties.district;
          const meta = districtsMeta.find(m => m.name === distName);
          const agg = districtAggregates[distName];
          const worstStatus = meta?.worst_status || agg?.worstStatus || 'green';
          const style = getMarkerStyle(worstStatus);

          return {
            fillColor: style.hex,
            fillOpacity: 0.22,
            color: style.border,
            weight: 1.5,
            opacity: 0.85,
            dashArray: null
          };
        },
        onEachFeature: (feature, layer) => {
          const distName = feature.properties.district;
          const meta = districtsMeta.find(m => m.name === distName);
          const agg = districtAggregates[distName];
          const worstStatus = meta?.worst_status || agg?.worstStatus || 'green';
          const centreCount = meta?.centre_count || agg?.centres?.length || 3;
          const criticalCount = meta?.critical_count ?? agg?.critical ?? 0;
          const lowCount = meta?.low_stock_count ?? agg?.low ?? 0;
          const healthyCount = meta?.healthy_count ?? agg?.healthy ?? 0;
          const openReqs = meta?.open_requests_count ?? agg?.openRequests ?? 0;
          const explanation = meta?.explanation || `${distName}: ${criticalCount} of ${centreCount} facilities require stock replenishment.`;

          // Hover interactions
          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({
                weight: 3,
                fillOpacity: 0.45,
                color: '#0F172A'
              });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                l.bringToFront();
              }
            },
            mouseout: (e) => {
              gLayer.resetStyle(e.target);
            },
            click: (e) => {
              map.fitBounds(e.target.getBounds(), {
                padding: [35, 35],
                maxZoom: 11,
                animate: true
              });
              handleDrillDistrict(distName);
            }
          });

          // Rich Hover Tooltip / Floating Card
          const tooltipHtml = `
            <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; line-height: 1.4; min-width: 220px; padding: 4px;">
              <div style="font-weight: 800; font-size: 13px; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>📍 ${distName} District</span>
                <span style="font-size: 10px; font-weight: 700; color: #64748B;">${centreCount} Centres</span>
              </div>
              <div style="font-size: 11px; color: #475569; margin-bottom: 6px; line-height: 1.35;">
                📢 ${explanation}
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; text-align: center; margin-bottom: 6px;">
                <div style="background: #FEE2E2; color: #DC2626; padding: 3px; border-radius: 6px; font-size: 10px; font-weight: 800;">
                  <div>${criticalCount}</div>
                  <div style="font-size: 8px;">Critical</div>
                </div>
                <div style="background: #FEF3C7; color: #D97706; padding: 3px; border-radius: 6px; font-size: 10px; font-weight: 800;">
                  <div>${lowCount}</div>
                  <div style="font-size: 8px;">Low</div>
                </div>
                <div style="background: #DCFCE7; color: #16A34A; padding: 3px; border-radius: 6px; font-size: 10px; font-weight: 800;">
                  <div>${healthyCount}</div>
                  <div style="font-size: 8px;">Healthy</div>
                </div>
              </div>
              <div style="font-size: 10px; color: #2563EB; font-weight: 700; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 4px;">
                Open Transfer Requests: <b>${openReqs}</b> &bull; Click to drill down &rarr;
              </div>
            </div>
          `;

          layer.bindTooltip(tooltipHtml, {
            direction: 'top',
            sticky: true,
            className: 'vrx-leaflet-popup',
            opacity: 0.98
          });
        }
      });

      gLayer.addTo(geoJsonLayer);

    } else if (drilledDistrict) {
      // -----------------------------------------------------------------
      // When drilled down: Highlight ONLY the selected district polygon
      // -----------------------------------------------------------------
      const selectedFeature = geoJsonData.features.find(f => f.properties.district === drilledDistrict);
      if (selectedFeature) {
        L.geoJSON(selectedFeature, {
          style: {
            fillColor: '#3B82F6',
            fillOpacity: 0.05,
            color: '#2563EB',
            weight: 2,
            dashArray: '5, 5',
            opacity: 0.8
          }
        }).addTo(geoJsonLayer);
      }
    }
  }, [
    geoJsonData,
    currentZoom,
    drilledDistrict,
    showAllCentres,
    districtFilter,
    districtsMeta,
    districtAggregates,
    getMarkerStyle,
    handleDrillDistrict
  ]);

  // 3. RENDER MAP MARKERS: DISTRICT VIEW VS CENTRE VIEW
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // Determine whether to show District Overview or Individual Centre Markers:
    // If at state zoom (<= 8), no district drilled down, and showAllCentres is false -> DISTRICT OVERVIEW
    const isDistrictView = currentZoom <= 8 && !drilledDistrict && !showAllCentres && districtFilter === 'all';

    if (isDistrictView) {
      // -------------------------------------------------------------
      // SECTION 3A: Clean Centroid Labels for all 38 Districts
      // -------------------------------------------------------------
      availableDistricts.forEach(distName => {
        const agg = districtAggregates[distName];
        if (!agg || agg.centres.length === 0) return;

        const meta = districtsMeta.find(m => m.name === distName);
        const worstStatus = meta?.worst_status || agg.worstStatus;
        const centreCount = meta?.centre_count || agg.centres.length;
        const criticalCount = meta?.critical_count ?? agg.critical;
        const lat = meta?.center_lat || agg.centerLat;
        const lon = meta?.center_lon || agg.centerLon;

        if (!lat || !lon) return;

        const isRed = worstStatus === 'red' || criticalCount > 0;

        const labelHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${isRed ? `<div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: urgent-pulse 1.8s infinite; pointer-events: none;"></div>` : ''}
            <div style="
              background: ${isRed ? '#DC2626' : '#0F172A'};
              color: #FFFFFF;
              font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
              font-size: 10px;
              font-weight: 800;
              padding: 2px 7px;
              border-radius: 9999px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.35);
              white-space: nowrap;
              border: 1.5px solid #FFFFFF;
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span>${distName}</span>
              <span style="
                background: rgba(255,255,255,0.25);
                font-size: 8px;
                padding: 1px 4px;
                border-radius: 4px;
              ">${centreCount}</span>
            </div>
          </div>
        `;

        const labelIcon = L.divIcon({
          className: 'custom-district-centroid-label',
          html: labelHtml,
          iconSize: [80, 24],
          iconAnchor: [40, 12]
        });

        const labelMarker = L.marker([lat, lon], {
          icon: labelIcon,
          zIndexOffset: isRed ? 800 : 300
        }).addTo(markersLayer);

        labelMarker.on('click', () => {
          handleDrillDistrict(distName);
        });
      });

    } else {
      // -------------------------------------------------------------
      // SECTION 3B: CENTRE-LEVEL VIEW & DISTRICT WAREHOUSE NODES
      // -------------------------------------------------------------

      // 1. Render fictional District Drug Warehouse nodes for visible districts
      const activeDistrictsToRenderWarehouses = drilledDistrict
        ? [drilledDistrict]
        : (districtFilter !== 'all' ? [districtFilter] : availableDistricts);

      activeDistrictsToRenderWarehouses.forEach(dName => {
        const wh = ALL_DISTRICT_WAREHOUSES.find(w => w.district === dName);
        if (!wh) return;

        const whLat = wh.lat || wh.latitude;
        const whLon = wh.lon || wh.longitude;
        if (!whLat || !whLon) return;

        const whIconHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div style="
              width: 32px;
              height: 32px;
              background-color: #312E81;
              border: 2.5px solid #FFFFFF;
              box-shadow: 0 4px 12px rgba(15, 23, 42, 0.4);
              border-radius: 8px;
              color: #FFFFFF;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
              font-weight: 800;
              font-size: 10px;
              line-height: 1;
              z-index: 12;
            ">
              <span>🏛️</span>
              <span style="font-size: 7px; font-weight: 700; letter-spacing: -0.02em; margin-top: 1px;">DDW</span>
            </div>
          </div>
        `;

        const whIcon = L.divIcon({
          className: 'custom-warehouse-marker',
          html: whIconHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const whMarker = L.marker([whLat, whLon], {
          icon: whIcon,
          zIndexOffset: 850
        }).addTo(markersLayer);

        // Warehouse popup showing stock summary, last updated, and open requests
        const meta = districtsMeta.find(m => m.name === wh.district);
        const openReqCount = meta?.open_requests_count ?? (wh.district === 'Madurai' ? 2 : 0);
        const stockSummary = meta ? `${meta.total_medicine_stock + 450} units available across district reserves` : '2,100 units reserve';

        const whPopupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; line-height: 1.45; min-width: 250px; color: #0F172A; padding: 2px;">
            <div style="border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span style="font-weight: 800; font-size: 13px; color: #1E1B4B;">🏛️ ${wh.name}</span>
                <span style="background: #E0E7FF; color: #3730A3; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">SIMULATED</span>
              </div>
              <div style="font-size: 10px; color: #64748B; font-weight: 600; margin-top: 2px;">
                Code: <b>${wh.code}</b> &bull; ${wh.district} District HQ
              </div>
            </div>

            <div style="background: #EEF2FF; border: 1px solid #C7D2FE; padding: 6px 8px; border-radius: 6px; margin-bottom: 8px; font-size: 11px; color: #312E81;">
              📦 <b>District Stock Reserves (${medicineFilter}):</b><br/>
              ${stockSummary}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 8px; background: #F8FAFC; padding: 6px 8px; border-radius: 6px; border: 1px solid #E2E8F0;">
              <div>
                <span style="color: #64748B; font-size: 10px;">Open Requests:</span>
                <div style="font-weight: 800; font-size: 13px; color: #0F172A;">${openReqCount} pending</div>
              </div>
              <div>
                <span style="color: #64748B; font-size: 10px;">Last Verified:</span>
                <div style="font-weight: 700; font-size: 11px; color: #16A34A;">Just now</div>
              </div>
            </div>

            <div style="font-size: 10px; color: #64748B; line-height: 1.35; border-top: 1px solid #E2E8F0; padding-top: 4px;">
              💡 <i>Escalation node: Requests routed here when local PHC peer transfers cannot close stock deficit.</i>
            </div>
          </div>
        `;

        whMarker.bindPopup(whPopupHtml, {
          autoPan: true,
          autoPanPadding: [30, 30],
          className: 'vrx-leaflet-popup'
        });
      });

      // 2. Render Individual Centre Markers with Clustering
      const validCentres = filteredCentres.filter(c => c.lat && c.lon);
      const clusters = [];
      const visited = new Set();

      validCentres.forEach((c1, i) => {
        if (visited.has(i)) return;
        const group = [c1];
        visited.add(i);

        // Clustered when overlapping centres zoomed out (< 36px)
        if (currentZoom <= 9 && !drilledDistrict) {
          const pt1 = map.latLngToLayerPoint([c1.lat, c1.lon]);
          validCentres.forEach((c2, j) => {
            if (i !== j && !visited.has(j)) {
              const pt2 = map.latLngToLayerPoint([c2.lat, c2.lon]);
              const dist = pt1.distanceTo(pt2);
              if (dist < 36) {
                group.push(c2);
                visited.add(j);
              }
            }
          });
        }
        clusters.push(group);
      });

      clusters.forEach(group => {
        if (group.length > 1) {
          // Cluster Marker
          const avgLat = group.reduce((sum, c) => sum + c.lat, 0) / group.length;
          const avgLon = group.reduce((sum, c) => sum + c.lon, 0) / group.length;
          const hasRed = group.some(c => (c.status || '').toLowerCase() === 'red');
          const hasAmber = group.some(c => ['amber', 'yellow'].includes((c.status || '').toLowerCase()));
          const dominantColor = hasRed ? '#DC2626' : (hasAmber ? '#F59E0B' : '#16A34A');

          const clusterHtml = `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              ${hasRed ? `<div style="position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: urgent-pulse 1.8s infinite; pointer-events: none;"></div>` : ''}
              <div style="
                width: 36px;
                height: 36px;
                background: ${dominantColor};
                border: 2.5px solid #FFFFFF;
                box-shadow: 0 4px 12px rgba(15, 23, 42, 0.35);
                border-radius: 50%;
                color: #FFFFFF;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                font-weight: 800;
                font-size: 13px;
                line-height: 1;
                z-index: 5;
              ">
                <span>${group.length}</span>
                <span style="font-size: 7px; font-weight: 700; text-transform: uppercase;">Centres</span>
              </div>
            </div>
          `;

          const clusterIcon = L.divIcon({
            className: 'custom-vrx-cluster-marker',
            html: clusterHtml,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });

          const clusterMarker = L.marker([avgLat, avgLon], {
            icon: clusterIcon,
            zIndexOffset: hasRed ? 900 : 400
          }).addTo(markersLayer);

          clusterMarker.on('click', () => {
            map.setView([avgLat, avgLon], currentZoom + 2, { animate: true });
          });

          const clusterPopupHtml = `
            <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; min-width: 210px; padding: 2px;">
              <div style="font-weight: 800; font-size: 13px; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
                ${group.length} Nearby Health Facilities
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">
                ${group.map(c => `
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px;">
                    <span><b>${c.code}:</b> ${c.shortName || c.label || c.name}</span>
                    <span style="
                      padding: 1px 6px;
                      border-radius: 9999px;
                      font-size: 9px;
                      font-weight: 700;
                      color: ${c.status === 'red' ? '#DC2626' : c.status === 'green' ? '#16A34A' : '#D97706'};
                      background: ${c.status === 'red' ? '#FEE2E2' : c.status === 'green' ? '#DCFCE7' : '#FEF3C7'};
                    ">${(c.status || 'healthy').toUpperCase()}</span>
                  </div>
                `).join('')}
              </div>
              <div style="font-size: 10px; color: #64748B; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 4px;">
                Click marker to zoom in and expand facilities
              </div>
            </div>
          `;
          clusterMarker.bindPopup(clusterPopupHtml);

        } else {
          // Individual Centre Marker (28px circle with white border and pulsing ring if critical)
          const centre = group[0];
          const isSelected = centre.code === selectedCentreCode || centre.id === selectedCentreCode;
          const style = getMarkerStyle(centre.status);
          const size = isSelected ? 34 : 28;

          // Pulsing ring for critical shortage
          const pulseHtml = style.isRed
            ? `<div style="position: absolute; width: ${size + 16}px; height: ${size + 16}px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: urgent-pulse 1.8s infinite; pointer-events: none;"></div>`
            : '';

          // Halo ring for actively selected centre
          const selectedRing = isSelected
            ? 'border: 3.5px solid #2563EB; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.4);'
            : `border: 2.5px solid #FFFFFF; box-shadow: 0 3px 8px rgba(15, 23, 42, 0.35);`;

          const iconHtml = `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;" aria-label="${centre.label || centre.name}">
              ${pulseHtml}
              <div style="
                width: ${size}px;
                height: ${size}px;
                background-color: ${style.bg};
                color: #FFFFFF;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 800;
                font-size: ${isSelected ? 13 : 11}px;
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                ${selectedRing}
                position: relative;
                z-index: 2;
                cursor: pointer;
              ">
                ${centre.code || centre.shortName?.slice(0, 2) || 'PHC'}
              </div>
            </div>
          `;

          const customIcon = L.divIcon({
            className: 'custom-vrx-marker',
            html: iconHtml,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
          });

          const marker = L.marker([centre.lat, centre.lon], {
            icon: customIcon,
            zIndexOffset: isSelected ? 1200 : (style.isRed ? 700 : 200)
          }).addTo(markersLayer);

          // 300px Unclipped Healthcare Popup
          const criticalCount = centre.criticalCount ?? (style.isRed ? 2 : 0);
          const lowStockCount = centre.lowStockCount ?? (['amber', 'yellow'].includes(centre.status) ? 3 : 1);
          const healthyCount = (centre.medicinesCount ?? 48) - criticalCount - lowStockCount;
          const totalStock = centre.stock ?? 0;
          const daysOfCover = centre.days ?? 0;
          const nearExpiryBatches = centre.nearExpiryCount ?? (centre.code === 'B' ? 2 : 0);
          const updateTime = centre.lastUpdated || '10 mins ago';

          const plainExplanation = getPlainLanguageExplanation({
            type: style.isRed ? 'critical_shortage' : (['amber', 'yellow'].includes(centre.status) ? 'low_stock' : 'healthy'),
            status: centre.status,
            severity: style.isRed ? 'critical' : 'warning',
            daysOfCover,
            daysToExpiry: nearExpiryBatches > 0 ? 36 : 180,
            currentQuantity: totalStock,
            minSafetyStock: 14,
            unit: 'units',
            isStale: centre.status === 'grey' || centre.is_stale
          });

          // Lead Time visual gauge progress
          const gaugePercent = Math.min(100, Math.max(5, (daysOfCover / 30) * 100));

          const popupHtml = `
            <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; line-height: 1.45; min-width: 285px; max-width: 320px; color: #0F172A; padding: 2px;">
              <!-- Header -->
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
                <div>
                  <div style="font-weight: 800; font-size: 14px; color: #0F172A;">
                    ${centre.label || centre.name || `Centre ${centre.code}`}
                  </div>
                  <div style="font-size: 10px; color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px;">
                    Type: <b>${centre.type || centre.facility_type || 'PHC'}</b> &bull; Code: <b>${centre.code}</b>
                  </div>
                  <div style="font-size: 10px; color: #0284C7; font-weight: 600; margin-top: 1px;">
                    📍 ${centre.district || 'District not set'} District &bull; ${centre.block || 'Local Block'}
                  </div>
                </div>
                <span style="
                  padding: 3px 8px;
                  border-radius: 9999px;
                  font-size: 10px;
                  font-weight: 700;
                  text-transform: uppercase;
                  background-color: ${style.fillHex};
                  color: ${style.bg};
                  white-space: nowrap;
                ">
                  ${style.label}
                </span>
              </div>

              <!-- Plain-Language Explanation -->
              <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; padding: 5px 8px; border-radius: 6px; margin-bottom: 8px; font-size: 11px; font-weight: 600; color: #92400E; line-height: 1.35;">
                📢 ${plainExplanation}
              </div>

              <!-- Usable Stock & Days of Cover Box -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background-color: #F8FAFC; padding: 8px; border-radius: 8px; margin-bottom: 8px; border: 1px solid #E2E8F0;">
                <div>
                  <div style="color: #64748B; font-size: 10px; font-weight: 600;">Usable Stock:</div>
                  <div style="font-weight: 800; font-size: 14px; color: #0F172A;">
                    ${totalStock} <span style="font-size: 10px; font-weight: 500; color: #64748B;">units</span>
                  </div>
                </div>
                <div>
                  <div style="color: #64748B; font-size: 10px; font-weight: 600;">Days of Cover:</div>
                  <div style="font-weight: 800; font-size: 14px; color: ${style.isRed ? '#DC2626' : '#0F172A'};">
                    ${daysOfCover} <span style="font-size: 10px; font-weight: 500; color: #64748B;">days left</span>
                  </div>
                </div>
              </div>

              <!-- Visual Lead Time & Safety Threshold Bar -->
              <div style="margin-bottom: 8px; background: #F1F5F9; border-radius: 6px; padding: 5px 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748B; margin-bottom: 3px;">
                  <span>Buffer Gauge (14d Threshold)</span>
                  <span style="font-weight: 700; color: ${daysOfCover < 14 ? '#DC2626' : '#16A34A'}">${daysOfCover < 14 ? '⚠️ Deficit' : '✅ Sufficient'}</span>
                </div>
                <div style="width: 100%; height: 6px; background: #E2E8F0; border-radius: 9999px; overflow: hidden; position: relative;">
                  <div style="height: 100%; width: ${gaugePercent}%; background: ${style.bg}; border-radius: 9999px;"></div>
                </div>
              </div>

              <!-- Medicine Status Breakdown -->
              <div style="font-size: 11px; margin-bottom: 8px;">
                <div style="color: #475569; display: flex; justify-content: space-between; margin-bottom: 2px;">
                  <span>Selected Medicine:</span> <b style="color: #0F172A;">${medicineFilter}</b>
                </div>
                <div style="color: #475569; display: flex; justify-content: space-between; margin-bottom: 2px;">
                  <span>Stock Breakdown:</span>
                  <span>
                    <b style="color: #DC2626;">${criticalCount} Crit</b> &bull; 
                    <b style="color: #D97706;">${lowStockCount} Low</b> &bull; 
                    <b style="color: #16A34A;">${Math.max(0, healthyCount)} OK</b>
                  </span>
                </div>
                <div style="color: #475569; display: flex; justify-content: space-between; margin-bottom: 2px;">
                  <span>Near-Expiry Batches:</span>
                  <b style="color: ${nearExpiryBatches > 0 ? '#D97706' : '#64748B'};">${nearExpiryBatches} batches</b>
                </div>
                <div style="color: #94A3B8; font-size: 10px; margin-top: 4px;">
                  Last update &amp; verified: ${updateTime}
                </div>
              </div>

              <!-- Two Action Buttons -->
              <div style="display: flex; gap: 6px; padding-top: 6px; border-top: 1px solid #E2E8F0;">
                <button id="inspect-btn-${centre.code}" style="
                  flex: 1;
                  background-color: #F1F5F9;
                  color: #1E293B;
                  border: 1px solid #CBD5E1;
                  padding: 6px 8px;
                  border-radius: 6px;
                  font-size: 11px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: background 0.15s;
                ">🔍 Inspect Inventory</button>
                <button id="request-btn-${centre.code}" style="
                  flex: 1;
                  background-color: #2563EB;
                  color: #FFFFFF;
                  border: none;
                  padding: 6px 8px;
                  border-radius: 6px;
                  font-size: 11px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: background 0.15s;
                ">⚡ Request Medicine</button>
              </div>
            </div>
          `;

          marker.bindPopup(popupHtml, {
            autoPan: true,
            autoPanPadding: [30, 30],
            closeButton: true,
            className: 'vrx-leaflet-popup'
          });

          marker.on('click', () => {
            if (onSelectCentre) onSelectCentre(centre.code);
          });

          marker.on('popupopen', () => {
            const inspectBtn = document.getElementById(`inspect-btn-${centre.code}`);
            const requestBtn = document.getElementById(`request-btn-${centre.code}`);

            if (inspectBtn && onInspectInventory) {
              inspectBtn.onclick = (e) => {
                e.stopPropagation();
                onInspectInventory(centre);
              };
            }
            if (requestBtn && onRequestMedicine) {
              requestBtn.onclick = (e) => {
                e.stopPropagation();
                onRequestMedicine(centre);
              };
            }
          });
        }
      });
    }
  }, [
    filteredCentres,
    availableDistricts,
    districtAggregates,
    districtsMeta,
    drilledDistrict,
    showAllCentres,
    currentZoom,
    districtFilter,
    medicineFilter,
    selectedCentreCode,
    getMarkerStyle,
    handleDrillDistrict,
    onSelectCentre,
    onInspectInventory,
    onRequestMedicine
  ]);

  // 4. RENDER TRANSFER ROUTES WITH ANIMATED DISPATCH DOT
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routesLayer = routesLayerRef.current;
    if (!map || !routesLayer) return;

    routesLayer.clearLayers();

    if (!showTransfers) return;

    // Draw route for real transfer records
    const routesToDraw = transferRoutes.length > 0
      ? transferRoutes
      : [
          {
            id: 'TRF-VRX-101',
            from: 'Centre 2 (Othakadai Upgraded PHC)',
            fromCode: 'B',
            to: 'Centre 1 (Melur PHC)',
            toCode: 'A',
            medicine: medicineFilter || 'Paracetamol Syrup',
            qty: 40,
            status: 'Requested',
            distance: 9.0,
            duration: 18
          }
        ];

    routesToDraw.forEach(route => {
      const fromCentre = allMergedCentres.find(c => c.code === route.fromCode || (c.label && c.label.includes(route.from)));
      const toCentre = allMergedCentres.find(c => c.code === route.toCode || (c.label && c.label.includes(route.to)));

      if (fromCentre && toCentre && fromCentre.lat && toCentre.lat) {
        const polyline = L.polyline(
          [[fromCentre.lat, fromCentre.lon], [toCentre.lat, toCentre.lon]],
          {
            color: '#2563EB',
            weight: 3.5,
            dashArray: '6, 6',
            opacity: 0.95
          }
        ).addTo(routesLayer);

        const routePopup = `
          <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 11px; line-height: 1.45; min-width: 220px; color: #0F172A; padding: 2px;">
            <div style="font-weight: 800; font-size: 12px; color: #2563EB; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
              🚚 ${route.id || 'Transfer Route'} (Estimated)
            </div>
            <div><b>Donor (Surplus):</b> ${fromCentre.label || `Centre ${fromCentre.code}`} (${fromCentre.district})</div>
            <div><b>Receiver (Deficit):</b> ${toCentre.label || `Centre ${toCentre.code}`} (${toCentre.district})</div>
            <div><b>Medicine:</b> ${route.medicine || medicineFilter} &bull; <b>${route.qty || 40}</b> units</div>
            <div><b>Status:</b> <span style="color: #2563EB; font-weight: 700;">${route.status || 'Active'}</span></div>
            <div style="font-size: 10px; color: #64748B; margin-top: 4px; background: #F1F5F9; padding: 3px 6px; border-radius: 4px;">
              🛣️ Road Distance: ~${route.distance || 9.0} km (estimated) &bull; ~${route.duration || 18} min
            </div>
          </div>
        `;

        polyline.bindPopup(routePopup);

        if (onSelectRoute) {
          polyline.on('click', () => onSelectRoute(route));
        }

        // Animate a dispatch dot if status is In Transit / Dispatched
        if (['Dispatched', 'In Transit', 'dispatched', 'in_transit'].includes(route.status)) {
          const midLat = (fromCentre.lat + toCentre.lat) / 2;
          const midLon = (fromCentre.lon + toCentre.lon) / 2;

          const dotHtml = `
            <div style="
              width: 14px;
              height: 14px;
              background-color: #2563EB;
              border: 2px solid #FFFFFF;
              border-radius: 50%;
              box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);
              animation: urgent-pulse 1.2s infinite;
            "></div>
          `;
          const dotIcon = L.divIcon({
            className: 'custom-transit-dot',
            html: dotHtml,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          L.marker([midLat, midLon], { icon: dotIcon, zIndexOffset: 950 }).addTo(routesLayer);
        }
      }
    });
  }, [transferRoutes, allMergedCentres, medicineFilter, showTransfers, onSelectRoute]);

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full rounded-2xl border border-slate-200 bg-white shadow-soft transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[9999] rounded-none p-4 bg-slate-900/40 backdrop-blur-sm' : ''
      }`}
    >
      {/* SECTION 5: COMPACT FILTERS & NAVIGATION HEADER BAR */}
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 rounded-t-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Breadcrumb when drilled into a district */}
          {drilledDistrict && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-900 mr-1 shadow-2xs">
              <button
                onClick={handleResetToTamilNadu}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                title="Back to all 38 districts"
              >
                <ArrowLeft size={13} />
                <span>Tamil Nadu (38)</span>
              </button>
              <span className="text-blue-400">&gt;</span>
              <span>{drilledDistrict} District</span>
              <button
                onClick={handleResetToTamilNadu}
                className="ml-1 text-slate-400 hover:text-slate-600"
                title="Exit district drilldown"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* District Filter Dropdown (All 38 Districts) */}
          <div className="relative">
            <select
              value={drilledDistrict || districtFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'all') {
                  setDistrictFilter('all');
                  setDrilledDistrict(null);
                  handleResetToTamilNadu();
                } else {
                  setDistrictFilter(val);
                  handleDrillDistrict(val);
                }
              }}
              className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">📍 All 38 Districts</option>
              {availableDistricts.map(d => (
                <option key={d} value={d}>{d} District</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Quick District Chips for top demo districts */}
          <div className="hidden xl:flex items-center gap-1">
            {['Madurai', 'Theni', 'Dindigul', 'Chennai', 'Coimbatore'].map(d => {
              const isActive = (drilledDistrict === d) || (districtFilter === d);
              return (
                <button
                  key={d}
                  onClick={() => {
                    if (isActive) {
                      setDistrictFilter('all');
                      setDrilledDistrict(null);
                      handleResetToTamilNadu();
                    } else {
                      setDistrictFilter(d);
                      handleDrillDistrict(d);
                    }
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Stock Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">🚦 All Stock Statuses</option>
              <option value="red">🔴 Critical Shortage (&lt;3d)</option>
              <option value="amber">🟡 Low Stock (&lt;14d)</option>
              <option value="green">🟢 Healthy / Surplus</option>
              <option value="grey">⚪ Stale / Unknown Data</option>
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Facility Type Filter */}
          <div className="relative">
            <select
              value={facilityTypeFilter}
              onChange={(e) => setFacilityTypeFilter(e.target.value)}
              className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">🏢 All Facilities</option>
              <option value="PHC">🏥 Primary (PHC)</option>
              <option value="CHC">🏥 Community (CHC)</option>
              <option value="Warehouse">🏬 Warehouse (DDW)</option>
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Medicine Filter */}
          <div className="relative">
            <select
              value={medicineFilter}
              onChange={(e) => {
                setMedicineFilter(e.target.value);
                if (onSelectMedicine) onSelectMedicine(e.target.value);
              }}
              className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              {MEDICINE_LIST.map(med => (
                <option key={med} value={med}>💊 {med}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[140px] max-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search centre, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Reset Filters */}
          {(districtFilter !== 'all' || statusFilter !== 'all' || facilityTypeFilter !== 'all' || searchTerm || drilledDistrict || showAllCentres || medicineFilter !== 'Paracetamol Syrup') && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer shadow-2xs"
              title="Reset all filters"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* CONTROLS (Toggles, Fit, Fullscreen, List View) */}
        <div className="flex items-center gap-1.5">
          {/* "Show all centres" toggle button */}
          <button
            onClick={() => setShowAllCentres(prev => !prev)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition shadow-2xs cursor-pointer ${
              showAllCentres
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="Toggle between 38 district polygons overview and all 133 centres"
          >
            <span>{showAllCentres ? 'Districts View' : 'All Centres'}</span>
          </button>

          {/* "Show transfers" toggle */}
          <button
            onClick={() => setShowTransfers(prev => !prev)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition shadow-2xs cursor-pointer ${
              showTransfers
                ? 'bg-slate-100 border-slate-300 text-slate-800'
                : 'bg-white border-slate-200 text-slate-400'
            }`}
            title="Toggle transfer route polylines"
          >
            <Truck size={13} className={showTransfers ? 'text-blue-600' : 'text-slate-400'} />
            <span className="hidden sm:inline">Transfers</span>
          </button>

          {/* Alternative List View toggle */}
          <button
            onClick={() => setViewMode(prev => prev === 'map' ? 'list' : 'map')}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title="Toggle map and tabular list view"
          >
            {viewMode === 'map' ? <List size={13} /> : <MapIcon size={13} />}
            <span className="hidden sm:inline">{viewMode === 'map' ? 'List View' : 'Map View'}</span>
          </button>

          {/* Fit Centres */}
          <button
            onClick={handleFitAllCentres}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title="Fit view to all matching centres"
          >
            <Maximize2 size={13} className="text-slate-500" />
            <span className="hidden md:inline">Fit centres</span>
          </button>

          {/* Reset TN View */}
          <button
            onClick={handleResetToTamilNadu}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title="Reset to Tamil Nadu overview"
          >
            <RotateCcw size={13} className="text-slate-500" />
            <span className="hidden md:inline">Tamil Nadu</span>
          </button>

          {onToggleMapMode && (
            <button
              onClick={onToggleMapMode}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
              title="Toggle between real tiles and schematic grid"
            >
              <Layers size={13} className="text-slate-500" />
              <span className="hidden sm:inline">{mapMode === 'schematic' ? 'Real Tiles' : 'Schematic'}</span>
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* MAP CANVAS OR ACCESSIBLE LIST VIEW */}
      {viewMode === 'map' ? (
        <div className="relative w-full" style={{ height: isFullscreen ? 'calc(100vh - 120px)' : height }}>
          <div
            className={`h-full w-full transition-opacity duration-300 ${
              mapMode === 'schematic' ? 'bg-slate-100' : 'bg-slate-50'
            }`}
            style={{
              backgroundImage: 'radial-gradient(#CBD5E1 1.2px, transparent 1.2px)',
              backgroundSize: '20px 20px'
            }}
          >
            <div ref={mapContainerRef} className="h-full w-full" />
          </div>

          {/* LOADING SKELETON */}
          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-xs">
              <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-md border border-slate-200">
                <RefreshCw size={14} className="animate-spin text-blue-600" />
                <span>Loading Tamil Nadu 38-District Health Network...</span>
              </div>
            </div>
          )}

          {/* EMPTY STATE */}
          {!isLoading && filteredCentres.length === 0 && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/85 backdrop-blur-2xs p-6 text-center">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2">
                <MapPin size={20} />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">No centres match selected filters</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-3">
                No health centres matched the current filter criteria for district, stock status, or search query.
              </p>
              <button
                onClick={handleResetFilters}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}

          {/* TILE ERROR FALLBACK BADGE */}
          {tileError && mapMode === 'tiles' && (
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm">
              <AlertCircle size={14} className="text-amber-600 shrink-0" />
              <span>Map tiles offline - vector nodes shown by coordinates</span>
            </div>
          )}

          {/* BACKEND STATUS BADGE */}
          {isBackendOffline && (
            <div className="absolute top-3 left-12 z-[1000] flex items-center gap-1.5 rounded-lg bg-amber-500 text-white px-2.5 py-1 text-xs font-semibold shadow-sm">
              <span>Demo Data Mode (Offline)</span>
            </div>
          )}

          {/* FLOATING COLLAPSIBLE STATUS LEGEND */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-xs rounded-xl border border-slate-200 text-xs shadow-md overflow-hidden transition-all duration-200">
            <div
              className="flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer bg-slate-50 border-b border-slate-100 hover:bg-slate-100"
              onClick={() => setIsLegendOpen(prev => !prev)}
            >
              <span className="font-bold text-slate-800 text-[11px]">Legend (Tamil Nadu)</span>
              {isLegendOpen ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronUp size={13} className="text-slate-500" />}
            </div>
            {isLegendOpen && (
              <div className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626] animate-pulse"></span>
                  <span>Critical Shortage (&lt;3d)</span>
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]"></span>
                  <span>Low Stock (&lt;14d)</span>
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]"></span>
                  <span>Healthy / Surplus</span>
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#64748B]"></span>
                  <span>Stale Data</span>
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700 pt-1 border-t border-slate-100">
                  <span className="h-3 w-3 rounded-xs bg-[#312E81] text-[8px] text-white flex items-center justify-center font-bold">🏛️</span>
                  <span>District Drug Warehouse (DDW)</span>
                </div>
              </div>
            )}
          </div>

          {/* FLOATING "NEEDS ATTENTION" CARD (Top Critical Centres) */}
          {topCriticalCentres.length > 0 && (
            <div className="absolute top-3 right-3 z-[1000] hidden sm:block max-w-[270px] bg-white/95 backdrop-blur-xs rounded-xl border border-red-200 text-xs shadow-md overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-1.5 bg-red-50 border-b border-red-100 cursor-pointer hover:bg-red-100/60"
                onClick={() => setIsAttentionCardOpen(prev => !prev)}
              >
                <div className="flex items-center gap-1.5 font-bold text-red-900 text-[11px]">
                  <AlertTriangle size={13} className="text-red-600" />
                  <span>Needs Attention ({topCriticalCentres.length})</span>
                </div>
                {isAttentionCardOpen ? <ChevronDown size={13} className="text-red-600" /> : <ChevronUp size={13} className="text-red-600" />}
              </div>
              {isAttentionCardOpen && (
                <div className="p-2 space-y-1.5">
                  {topCriticalCentres.map(c => (
                    <div
                      key={c.code || c.id}
                      className="p-1.5 rounded-lg bg-red-50/60 border border-red-100 flex items-center justify-between gap-1.5 hover:bg-red-100/70 transition"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[11px] text-slate-900 truncate">
                          {c.code}: {c.shortName || c.label || c.name}
                        </div>
                        <div className="text-[10px] text-red-700 font-semibold">
                          📍 {c.district} &bull; <b>{c.days} days</b> stock left
                        </div>
                      </div>
                      <button
                        onClick={() => handleJumpToCentre(c)}
                        className="shrink-0 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer"
                        title="Focus centre on map"
                      >
                        Focus
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SIMULATION DISCLAIMER BADGE (Permanent Caption) */}
          <div className="absolute bottom-3 right-3 z-[1000] hidden md:flex items-center gap-1 bg-slate-900/80 backdrop-blur-xs text-white/90 px-3 py-1 rounded-full text-[10px] font-medium shadow-md">
            <span>Simulated demo centres - not real government facilities.</span>
          </div>
        </div>
      ) : (
        /* ACCESSIBLE ALTERNATIVE LIST VIEW */
        <div className="p-4 overflow-y-auto max-h-[540px] divide-y divide-slate-100">
          <div className="pb-3 flex items-center justify-between">
            <h4 className="font-bold text-sm text-slate-800">
              Health Facilities Directory ({filteredCentres.length} Centres across {availableDistricts.length} Districts)
            </h4>
            <span className="text-xs text-slate-500">Accessible tabular view</span>
          </div>

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold">
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Centre Name</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">District</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Stock</th>
                  <th className="py-2 px-3">Days</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCentres.map(c => {
                  const style = getMarkerStyle(c.status);
                  return (
                    <tr key={c.code || c.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-bold font-mono text-slate-900">{c.code}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{c.label || c.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{c.type || c.facility_type || 'PHC'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{c.district || 'District not set'}</td>
                      <td className="py-2.5 px-3">
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontWeight: 700,
                          fontSize: '10px',
                          backgroundColor: style.fillHex,
                          color: style.bg
                        }}>
                          {style.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{c.stock ?? 0} u</td>
                      <td className="py-2.5 px-3 font-bold" style={{ color: style.isRed ? '#DC2626' : '#0F172A' }}>{c.days ?? 0} d</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onInspectInventory && onInspectInventory(c)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => onRequestMedicine && onRequestMedicine(c)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[11px] font-semibold cursor-pointer"
                          >
                            Request
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FOOTER CAPTION & ATTRIBUTION */}
      <div className="px-4 py-2.5 border-t border-slate-100 bg-white rounded-b-2xl flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-1.5">
        <div>
          Showing <b>{filteredCentres.length}</b> health centres across <b>{availableDistricts.length}</b> districts (3-4 centres/district + 38 DDWs) &bull; <i>{drilledDistrict ? `Viewing ${drilledDistrict} District Drilldown` : 'Tamil Nadu State Network'}</i>
        </div>
        <div className="text-[10px] text-slate-400">
          District boundaries &copy; <a href="https://github.com/datameet/maps" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">DataMeet / Survey of India (ODbL / CC-BY)</a> &bull; Tiles &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">OpenStreetMap contributors</a>
        </div>
      </div>
    </div>
  );
}
