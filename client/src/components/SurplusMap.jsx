import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Maximize2, Minimize2, RotateCcw, RefreshCw, AlertCircle, Search,
  Filter, Layers, MapPin, Eye, Send, X, ShieldAlert, CheckCircle2, ChevronDown
} from 'lucide-react';
import { getPlainLanguageExplanation } from '../utils/plainLanguageAlerts';

/**
 * TAMIL NADU ONLY HEALTHCARE SURPLUS & LOGISTICS MAP
 * Bounds: SW [8.0, 76.2], NE [13.6, 80.4]
 * Default Center: [10.9, 78.4], Zoom: 7
 */
const TAMIL_NADU_CENTER = [10.9, 78.4];
const TAMIL_NADU_ZOOM = 7;
const TAMIL_NADU_BOUNDS = [
  [8.0, 76.2],  // South-West (Kanyakumari / Indian Ocean border)
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

export default function SurplusMap({
  centres = [],
  selectedCentreCode,
  selectedMedicine = 'Paracetamol Syrup',
  transferRoutes = [],
  onSelectCentre,
  onInspectInventory,
  onRequestMedicine,
  onSelectRoute,
  onSelectMedicine,
  height = '520px',
  mapMode = 'tiles', // 'tiles' | 'schematic'
  onToggleMapMode,
  isBackendOffline = false
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const wrapperRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(TAMIL_NADU_ZOOM);

  // STEP 5 Filters State
  const [districtFilter, setDistrictFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [medicineFilter, setMedicineFilter] = useState(selectedMedicine);
  const [searchTerm, setSearchTerm] = useState('');

  // Keep local medicine filter synchronized with prop if changed externally
  useEffect(() => {
    if (selectedMedicine && selectedMedicine !== medicineFilter) {
      setMedicineFilter(selectedMedicine);
    }
  }, [selectedMedicine]);

  // Available districts from centres
  const availableDistricts = useMemo(() => {
    const districts = new Set();
    centres.forEach(c => {
      if (c.district) districts.add(c.district);
    });
    return Array.from(districts).sort();
  }, [centres]);

  // Filtered centres list based on STEP 5 requirements
  const filteredCentres = useMemo(() => {
    return centres.filter(centre => {
      // 1. District Filter
      if (districtFilter !== 'all' && centre.district !== districtFilter) {
        return false;
      }
      // 2. Stock Status Filter
      if (statusFilter !== 'all') {
        const s = (centre.status || '').toLowerCase();
        if (statusFilter === 'red' && s !== 'red') return false;
        if (statusFilter === 'amber' && s !== 'amber' && s !== 'yellow') return false;
        if (statusFilter === 'green' && s !== 'green') return false;
        if (statusFilter === 'grey' && s !== 'grey') return false;
      }
      // 3. Search query (matches code, label, name, district, block, or ID)
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
  }, [centres, districtFilter, statusFilter, searchTerm]);

  // Helper to determine marker colors & human labels
  const getMarkerStyle = useCallback((status) => {
    const s = (status || '').toLowerCase();
    if (s === 'red') {
      return { bg: '#DC2626', border: '#991B1B', text: '#FFFFFF', label: 'Critical Shortage (<3d)', isRed: true };
    }
    if (s === 'amber' || s === 'yellow') {
      return { bg: '#F59E0B', border: '#D97706', text: '#FFFFFF', label: 'Low Stock (<14d)', isRed: false };
    }
    if (s === 'green') {
      return { bg: '#16A34A', border: '#15803D', text: '#FFFFFF', label: 'Healthy / Eligible Surplus', isRed: false };
    }
    return { bg: '#64748B', border: '#475569', text: '#FFFFFF', label: 'Stale / Unknown Data', isRed: false };
  }, []);

  // 1. INITIALIZE LEAFLET MAP WITH TAMIL NADU RESTRICTIONS
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

      // Top-left standard zoom controls
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // OpenStreetMap Tiles Layer with attribution
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

      // LayerGroups for markers and transfer routes
      markersLayerRef.current = L.layerGroup().addTo(map);
      routesLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;

      // Track zoom level for clustering calculations
      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
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
      if (map.hasLayer(tileLayer)) {
        map.removeLayer(tileLayer);
      }
    } else {
      if (!map.hasLayer(tileLayer)) {
        tileLayer.addTo(map);
      }
    }
  }, [mapMode]);

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

  // Reset to Whole Tamil Nadu
  const handleResetToTamilNadu = useCallback(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView(TAMIL_NADU_CENTER, TAMIL_NADU_ZOOM, {
      animate: true
    });
  }, []);

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
    setSearchTerm('');
    setMedicineFilter('Paracetamol Syrup');
    if (onSelectMedicine) onSelectMedicine('Paracetamol Syrup');
    handleResetToTamilNadu();
  }, [handleResetToTamilNadu, onSelectMedicine]);

  // 2. RENDER CLUSTERED OR INDIVIDUAL MARKERS (STEP 3 & STEP 4)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // Grouping & Clustering: At low zoom (zoom 7), nearby centres in the same block/town
    // can overlap visually. We cluster them if distance on screen is < 38 pixels.
    const validCentres = filteredCentres.filter(c => c.lat && c.lon);
    const clusters = [];
    const visited = new Set();

    validCentres.forEach((c1, i) => {
      if (visited.has(i)) return;
      const group = [c1];
      visited.add(i);

      if (currentZoom <= 8) {
        const pt1 = map.latLngToLayerPoint([c1.lat, c1.lon]);
        validCentres.forEach((c2, j) => {
          if (i !== j && !visited.has(j)) {
            const pt2 = map.latLngToLayerPoint([c2.lat, c2.lon]);
            const dist = pt1.distanceTo(pt2);
            if (dist < 42) {
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
        // Multi-centre cluster marker
        const avgLat = group.reduce((sum, c) => sum + c.lat, 0) / group.length;
        const avgLon = group.reduce((sum, c) => sum + c.lon, 0) / group.length;
        const hasRed = group.some(c => (c.status || '').toLowerCase() === 'red');
        const hasAmber = group.some(c => ['amber', 'yellow'].includes((c.status || '').toLowerCase()));
        const dominantColor = hasRed ? '#DC2626' : (hasAmber ? '#F59E0B' : '#16A34A');

        const clusterHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${hasRed ? `<div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(220, 38, 38, 0.35); animation: urgent-pulse 1.8s infinite; pointer-events: none;"></div>` : ''}
            <div style="
              width: 38px;
              height: 38px;
              background: ${dominantColor};
              border: 3px solid #FFFFFF;
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
              <span style="font-size: 8px; font-weight: 600; text-transform: uppercase;">PHCs</span>
            </div>
          </div>
        `;

        const clusterIcon = L.divIcon({
          className: 'custom-vrx-cluster-marker',
          html: clusterHtml,
          iconSize: [42, 42],
          iconAnchor: [21, 21]
        });

        const clusterMarker = L.marker([avgLat, avgLon], {
          icon: clusterIcon,
          zIndexOffset: hasRed ? 900 : 400
        }).addTo(markersLayer);

        // Clicking a cluster zooms in to view individual facilities
        clusterMarker.on('click', () => {
          map.setView([avgLat, avgLon], 10, { animate: true });
        });

        const clusterPopupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; min-width: 210px; padding: 2px;">
            <div style="font-weight: 800; font-size: 13px; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
              ${group.length} Clustered Health Facilities
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">
              ${group.map(c => `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px;">
                  <span><b>${c.code}:</b> ${c.label || c.name}</span>
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
        // Individual Centre Marker
        const centre = group[0];
        const isSelected = centre.code === selectedCentreCode;
        const style = getMarkerStyle(centre.status);
        const size = isSelected ? 36 : 30;

        // Pulsing ring for critical shortage markers
        const pulseHtml = style.isRed
          ? `<div style="position: absolute; width: ${size + 16}px; height: ${size + 16}px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: urgent-pulse 1.8s infinite; pointer-events: none;"></div>`
          : '';

        // Halo ring for actively selected centre
        const selectedRing = isSelected
          ? 'border: 3.5px solid #2563EB; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.4);'
          : `border: 2.5px solid #FFFFFF; box-shadow: 0 3px 8px rgba(15, 23, 42, 0.35);`;

        const iconHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
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
              font-size: ${isSelected ? 14 : 11}px;
              font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
              ${selectedRing}
              position: relative;
              z-index: 2;
              cursor: pointer;
            ">
              ${centre.code}
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

        // STEP 4: Comprehensive Healthcare Popup
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
          isStale: centre.status === 'grey'
        });

        const popupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; line-height: 1.45; min-width: 260px; max-width: 290px; color: #0F172A; padding: 2px;">
            <!-- Header -->
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 800; font-size: 14px; color: #0F172A;">
                  ${centre.label || centre.name || `Centre ${centre.code}`}
                </div>
                <div style="font-size: 10px; color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px;">
                  Code: <b>${centre.code}</b> &bull; ID: <code>${centre.id || `phc-${centre.code.toLowerCase()}`}</code>
                </div>
                <div style="font-size: 10px; color: #0284C7; font-weight: 600; margin-top: 1px;">
                  📍 ${centre.district || 'Madurai'} District &bull; ${centre.block || 'Local Block'}
                </div>
              </div>
              <span style="
                padding: 3px 8px;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                background-color: ${style.isRed ? '#FEE2E2' : ['amber', 'yellow'].includes(centre.status) ? '#FEF3C7' : centre.status === 'green' ? '#DCFCE7' : '#F1F5F9'};
                color: ${style.isRed ? '#DC2626' : ['amber', 'yellow'].includes(centre.status) ? '#D97706' : centre.status === 'green' ? '#16A34A' : '#64748B'};
                white-space: nowrap;
              ">
                ${style.label}
              </span>
            </div>

            <!-- Plain-Language Explanation (Requirement B) -->
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
                  ${daysOfCover} <span style="font-size: 10px; font-weight: 500; color: #64748B;">days</span>
                </div>
              </div>
            </div>

            <!-- Medicine Status Breakdown -->
            <div style="font-size: 11px; margin-bottom: 8px;">
              <div style="color: #475569; display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>Selected Medicine:</span> <b style="color: #0F172A;">${medicineFilter}</b>
              </div>
              <div style="color: #475569; display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>Medicine Breakdown:</span>
                <span>
                  <b style="color: #DC2626;">${criticalCount} Crit</b> &bull; 
                  <b style="color: #D97706;">${lowStockCount} Low</b> &bull; 
                  <b style="color: #16A34A;">${Math.max(0, healthyCount)} OK</b>
                </span>
              </div>
              <div style="color: #475569; display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>Near-Expiry Batches (&le;90d):</span>
                <b style="color: ${nearExpiryBatches > 0 ? '#D97706' : '#64748B'};">${nearExpiryBatches} batches</b>
              </div>
              <div style="color: #94A3B8; font-size: 10px; margin-top: 4px;">
                Last stock update: ${updateTime}
              </div>
            </div>

            <!-- Two Action Buttons (STEP 4) -->
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
  }, [
    filteredCentres,
    selectedCentreCode,
    currentZoom,
    medicineFilter,
    getMarkerStyle,
    onSelectCentre,
    onInspectInventory,
    onRequestMedicine
  ]);

  // 3. RENDER TRANSFER ROUTES (STEP 2: 9 KM ROAD DEMO TRANSFER BETWEEN CENTRE B AND A)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routesLayer = routesLayerRef.current;
    if (!map || !routesLayer) return;

    routesLayer.clearLayers();

    const routesToDraw = transferRoutes.length > 0
      ? transferRoutes
      : [
          {
            id: 'TRF-VRX-101',
            from: 'Centre B (Othakadai Upgraded PHC)',
            fromCode: 'B',
            to: 'Centre A (Melur PHC)',
            toCode: 'A',
            medicine: medicineFilter || 'Paracetamol Syrup',
            qty: 40,
            status: 'Requested',
            distance: 9.0,
            duration: 18
          }
        ];

    routesToDraw.forEach(route => {
      const fromCentre = centres.find(c => c.code === route.fromCode || (c.label && c.label.includes(route.from)));
      const toCentre = centres.find(c => c.code === route.toCode || (c.label && c.label.includes(route.to)));

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
          <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 11px; line-height: 1.45; min-width: 200px; color: #0F172A; padding: 2px;">
            <div style="font-weight: 800; font-size: 12px; color: #2563EB; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
              ${route.id || 'Active Transfer Route'}
            </div>
            <div><b>Donor (Surplus):</b> ${fromCentre.label || `Centre ${fromCentre.code}`}</div>
            <div><b>Receiver (Deficit):</b> ${toCentre.label || `Centre ${toCentre.code}`}</div>
            <div><b>Medicine:</b> ${route.medicine || medicineFilter} (${route.qty || 40} units)</div>
            <div><b>Status:</b> <span style="color: #2563EB; font-weight: 700;">${route.status || 'Active'}</span></div>
            <div style="font-size: 10px; color: #64748B; margin-top: 4px; background: #F1F5F9; padding: 3px 6px; border-radius: 4px;">
              🛣️ Road Distance: ~${route.distance || 9.0} km &bull; ~${route.duration || 18} min
            </div>
          </div>
        `;

        polyline.bindPopup(routePopup);

        if (onSelectRoute) {
          polyline.on('click', () => onSelectRoute(route));
        }
      }
    });
  }, [transferRoutes, centres, medicineFilter, onSelectRoute]);

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full rounded-2xl border border-slate-200 bg-white shadow-soft transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[9999] rounded-none p-4 bg-slate-900/40 backdrop-blur-sm' : ''
      }`}
    >
      {/* STEP 5: COMPACT FILTERS HEADER BAR */}
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 rounded-t-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* District Filter */}
          <div className="relative">
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">📍 All Districts ({availableDistricts.length})</option>
              {availableDistricts.map(d => (
                <option key={d} value={d}>{d} District</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
          <div className="relative flex-1 min-w-[150px] max-w-[240px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search centre, ID, code..."
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
          {(districtFilter !== 'all' || statusFilter !== 'all' || searchTerm || medicineFilter !== 'Paracetamol Syrup') && (
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

        {/* CONTROLS (Fit, Reset, Fullscreen, Schematic) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleFitAllCentres}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title="Fit view to all matching centres"
          >
            <Maximize2 size={13} className="text-slate-500" />
            <span className="hidden sm:inline">Fit Centres</span>
          </button>

          <button
            onClick={handleResetToTamilNadu}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title="Reset map view to entire Tamil Nadu state"
          >
            <RotateCcw size={13} className="text-slate-500" />
            <span className="hidden sm:inline">Reset TN</span>
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

          <button
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* MAP CANVAS CONTAINER */}
      <div className="relative w-full overflow-hidden" style={{ height: isFullscreen ? 'calc(100vh - 120px)' : height }}>
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
              <span>Loading Tamil Nadu Health Network Map...</span>
            </div>
          </div>
        )}

        {/* EMPTY STATE (STEP 3) */}
        {!isLoading && filteredCentres.length === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/85 backdrop-blur-2xs p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2">
              <MapPin size={20} />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No centres match selected filters</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-3">
              No health centres matched the current filter criteria for district, stock status, or keyword.
            </p>
            <button
              onClick={handleResetFilters}
              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* TILE ERROR / OFFLINE FALLBACK BADGE (STEP 1) */}
        {tileError && mapMode === 'tiles' && (
          <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm">
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
            <span>Map tiles offline - nodes shown by coordinates</span>
          </div>
        )}

        {/* BACKEND STATUS BADGE (STEP 6) */}
        {isBackendOffline && (
          <div className="absolute top-3 left-12 z-[1000] flex items-center gap-1.5 rounded-lg bg-amber-500 text-white px-2.5 py-1 text-xs font-semibold shadow-sm">
            <span>Demo Data Mode (Offline)</span>
          </div>
        )}

        {/* FLOATING STATUS LEGEND (STEP 3) */}
        <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap items-center gap-3 bg-white/95 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-slate-200 text-xs shadow-md">
          <span className="font-bold text-slate-800 text-[11px]">Legend:</span>
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626] animate-pulse"></span>
            <span>Critical (&lt;3d)</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]"></span>
            <span>Low Stock (&lt;14d)</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]"></span>
            <span>Healthy / Surplus</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-[#64748B]"></span>
            <span>Stale Data</span>
          </div>
        </div>

        {/* SIMULATION DISCLAIMER BADGE (STEP 2) */}
        <div className="absolute bottom-3 right-3 z-[1000] hidden md:flex items-center gap-1 bg-slate-900/80 backdrop-blur-xs text-white/90 px-3 py-1 rounded-full text-[10px] font-medium shadow-md">
          <span>Simulated demo centres - not real government facilities.</span>
        </div>
      </div>

      {/* FOOTER CAPTION */}
      <div className="px-4 py-2 border-t border-slate-100 bg-white rounded-b-2xl flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-1">
        <div>
          Showing <b>{filteredCentres.length}</b> of <b>{centres.length}</b> health centres across Tamil Nadu (Madurai, Dindigul, Theni, Sivaganga, Virudhunagar)
        </div>
        <div className="text-[10px] text-slate-400">
          Tiles &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">OpenStreetMap contributors</a>
        </div>
      </div>
    </div>
  );
}
