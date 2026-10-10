import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, RefreshCw, AlertCircle } from 'lucide-react';

export default function SurplusMap({
  centres = [],
  selectedCentreCode,
  selectedMedicine = 'Paracetamol Syrup',
  transferRoutes = [],
  onSelectCentre,
  onInspectInventory,
  onRequestMedicine,
  onSelectRoute,
  height = '480px',
  mapMode = 'tiles', // 'tiles' | 'schematic'
  onToggleMapMode
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routesLayerRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [tileError, setTileError] = useState(false);

  // Helper to get marker styling based on healthcare stock-risk logic
  const getMarkerStyle = useCallback((status, isSelected) => {
    let bg = '#64748B';
    let label = 'Stale Data';

    if (status === 'red') {
      bg = '#DC2626';
      label = 'Critical Shortage (<3d)';
    } else if (status === 'amber' || status === 'yellow') {
      bg = '#F59E0B';
      label = 'Low Stock (<14d)';
    } else if (status === 'green') {
      bg = '#16A34A';
      label = 'Transferable Surplus';
    } else {
      bg = '#64748B';
      label = 'Stale Data';
    }

    return { bg, label };
  }, []);

  // 1. Initialize Leaflet Map Instance ONCE
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // React 18 StrictMode fix: clear stale _leaflet_id if present
    if (mapContainerRef.current._leaflet_id) {
      mapContainerRef.current._leaflet_id = null;
    }

    // Default centroid (falls back cleanly if centres are loading)
    const initialCenter = centres.length > 0 && centres[0].lat
      ? [centres[0].lat, centres[0].lon]
      : [25.4358, 81.8463];

    try {
      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 11,
        zoomControl: false,
        scrollWheelZoom: true
      });

      // Standard top-left zoom controls (matching screenshot)
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // OpenStreetMap Tiles Layer (OpenStreetMap with attribution)
      const osmTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        timeout: 8000
      });

      osmTiles.on('tileerror', () => {
        setTileError(true);
      });

      osmTiles.addTo(map);
      tileLayerRef.current = osmTiles;

      // Create LayerGroups for markers and routes
      markersLayerRef.current = L.layerGroup().addTo(map);
      routesLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;

      // Invalidate size after DOM mount
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
        setIsLoading(false);
      }, 120);

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
      console.error('Error initializing map:', err);
      setIsLoading(false);
      setTileError(true);
    }
  }, []);

  // Handle switching between tiles and schematic view
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

  // Fit bounds helper
  const handleFitBounds = useCallback(() => {
    if (!mapInstanceRef.current || !centres || centres.length === 0) return;
    const validCoords = centres
      .filter((c) => c.lat && c.lon)
      .map((c) => [c.lat, c.lon]);

    if (validCoords.length > 0) {
      mapInstanceRef.current.fitBounds(validCoords, {
        padding: [45, 45],
        maxZoom: 13,
        animate: true
      });
    }
  }, [centres]);

  // 2. Render Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    const latLngs = [];

    centres.forEach((centre) => {
      if (!centre.lat || !centre.lon) return;

      const isSelected = centre.code === selectedCentreCode;
      const isRed = centre.status === 'red';
      const style = getMarkerStyle(centre.status, isSelected);
      const size = isSelected ? 36 : 30;

      // Pulsing ring for critical shortage markers
      const pulseHtml = isRed
        ? `<div style="position: absolute; width: ${size + 14}px; height: ${size + 14}px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: urgent-pulse 1.8s infinite; pointer-events: none;"></div>`
        : '';

      // Selected halo ring (matching marker H in screenshot)
      const selectedRing = isSelected
        ? 'border: 3.5px solid #2563EB; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.35);'
        : 'border: 2.5px solid #FFFFFF; box-shadow: 0 3px 8px rgba(15, 23, 42, 0.3);';

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
            font-size: ${isSelected ? 13 : 11}px;
            font-family: inherit;
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
        className: 'custom-velocityrx-marker',
        html: iconHtml,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const marker = L.marker([centre.lat, centre.lon], {
        icon: customIcon,
        zIndexOffset: isSelected ? 1200 : (isRed ? 600 : 200)
      }).addTo(markersLayer);

      // Popup Content (STEP 4 Requirements)
      const criticalCount = centre.criticalCount ?? (isRed ? 2 : 0);
      const lowStockCount = centre.lowStockCount ?? (centre.status === 'amber' ? 3 : 1);
      const totalStock = centre.stock ?? 0;
      const daysOfCover = centre.days ?? 0;
      const medicinesCount = centre.medicinesCount ?? 48;
      const updateTime = centre.lastUpdated || '10 mins ago';

      const popupHtml = `
        <div style="font-family: 'Inter', system-ui, sans-serif; font-size: 12px; line-height: 1.45; min-width: 250px; max-width: 280px; color: #0F172A; padding: 2px;">
          <!-- Header -->
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 800; font-size: 14px; color: #0F172A;">${centre.label || `Centre ${centre.code}`}</div>
              <div style="font-size: 10px; color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px;">
                ${centre.type || 'Primary Health Centre (PHC)'} &bull; Code: <b>${centre.code}</b>
              </div>
            </div>
            <span style="
              padding: 2px 7px;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              background-color: ${isRed ? '#FEE2E2' : centre.status === 'amber' || centre.status === 'yellow' ? '#FEF3C7' : centre.status === 'green' ? '#DCFCE7' : '#F1F5F9'};
              color: ${isRed ? '#DC2626' : centre.status === 'amber' || centre.status === 'yellow' ? '#D97706' : centre.status === 'green' ? '#16A34A' : '#64748B'};
              white-space: nowrap;
            ">
              ${style.label}
            </span>
          </div>

          <!-- Stock & Days Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background-color: #F8FAFC; padding: 7px; border-radius: 8px; margin-bottom: 8px; border: 1px solid #E2E8F0;">
            <div>
              <div style="color: #64748B; font-size: 10px; font-weight: 500;">Usable Stock:</div>
              <div style="font-weight: 800; font-size: 13px; color: #0F172A;">${totalStock} <span style="font-size: 10px; font-weight: 500; color: #64748B;">units</span></div>
            </div>
            <div>
              <div style="color: #64748B; font-size: 10px; font-weight: 500;">Days of Cover:</div>
              <div style="font-weight: 800; font-size: 13px; color: ${isRed ? '#DC2626' : '#0F172A'};">
                ${daysOfCover} <span style="font-size: 10px; font-weight: 500; color: #64748B;">days</span>
              </div>
            </div>
          </div>

          <!-- Inventory Details -->
          <div style="font-size: 11px; margin-bottom: 8px; space-y: 2px;">
            <div style="color: #475569; display: flex; justify-content: space-between;">
              <span>Selected Medicine:</span> <b style="color: #0F172A;">${selectedMedicine}</b>
            </div>
            <div style="color: #475569; display: flex; justify-content: space-between;">
              <span>Medicines Tracked:</span> <b>${medicinesCount} catalog items</b>
            </div>
            <div style="color: #475569; display: flex; justify-content: space-between;">
              <span>Risk Counts:</span>
              <span>
                <span style="color: #DC2626; font-weight: 700;">${criticalCount} Critical</span> &bull; 
                <span style="color: #D97706; font-weight: 700;">${lowStockCount} Low</span>
              </span>
            </div>
            <div style="color: #94A3B8; font-size: 10px; margin-top: 3px;">
              Updated: ${updateTime}
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; gap: 6px; padding-top: 6px; border-top: 1px solid #E2E8F0;">
            <button id="inspect-btn-${centre.code}" style="
              flex: 1;
              background-color: #F1F5F9;
              color: #1E293B;
              border: 1px solid #CBD5E1;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">Inspect Inventory</button>
            <button id="request-btn-${centre.code}" style="
              flex: 1;
              background-color: #2563EB;
              color: #FFFFFF;
              border: none;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">Request Medicine</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        autoPan: true,
        autoPanPadding: [25, 25],
        closeButton: true
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

      latLngs.push([centre.lat, centre.lon]);
    });

    // Auto-fit bounds on initial mount
    if (latLngs.length > 1 && !selectedCentreCode) {
      map.fitBounds(latLngs, { padding: [40, 40] });
    }
  }, [centres, selectedCentreCode, selectedMedicine, getMarkerStyle, onSelectCentre, onInspectInventory, onRequestMedicine]);

  // 3. Render Transfer Routes (STEP 5)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routesLayer = routesLayerRef.current;
    if (!map || !routesLayer) return;

    routesLayer.clearLayers();

    // Default primary route from Centre B to Centre A (or dynamic routes)
    const routesToDraw = transferRoutes.length > 0
      ? transferRoutes
      : [
          {
            id: 'TRF-VRX-101',
            from: 'Centre B (Kelambakkam)',
            fromCode: 'B',
            to: 'Centre A (Thiruporur)',
            toCode: 'A',
            medicine: 'Paracetamol Syrup',
            qty: 40,
            status: 'Requested',
            distance: 9.0,
            duration: 22
          }
        ];

    routesToDraw.forEach((route) => {
      const fromCentre = centres.find((c) => c.code === route.fromCode || (c.label && c.label.includes(route.from)));
      const toCentre = centres.find((c) => c.code === route.toCode || (c.label && c.label.includes(route.to)));

      if (fromCentre && toCentre && fromCentre.lat && toCentre.lat) {
        // Dashed blue route line (matching screenshot)
        const polyline = L.polyline(
          [[fromCentre.lat, fromCentre.lon], [toCentre.lat, toCentre.lon]],
          {
            color: '#2563EB',
            weight: 3.5,
            dashArray: '6, 6',
            opacity: 0.9
          }
        ).addTo(routesLayer);

        const routePopup = `
          <div style="font-family: 'Inter', system-ui, sans-serif; font-size: 11px; line-height: 1.45; min-width: 190px; color: #0F172A; padding: 2px;">
            <div style="font-weight: 800; font-size: 12px; color: #2563EB; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
              ${route.id || 'Active Transfer Route'}
            </div>
            <div><b>Donor:</b> ${fromCentre.label || `Centre ${fromCentre.code}`}</div>
            <div><b>Receiver:</b> ${toCentre.label || `Centre ${toCentre.code}`}</div>
            <div><b>Medicine:</b> ${route.medicine || selectedMedicine} (${route.qty || 40} bottles)</div>
            <div><b>Status:</b> <span style="color: #2563EB; font-weight: 700;">${route.status || 'Active'}</span></div>
            <div style="font-size: 10px; color: #64748B; margin-top: 4px;">
              Road Distance: ~${route.distance || 9} km &bull; ~${route.duration || 22} min
            </div>
          </div>
        `;

        polyline.bindPopup(routePopup);

        if (onSelectRoute) {
          polyline.on('click', () => onSelectRoute(route));
        }
      }
    });
  }, [transferRoutes, centres, selectedMedicine, onSelectRoute]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
      {/* Map Canvas with Schematic Fallback Background Pattern */}
      <div
        className={`w-full transition-opacity duration-300 ${
          mapMode === 'schematic' ? 'bg-slate-100' : 'bg-slate-50'
        }`}
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1.2px, transparent 1.2px)',
          backgroundSize: '20px 20px'
        }}
      >
        <div ref={mapContainerRef} style={{ height, width: '100%' }} />
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/75 backdrop-blur-2xs">
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-md border border-slate-200">
            <RefreshCw size={14} className="animate-spin text-blue-600" />
            Loading Health Centre Map...
          </div>
        </div>
      )}

      {/* Tile Error / Offline Notification */}
      {tileError && mapMode === 'tiles' && (
        <div className="absolute top-3 right-14 z-[1000] flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-800 shadow-sm">
          <AlertCircle size={13} className="text-amber-600 shrink-0" />
          <span>Map tiles offline - nodes shown by coordinates</span>
        </div>
      )}

      {/* Fit All Centres Button (Top-Right) */}
      <button
        onClick={handleFitBounds}
        title="Fit all centres"
        className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition cursor-pointer"
      >
        <Maximize2 size={13} className="text-slate-600" />
        <span className="hidden sm:inline">Fit all centres</span>
      </button>

      {/* Status Legend Floating Bar (Matching Screenshot Exact Design) */}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap items-center gap-3 bg-white/95 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-slate-200 text-xs shadow-md">
        <span className="font-bold text-slate-800 text-[11px]">Status:</span>
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]"></span>
          <span>Critical Shortage (&lt;3d)</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]"></span>
          <span>Low Stock (&lt;14d)</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]"></span>
          <span>Transferable Surplus</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full bg-[#64748B]"></span>
          <span>Stale Data</span>
        </div>
      </div>
    </div>
  );
}
