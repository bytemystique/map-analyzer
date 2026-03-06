import L from 'leaflet';

/* ----------------------------------------------------
   ADOPTION LIKELIHOOD COST LAYER
   Calculates cost based on EV adoption likelihood in the area
   Higher adoption likelihood = More open to EV = Lower cost (more favorable)
---------------------------------------------------- */

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

/* ----------------------------------------------------
   EXPAND BOUNDS TO INCLUDE SURROUNDING AREA
   Polygon is for visualization, but costs are affected by surroundings
---------------------------------------------------- */
const expandBounds = (bounds, bufferKm = 5) => {
    // Calculate buffer in degrees (approximate)
    // 1 degree latitude ≈ 111 km
    const bufferDegrees = bufferKm / 111;

    const lats = bounds.map(coord => coord[0]);
    const lngs = bounds.map(coord => coord[1]);

    const minLat = Math.min(...lats) - bufferDegrees;
    const maxLat = Math.max(...lats) + bufferDegrees;
    const minLng = Math.min(...lngs) - bufferDegrees;
    const maxLng = Math.max(...lngs) + bufferDegrees;

    // Return expanded rectangular bounds
    return [
        [minLat, minLng],
        [minLat, maxLng],
        [maxLat, maxLng],
        [maxLat, minLng]
    ];
};

/* ----------------------------------------------------
   FETCH ADOPTION LIKELIHOOD DATA FROM DATABASE
   Fetches from expanded area (polygon + buffer) to account for surroundings
---------------------------------------------------- */
export const fetchAdoptionLikelihoodData = async (bounds, includeBuffer = true) => {
    try {
        // Expand bounds to include surrounding area for cost calculations
        const searchBounds = includeBuffer ? expandBounds(bounds, 5) : bounds;

        const response = await fetch('/api/adoption_likelihood', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bounds: searchBounds })
        });

        if (!response.ok) throw new Error('Failed to fetch adoption likelihood data');

        const { adoptionData } = await response.json();
        console.log(`Fetched ${adoptionData.length} adoption likelihood zones from ${includeBuffer ? 'expanded' : 'polygon'} area`);
        return adoptionData;
    } catch (error) {
        console.error('Error fetching adoption likelihood data:', error);
        return [];
    }
};

/* ----------------------------------------------------
   CALCULATE ADOPTION LIKELIHOOD COST
   Uses radial decay from adoption centers
   Higher adoption likelihood = More favorable (-20 to 0 cost range)
---------------------------------------------------- */
export const calculateAdoptionLikelihoodCost = (cells, adoptionData) => {
    if (!adoptionData || adoptionData.length === 0) {
        console.log('No adoption likelihood data provided for cost calculation');
        return cells;
    }

    // ADOPTION WEIGHT CONSTANT - Maps max adoption score to cost reduction
    // Max adoption score ~80% should give ~-20 cost reduction
    const MAX_COST_REDUCTION = 20;  // Maximum cost bonus for high adoption areas
    const INFLUENCE_RADIUS_KM = 3;  // Fixed 3km influence radius
    const INFLUENCE_RADIUS_M = INFLUENCE_RADIUS_KM * 1000;

    console.log('\n=== APPLYING ADOPTION LIKELIHOOD COST ===');
    console.log(`Processing ${cells.length} cells based on ${adoptionData.length} adoption zones`);
    console.log(`Influence radius: ${INFLUENCE_RADIUS_KM}km, Max cost reduction: ${MAX_COST_REDUCTION}\n`);

    // Display adoption centers
    console.log('=== ADOPTION LIKELIHOOD CENTERS ===');
    console.table(adoptionData.slice(0, 10).map((zone, idx) => ({
        id: idx + 1,
        latitude: zone.latitude.toFixed(4),
        longitude: zone.longitude.toFixed(4),
        population: zone.population.toLocaleString(),
        ev_score: zone.ev_adoption_likelihood_score.toFixed(1),
        income: zone.per_capita_income.toLocaleString()
    })));

    cells.forEach((cell) => {
        let totalWeightedScore = 0;
        let totalInfluenceWeight = 0;

        // Calculate influence from all nearby adoption zones (radial decay)
        adoptionData.forEach(zone => {
            const distance = calculateDistance(
                cell.centerLat,
                cell.centerLng,
                zone.latitude,
                zone.longitude
            );

            if (distance <= INFLUENCE_RADIUS_M) {
                // Radial decay: influence decreases linearly with distance
                const distanceInfluence = 1 - (distance / INFLUENCE_RADIUS_M);

                // Use the ev_adoption_likelihood_score directly (already 0-100 scale)
                const adoptionScore = zone.ev_adoption_likelihood_score;

                totalWeightedScore += adoptionScore * distanceInfluence;
                totalInfluenceWeight += distanceInfluence;
            }
        });

        if (totalInfluenceWeight > 0) {
            // Weighted average of adoption scores (0-100 scale)
            const avgAdoptionScore = totalWeightedScore / totalInfluenceWeight;

            // Store normalized adoption score for reference
            cell.adoptionLikelihood = avgAdoptionScore;

            // Calculate cost: higher adoption = lower cost (more favorable)
            // Score 0-100 maps to cost 0 to -MAX_COST_REDUCTION
            const adoptionCost = -Math.round((avgAdoptionScore / 100) * MAX_COST_REDUCTION);

            cell.cost += adoptionCost;
            cell.adoptionCostAdjustment = adoptionCost;
        } else {
            // No adoption zones nearby - neutral
            cell.adoptionLikelihood = 0;
            cell.adoptionCostAdjustment = 0;
        }
    });

    // Log statistics
    const cellsInPolygon = cells.filter(c => c.inPolygon);
    const cellsWithAdoption = cellsInPolygon.filter(c => c.adoptionLikelihood > 0);
    const avgAdoption = cellsWithAdoption.length > 0
        ? cellsWithAdoption.reduce((sum, c) => sum + c.adoptionLikelihood, 0) / cellsWithAdoption.length
        : 0;
    const maxAdoption = cellsWithAdoption.length > 0
        ? Math.max(...cellsWithAdoption.map(c => c.adoptionLikelihood))
        : 0;
    const minAdoption = cellsWithAdoption.length > 0
        ? Math.min(...cellsWithAdoption.map(c => c.adoptionLikelihood))
        : 0;

    console.log('\n=== ADOPTION LIKELIHOOD COST RESULTS ===');
    console.log(`Cells in polygon: ${cellsInPolygon.length}`);
    console.log(`Cells with adoption data: ${cellsWithAdoption.length}`);
    console.log(`Cells without adoption data: ${cellsInPolygon.length - cellsWithAdoption.length}`);
    console.log(`Adoption score statistics (0-100 scale):`);
    console.log(`  - Min score: ${minAdoption.toFixed(1)}`);
    console.log(`  - Max score: ${maxAdoption.toFixed(1)}`);
    console.log(`  - Average score: ${avgAdoption.toFixed(1)}`);
    console.log('');

    // Display sample of cells with best adoption likelihood
    const sortedByAdoption = cellsInPolygon
        .filter(c => c.adoptionLikelihood > 0)
        .slice()
        .sort((a, b) => b.adoptionLikelihood - a.adoptionLikelihood);
    const sampleSize = Math.min(10, sortedByAdoption.length);

    if (sampleSize > 0) {
        console.log(`=== TOP ${sampleSize} CELLS BY ADOPTION SCORE ===`);
        console.table(sortedByAdoption.slice(0, sampleSize).map((cell, idx) => ({
            rank: idx + 1,
            lat: cell.centerLat.toFixed(4),
            lng: cell.centerLng.toFixed(4),
            adoptionScore: cell.adoptionLikelihood.toFixed(1),
            costAdj: cell.adoptionCostAdjustment,
            totalCost: cell.cost
        })));
    }

    console.log('\n');
    return cells;
};

/* ----------------------------------------------------
   PLOT ADOPTION LIKELIHOOD CENTERS ON MAP
   Visualize adoption likelihood zone centers
---------------------------------------------------- */
export const plotAdoptionCentersOnMap = (map, adoptionData) => {
    if (!adoptionData || adoptionData.length === 0) {
        console.log('No adoption likelihood centers to plot');
        return null;
    }

    const layer = L.layerGroup();

    adoptionData.forEach((zone, i) => {
        // Size based on adoption score (68-80 range typically)
        const radius = 6 + ((zone.ev_adoption_likelihood_score - 60) * 0.3);

        const marker = L.circleMarker([zone.latitude, zone.longitude], {
            radius: Math.max(4, Math.min(12, radius)), // Clamp between 4-12
            color: '#f59e0b', // Amber color for adoption zones
            fillColor: '#fbbf24',
            fillOpacity: 0.8,
            weight: 2
        });

        marker.bindPopup(
            `<strong>Adoption Zone ${i + 1}</strong><br/>` +
            `Population: ${zone.population.toLocaleString()}<br/>` +
            `EV Adoption Score: ${zone.ev_adoption_likelihood_score.toFixed(1)}/100<br/>` +
            `Per Capita Income: ₹${zone.per_capita_income.toLocaleString()}<br/>` +
            `Lat: ${zone.latitude.toFixed(4)}, Lng: ${zone.longitude.toFixed(4)}`
        );

        layer.addLayer(marker);
    });

    layer.addTo(map);
    console.log(`Plotted ${adoptionData.length} adoption likelihood centers on map`);
    return layer;
};

export default {
    fetchAdoptionLikelihoodData,
    calculateAdoptionLikelihoodCost,
    plotAdoptionCentersOnMap
};
