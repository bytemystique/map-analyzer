import React, { useState, useEffect, useRef } from 'react';
import { Navigation, Zap, Fuel, X, Loader2, MapPin, ArrowLeft, Route, XCircle } from 'lucide-react';

const NavigationMenu = ({
  isOpen,
  onClose,
  onNavigateToStation,
  isLocating,
  userLocation,
  nearestStation,
  stationType,
  onBack,
}) => {
  const [selectedType, setSelectedType] = useState(null);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const miniMapRef = useRef(null);
  const miniMapInstanceRef = useRef(null);

  // Initialize mini map when showing route
  useEffect(() => {
    if (showRouteMap && userLocation && nearestStation && miniMapRef.current) {
      // Dynamically import Leaflet for client-side rendering
      import('leaflet').then((L) => {
        // Clean up existing map
        if (miniMapInstanceRef.current) {
          miniMapInstanceRef.current.remove();
        }

        // Create mini map
        const map = L.map(miniMapRef.current, {
          zoomControl: true,
          attributionControl: false,
        });

        // Use a lighter dark theme for better visibility
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
        }).addTo(map);

        // Custom user icon - larger and more prominent with pulse animation
        const userIcon = L.divIcon({
          className: 'user-marker-container',
          html: `
            <div style="position: relative;">
              <!-- Pulse ring animation -->
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 60px;
                height: 60px;
                background: rgba(59, 130, 246, 0.3);
                border-radius: 50%;
                animation: pulse-ring 2s ease-out infinite;
              "></div>
              <!-- Main marker -->
              <div style="
                position: relative;
                width: 36px; 
                height: 36px; 
                background: linear-gradient(135deg, #3b82f6, #8b5cf6); 
                border-radius: 50%; 
                border: 4px solid white; 
                box-shadow: 0 4px 20px rgba(59, 130, 246, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
              ">
                <div style="width: 12px; height: 12px; background: white; border-radius: 50%;"></div>
              </div>
              <!-- Label -->
              <div style="
                position: absolute;
                top: 42px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                color: white;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                border: 2px solid white;
              ">📍 YOU</div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        // Custom station icon - larger for visibility
        const stationColor = stationType === 'ev' ? '#10b981' : '#ef4444';
        const stationIcon = L.divIcon({
          className: 'station-marker',
          html: `
            <div style="position: relative;">
              <!-- Main marker -->
              <div style="
                width: 40px; 
                height: 40px; 
                background: linear-gradient(135deg, ${stationColor}, ${stationType === 'ev' ? '#14b8a6' : '#f97316'}); 
                border-radius: 50%; 
                border: 4px solid white; 
                box-shadow: 0 4px 20px ${stationColor}90;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
              ">
                ${stationType === 'ev' ? '⚡' : '⛽'}
              </div>
              <!-- Label -->
              <div style="
                position: absolute;
                top: 46px;
                left: 50%;
                transform: translateX(-50%);
                background: ${stationType === 'ev' ? 'linear-gradient(135deg, #10b981, #14b8a6)' : 'linear-gradient(135deg, #ef4444, #f97316)'};
                color: white;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                border: 2px solid white;
              ">🏁 DESTINATION</div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        // Add markers with higher z-index
        const userMarker = L.marker([userLocation[0], userLocation[1]], { 
          icon: userIcon,
          zIndexOffset: 1000 
        })
          .bindPopup('<strong style="color: #333;">Your Location (Start)</strong>')
          .addTo(map);

        const stationMarker = L.marker([nearestStation.lat, nearestStation.lng], { 
          icon: stationIcon,
          zIndexOffset: 900
        })
          .bindPopup(`
            <div style="color: #333;">
              <strong>${nearestStation.name || (stationType === 'ev' ? 'EV Station' : 'Petrol Station')}</strong>
              <br/><span style="font-size: 12px;">Distance: ${nearestStation.distance.toFixed(2)} km</span>
            </div>
          `)
          .addTo(map);

        // Add white border line for contrast (add first so it's behind)
        const borderLine = L.polyline(
          [[userLocation[0], userLocation[1]], [nearestStation.lat, nearestStation.lng]],
          {
            color: 'white',
            weight: 10,
            opacity: 0.4,
            lineCap: 'round',
          }
        ).addTo(map);

        // Draw route line - more visible (add second so it's on top)
        const routeLine = L.polyline(
          [[userLocation[0], userLocation[1]], [nearestStation.lat, nearestStation.lng]],
          {
            color: stationType === 'ev' ? '#10b981' : '#ef4444',
            weight: 6,
            opacity: 0.9,
            dashArray: '15, 10',
            lineCap: 'round',
          }
        ).addTo(map);

        // Fit bounds to show both markers with more padding
        const bounds = L.latLngBounds([
          [userLocation[0], userLocation[1]],
          [nearestStation.lat, nearestStation.lng],
        ]);
        map.fitBounds(bounds, { padding: [80, 80] });

        miniMapInstanceRef.current = map;
      });
    }

    return () => {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
    };
  }, [showRouteMap, userLocation, nearestStation, stationType]);

  if (!isOpen) return null;

  const handleStationSelect = (type) => {
    setSelectedType(type);
    onNavigateToStation(type);
  };

  const handleBack = () => {
    setSelectedType(null);
    setShowRouteMap(false);
    if (nearestStation) {
      onBack();
    }
  };

  const handleShowRoute = () => {
    setShowRouteMap(true);
  };

  const handleExitRoute = () => {
    setShowRouteMap(false);
  };

  const handleClose = () => {
    setShowRouteMap(false);
    setSelectedType(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`glass rounded-3xl p-6 shadow-2xl border border-white/10 transition-all duration-300 ${
          showRouteMap ? 'w-[600px] max-w-[95vw]' : 'w-[400px] max-w-[90vw]'
        }`}
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {(selectedType || showRouteMap) && (
              <button
                onClick={showRouteMap ? handleExitRoute : handleBack}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              {showRouteMap ? <Route size={24} className="text-white" /> : <Navigation size={24} className="text-white" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {showRouteMap ? 'Route to Station' : 'Find Nearest Station'}
              </h2>
              <p className="text-xs text-gray-500">
                {showRouteMap
                  ? `${nearestStation?.distance?.toFixed(2)} km to destination`
                  : 'Navigate to EV or Petrol station'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Route Map View */}
        {showRouteMap && userLocation && nearestStation && (
          <div className="space-y-4">
            {/* Mini Map Container */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10">
              <div
                ref={miniMapRef}
                className="w-full h-[350px] bg-[#1a1a2e]"
                style={{ zIndex: 1 }}
              />
              
              {/* Exit Route Button Overlay */}
              <button
                onClick={handleExitRoute}
                className="absolute top-3 right-3 z-10 flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium shadow-lg transition-all"
              >
                <XCircle size={16} />
                Exit Route
              </button>

              {/* Route Info Overlay */}
              <div className="absolute bottom-3 left-3 right-3 z-10 glass rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      stationType === 'ev'
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                        : 'bg-gradient-to-br from-red-500 to-rose-500'
                    }`}
                  >
                    {stationType === 'ev' ? <Zap size={20} className="text-white" /> : <Fuel size={20} className="text-white" />}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">
                      {nearestStation.name || (stationType === 'ev' ? 'EV Station' : 'Petrol Station')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {nearestStation.operator || nearestStation.brand || 'Station'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{nearestStation.distance.toFixed(2)} km</p>
                  <p className="text-xs text-gray-400">Distance</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10 transition-all"
              >
                <ArrowLeft size={16} />
                Find Another
              </button>
              <button
                onClick={handleClose}
                className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium shadow-lg transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Selection Content */}
        {!showRouteMap && !selectedType && !isLocating && !nearestStation && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-4">
              Select the type of station you want to find:
            </p>

            <button
              onClick={() => handleStationSelect('ev')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 hover:border-emerald-500/40 hover:from-emerald-500/20 hover:to-teal-500/20 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                <Zap size={24} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-white font-semibold">EV Charging Station</h3>
                <p className="text-xs text-gray-500">Find nearest electric vehicle charger</p>
              </div>
            </button>

            <button
              onClick={() => handleStationSelect('petrol')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-rose-500/10 border border-red-500/20 hover:border-red-500/40 hover:from-red-500/20 hover:to-rose-500/20 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform">
                <Fuel size={24} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-white font-semibold">Petrol Station</h3>
                <p className="text-xs text-gray-500">Find nearest fuel station</p>
              </div>
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLocating && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center animate-pulse">
              <Loader2 size={32} className="text-white animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">Locating you...</p>
              <p className="text-xs text-gray-500 mt-1">
                Finding nearest {stationType === 'ev' ? 'EV charging' : 'petrol'} station
              </p>
            </div>
          </div>
        )}

        {/* Result State - Show before route map */}
        {!showRouteMap && nearestStation && !isLocating && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    stationType === 'ev'
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-br from-red-500 to-rose-500'
                  }`}
                >
                  {stationType === 'ev' ? <Zap size={20} className="text-white" /> : <Fuel size={20} className="text-white" />}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">
                    {nearestStation.name || (stationType === 'ev' ? 'EV Station' : 'Petrol Station')}
                  </h3>
                  {nearestStation.operator && <p className="text-xs text-gray-400">{nearestStation.operator}</p>}
                  {nearestStation.brand && <p className="text-xs text-gray-400">{nearestStation.brand}</p>}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                <MapPin size={14} className="text-gray-500" />
                <span className="text-sm text-gray-400">{nearestStation.distance.toFixed(2)} km away</span>
              </div>
            </div>

            <button
              onClick={handleShowRoute}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all"
            >
              <Route size={18} />
              View Route
            </button>

            <button
              onClick={handleBack}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10 transition-all"
            >
              <ArrowLeft size={16} />
              Find Another Station
            </button>
          </div>
        )}

        {/* Footer */}
        {!isLocating && !showRouteMap && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <button
              onClick={handleClose}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all text-sm"
            >
              Close and Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NavigationMenu;
