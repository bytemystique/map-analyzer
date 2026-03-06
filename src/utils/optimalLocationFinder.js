import L from 'leaflet';

/* ----------------------------------------------------
   FIND OPTIMAL LOCATIONS FOR EV CHARGING STATIONS
   Uses proximal grid cost analysis to find best placements
---------------------------------------------------- */

/**
 * Calculate the outer boundary of a group of cells
 * Returns an array of polyline coordinates representing the perimeter
 * Uses grid-based keys to handle floating point precision
 */
const calculateCellBoundary = (cells, cellSize = 0.0005) => {
    if (!cells || cells.length === 0) return [];
    
    // Use grid indices instead of coordinates for reliable matching
    // Round coordinates to grid positions
    const toGridKey = (lat, lng) => {
        const gridLat = Math.round(lat / cellSize);
        const gridLng = Math.round(lng / cellSize);
        return `${gridLat},${gridLng}`;
    };
    
    // Create a set of grid keys for O(1) lookup
    const cellSet = new Set();
    const cellCoords = new Map(); // Map grid key to actual coords
    
    cells.forEach(cell => {
        const key = toGridKey(cell.lat, cell.lng);
        cellSet.add(key);
        cellCoords.set(key, { lat: cell.lat, lng: cell.lng });
    });
    
    // Helper to check if a cell exists at grid position
    const hasCell = (gridLat, gridLng) => {
        const key = `${gridLat},${gridLng}`;
        return cellSet.has(key);
    };
    
    // Collect all outer edges using grid coordinates
    const edges = [];
    const halfCell = cellSize / 2;
    
    cells.forEach(cell => {
        const gridLat = Math.round(cell.lat / cellSize);
        const gridLng = Math.round(cell.lng / cellSize);
        
        // Use actual cell coords for edge positions
        const lat = cell.lat;
        const lng = cell.lng;
        
        // Cell corners
        const minLat = lat - halfCell;
        const maxLat = lat + halfCell;
        const minLng = lng - halfCell;
        const maxLng = lng + halfCell;
        
        // Check each edge using GRID positions for neighbor check
        // Top edge (only if no cell above)
        if (!hasCell(gridLat + 1, gridLng)) {
            edges.push([[maxLat, minLng], [maxLat, maxLng]]);
        }
        // Bottom edge (only if no cell below)
        if (!hasCell(gridLat - 1, gridLng)) {
            edges.push([[minLat, maxLng], [minLat, minLng]]);
        }
        // Left edge (only if no cell to the left)
        if (!hasCell(gridLat, gridLng - 1)) {
            edges.push([[maxLat, minLng], [minLat, minLng]]);
        }
        // Right edge (only if no cell to the right)
        if (!hasCell(gridLat, gridLng + 1)) {
            edges.push([[minLat, maxLng], [maxLat, maxLng]]);
        }
    });
    
    if (edges.length === 0) return [];
    
    // Round edge points to avoid floating point issues when connecting
    const roundCoord = (val) => Math.round(val * 1000000) / 1000000;
    const pointKey = (p) => `${roundCoord(p[0])},${roundCoord(p[1])}`;
    
    // Build adjacency map for edge connections
    const edgeMap = new Map();
    
    edges.forEach(edge => {
        const startKey = pointKey(edge[0]);
        const endKey = pointKey(edge[1]);
        
        if (!edgeMap.has(startKey)) edgeMap.set(startKey, []);
        if (!edgeMap.has(endKey)) edgeMap.set(endKey, []);
        
        edgeMap.get(startKey).push({ to: edge[1], toKey: endKey });
        edgeMap.get(endKey).push({ to: edge[0], toKey: startKey });
    });
    
    // Trace closed loops
    const paths = [];
    const usedEdges = new Set();
    
    edges.forEach((startEdge) => {
        const edgeKey = `${pointKey(startEdge[0])}-${pointKey(startEdge[1])}`;
        const reverseKey = `${pointKey(startEdge[1])}-${pointKey(startEdge[0])}`;
        
        if (usedEdges.has(edgeKey) || usedEdges.has(reverseKey)) return;
        
        const path = [startEdge[0], startEdge[1]];
        usedEdges.add(edgeKey);
        usedEdges.add(reverseKey);
        
        let currentPoint = startEdge[1];
        let iterations = 0;
        const maxIterations = edges.length * 2;
        
        while (iterations < maxIterations) {
            iterations++;
            const currentKey = pointKey(currentPoint);
            const connections = edgeMap.get(currentKey) || [];
            
            let foundNext = false;
            for (const conn of connections) {
                const connEdgeKey = `${currentKey}-${conn.toKey}`;
                const connReverseKey = `${conn.toKey}-${currentKey}`;
                
                if (!usedEdges.has(connEdgeKey) && !usedEdges.has(connReverseKey)) {
                    usedEdges.add(connEdgeKey);
                    usedEdges.add(connReverseKey);
                    path.push(conn.to);
                    currentPoint = conn.to;
                    foundNext = true;
                    break;
                }
            }
            
            if (!foundNext) break;
            
            // Check if we've closed the loop
            if (pointKey(currentPoint) === pointKey(path[0])) {
                break;
            }
        }
        
        if (path.length > 2) {
            paths.push(path);
        }
    });
    
    console.log(`  Boundary: ${cells.length} cells → ${edges.length} outer edges → ${paths.length} closed path(s)`);
    
    return paths;
};

/**
 * Calculate distance between two points using Haversine formula
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
};

/**
 * Create spatial grid index for faster nearest neighbor searches
 * ONLY indexes cells INSIDE the polygon (excludes buffer cells)
 */
const createSpatialIndex = (cells) => {
    const GRID_SIZE = 0.01; // ~1km grid cells
    const index = new Map();

    // ONLY index cells that are inside the polygon (no buffer cells)
    const cellsInPolygon = cells.filter(c => c.inPolygon);

    cellsInPolygon.forEach(cell => {
        const gridX = Math.floor(cell.centerLat / GRID_SIZE);
        const gridY = Math.floor(cell.centerLng / GRID_SIZE);
        const key = `${gridX},${gridY}`;

        if (!index.has(key)) {
            index.set(key, []);
        }
        index.get(key).push(cell);
    });

    return { index, GRID_SIZE };
};

/**
 * Get cells within radius using spatial index
 * ONLY returns cells inside polygon (no buffer cells)
 */
const getCellsInRadius = (centerCell, radiusMeters, spatialIndex) => {
    const { index, GRID_SIZE } = spatialIndex;
    const radiusDegrees = radiusMeters / 111320; // Approximate conversion
    const gridRadius = Math.ceil(radiusDegrees / GRID_SIZE);

    const centerGridX = Math.floor(centerCell.centerLat / GRID_SIZE);
    const centerGridY = Math.floor(centerCell.centerLng / GRID_SIZE);

    const nearbyCells = [];

    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
        for (let dy = -gridRadius; dy <= gridRadius; dy++) {
            const key = `${centerGridX + dx},${centerGridY + dy}`;
            const cells = index.get(key);
            if (cells) {
                // Double-check cells are in polygon (should already be filtered, but safety check)
                nearbyCells.push(...cells.filter(c => c.inPolygon));
            }
        }
    }

    return nearbyCells;
};

/**
 * Calculate the suitability score for placing a station at a specific location
 * OPTIMIZED VERSION - considers ONLY cells inside polygon
 * Lower score = better location (we minimize cost)
 */
const calculateLocationScore = (candidate, workingCells, alreadyPlacedStations, spatialIndex) => {
    const INFLUENCE_RADIUS = 5000; // 5km influence radius

    // Primary score: the candidate's own cost (lower is better)
    let score = candidate.cost;

    // Penalize locations too close to already placed stations
    for (const station of alreadyPlacedStations) {
        const distanceToPlaced = calculateDistance(
            candidate.centerLat,
            candidate.centerLng,
            station.latitude,
            station.longitude
        );

        if (distanceToPlaced < INFLUENCE_RADIUS) {
            // Add penalty for proximity to existing new stations
            // Closer = higher penalty
            const overlapPenalty = (1 - distanceToPlaced / INFLUENCE_RADIUS) * 1000;
            score += overlapPenalty;
        }
    }

    // REWARD: Consider population density coverage within polygon
    // Get nearby cells INSIDE polygon only using spatial index
    const nearbyCells = getCellsInRadius(candidate, INFLUENCE_RADIUS, spatialIndex);
    const totalDensity = nearbyCells.reduce((sum, cell) => sum + (cell.density || 0), 0);

    // Higher density coverage = lower score (better location)
    // Use logarithmic scaling to avoid over-weighting density
    if (totalDensity > 0) {
        const densityBonus = Math.log(totalDensity + 1) * 10;
        score -= densityBonus; // Subtract to make it better (lower score)
    }

    return score;
};

/**
 * Update costs in the proximal grid based on a newly placed charging station
 * OPTIMIZED VERSION - only updates cells INSIDE polygon
 */
const updateCostsWithNewStation = (workingCells, newStation, spatialIndex) => {
    const INFLUENCE_RADIUS = 5000; // 5km influence radius for new station
    const MAX_COST_REDUCTION = 100; // Maximum cost reduction near the station

    // Use spatial index to only update nearby cells INSIDE POLYGON
    const nearbyCells = spatialIndex ?
        getCellsInRadius(newStation, INFLUENCE_RADIUS, spatialIndex) :
        workingCells.filter(c => c.inPolygon);

    nearbyCells.forEach(cell => {
        // Skip if not in polygon (safety check)
        if (!cell.inPolygon) return;

        const distance = calculateDistance(
            cell.centerLat,
            cell.centerLng,
            newStation.latitude,
            newStation.longitude
        );

        if (distance <= INFLUENCE_RADIUS) {
            // Closer to the new station = higher cost (less favorable for next station)
            // Linear decay: 100% cost increase at station, 0% at 5km
            const distanceRatio = distance / INFLUENCE_RADIUS;
            const costIncrease = MAX_COST_REDUCTION * (1 - distanceRatio);

            // Update the cost
            cell.cost += costIncrease;

            // Update nearest station distance if this station is closer
            if (!cell.nearestStationDistance || distance < cell.nearestStationDistance * 1000) {
                cell.nearestStationDistance = distance / 1000; // Convert to km
            }
        }
    });

    return workingCells;
};

/**
 * Find N optimal locations for EV charging stations
 * OPTIMIZED VERSION with spatial indexing and progress reporting
 * @param {Array} cells - Grid cells with cost calculations
 * @param {number} n - Number of stations to place
 * @param {number} minDistanceKm - Minimum distance between stations in km (default 0.5km)
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<Array>} Array of optimal locations with coordinates and cost info
 */
export const findOptimalLocations = async (cells, n, minDistanceKm = 0.5, onProgress) => {
    // Filter to ONLY cells inside the polygon (exclude buffer cells)
    const cellsInPolygon = cells.filter(c => c.inPolygon);
    const bufferCells = cells.filter(c => !c.inPolygon);

    if (cellsInPolygon.length === 0) {
        console.warn('No cells in polygon for optimal location search');
        return [];
    }

    console.log('\n=== FINDING OPTIMAL CHARGING STATION LOCATIONS ===');
    console.log(`Total cells in polygon: ${cellsInPolygon.length}`);
    console.log(`Buffer cells (excluded from placement): ${bufferCells.length}`);
    console.log(`Requested stations: ${n}`);
    console.log(`Minimum distance between stations: ${minDistanceKm} km`);
    console.log('NOTE: Using optimized spatial indexing for faster computation');
    console.log('NOTE: Selecting locations with LOWEST cost (most favorable)');
    console.log('NOTE: Adding density bonus to prefer high-population areas');
    console.log('NOTE: Each placement updates costs for next iteration');
    console.log('NOTE: All stations will be placed ONLY within the user-defined polygon');
    console.log('NOTE: Buffer cells are COMPLETELY EXCLUDED from consideration\n');

    // Create spatial index for faster lookups (POLYGON CELLS ONLY)
    console.log('Building spatial index (polygon cells only)...');
    const spatialIndex = createSpatialIndex(cellsInPolygon);
    console.log(`✓ Spatial index created with ${cellsInPolygon.length} polygon cells\n`);

    // Create a deep copy of cells for working calculations
    const workingCells = cellsInPolygon.map(cell => ({
        ...cell,
        cost: cell.cost, // Copy current cost
        nearestStationDistance: cell.nearestStationDistance || Infinity,
        density: cell.density || 0,
        adoptionLikelihood: cell.adoptionLikelihood || 0,
        inPolygon: true // Ensure flag is set
    }));

    const optimalLocations = [];
    const minDistanceMeters = minDistanceKm * 1000;

    // Iterative algorithm with progress reporting and optimization
    for (let stationNum = 0; stationNum < n; stationNum++) {
        // Report progress
        if (onProgress) {
            const progress = ((stationNum) / n) * 100;
            onProgress(progress);
        }

        // Allow UI to breathe every few iterations
        if (stationNum % 2 === 0 && stationNum > 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        let bestCandidate = null;
        let bestScore = Infinity; // Lower score is better

        console.log(`\n--- Evaluating candidates for Station ${stationNum + 1} ---`);

        // Sample candidates for large datasets (limit evaluation for performance)
        const MAX_CANDIDATES_TO_EVALUATE = 500;
        const candidateStep = Math.max(1, Math.floor(workingCells.length / MAX_CANDIDATES_TO_EVALUATE));

        // IMPORTANT: Only evaluate cells inside polygon
        const candidates = workingCells
            .filter(c => c.inPolygon)
            .filter((_, idx) => idx % candidateStep === 0);

        console.log(`Evaluating ${candidates.length} candidate locations (sampled from ${workingCells.length} polygon cells)`);

        // Evaluate candidates and find the one with minimum score (lowest cost)
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];

            // Double-check candidate is in polygon
            if (!candidate.inPolygon) continue;

            // Check if candidate is far enough from already selected locations
            let tooClose = false;
            for (const location of optimalLocations) {
                const distance = calculateDistance(
                    candidate.centerLat,
                    candidate.centerLng,
                    location.latitude,
                    location.longitude
                );

                if (distance < minDistanceMeters) {
                    tooClose = true;
                    break;
                }
            }

            if (tooClose) continue; // Skip this candidate

            // Calculate the suitability score (lower = better)
            const score = calculateLocationScore(candidate, workingCells, optimalLocations, spatialIndex);

            // The best candidate has the lowest score
            if (score < bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }

        if (!bestCandidate) {
            console.warn(`Could not find valid location for station ${stationNum + 1} (only placed ${optimalLocations.length})`);
            break;
        }

        // Verify candidate is in polygon
        if (!bestCandidate.inPolygon) {
            console.error(`ERROR: Selected candidate is outside polygon! Skipping.`);
            break;
        }

        // Add this location to our results
        const newLocation = {
            latitude: bestCandidate.centerLat,
            longitude: bestCandidate.centerLng,
            cost: bestCandidate.cost,
            score: bestScore,
            nearestStationDistance: bestCandidate.nearestStationDistance === Infinity ? 0 : bestCandidate.nearestStationDistance,
            density: bestCandidate.density,
            adoptionLikelihood: bestCandidate.adoptionLikelihood,
            stationNumber: stationNum + 1,
            inPolygon: true
        };

        optimalLocations.push(newLocation);

        console.log(`✓ Station ${stationNum + 1}: Placed at (${newLocation.latitude.toFixed(6)}, ${newLocation.longitude.toFixed(6)})`);
        console.log(`  Cell Cost: ${newLocation.cost.toFixed(2)} | Selection Score: ${newLocation.score.toFixed(2)} (lower is better)`);
        console.log(`  Density: ${newLocation.density.toExponential(2)} | Location: INSIDE POLYGON`);

        // Update the working grid costs based on this new station (using spatial index)
        // This ensures the next station considers the impact of this one
        if (stationNum < n - 1) { // Don't update after the last station
            updateCostsWithNewStation(workingCells, newLocation, spatialIndex);
            console.log(`  → Updated proximal grid with new station influence (polygon cells only)`);
        }
    }

    // Final progress update
    if (onProgress) {
        onProgress(100);
    }

    console.log(`\n=== FOUND ${optimalLocations.length} OPTIMAL LOCATIONS ===`);
    console.log('All stations placed INSIDE polygon (buffer cells excluded)');
    console.log('Locations optimized for lowest cost + highest density coverage');
    console.table(optimalLocations.map((loc, idx) => ({
        station: loc.stationNumber,
        latitude: loc.latitude.toFixed(6),
        longitude: loc.longitude.toFixed(6),
        cell_cost: loc.cost.toFixed(2),
        selection_score: loc.score.toFixed(2),
        density: loc.density.toExponential(2)
    })));

    return optimalLocations;
};

/**
 * Color palette for different optimal regions
 * Each region gets a distinct color for clear visual differentiation
 */
const REGION_COLORS = [
    { primary: '#10b981', secondary: '#059669', light: '#d1fae5', name: 'Emerald' },   // #1 - Best
    { primary: '#3b82f6', secondary: '#2563eb', light: '#dbeafe', name: 'Blue' },      // #2
    { primary: '#8b5cf6', secondary: '#7c3aed', light: '#ede9fe', name: 'Violet' },    // #3
    { primary: '#f59e0b', secondary: '#d97706', light: '#fef3c7', name: 'Amber' },     // #4
    { primary: '#ef4444', secondary: '#dc2626', light: '#fee2e2', name: 'Red' },       // #5
    { primary: '#ec4899', secondary: '#db2777', light: '#fce7f3', name: 'Pink' },      // #6
    { primary: '#06b6d4', secondary: '#0891b2', light: '#cffafe', name: 'Cyan' },      // #7
    { primary: '#84cc16', secondary: '#65a30d', light: '#ecfccb', name: 'Lime' },      // #8
    { primary: '#f97316', secondary: '#ea580c', light: '#ffedd5', name: 'Orange' },    // #9
    { primary: '#6366f1', secondary: '#4f46e5', light: '#e0e7ff', name: 'Indigo' },    // #10
];

// Export REGION_COLORS for use in other components
export { REGION_COLORS };

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
const isPointInPolygon = (point, polygon) => {
    if (!polygon || polygon.length < 3) return true;
    
    const [lat, lng] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [yi, xi] = polygon[i];
        const [yj, xj] = polygon[j];
        
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
};

/**
 * Group locations by cost value and assign color indices
 * All regions with the same cost get the same color
 * If costRank is already present (from API), use it for coloring
 */
const groupLocationsByCost = (locations) => {
    // If locations already have costRank from API, use that for colorIndex
    if (locations[0]?.costRank !== undefined) {
        // Get unique costRanks
        const uniqueRanks = [...new Set(locations.map(l => l.costRank))].sort((a, b) => a - b);
        const rankToColorIndex = new Map();
        uniqueRanks.forEach((rank, idx) => {
            rankToColorIndex.set(rank, idx);
        });
        
        return locations.map(loc => ({
            ...loc,
            colorIndex: rankToColorIndex.get(loc.costRank)
        }));
    }
    
    // Fallback: compute costRank from cost values
    const uniqueCosts = [...new Set(locations.map(l => l.cost.toFixed(2)))]
        .map(c => parseFloat(c))
        .sort((a, b) => a - b);
    
    // Create cost to color index mapping
    const costToColorIndex = new Map();
    uniqueCosts.forEach((cost, idx) => {
        costToColorIndex.set(cost.toFixed(2), idx);
    });
    
    // Assign colorIndex and costRank to each location
    return locations.map(loc => ({
        ...loc,
        colorIndex: costToColorIndex.get(loc.cost.toFixed(2)),
        costRank: costToColorIndex.get(loc.cost.toFixed(2)) + 1
    }));
};

/**
 * Zoom map to a specific region with smooth animation
 */
export const zoomToRegion = (map, region, padding = 80) => {
    if (!map || !region) return;

    const isRegionType = region.type === 'region' && region.cells && region.cells.length > 0;

    if (isRegionType) {
        // Calculate bounds from cells
        const lats = region.cells.map(c => c.lat);
        const lngs = region.cells.map(c => c.lng);
        const cellSize = 0.0005;
        
        const bounds = L.latLngBounds(
            [Math.min(...lats) - cellSize, Math.min(...lngs) - cellSize],
            [Math.max(...lats) + cellSize, Math.max(...lngs) + cellSize]
        );

        map.fitBounds(bounds, {
            padding: [padding, padding],
            maxZoom: 16,
            animate: true,
            duration: 0.8
        });
    } else if (region.bounds) {
        const bounds = L.latLngBounds(
            [region.bounds.minLat, region.bounds.minLng],
            [region.bounds.maxLat, region.bounds.maxLng]
        );

        map.fitBounds(bounds, {
            padding: [padding, padding],
            maxZoom: 16,
            animate: true,
            duration: 0.8
        });
    } else if (region.latitude && region.longitude) {
        map.setView([region.latitude, region.longitude], 16, {
            animate: true,
            duration: 0.8
        });
    }
};

/**
 * Plot optimal locations on the map
 * Handles both single-point locations and region-based responses
 * @param {Object} map - Leaflet map instance
 * @param {Array} locations - Array of optimal locations from backend
 * @param {Array} userPolygon - User-drawn polygon coordinates for clipping
 * @param {Object} highlightRegion - Optional region to highlight (others will be dimmed)
 * @returns {Object} Layer group and region data for selection
 */
export const plotOptimalLocations = (map, locations, userPolygon = null, highlightRegion = null, filterRank = null) => {
    if (!locations || locations.length === 0) {
        console.log('No optimal locations to plot');
        return null;
    }

    const layer = L.layerGroup();
    
    // Group locations by cost and assign color indices
    const processedLocations = groupLocationsByCost(locations);

    // Apply rank filter if specified (filterRank is 0-indexed costRank - 1)
    const filteredLocations = filterRank !== null 
        ? processedLocations.filter(loc => loc.costRank === (filterRank + 1))
        : processedLocations;

    // Add CSS styles for animations and marker visibility
    const styleId = 'optimal-region-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes region-pulse {
                0%, 100% { stroke-opacity: 1; }
                50% { stroke-opacity: 0.6; }
            }
            .optimal-region-overlay path {
                animation: region-pulse 2s infinite;
            }
            @keyframes label-glow {
                0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
                50% { box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            }
            .optimal-region-label > div {
                animation: label-glow 2s infinite;
            }
            .region-dimmed {
                opacity: 0.3 !important;
            }
            .region-highlighted {
                opacity: 1 !important;
            }
            /* Ensure divIcon markers are fully visible - no clipping */
            .optimal-location-pointer {
                overflow: visible !important;
                background: transparent !important;
                border: none !important;
            }
            .optimal-location-pointer > div {
                overflow: visible !important;
            }
            /* Pulse animation for the pointer */
            @keyframes pointer-bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }
            .optimal-location-pointer:hover > div {
                animation: pointer-bounce 0.6s ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);
    }

    console.log(`Plotting ${filteredLocations.length} locations (filter: ${filterRank !== null ? `rank ${filterRank + 1}` : 'none'})`);

    filteredLocations.forEach((location, i) => {
        // Use colorIndex based on cost grouping (same cost = same color)
        const colorIndex = location.colorIndex % REGION_COLORS.length;
        const colors = REGION_COLORS[colorIndex];
        
        // Check if this region should be dimmed
        // highlightRegion can be an index (number) or null
        const isDimmed = highlightRegion !== null && highlightRegion !== undefined && i !== highlightRegion;
        const dimOpacity = isDimmed ? 0.15 : 1;
        
        // Check if this is a region response (new format) or point location (old format)
        const isRegion = location.type === 'region' && location.cells && location.cells.length > 0;

        if (isRegion) {
            // Skip rendering this region entirely if it's dimmed (not highlighted)
            if (isDimmed) {
                return; // Don't render non-highlighted regions at all
            }
            
            console.log(`Plotting region #${location.costRank} (sub ${location.subIndex || 0}) with ${location.cellCount || location.cells.length} cells (${colors.name})`);

            // Filter cells to only those inside the user polygon (if provided)
            let validCells = location.cells;
            if (userPolygon && userPolygon.length >= 3) {
                validCells = location.cells.filter(cell => 
                    isPointInPolygon([cell.lat, cell.lng], userPolygon)
                );
                console.log(`  Clipped to polygon: ${validCells.length}/${location.cells.length} cells`);
            }

            if (validCells.length === 0) {
                console.log(`  Skipping region #${location.costRank} - no cells inside polygon`);
                return;
            }

            // Calculate cellSize based on actual cell spacing
            const cellSize = 0.0005; // Approximate cell size in degrees

            // Calculate centroid from valid cells
            const centroidLat = validCells.reduce((sum, c) => sum + c.lat, 0) / validCells.length;
            const centroidLng = validCells.reduce((sum, c) => sum + c.lng, 0) / validCells.length;

            // Rank indicator for the label (use costRank for same-cost grouping)
            const rankEmoji = location.costRank === 1 ? '🥇' : 
                             location.costRank === 2 ? '🥈' : 
                             location.costRank === 3 ? '🥉' : `#${location.costRank}`;

            // ============ DRAW INDIVIDUAL CELL RECTANGLES ============
            // Simple approach: draw each cell as a filled rectangle with thin border
            validCells.forEach(cell => {
                const halfCell = cellSize / 2;
                const cellRect = L.rectangle(
                    [[cell.lat - halfCell, cell.lng - halfCell], 
                     [cell.lat + halfCell, cell.lng + halfCell]],
                    {
                        color: '#000000',      // Black border
                        weight: 1,             // Thin border
                        opacity: 0.8,
                        fill: true,
                        fillColor: colors.primary,
                        fillOpacity: 0.5
                    }
                );
                layer.addLayer(cellRect);
            });
            
            console.log(`  Drew ${validCells.length} cell rectangles`);

            // No marker - using legend instead

        } else {
            // Skip rendering this location entirely if it's dimmed (not highlighted)
            if (isDimmed) {
                return; // Don't render non-highlighted locations at all
            }
            
            // Point location with colors based on cost ranking
            const rankEmoji = location.costRank === 1 ? '🥇' : 
                             location.costRank === 2 ? '🥈' : 
                             location.costRank === 3 ? '🥉' : `#${location.costRank}`;

            const icon = L.divIcon({
                className: 'optimal-location-marker',
                html: `<div style="
                    position: relative;
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <!-- Pulsing ring effect -->
                    <div style="
                        position: absolute;
                        width: 50px;
                        height: 50px;
                        background: rgba(${parseInt(colors.primary.slice(1,3), 16)}, ${parseInt(colors.primary.slice(3,5), 16)}, ${parseInt(colors.primary.slice(5,7), 16)}, 0.3);
                        border: 3px solid ${colors.primary};
                        border-radius: 50%;
                        animation: pulse 2s infinite;
                    "></div>
                    
                    <!-- Main marker body -->
                    <div style="
                        position: relative;
                        width: 30px;
                        height: 30px;
                        background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
                        border: 4px solid white;
                        border-radius: 50%;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 20px rgba(${parseInt(colors.primary.slice(1,3), 16)}, ${parseInt(colors.primary.slice(3,5), 16)}, ${parseInt(colors.primary.slice(5,7), 16)}, 0.6);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 14px;
                        z-index: 1000;
                    ">${location.costRank}</div>
                    
                    <!-- Rank badge on top -->
                    <div style="
                        position: absolute;
                        top: -8px;
                        right: -8px;
                        width: 22px;
                        height: 22px;
                        background: ${colors.secondary};
                        border: 2px solid white;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        z-index: 1001;
                    ">${location.costRank === 1 ? '⭐' : ''}</div>
                </div>
                <style>
                    @keyframes pulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.3); opacity: 0.5; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    .optimal-location-marker { z-index: 10000 !important; }
                </style>`,
                iconSize: [50, 50],
                iconAnchor: [25, 25]
            });

            const divMarker = L.marker([location.latitude, location.longitude], {
                icon,
                zIndexOffset: 10000 + (100 - location.costRank)
            });

            divMarker.bindPopup(
                `<div style="font-family: system-ui; min-width: 240px;">
                    <div style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%); color: white; padding: 12px; margin: -10px -10px 10px -10px; border-radius: 8px 8px 0 0;">
                        <div style="font-size: 18px; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 24px;">${rankEmoji}</span>
                            <span>Optimal Location (Cost: ${location.cost.toFixed(2)})</span>
                        </div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
                            RECOMMENDED CHARGING STATION
                        </div>
                    </div>
                    
                    <div style="padding: 8px 0;">
                        <div style="display: flex; justify-content: space-between; margin: 8px 0; padding: 8px; background: ${colors.light}; border-radius: 6px;">
                            <span style="color: ${colors.secondary}; font-weight: 600;">Cost Score:</span>
                            <strong style="color: ${colors.primary}; font-size: 16px;">${location.cost.toFixed(2)}</strong>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; margin: 6px 0; padding: 6px 0; border-bottom: 1px solid #e5e7eb;">
                            <span style="color: #6b7280;">Nearest Existing Station:</span>
                            <strong style="color: #1f2937;">${location.nearestStationDistance ? location.nearestStationDistance.toFixed(3) : '0.000'} km</strong>
                        </div>
                    </div>
                    
                    <div style="margin-top: 12px; padding: 10px; background: linear-gradient(135deg, ${colors.light} 0%, white 100%); border-radius: 6px; text-align: center; border: 2px solid ${colors.primary};">
                        <span style="font-size: 13px; font-weight: 700; color: ${colors.secondary};">
                            ✓ RANK #${location.costRank} OPTIMAL
                        </span>
                    </div>
                    
                    <div style="margin-top: 8px; padding: 6px; background: #f9fafb; border-radius: 4px; text-align: center;">
                        <div style="font-size: 10px; color: #6b7280; font-weight: 500;">COORDINATES</div>
                        <div style="font-size: 11px; color: #1f2937; font-family: monospace; margin-top: 2px;">
                            ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
                        </div>
                    </div>
                </div>`,
                {
                    maxWidth: 280,
                    className: 'optimal-location-popup'
                }
            );

            layer.addLayer(divMarker);
        }
    });

    // ============ ADD LEGEND TO MAP ============
    // Create legend showing what colors mean
    const legendId = 'optimal-locations-legend';
    
    // Remove existing legend if any
    const existingLegend = document.getElementById(legendId);
    if (existingLegend) {
        existingLegend.remove();
    }
    
    // Build legend items from filtered locations (unique cost ranks)
    const uniqueRanks = new Map();
    filteredLocations.forEach(loc => {
        if (!uniqueRanks.has(loc.costRank)) {
            const colorIndex = loc.colorIndex % REGION_COLORS.length;
            uniqueRanks.set(loc.costRank, {
                costRank: loc.costRank,
                cost: loc.cost,
                colors: REGION_COLORS[colorIndex]
            });
        }
    });
    
    // Sort by cost rank
    const sortedRanks = Array.from(uniqueRanks.values()).sort((a, b) => a.costRank - b.costRank);
    
    // Legend title - indicate if filtered
    const legendTitle = filterRank !== null 
        ? `🔍 Rank ${filterRank + 1} Only`
        : 'Optimal Locations';
    
    // Create legend HTML with dark theme
    const legendHtml = `
        <div id="${legendId}" style="
            position: fixed;
            top: 100px;
            right: 20px;
            background: rgba(22, 22, 29, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            padding: 16px;
            z-index: 10000;
            font-family: system-ui, -apple-system, sans-serif;
            min-width: 200px;
            border: 1px solid rgba(255,255,255,0.08);
        ">
            <div style="
                font-size: 14px;
                font-weight: 700;
                color: #f4f4f5;
                margin-bottom: 12px;
                padding-bottom: 10px;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                <span style="font-size: 16px;">📍</span>
                ${legendTitle}
            </div>
            ${sortedRanks.map(rank => {
                const emoji = rank.costRank === 1 ? '🥇' : 
                             rank.costRank === 2 ? '🥈' : 
                             rank.costRank === 3 ? '🥉' : `#${rank.costRank}`;
                return `
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin: 8px 0;
                        padding: 8px 10px;
                        border-radius: 10px;
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.05);
                        transition: all 0.2s ease;
                    ">
                        <div style="
                            width: 22px;
                            height: 22px;
                            background: linear-gradient(135deg, ${rank.colors.primary}, ${rank.colors.secondary});
                            border: 2px solid rgba(0,0,0,0.3);
                            border-radius: 6px;
                            flex-shrink: 0;
                            box-shadow: 0 4px 12px ${rank.colors.primary}40;
                        "></div>
                        <div style="flex: 1;">
                            <div style="font-size: 12px; font-weight: 600; color: ${rank.colors.primary};">
                                ${emoji} Rank ${rank.costRank}
                            </div>
                            <div style="font-size: 10px; color: #6b7280;">
                                Cost: ${rank.cost.toFixed(2)}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
            <div style="
                margin-top: 12px;
                padding-top: 10px;
                border-top: 1px solid rgba(255,255,255,0.08);
                font-size: 10px;
                color: #6b7280;
                text-align: center;
            ">
                Lower cost = Better location
            </div>
        </div>
    `;
    
    // Add legend to document body
    document.body.insertAdjacentHTML('beforeend', legendHtml);

    layer.addTo(map);
    console.log(`Plotted ${locations.length} optimal ${locations[0]?.type === 'region' ? 'regions' : 'locations'} on map`);
    return layer;
};

// Function to remove legend when clearing locations
export const removeLegend = () => {
    const legend = document.getElementById('optimal-locations-legend');
    if (legend) {
        legend.remove();
    }
};

export default {
    findOptimalLocations,
    plotOptimalLocations,
    groupLocationsByCost,
    zoomToRegion,
    removeLegend,
    REGION_COLORS
};
