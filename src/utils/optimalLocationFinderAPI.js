/**
 * Frontend API client for calling Python backend
 * Sends grid data to Flask server for optimal location computation
 */

/**
 * Find optimal locations using Python backend API
 * @param {Array} cells - Grid cells with cost data
 * @param {number} n - Number of stations to find
 * @param {number} minDistanceKm - Minimum distance between stations
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Array>} Optimal locations with metadata
 */
export const findOptimalLocationsAPI = async (cells, n, minDistanceKm = 0.5, onProgress) => {
    try {
        console.log('\n=== CALLING PYTHON BACKEND FOR OPTIMAL LOCATIONS ===');
        console.log(`Sending ${cells.length} cells to Python backend...`);

        if (onProgress) onProgress(10);

        // Filter to polygon cells only for efficient transmission
        const polygonCells = cells.filter(c => c.inPolygon);
        console.log(`Polygon cells: ${polygonCells.length}`);
        console.log(`Buffer cells excluded: ${cells.length - polygonCells.length}`);

        if (polygonCells.length === 0) {
            throw new Error('No cells found inside polygon');
        }

        // Prepare request payload with only necessary data
        const payload = {
            cells: polygonCells.map(c => ({
                centerLat: c.centerLat,
                centerLng: c.centerLng,
                cost: c.cost,
                density: c.density || 0,
                inPolygon: c.inPolygon,
                nearestStationDistance: c.nearestStationDistance || 0,
                adoptionLikelihood: c.adoptionLikelihood || 0
            })),
            n: Math.min(n, polygonCells.length),  // Can't place more than available cells
            minDistanceKm: minDistanceKm
        };

        if (onProgress) onProgress(20);

        console.log('Sending request to http://localhost:5000/api/find-optimal-locations');

        const response = await fetch('http://localhost:5000/api/find-optimal-locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (onProgress) onProgress(75);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Backend returned ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (onProgress) onProgress(95);

        // Validate response
        if (!result.locations || !Array.isArray(result.locations)) {
            throw new Error('Invalid response format from backend');
        }

        if (onProgress) onProgress(100);

        // Log results
        console.log(`\n✓ Backend found ${result.locations.length} cost ranks`);
        console.log(`✓ Execution time: ${result.executionTime.toFixed(3)}s`);
        console.log(`✓ Cells processed: ${result.cellsProcessed}`);

        console.log('\n=== OPTIMAL COST RANKS ===');

        // New format: costRanks with subLocations
        const costRanks = result.locations;
        
        console.table(costRanks.map(rank => ({
            rank: rank.costRank,
            cost: rank.cost.toFixed(2),
            subLocations: rank.subLocationCount,
            totalCells: rank.totalCellCount
        })));

        // Flatten for plotting while preserving hierarchy info
        const flatLocations = [];
        costRanks.forEach(rank => {
            rank.subLocations.forEach((subLoc, subIdx) => {
                flatLocations.push({
                    ...subLoc,
                    costRank: rank.costRank,
                    cost: rank.cost,
                    subIndex: subIdx,
                    totalSubLocations: rank.subLocationCount,
                    stationNumber: flatLocations.length + 1, // For backward compatibility
                    type: 'region'
                });
            });
        });

        // Return both the hierarchical and flat structures
        return {
            costRanks: costRanks,
            flatLocations: flatLocations,
            executionTime: result.executionTime,
            cellsProcessed: result.cellsProcessed
        };

    } catch (error) {
        console.error('❌ Error calling optimal location backend API:', error);

        // Provide helpful error messages
        if (error.message.includes('Failed to fetch')) {
            throw new Error(
                'Cannot connect to Python backend. Make sure to:\n' +
                '1. Run backend/setup.bat (first time only)\n' +
                '2. Run backend/start.bat\n' +
                '3. Backend should be running on http://localhost:5000'
            );
        }

        throw error;
    }
};

/**
 * Check if backend is running
 * @returns {Promise<boolean>} True if backend is healthy
 */
export const checkBackendHealth = async () => {
    try {
        const response = await fetch('http://localhost:5000/health');
        return response.ok;
    } catch {
        return false;
    }
};

/**
 * Get backend API documentation
 * @returns {Promise<Object>} API documentation
 */
export const getBackendInfo = async () => {
    try {
        const response = await fetch('http://localhost:5000/');
        return await response.json();
    } catch (error) {
        console.error('Error getting backend info:', error);
        return null;
    }
};

export default {
    findOptimalLocationsAPI,
    checkBackendHealth,
    getBackendInfo
};
