"""
Flask API for finding optimal EV charging station locations
Uses spatial indexing and numpy for fast computation
with DIVIDE-AND-CONQUER by heat map color zones (GREEN → YELLOW → RED)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from scipy.spatial import KDTree
import time
import math
from evStationsLoader import get_all_ev_stations
from petrolStationsLoader import get_all_petrol_stations

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# Color zone thresholds based on heat map
# Cost range: -100 (green) → 0 (yellow) → 100 (red)
GREEN_THRESHOLD = -33   # cost <= -33 is green (favorable)
YELLOW_THRESHOLD = 33   # cost <= 33 is yellow (neutral), > 33 is red


class OptimalLocationFinder:
    """
    Find optimal EV charging station locations using DIVIDE-AND-CONQUER
    by heat map color zones: GREEN (best) → YELLOW → RED (worst)
    """

    def __init__(self, cells, n_stations=3, min_distance_km=0.5):
        """
        Initialize finder with grid cells

        Args:
            cells: List of grid cells with keys: centerLat, centerLng, cost, density, inPolygon
            n_stations: Number of optimal regions to find
            min_distance_km: Minimum distance between regions
        """
        # Filter to polygon cells only (for placement)
        self.polygon_cells = [c for c in cells if c.get('inPolygon', False)]
        self.n_stations = n_stations
        self.min_distance_km = min_distance_km
        
        # Partition cells by color zone for divide-and-conquer
        self.green_cells = []
        self.yellow_cells = []
        self.red_cells = []
        
        for cell in self.polygon_cells:
            cost = cell.get('cost', 0)
            if cost <= GREEN_THRESHOLD:
                self.green_cells.append(cell)
            elif cost <= YELLOW_THRESHOLD:
                self.yellow_cells.append(cell)
            else:
                self.red_cells.append(cell)

        if not self.polygon_cells:
            raise ValueError("No cells found inside polygon")

        print(f"✓ Initialized with {len(self.polygon_cells)} cells in polygon")
        print(f"  🟢 GREEN zone (cost ≤ {GREEN_THRESHOLD}): {len(self.green_cells)} cells")
        print(f"  🟡 YELLOW zone ({GREEN_THRESHOLD} < cost ≤ {YELLOW_THRESHOLD}): {len(self.yellow_cells)} cells")
        print(f"  🔴 RED zone (cost > {YELLOW_THRESHOLD}): {len(self.red_cells)} cells")

    def haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance in km using Haversine formula"""
        R = 6371  # Earth radius in km

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)

        a = math.sin(dphi/2)**2 + math.cos(phi1) * \
            math.cos(phi2) * math.sin(dlambda/2)**2
        return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def find_connected_regions(self, cells):
        """
        Split cells into spatially connected groups using OPTIMIZED flood-fill.
        Uses hash-based neighbor lookup for O(n) instead of O(n²).
        
        Args:
            cells: List of cells to group
            
        Returns:
            List of cell groups, where each group is a connected region
        """
        if not cells:
            return []
        
        # Determine grid spacing from actual data
        if len(cells) >= 2:
            sorted_cells = sorted(cells, key=lambda c: (c['centerLat'], c['centerLng']))
            lat_diffs = []
            lng_diffs = []
            
            for i in range(min(10, len(sorted_cells) - 1)):
                lat_diff = abs(sorted_cells[i+1]['centerLat'] - sorted_cells[i]['centerLat'])
                lng_diff = abs(sorted_cells[i+1]['centerLng'] - sorted_cells[i]['centerLng'])
                if lat_diff > 0:
                    lat_diffs.append(lat_diff)
                if lng_diff > 0:
                    lng_diffs.append(lng_diff)
            
            grid_spacing = min(
                np.median(lat_diffs) if lat_diffs else 0.0005,
                np.median(lng_diffs) if lng_diffs else 0.0005
            )
        else:
            grid_spacing = 0.0005
        
        # Use grid-based indexing for O(1) neighbor lookup
        # Round coordinates to grid keys
        precision = int(-math.log10(grid_spacing)) + 1  # Decimal precision
        
        def grid_key(lat, lng):
            """Create a grid key by rounding to grid precision"""
            return (round(lat, precision), round(lng, precision))
        
        # Build cell lookup dictionary
        cell_map = {}
        for cell in cells:
            key = grid_key(cell['centerLat'], cell['centerLng'])
            cell_map[key] = cell
        
        # 8-directional neighbor offsets (includes diagonals)
        neighbor_offsets = [
            (-grid_spacing, 0), (grid_spacing, 0),      # N, S
            (0, -grid_spacing), (0, grid_spacing),      # W, E
            (-grid_spacing, -grid_spacing), (-grid_spacing, grid_spacing),  # NW, NE
            (grid_spacing, -grid_spacing), (grid_spacing, grid_spacing)     # SW, SE
        ]
        
        visited = set()
        regions = []
        
        for cell in cells:
            start_key = grid_key(cell['centerLat'], cell['centerLng'])
            if start_key in visited:
                continue
            
            # Flood-fill using hash-based neighbor lookup
            region = []
            stack = [start_key]
            
            while stack:
                current_key = stack.pop()
                
                if current_key in visited:
                    continue
                
                if current_key not in cell_map:
                    continue
                
                visited.add(current_key)
                region.append(cell_map[current_key])
                
                # Check 8 neighbors using offset calculation
                lat, lng = current_key
                for dlat, dlng in neighbor_offsets:
                    neighbor_key = grid_key(lat + dlat, lng + dlng)
                    if neighbor_key in cell_map and neighbor_key not in visited:
                        stack.append(neighbor_key)
            
            if region:
                regions.append(region)
        
        return regions

    def find_optimal_locations(self):
        """
        Find optimal regions using DIVIDE-AND-CONQUER by color zones
        
        Algorithm:
        1. Start with GREEN zone cells (lowest cost, most favorable)
        2. Process cells by cost rank within the zone
        3. If N ranks found, STOP (don't compute other zones)
        4. If more ranks needed, move to YELLOW zone
        5. If still more needed, move to RED zone
        
        This is much faster because we only process cells in favorable zones
        and skip red zones entirely if green/yellow have enough locations.
        """
        print(f"\n=== DIVIDE-AND-CONQUER: FINDING {self.n_stations} OPTIMAL COST RANKS ===")
        print("Strategy: GREEN zones first → YELLOW if needed → RED only if required\n")

        optimal_ranks = []  # List of cost ranks, each with sub-locations
        used_cell_keys = set()  # Track cells that have been assigned to a rank
        
        # Process zones in order: GREEN → YELLOW → RED
        zones = [
            ('🟢 GREEN', self.green_cells),
            ('🟡 YELLOW', self.yellow_cells),
            ('🔴 RED', self.red_cells)
        ]
        
        for zone_name, zone_cells in zones:
            if len(optimal_ranks) >= self.n_stations:
                print(f"\n✓ Already found {self.n_stations} ranks - SKIPPING {zone_name} zone")
                continue
                
            if not zone_cells:
                print(f"\n⚠ {zone_name} zone is empty - skipping")
                continue
            
            print(f"\n{'='*50}")
            print(f"PROCESSING {zone_name} ZONE ({len(zone_cells)} cells)")
            print(f"{'='*50}")
            
            # Process this zone until we have enough ranks or run out of cells
            zone_available = [c for c in zone_cells if (c['centerLat'], c['centerLng']) not in used_cell_keys]
            
            while zone_available and len(optimal_ranks) < self.n_stations:
                rank_num = len(optimal_ranks)
                
                print(f"\n--- Cost Rank {rank_num + 1}/{self.n_stations} (from {zone_name}) ---")
                print(f"Available cells in zone: {len(zone_available)}")

                # Find minimum cost among available cells in this zone
                min_cost = min(cell['cost'] for cell in zone_available)
                
                # Get ALL cells with this minimum cost
                min_cost_cells = [cell for cell in zone_available if cell['cost'] == min_cost]
                
                print(f"Minimum cost found: {min_cost:.2f}")
                print(f"Cells with this cost: {len(min_cost_cells)}")

                # Mark these cells as used
                for cell in min_cost_cells:
                    used_cell_keys.add((cell['centerLat'], cell['centerLng']))

                # Split into spatially connected regions (sub-locations)
                connected_regions = self.find_connected_regions(min_cost_cells)
                print(f"Connected sub-regions found: {len(connected_regions)}")

                # Create sub-locations for this cost rank
                sub_locations = []
                for i, region_cells in enumerate(connected_regions):
                    # Calculate bounds for this specific connected region
                    lats = [cell['centerLat'] for cell in region_cells]
                    lngs = [cell['centerLng'] for cell in region_cells]
                    
                    sub_location = {
                        'subIndex': i,
                        'type': 'region',
                        'cellCount': len(region_cells),
                        'cells': [
                            {
                                'lat': float(cell['centerLat']),
                                'lng': float(cell['centerLng']),
                                'cost': float(cell['cost'])
                            }
                            for cell in region_cells
                        ],
                        'bounds': {
                            'minLat': float(min(lats)),
                            'maxLat': float(max(lats)),
                            'minLng': float(min(lngs)),
                            'maxLng': float(max(lngs))
                        },
                        'avgDensity': float(np.mean([cell.get('density', 0) for cell in region_cells])),
                        'avgNearestStation': float(np.mean([cell.get('nearestStationDistance', 0) for cell in region_cells])),
                        # Calculate centroid
                        'latitude': float(sum(lats) / len(lats)),
                        'longitude': float(sum(lngs) / len(lngs))
                    }
                    sub_locations.append(sub_location)
                    print(f"  Sub-location {i + 1}: {len(region_cells)} cells")

                # Create the cost rank object
                cost_rank = {
                    'costRank': rank_num + 1,
                    'cost': float(min_cost),
                    'zone': zone_name,
                    'subLocationCount': len(sub_locations),
                    'totalCellCount': len(min_cost_cells),
                    'subLocations': sub_locations
                }
                optimal_ranks.append(cost_rank)
                
                print(f"  ✓ Rank {rank_num + 1} complete - Total cells used: {len(used_cell_keys)}")
                
                # Update available cells for next iteration
                zone_available = [c for c in zone_cells if (c['centerLat'], c['centerLng']) not in used_cell_keys]

        print(f"\n{'='*50}")
        print(f"✓ FOUND {len(optimal_ranks)} COST RANKS")
        total_sub_locs = sum(r['subLocationCount'] for r in optimal_ranks)
        print(f"Total sub-locations: {total_sub_locs}")
        print(f"Total cells in optimal regions: {sum(r['totalCellCount'] for r in optimal_ranks)}")
        
        # Report which zones were used
        zones_used = set(r.get('zone', 'unknown') for r in optimal_ranks)
        print(f"Zones used: {', '.join(zones_used)}")
        
        return optimal_ranks


@app.route('/api/find-optimal-locations', methods=['POST'])
def find_optimal_locations():
    """
    API endpoint to find optimal EV charging station regions

    Identifies regions with the LOWEST cost values (best for EV adoption).
    Returns N cost ranks, each with potentially multiple sub-locations (scattered regions with same cost).

    Request body:
    {
        "cells": [...],       // Grid cells with inPolygon flag
        "n": 5,               // Number of optimal cost RANKS to find (not total locations)
        "minDistanceKm": 0.5  // Minimum distance between sub-locations of different ranks
    }

    Response:
    {
        "locations": [
            {
                "costRank": 1,            // Rank based on cost (1 = best)
                "cost": -7.00,            // Cost value for this rank
                "subLocationCount": 2,    // Number of scattered regions with this cost
                "totalCellCount": 25,     // Total cells across all sub-locations
                "subLocations": [
                    {
                        "subIndex": 0,
                        "type": "region",
                        "cellCount": 15,
                        "cells": [{"lat": 10.774, "lng": 76.301, "cost": -7.00}, ...],
                        "bounds": {"minLat": 10.770, "maxLat": 10.780, "minLng": 76.300, "maxLng": 76.310},
                        "latitude": 10.775,   // Centroid lat
                        "longitude": 76.305,  // Centroid lng
                        "avgDensity": 5000.0,
                        "avgNearestStation": 2.5
                    },
                    ...
                ]
            }
        ],
        "executionTime": 0.123,
        "cellsProcessed": 500
    }
    """
    try:
        data = request.json
        cells = data.get('cells', [])
        n = data.get('n', 3)
        min_distance_km = data.get('minDistanceKm', 0.5)

        if not cells:
            return jsonify({'error': 'No cells provided'}), 400

        if n <= 0:
            return jsonify({'error': 'Number of stations must be > 0'}), 400

        # Measure execution time
        start_time = time.time()

        print(f"\n{'='*60}")
        print(f"New request: Find {n} stations from {len(cells)} cells")
        print(f"{'='*60}")

        # Find optimal locations
        finder = OptimalLocationFinder(cells, n, min_distance_km)
        locations = finder.find_optimal_locations()

        execution_time = time.time() - start_time

        print(f"\n✓ Execution time: {execution_time:.3f}s")
        print(f"✓ Cells processed: {len(finder.polygon_cells)}")

        return jsonify({
            'success': True,
            'locations': locations,
            'executionTime': round(execution_time, 3),
            'cellsProcessed': len(finder.polygon_cells),
            'locationsFound': len(locations)
        })

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/all-ev-stations', methods=['GET'])
def get_ev_stations():
    """
    Get all EV charging stations in Kerala
    
    Returns:
        JSON array of EV station objects with lat, lng, name, status, access
    """
    try:
        stations = get_all_ev_stations()
        return jsonify({
            'success': True,
            'count': len(stations),
            'stations': stations
        })
    except Exception as e:
        print(f"❌ Error fetching EV stations: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/all-petrol-stations', methods=['GET'])
def get_petrol_stations():
    """
    Get all petrol stations in Kerala
    
    Returns:
        JSON array of petrol station objects with lat, lng, name, operator, brand
    """
    try:
        stations = get_all_petrol_stations()
        return jsonify({
            'success': True,
            'count': len(stations),
            'stations': stations
        })
    except Exception as e:
        print(f"❌ Error fetching petrol stations: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'Optimal Location Finder API',
        'version': '1.0'
    })


@app.route('/', methods=['GET'])
def index():
    """API documentation"""
    return jsonify({
        'service': 'EV Charging Station Optimal Region Finder',
        'version': '2.0',
        'endpoints': {
            'POST /api/find-optimal-locations': 'Find optimal regions (lowest cost areas)',
            'GET /health': 'Health check',
            'GET /': 'API documentation'
        },
        'example_request': {
            'cells': [{'centerLat': 10.0, 'centerLng': 76.0, 'cost': -5.0, 'density': 1000, 'inPolygon': True}],
            'n': 3,
            'minDistanceKm': 0.5
        }
    })


if __name__ == '__main__':
    print("Starting Flask API server...")
    print("http://localhost:5000")
    print("Press Ctrl+C to stop\n")
    app.run(debug=True, port=5000)
