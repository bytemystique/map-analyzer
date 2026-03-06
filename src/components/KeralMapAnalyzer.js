import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Header from './Header';
import MapView from './MapView';
import StatsPanel from './StatsPanel';
import OptimalLocationModal from './OptimalLocationModal';
import RegionSelector from './RegionSelector';
import NavigationMenu from './NavigationMenu';
import {
  generateStats,
  fetchStationsFromDB,
  generateGridCells,
  visualizeGridCells,
  pointInPolygon,
  calculateChargingStationProximityCost,
  plotAllStations
} from '../utils/mapUtils';
import { generateHeatMapLayer, addHeatMapLegend } from '../utils/heatMapLayer';
import { fetchPopulationDensityData, calculatePopulationDensityCost } from '../utils/populationDensityLayer';
import { fetchSubstationsData, calculateSubstationsCost, plotSubstationsOnMap } from '../utils/substationsLayer';
import { fetchAdoptionLikelihoodData, calculateAdoptionLikelihoodCost, plotAdoptionCentersOnMap } from '../utils/adoptionLikelihoodLayer';
import { plotOptimalLocations, groupLocationsByCost, zoomToRegion, removeLegend, REGION_COLORS } from '../utils/optimalLocationFinder';
import { findOptimalLocationsAPI, checkBackendHealth } from '../utils/optimalLocationFinderAPI';
import { fetchAllEVStations, fetchAllPetrolStations } from '../utils/stationsAPI';

const KeralMapAnalyzer = () => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [polygon, setPolygon] = useState(null);
  const [stats, setStats] = useState(null);
  const [currentPath, setCurrentPath] = useState([]);
  const [showCharging, setShowCharging] = useState(false);
  const [showPetrol, setShowPetrol] = useState(false);
  const [chargingLayer, setChargingLayer] = useState(null);
  const [petrolLayer, setPetrolLayer] = useState(null);
  const [showAllEVStations, setShowAllEVStations] = useState(false);
  const [showAllPetrolStations, setShowAllPetrolStations] = useState(false);
  const allEVStationsLayerRef = useRef(null);
  const allPetrolStationsLayerRef = useRef(null);
  const [gridLayer, setGridLayer] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [showDensityLayer, setShowDensityLayer] = useState(false);
  const [showSubstationsLayer, setShowSubstationsLayer] = useState(false);
  const [showAdoptionLayer, setShowAdoptionLayer] = useState(false);
  const [showOptimalModal, setShowOptimalModal] = useState(false);
  const [optimalLocations, setOptimalLocations] = useState(null); // { costRanks, flatLocations }
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState(0);
  const gridLayerRef = useRef(null);
  const heatMapLayerRef = useRef(null);
  const heatMapLegendRef = useRef(null);
  const currentCellsRef = useRef(null);
  const substationsLayerRef = useRef(null);
  const adoptionLayerRef = useRef(null);
  const optimalLocationsLayerRef = useRef(null);

  // Navigation menu state
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [nearestStation, setNearestStation] = useState(null);
  const [stationType, setStationType] = useState(null);
  const navigationMarkerRef = useRef(null);
  const navigationLineRef = useRef(null);

  useEffect(() => {
    const mapInstance = L.map(mapRef.current).setView([10.8505, 76.2711], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapInstance);

    setMap(mapInstance);

    return () => mapInstance.remove();
  }, []);

  const plotMarkersFromDB = async (type) => {
    if (!map || !currentPath || currentPath.length < 3) return;

    // For visualization, only fetch stations within polygon (no buffer)
    const stations = await fetchStationsFromDB(currentPath, type, false);

    if (stations.length === 0) {
      console.warn(`No ${type} stations found in the database for this area`);
      return;
    }

    // Filter stations to only those inside the polygon
    const filteredStations = stations.filter(station =>
      pointInPolygon(station, currentPath)
    );

    const layer = L.layerGroup();

    filteredStations.forEach((station, i) => {
      const marker = L.circleMarker(station, {
        radius: type === 'charging' ? 6 : 5,
        color: type === 'charging' ? '#059669' : '#b91c1c',
        fillColor: type === 'charging' ? '#10b981' : '#ef4444',
        fillOpacity: 0.9
      });

      marker.bindPopup(
        `<strong>${type === 'charging' ? 'Charging' : 'Petrol'} Station</strong><br/>ID: ${type === 'charging' ? 'CH' : 'P'}-${i + 1}<br/>Lat: ${station[0].toFixed(6)}<br/>Lng: ${station[1].toFixed(6)}`
      );

      layer.addLayer(marker);
    });

    layer.addTo(map);

    if (type === 'charging') {
      setChargingLayer(layer);
    } else {
      setPetrolLayer(layer);
    }

    console.log(`Plotted ${filteredStations.length} ${type} stations from database`);
  };

  const startDrawing = () => {
    if (!map) return;
    setDrawing(true);
    setCurrentPath([]);
    if (polygon) {
      map.removeLayer(polygon);
      setPolygon(null);
    }
    setStats(null);
    
    // Hide all EV and petrol station markers when drawing starts
    if (allEVStationsLayerRef.current) {
      allEVStationsLayerRef.current.remove();
      allEVStationsLayerRef.current = null;
    }
    if (allPetrolStationsLayerRef.current) {
      allPetrolStationsLayerRef.current.remove();
      allPetrolStationsLayerRef.current = null;
    }
    setShowAllEVStations(false);
    setShowAllPetrolStations(false);
    
    // Clear navigation markers when drawing starts
    if (navigationMarkerRef.current) {
      navigationMarkerRef.current.remove();
      navigationMarkerRef.current = null;
    }
    if (navigationLineRef.current) {
      navigationLineRef.current.remove();
      navigationLineRef.current = null;
    }
    setIsNavigationOpen(false);
    setNearestStation(null);
    setUserLocation(null);
  };

  const handleMapClick = (e) => {
    if (!drawing || !map) return;
    const latlng = e.latlng;
    const newPath = [...currentPath, [latlng.lat, latlng.lng]];
    setCurrentPath(newPath);

    if (polygon) map.removeLayer(polygon);

    const newPolygon = L.polygon(newPath, {
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.2,
      weight: 3
    }).addTo(map);

    setPolygon(newPolygon);
  };

  const finishDrawing = async () => {
    if (currentPath.length < 3) {
      alert('Please draw at least 3 points to create a polygon');
      return;
    }

    setDrawing(false);

    const generatedStats = generateStats(currentPath);
    setStats(generatedStats);

    // Check area size and warn user
    const area = parseFloat(generatedStats.area);
    if (area > 200) {
      const proceed = window.confirm(
        `Warning: This is a very large area (${area.toFixed(2)} km²).\n\n` +
        `Processing may take some time and use larger grid cells.\n\n` +
        `For best results, consider drawing a smaller area.\n\n` +
        `Continue anyway?`
      );
      if (!proceed) {
        return;
      }
    }

    console.log(`Processing area: ${area.toFixed(2)} km²`);

    let cells = generateGridCells(currentPath);
    console.log('Total grid cells generated:', cells.length);

    // Fetch charging stations from expanded area (polygon + surroundings)
    // Polygon is just for visualization, but cost is affected by nearby stations too
    const chargingStations = await fetchStationsFromDB(currentPath, 'charging', true);

    console.log(`Applying proximity penalties based on ${chargingStations.length} charging stations (including surroundings)`);
    cells = calculateChargingStationProximityCost(cells, chargingStations);

    // Fetch population density data from expanded area and calculate density cost if layer is enabled
    if (showDensityLayer) {
      const densityData = await fetchPopulationDensityData(currentPath, true);
      console.log(`Applying population density cost based on ${densityData.length} density zones (including surroundings)`);
      cells = calculatePopulationDensityCost(cells, densityData, chargingStations);
    }

    // Fetch substations data from expanded area and calculate substations cost if layer is enabled
    if (showSubstationsLayer) {
      const substationsData = await fetchSubstationsData(currentPath, true);
      console.log(`Applying substations cost based on ${substationsData.length} substations (including surroundings)`);
      cells = calculateSubstationsCost(cells, substationsData);

      // Plot substations on map
      if (substationsLayerRef.current) {
        substationsLayerRef.current.remove();
      }
      substationsLayerRef.current = plotSubstationsOnMap(map, substationsData);
    }

    // Fetch adoption likelihood data from expanded area and calculate adoption cost if layer is enabled
    if (showAdoptionLayer) {
      const adoptionData = await fetchAdoptionLikelihoodData(currentPath, true);
      console.log(`Applying adoption likelihood cost based on ${adoptionData.length} adoption zones (including surroundings)`);
      cells = calculateAdoptionLikelihoodCost(cells, adoptionData);

      // Plot adoption centers on map
      if (adoptionLayerRef.current) {
        adoptionLayerRef.current.remove();
      }
      adoptionLayerRef.current = plotAdoptionCentersOnMap(map, adoptionData);
    }

    // Store cells for heat map toggle
    currentCellsRef.current = cells;

    // Don't show grid by default - user can toggle it on
    if (gridLayerRef.current) {
      gridLayerRef.current.remove();
      gridLayerRef.current = null;
    }

    // Only show grid if already toggled on
    if (showGrid) {
      gridLayerRef.current = visualizeGridCells(map, cells);
    }

    // Update heat map if it's currently showing (apply at the end after all layers)
    if (showHeatMap) {
      if (heatMapLayerRef.current) {
        heatMapLayerRef.current.remove();
      }
      heatMapLayerRef.current = generateHeatMapLayer(map, cells);
    }
  };

  const clearPolygon = () => {
    if (polygon && map) {
      map.removeLayer(polygon);
      setPolygon(null);
      setStats(null);
      setCurrentPath([]);
      setDrawing(false);
      if (petrolLayer) { petrolLayer.remove(); setPetrolLayer(null); }
      if (chargingLayer) { chargingLayer.remove(); setChargingLayer(null); }
      if (gridLayer) { gridLayer.remove(); setGridLayer(null); }
      if (gridLayerRef.current) { gridLayerRef.current.remove(); gridLayerRef.current = null; }
      if (heatMapLayerRef.current) { heatMapLayerRef.current.remove(); heatMapLayerRef.current = null; }
      if (heatMapLegendRef.current) { heatMapLegendRef.current.remove(); heatMapLegendRef.current = null; }
      if (substationsLayerRef.current) { substationsLayerRef.current.remove(); substationsLayerRef.current = null; }
      if (adoptionLayerRef.current) { adoptionLayerRef.current.remove(); adoptionLayerRef.current = null; }
      if (optimalLocationsLayerRef.current) { optimalLocationsLayerRef.current.remove(); optimalLocationsLayerRef.current = null; }
      currentCellsRef.current = null;
      setShowPetrol(false);
      setShowCharging(false);
      setShowGrid(false);
      setShowHeatMap(false);
      setShowDensityLayer(false);
      setShowSubstationsLayer(false);
      setShowAdoptionLayer(false);
    }
  };

  /**
   * Reset to initial screen - clears everything and returns to initial map view
   */
  const handleReset = () => {
    // Clear polygon and all layers
    clearPolygon();
    
    // Clear optimal locations
    if (optimalLocationsLayerRef.current) {
      optimalLocationsLayerRef.current.remove();
      optimalLocationsLayerRef.current = null;
    }
    removeLegend();
    setOptimalLocations(null);
    setShowRegionSelector(false);
    setSelectedRegionIndex(0);
    
    // Clear navigation markers
    if (navigationMarkerRef.current) {
      navigationMarkerRef.current.remove();
      navigationMarkerRef.current = null;
    }
    if (navigationLineRef.current) {
      navigationLineRef.current.remove();
      navigationLineRef.current = null;
    }
    
    // Reset map view to Kerala
    if (map) {
      map.setView([10.8505, 76.2711], 8);
    }
  };

  /**
   * Open navigation menu
   */
  const handleOpenNavigation = () => {
    setIsNavigationOpen(true);
    setNearestStation(null);
    setUserLocation(null);
    setStationType(null);
  };

  /**
   * Close navigation menu and clear navigation markers
   */
  const handleCloseNavigation = () => {
    setIsNavigationOpen(false);
    setNearestStation(null);
    setUserLocation(null);
    setStationType(null);
    
    // Clear navigation markers from map
    if (navigationMarkerRef.current) {
      navigationMarkerRef.current.remove();
      navigationMarkerRef.current = null;
    }
    if (navigationLineRef.current) {
      navigationLineRef.current.remove();
      navigationLineRef.current = null;
    }
  };

  /**
   * Calculate distance using Haversine formula
   */
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  /**
   * Navigate to nearest station of the given type
   */
  const handleNavigateToStation = async (type) => {
    setStationType(type);
    setIsLocating(true);
    setNearestStation(null);

    try {
      // Get user's current location
      const position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by your browser'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      setUserLocation([userLat, userLng]);

      // Fetch all stations of the given type
      let stations;
      if (type === 'ev') {
        stations = await fetchAllEVStations();
      } else {
        stations = await fetchAllPetrolStations();
      }

      if (!stations || stations.length === 0) {
        alert(`No ${type === 'ev' ? 'EV charging' : 'petrol'} stations found in database.`);
        setIsLocating(false);
        return;
      }

      // Find the nearest station
      let nearestDist = Infinity;
      let nearest = null;

      stations.forEach(station => {
        const dist = calculateDistance(userLat, userLng, station.lat, station.lng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = { ...station, distance: dist };
        }
      });

      if (nearest) {
        setNearestStation(nearest);

        // Clear old markers
        if (navigationMarkerRef.current) {
          navigationMarkerRef.current.remove();
        }
        if (navigationLineRef.current) {
          navigationLineRef.current.remove();
        }

        // Add markers and line to map
        const userIcon = L.divIcon({
          className: 'user-location-marker',
          html: `<div style="width: 20px; height: 20px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(59, 130, 246, 0.5);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const stationIcon = L.divIcon({
          className: 'station-marker',
          html: `<div style="width: 24px; height: 24px; background: linear-gradient(135deg, ${type === 'ev' ? '#10b981, #14b8a6' : '#ef4444, #f97316'}); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px ${type === 'ev' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}; display: flex; align-items: center; justify-content: center;"><span style="color: white; font-size: 12px;">⚡</span></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const layerGroup = L.layerGroup();

        // User marker
        const userMarker = L.marker([userLat, userLng], { icon: userIcon })
          .bindPopup('<strong>Your Location</strong>');
        layerGroup.addLayer(userMarker);

        // Station marker
        const stationMarker = L.marker([nearest.lat, nearest.lng], { icon: stationIcon })
          .bindPopup(`<strong>${nearest.name || (type === 'ev' ? 'EV Station' : 'Petrol Station')}</strong><br/>Distance: ${nearest.distance.toFixed(2)} km`);
        layerGroup.addLayer(stationMarker);

        // Draw dashed line
        const line = L.polyline(
          [[userLat, userLng], [nearest.lat, nearest.lng]],
          { 
            color: type === 'ev' ? '#10b981' : '#ef4444',
            weight: 3,
            dashArray: '10, 10',
            opacity: 0.8
          }
        );
        layerGroup.addLayer(line);

        layerGroup.addTo(map);
        navigationMarkerRef.current = layerGroup;

        // Fit map to show both markers
        const bounds = L.latLngBounds([
          [userLat, userLng],
          [nearest.lat, nearest.lng]
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }

      setIsLocating(false);
    } catch (error) {
      console.error('Error getting location:', error);
      alert('Could not get your location. Please enable location services and try again.');
      setIsLocating(false);
    }
  };

  /**
   * Go back in navigation menu (clear result)
   */
  const handleNavigationBack = () => {
    setNearestStation(null);
    setStationType(null);
    
    // Clear navigation markers
    if (navigationMarkerRef.current) {
      navigationMarkerRef.current.remove();
      navigationMarkerRef.current = null;
    }
    
    // Reset map view
    if (map) {
      map.setView([10.8505, 76.2711], 8);
    }
  };

  const exportData = () => {
    if (!stats) return;
    const data = JSON.stringify(stats, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'area-analysis.json';
    a.click();
  };

  const handleToggleCharging = async () => {
    const next = !showCharging;
    setShowCharging(next);
    if (!next) {
      if (chargingLayer) { chargingLayer.remove(); setChargingLayer(null); }
    } else {
      await plotMarkersFromDB('charging');
    }
  };

  const handleTogglePetrol = async () => {
    const next = !showPetrol;
    setShowPetrol(next);
    if (!next) {
      if (petrolLayer) { petrolLayer.remove(); setPetrolLayer(null); }
    } else {
      await plotMarkersFromDB('petrol');
    }
  };

  const handleToggleAllEVStations = async () => {
    const next = !showAllEVStations;
    setShowAllEVStations(next);

    if (!next) {
      if (allEVStationsLayerRef.current) {
        allEVStationsLayerRef.current.remove();
        allEVStationsLayerRef.current = null;
      }
    } else {
      try {
        const stations = await fetchAllEVStations();
        if (stations.length === 0) {
          alert('No EV charging stations found in Kerala database.');
          setShowAllEVStations(false);
          return;
        }

        if (allEVStationsLayerRef.current) {
          allEVStationsLayerRef.current.remove();
        }

        allEVStationsLayerRef.current = plotAllStations(map, stations, 'ev');
      } catch (error) {
        console.error('Error loading EV stations:', error);
        alert('Failed to load EV stations. Please make sure the backend is running.');
        setShowAllEVStations(false);
      }
    }
  };

  const handleToggleAllPetrolStations = async () => {
    const next = !showAllPetrolStations;
    setShowAllPetrolStations(next);

    if (!next) {
      if (allPetrolStationsLayerRef.current) {
        allPetrolStationsLayerRef.current.remove();
        allPetrolStationsLayerRef.current = null;
      }
    } else {
      try {
        const stations = await fetchAllPetrolStations();
        if (stations.length === 0) {
          alert('No petrol stations found in Kerala database.');
          setShowAllPetrolStations(false);
          return;
        }

        if (allPetrolStationsLayerRef.current) {
          allPetrolStationsLayerRef.current.remove();
        }

        allPetrolStationsLayerRef.current = plotAllStations(map, stations, 'petrol');
      } catch (error) {
        console.error('Error loading petrol stations:', error);
        alert('Failed to load petrol stations. Please make sure the backend is running.');
        setShowAllPetrolStations(false);
      }
    }
  };

  const handleToggleGrid = () => {
    const next = !showGrid;
    setShowGrid(next);
    if (!next) {
      if (gridLayerRef.current) { gridLayerRef.current.remove(); gridLayerRef.current = null; }
    } else {
      if (currentCellsRef.current) {
        gridLayerRef.current = visualizeGridCells(map, currentCellsRef.current);
      } else if (stats && currentPath.length >= 3) {
        const cells = generateGridCells(currentPath);
        gridLayerRef.current = visualizeGridCells(map, cells);
      }
    }
  };

  const handleToggleDensityLayer = async () => {
    const next = !showDensityLayer;
    setShowDensityLayer(next);

    if (!currentPath || currentPath.length < 3) {
      alert('Please draw and finish a polygon first');
      setShowDensityLayer(false);
      return;
    }

    // Recalculate costs with or without density layer
    let cells = generateGridCells(currentPath);

    // Always apply charging station proximity (fetch from expanded area including surroundings)
    const chargingStations = await fetchStationsFromDB(currentPath, 'charging', true);
    cells = calculateChargingStationProximityCost(cells, chargingStations);

    // Apply density cost if toggled on (fetch from expanded area including surroundings)
    if (next) {
      const densityData = await fetchPopulationDensityData(currentPath, true);
      console.log(`Toggling ON population density layer with ${densityData.length} zones (including surroundings)`);
      cells = calculatePopulationDensityCost(cells, densityData, chargingStations);
    } else {
      console.log('Toggling OFF population density layer');
    }

    // Update stored cells
    currentCellsRef.current = cells;

    // Update heat map if it's currently showing
    if (showHeatMap && heatMapLayerRef.current) {
      heatMapLayerRef.current.remove();
      heatMapLayerRef.current = generateHeatMapLayer(map, cells);
    }

    // Update grid if it's currently showing
    if (showGrid && gridLayerRef.current) {
      gridLayerRef.current.remove();
      gridLayerRef.current = visualizeGridCells(map, cells);
    }
  };

  const handleToggleSubstationsLayer = async () => {
    const next = !showSubstationsLayer;
    setShowSubstationsLayer(next);

    if (!currentPath || currentPath.length < 3) {
      alert('Please draw and finish a polygon first');
      setShowSubstationsLayer(false);
      return;
    }

    // Recalculate costs with or without substations layer
    let cells = generateGridCells(currentPath);

    // Always apply charging station proximity
    const chargingStations = await fetchStationsFromDB(currentPath, 'charging', true);
    cells = calculateChargingStationProximityCost(cells, chargingStations);

    // Apply density cost if it's enabled
    if (showDensityLayer) {
      const densityData = await fetchPopulationDensityData(currentPath, true);
      cells = calculatePopulationDensityCost(cells, densityData, chargingStations);
    }

    // Apply substations cost if toggled on (fetch from expanded area including surroundings)
    if (next) {
      const substationsData = await fetchSubstationsData(currentPath, true);
      console.log(`Toggling ON substations layer with ${substationsData.length} substations (including surroundings)`);
      cells = calculateSubstationsCost(cells, substationsData);

      // Plot substations on map
      if (substationsLayerRef.current) {
        substationsLayerRef.current.remove();
      }
      substationsLayerRef.current = plotSubstationsOnMap(map, substationsData);
    } else {
      console.log('Toggling OFF substations layer');
      // Remove substations markers from map
      if (substationsLayerRef.current) {
        substationsLayerRef.current.remove();
        substationsLayerRef.current = null;
      }
    }

    // Update stored cells
    currentCellsRef.current = cells;

    // Update heat map if it's currently showing
    if (showHeatMap && heatMapLayerRef.current) {
      heatMapLayerRef.current.remove();
      heatMapLayerRef.current = generateHeatMapLayer(map, cells);
    }

    // Update grid if it's currently showing
    if (showGrid && gridLayerRef.current) {
      gridLayerRef.current.remove();
      gridLayerRef.current = visualizeGridCells(map, cells);
    }
  };

  const handleToggleAdoptionLayer = async () => {
    const next = !showAdoptionLayer;
    setShowAdoptionLayer(next);

    if (!currentPath || currentPath.length < 3) {
      alert('Please draw and finish a polygon first');
      setShowAdoptionLayer(false);
      return;
    }

    // Recalculate costs with or without adoption layer
    let cells = generateGridCells(currentPath);

    // Always apply charging station proximity
    const chargingStations = await fetchStationsFromDB(currentPath, 'charging', true);
    cells = calculateChargingStationProximityCost(cells, chargingStations);

    // Apply density cost if it's enabled
    if (showDensityLayer) {
      const densityData = await fetchPopulationDensityData(currentPath, true);
      cells = calculatePopulationDensityCost(cells, densityData, chargingStations);
    }

    // Apply substations cost if it's enabled
    if (showSubstationsLayer) {
      const substationsData = await fetchSubstationsData(currentPath, true);
      cells = calculateSubstationsCost(cells, substationsData);
    }

    // Apply adoption likelihood cost if toggled on (fetch from expanded area including surroundings)
    if (next) {
      const adoptionData = await fetchAdoptionLikelihoodData(currentPath, true);
      console.log(`Toggling ON adoption likelihood layer with ${adoptionData.length} adoption zones (including surroundings)`);
      cells = calculateAdoptionLikelihoodCost(cells, adoptionData);

      // Plot adoption centers on map
      if (adoptionLayerRef.current) {
        adoptionLayerRef.current.remove();
      }
      adoptionLayerRef.current = plotAdoptionCentersOnMap(map, adoptionData);
    } else {
      console.log('Toggling OFF adoption likelihood layer');
      // Remove adoption markers from map
      if (adoptionLayerRef.current) {
        adoptionLayerRef.current.remove();
        adoptionLayerRef.current = null;
      }
    }

    // Update stored cells
    currentCellsRef.current = cells;

    // Update heat map if it's currently showing
    if (showHeatMap && heatMapLayerRef.current) {
      heatMapLayerRef.current.remove();
      heatMapLayerRef.current = generateHeatMapLayer(map, cells);
    }

    // Update grid if it's currently showing
    if (showGrid && gridLayerRef.current) {
      gridLayerRef.current.remove();
      gridLayerRef.current = visualizeGridCells(map, cells);
    }
  };

  const handleFindOptimalLocations = () => {
    setShowOptimalModal(true);
  };

  const handleSubmitOptimalLocations = async (n, onProgress) => {
    if (!currentCellsRef.current) {
      alert('Please draw a polygon first to analyze the area.');
      return;
    }

    if (!map) {
      alert('Map is not initialized yet.');
      return;
    }

    try {
      // Check if backend is running
      const backendHealthy = await checkBackendHealth();
      if (!backendHealthy) {
        throw new Error('Python backend is not running');
      }

      // Call Python backend API for optimal location finding
      const result = await findOptimalLocationsAPI(
        currentCellsRef.current,
        n,
        0.5,
        onProgress
      );

      if (!result.flatLocations || result.flatLocations.length === 0) {
        alert('No valid locations found within the selected area.');
        return;
      }

      if (optimalLocationsLayerRef.current) {
        optimalLocationsLayerRef.current.remove();
      }

      // Plot using flat locations for visualization
      optimalLocationsLayerRef.current = plotOptimalLocations(map, result.flatLocations, currentPath);

      // Store both structures for region selector
      setOptimalLocations(result);
      setShowRegionSelector(true);
      setSelectedRegionIndex(0);

      // Auto-zoom to the MOST optimal region (#1)
      zoomToOptimalRegions(map, result.flatLocations);
    } catch (error) {
      console.error('Error finding optimal locations:', error);

      // Provide helpful error messages
      let errorMessage = 'An error occurred while finding optimal locations.';

      if (error.message.includes('Cannot connect')) {
        errorMessage = error.message;
      } else if (error.message.includes('not running')) {
        errorMessage = 'Python backend is not running.\n\nPlease:\n1. Open terminal\n2. Navigate to "backend" folder\n3. Run "start.bat"';
      }

      alert(errorMessage);
    }
  };

  /**
   * Zoom map to the MOST optimal region (#1 - lowest cost)
   */
  const zoomToOptimalRegions = (map, locations) => {
    if (!locations || locations.length === 0) return;

    const isRegion = locations[0]?.type === 'region';

    // Find the #1 optimal location (lowest costRank = best)
    const bestLocation = locations.reduce((best, loc) =>
      (!best || loc.costRank < best.costRank) ? loc : best
      , null);

    if (!bestLocation) return;

    if (isRegion && bestLocation.cells && bestLocation.cells.length > 0) {
      // Calculate bounds from cells for precise zoom
      const lats = bestLocation.cells.map(c => c.lat);
      const lngs = bestLocation.cells.map(c => c.lng);
      const cellSize = 0.0005;

      const bounds = L.latLngBounds(
        [Math.min(...lats) - cellSize, Math.min(...lngs) - cellSize],
        [Math.max(...lats) + cellSize, Math.max(...lngs) + cellSize]
      );

      map.fitBounds(bounds, {
        padding: [80, 80],
        maxZoom: 16,
        animate: true,
        duration: 1.0
      });
    } else if (bestLocation.latitude && bestLocation.longitude) {
      // Zoom to the best point location
      map.setView([bestLocation.latitude, bestLocation.longitude], 15, {
        animate: true,
        duration: 1.0
      });
    }

    console.log(`✓ Auto-zoomed to optimal region #${bestLocation.costRank}`);
  };

  /**
   * Handle region selection from RegionSelector UI
   */
  const handleRegionSelect = (region, rankIndex, subIndex, cost) => {
    if (!map || !optimalLocations?.flatLocations) return;

    console.log(`Selecting region: rank=${rankIndex + 1}, subIndex=${subIndex}, cost=${cost}`);

    // Find the index of this region in the flat locations array
    // Match by costRank and subIndex for reliable matching
    const regionIndex = optimalLocations.flatLocations.findIndex(loc =>
      loc.costRank === (rankIndex + 1) &&
      loc.subIndex === subIndex
    );

    console.log(`Found region at flatLocations index: ${regionIndex}`);

    if (regionIndex !== -1) {
      setSelectedRegionIndex(regionIndex);

      // Use the actual region from flatLocations for zooming (has accurate coords)
      const actualRegion = optimalLocations.flatLocations[regionIndex];
      zoomToRegion(map, actualRegion);
    } else {
      // Fallback: use the passed region directly
      zoomToRegion(map, region);
    }

    // Re-plot with highlight on selected region
    if (optimalLocationsLayerRef.current) {
      optimalLocationsLayerRef.current.remove();
    }
    optimalLocationsLayerRef.current = plotOptimalLocations(
      map,
      optimalLocations.flatLocations,
      currentPath,
      regionIndex !== -1 ? regionIndex : 0
    );
  };

  /**
   * Hide the region selector (keeps locations on map)
   */
  const handleHideRegionSelector = () => {
    setShowRegionSelector(false);
  };

  /**
   * Show all optimal location markers (no specific selection)
   */
  const handleShowAllRegions = () => {
    if (!map || !optimalLocations?.flatLocations) return;

    setSelectedRegionIndex(null);

    // Re-plot without highlight (shows all markers)
    if (optimalLocationsLayerRef.current) {
      optimalLocationsLayerRef.current.remove();
    }
    optimalLocationsLayerRef.current = plotOptimalLocations(
      map,
      optimalLocations.flatLocations,
      currentPath
      // No highlightRegion = show all
    );
  };

  /**
   * Filter to show only specific rank
   */
  const handleFilterByRank = (rankIndex) => {
    if (!map || !optimalLocations?.flatLocations) return;

    console.log(`Filtering to rank: ${rankIndex !== null ? rankIndex + 1 : 'all'}`);

    setSelectedRegionIndex(null);

    // Re-plot with filter for specific rank
    if (optimalLocationsLayerRef.current) {
      optimalLocationsLayerRef.current.remove();
    }
    optimalLocationsLayerRef.current = plotOptimalLocations(
      map,
      optimalLocations.flatLocations,
      currentPath,
      null, // no highlight
      rankIndex // filter by rank
    );
  };

  /**
   * Clear optimal locations completely
   */
  const handleClearOptimalLocations = () => {
    if (optimalLocationsLayerRef.current) {
      optimalLocationsLayerRef.current.remove();
      optimalLocationsLayerRef.current = null;
    }
    // Remove the legend from the map
    removeLegend();
    setOptimalLocations(null);
    setShowRegionSelector(false);
    setSelectedRegionIndex(0);
  };

  const handleToggleHeatMap = () => {
    const next = !showHeatMap;
    setShowHeatMap(next);

    if (!next) {
      // Hide heat map
      if (heatMapLayerRef.current) {
        heatMapLayerRef.current.remove();
        heatMapLayerRef.current = null;
      }
      if (heatMapLegendRef.current) {
        heatMapLegendRef.current.remove();
        heatMapLegendRef.current = null;
      }
    } else {
      // Show heat map
      if (!currentCellsRef.current) {
        alert('Please draw and finish a polygon first to generate the heat map');
        setShowHeatMap(false);
        return;
      }

      if (heatMapLayerRef.current) {
        heatMapLayerRef.current.remove();
      }
      if (heatMapLegendRef.current) {
        heatMapLegendRef.current.remove();
      }

      heatMapLayerRef.current = generateHeatMapLayer(map, currentCellsRef.current);
      heatMapLegendRef.current = addHeatMapLegend(map);
    }
  };

  useEffect(() => {
    if (map) {
      map.on('click', handleMapClick);
      return () => map.off('click', handleMapClick);
    }
  }, [map, drawing, currentPath]);

  return (
    <div className="h-screen w-full flex flex-col bg-[#0f0f14]">
      <Header
        drawing={drawing}
        onStartDrawing={startDrawing}
        onFinishDrawing={finishDrawing}
        showCharging={showCharging}
        showPetrol={showPetrol}
        onToggleCharging={handleToggleCharging}
        onTogglePetrol={handleTogglePetrol}
        showAllEVStations={showAllEVStations}
        showAllPetrolStations={showAllPetrolStations}
        onToggleAllEVStations={handleToggleAllEVStations}
        onToggleAllPetrolStations={handleToggleAllPetrolStations}
        hasPolygon={!!polygon}
        onClear={clearPolygon}
        onExport={exportData}
        showGrid={showGrid}
        onToggleGrid={handleToggleGrid}
        showHeatMap={showHeatMap}
        onToggleHeatMap={handleToggleHeatMap}
        showDensityLayer={showDensityLayer}
        onToggleDensityLayer={handleToggleDensityLayer}
        showSubstationsLayer={showSubstationsLayer}
        onToggleSubstationsLayer={handleToggleSubstationsLayer}
        showAdoptionLayer={showAdoptionLayer}
        onToggleAdoptionLayer={handleToggleAdoptionLayer}
        onFindOptimalLocations={handleFindOptimalLocations}
        onOpenNavigation={handleOpenNavigation}
        onReset={handleReset}
      />

      {/* Navigation Menu */}
      <NavigationMenu
        isOpen={isNavigationOpen}
        onClose={handleCloseNavigation}
        onNavigateToStation={handleNavigateToStation}
        isLocating={isLocating}
        userLocation={userLocation}
        nearestStation={nearestStation}
        stationType={stationType}
        onBack={handleNavigationBack}
      />

      {/* Main content with top padding for fixed header */}
      <div className="flex-1 flex overflow-hidden pt-16">
        <MapView
          mapRef={mapRef}
          drawing={drawing}
          pointCount={currentPath.length}
          hasPolygon={!!polygon}
        />
        <StatsPanel stats={stats} />
      </div>
      <OptimalLocationModal
        isOpen={showOptimalModal}
        onClose={() => setShowOptimalModal(false)}
        onFindLocations={handleSubmitOptimalLocations}
      />

      {/* Region Selector UI - shows when optimal locations are found and selector is visible */}
      {optimalLocations && showRegionSelector && (
        <RegionSelector
          costRanks={optimalLocations.costRanks}
          selectedIndex={selectedRegionIndex}
          onSelectRegion={handleRegionSelect}
          onShowAll={handleShowAllRegions}
          onClose={handleHideRegionSelector}
          onClear={handleClearOptimalLocations}
          onFilterByRank={handleFilterByRank}
        />
      )}
    </div>
  );
};

export default KeralMapAnalyzer;