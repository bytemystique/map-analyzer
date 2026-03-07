# Kerala EV Charging Infrastructure Optimizer - Complete Technical Documentation

## Project Overview

**Kerala EV Charging Infrastructure Optimizer** is a geospatial decision-support platform for identifying optimal electric vehicle (EV) charging station locations in Kerala, India. The platform combines multi-layer spatial analysis, real-time navigation, and data visualization to serve both infrastructure planners and end-users.

---

## 1. CORE ALGORITHMS

### 1.1 Cost Calculation Algorithm

The system computes a **composite cost score** for each grid cell using four weighted factors:

```python
# From backend/app.py - find_optimal_locations()

def calculate_cell_cost(cell, charging_stations, substations, density_value, adoption_score):
    """
    Cost Calculation Formula:
    TOTAL_COST = (charging_proximity_cost * 0.3) + 
                 (density_cost * 0.25) + 
                 (substation_cost * 0.25) + 
                 (adoption_cost * 0.2)
    
    Scale: -100 (excellent) to +100 (poor)
    """
```

#### 1.1.1 Charging Station Proximity Cost (Weight: 30%)

**Purpose:** Penalize cells close to existing EV charging stations (to avoid clustering).

**Radial Decay Function:**
```python
# Radial decay penalty applied within influence_km radius
def calculate_charging_proximity_cost(cell_lat, cell_lng, charging_stations, influence_km=2.0):
    proximity_cost = 0
    
    for station in charging_stations:
        distance = haversine(cell_lat, cell_lng, station['lat'], station['lng'])
        
        if distance <= influence_km:
            # Exponential decay: closer = higher penalty
            # At distance=0: penalty = 100
            # At distance=influence_km: penalty ≈ 0
            decay_factor = 1 - (distance / influence_km)
            proximity_cost += 100 * (decay_factor ** 2)  # Quadratic decay
    
    # Normalize to [-100, 100] scale
    # High proximity_cost (many nearby stations) → positive score (bad)
    # Low proximity_cost (no nearby stations) → negative score (good)
    return min(proximity_cost, 100) - 50  # Shift to center scale
```

**Haversine Distance Formula:**
```python
import math

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate great-circle distance between two points on Earth.
    Returns distance in kilometers.
    """
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c
```

#### 1.1.2 Population Density Cost (Weight: 25%)

**Purpose:** Favor high-density areas with more potential users.

```python
def calculate_density_cost(density_value, max_density=5000):
    """
    Higher population density = Lower cost (more favorable)
    
    density_value: people per km² (from 73 local body zones)
    max_density: normalization ceiling (Kerala urban max ≈ 5000/km²)
    
    Formula:
    - High density (5000/km²) → cost = -100 (excellent)
    - Low density (0/km²) → cost = +100 (poor)
    """
    normalized = min(density_value / max_density, 1.0)
    return 100 - (200 * normalized)  # Maps [0,1] to [100, -100]
```

#### 1.1.3 Substation Distance Cost (Weight: 25%)

**Purpose:** Favor cells near power substations (lower grid connection cost).

```python
def calculate_substation_cost(cell_lat, cell_lng, substations, max_distance=10.0):
    """
    Closer to substation = Lower cost
    
    max_distance: 10 km (beyond this, grid connection becomes expensive)
    
    Formula:
    - Distance = 0 km → cost = -100
    - Distance = 10 km → cost = +100
    """
    if not substations:
        return 0  # Neutral if no substation data
    
    # Use SciPy KDTree for O(log n) nearest neighbor lookup
    from scipy.spatial import KDTree
    
    substation_coords = [(s['lat'], s['lng']) for s in substations]
    tree = KDTree(substation_coords)
    
    distance, _ = tree.query([cell_lat, cell_lng])
    # Convert from degrees to km (approximate)
    distance_km = distance * 111  # 1 degree ≈ 111 km
    
    normalized = min(distance_km / max_distance, 1.0)
    return (200 * normalized) - 100  # Maps [0,1] to [-100, 100]
```

#### 1.1.4 Adoption Likelihood Cost (Weight: 20%)

**Purpose:** Favor areas with higher predicted EV adoption rates.

```python
def calculate_adoption_cost(adoption_score):
    """
    adoption_score: 0-100 scale (pre-computed per district)
    
    Based on:
    - Per-capita income
    - Existing EV registrations
    - Urban vs rural classification
    
    Formula:
    - High adoption (100) → cost = -100
    - Low adoption (0) → cost = +100
    """
    return 100 - (2 * adoption_score)
```

---

### 1.2 Divide-and-Conquer Zone Processing

**Purpose:** Optimize algorithm performance by processing favorable zones first.

```python
# From backend/app.py

def find_optimal_locations_optimized(polygon_cells, n_locations, stations, substations, density_data, adoption_data):
    """
    Divide-and-Conquer Algorithm:
    
    1. Calculate cost for all cells
    2. Partition into GREEN/YELLOW/RED zones
    3. Process GREEN first → if N ranks found, STOP
    4. Process YELLOW only if more ranks needed
    5. Process RED only as last resort
    
    Thresholds:
    - GREEN: cost ≤ -33 (top 33% favorable)
    - YELLOW: -33 < cost ≤ 33 (middle 33%)
    - RED: cost > 33 (bottom 33% unfavorable)
    """
    
    # Step 1: Calculate costs for all cells
    cells_with_costs = []
    for cell in polygon_cells:
        cost = calculate_total_cost(cell, stations, substations, density_data, adoption_data)
        cells_with_costs.append({
            'lat': cell['lat'],
            'lng': cell['lng'],
            'cost': cost,
            'cellSize': cell['cellSize']
        })
    
    # Step 2: Partition by zones
    GREEN_THRESHOLD = -33
    YELLOW_THRESHOLD = 33
    
    green_cells = [c for c in cells_with_costs if c['cost'] <= GREEN_THRESHOLD]
    yellow_cells = [c for c in cells_with_costs if GREEN_THRESHOLD < c['cost'] <= YELLOW_THRESHOLD]
    red_cells = [c for c in cells_with_costs if c['cost'] > YELLOW_THRESHOLD]
    
    # Step 3: Process zones in order
    found_ranks = []
    used_cells = set()
    
    # Process GREEN zone first
    green_ranks = extract_cost_ranks(green_cells, n_locations, used_cells)
    found_ranks.extend(green_ranks)
    
    # Step 4: Process YELLOW only if needed
    if len(found_ranks) < n_locations:
        remaining = n_locations - len(found_ranks)
        yellow_ranks = extract_cost_ranks(yellow_cells, remaining, used_cells)
        found_ranks.extend(yellow_ranks)
    
    # Step 5: Process RED only if still needed
    if len(found_ranks) < n_locations:
        remaining = n_locations - len(found_ranks)
        red_ranks = extract_cost_ranks(red_cells, remaining, used_cells)
        found_ranks.extend(red_ranks)
    
    return found_ranks
```

---

### 1.3 Flood-Fill Connected Region Algorithm

**Purpose:** Group adjacent cells with the same cost value into connected regions.

```python
def find_connected_regions(cells_with_same_cost, cell_size):
    """
    Flood-Fill Algorithm using Hash Table for O(1) neighbor lookup.
    
    Input: List of cells with identical cost values
    Output: List of connected regions (sub-locations)
    
    Connectivity: 8-directional (including diagonals)
    """
    
    # Step 1: Build hash table for O(1) coordinate lookup
    # Key: (grid_row, grid_col) → Value: cell data
    cell_map = {}
    
    for cell in cells_with_same_cost:
        # Convert lat/lng to grid indices
        grid_row = round(cell['lat'] / cell_size)
        grid_col = round(cell['lng'] / cell_size)
        cell_map[(grid_row, grid_col)] = cell
    
    # Step 2: Flood-fill to find connected components
    visited = set()
    regions = []
    
    for (row, col), cell in cell_map.items():
        if (row, col) in visited:
            continue
        
        # BFS flood-fill starting from this cell
        region = []
        queue = [(row, col)]
        
        while queue:
            r, c = queue.pop(0)
            
            if (r, c) in visited:
                continue
            if (r, c) not in cell_map:
                continue
            
            visited.add((r, c))
            region.append(cell_map[(r, c)])
            
            # Check 8 neighbors
            neighbors = [
                (r-1, c-1), (r-1, c), (r-1, c+1),
                (r, c-1),             (r, c+1),
                (r+1, c-1), (r+1, c), (r+1, c+1)
            ]
            
            for nr, nc in neighbors:
                if (nr, nc) not in visited and (nr, nc) in cell_map:
                    queue.append((nr, nc))
        
        if region:
            regions.append(region)
    
    return regions
```

**Hash Table Structure:**
```
cell_map = {
    (100, 200): {'lat': 10.0, 'lng': 76.0, 'cost': -55.00},
    (100, 201): {'lat': 10.0, 'lng': 76.005, 'cost': -55.00},
    (101, 200): {'lat': 10.005, 'lng': 76.0, 'cost': -55.00},
    ...
}
```

**Time Complexity:**
- Hash table construction: O(n)
- Flood-fill traversal: O(n)
- Total: O(n) where n = number of cells

---

### 1.4 Cost Rank Extraction (Greedy Selection)

**Purpose:** Extract N distinct cost ranks, each with multiple sub-locations.

```python
def extract_cost_ranks(cells, n_ranks, used_cells):
    """
    Greedy Algorithm:
    1. Sort cells by cost (ascending - best first)
    2. Group by unique cost values
    3. For each cost value, find connected regions
    4. Return N cost ranks with their sub-locations
    """
    
    # Step 1: Filter out already-used cells
    available_cells = [c for c in cells if (c['lat'], c['lng']) not in used_cells]
    
    if not available_cells:
        return []
    
    # Step 2: Group cells by cost value
    cost_groups = {}
    for cell in available_cells:
        cost = round(cell['cost'], 2)  # Round to avoid floating-point issues
        if cost not in cost_groups:
            cost_groups[cost] = []
        cost_groups[cost].append(cell)
    
    # Step 3: Sort cost values (ascending)
    sorted_costs = sorted(cost_groups.keys())
    
    # Step 4: Extract N ranks
    ranks = []
    for cost in sorted_costs:
        if len(ranks) >= n_ranks:
            break
        
        cells_at_cost = cost_groups[cost]
        
        # Find connected regions (sub-locations)
        sub_locations = find_connected_regions(cells_at_cost, cells_at_cost[0]['cellSize'])
        
        # Mark cells as used
        for cell in cells_at_cost:
            used_cells.add((cell['lat'], cell['lng']))
        
        ranks.append({
            'costRank': len(ranks) + 1,
            'cost': cost,
            'subLocationCount': len(sub_locations),
            'subLocations': sub_locations
        })
    
    return ranks
```

---

### 1.5 Cell Boundary Calculation Algorithm

**Purpose:** Draw visual boundaries around optimal regions using cell edges.

```javascript
// From src/utils/optimalLocationFinder.js

function calculateCellBoundary(cells, cellSize) {
    /**
     * Algorithm to compute outer boundary of connected cells.
     * 
     * 1. For each cell, identify its 4 edges (N, S, E, W)
     * 2. An edge is "outer" if no adjacent cell shares it
     * 3. Connect outer edges into closed polygon paths
     * 
     * Returns: Array of [lat, lng] paths for Leaflet polylines
     */
    
    // Step 1: Build cell grid for O(1) neighbor lookup
    const cellGrid = new Map();
    const halfCell = cellSize / 2;
    
    cells.forEach(cell => {
        const gridRow = Math.round(cell.lat / cellSize);
        const gridCol = Math.round(cell.lng / cellSize);
        cellGrid.set(`${gridRow},${gridCol}`, cell);
    });
    
    // Step 2: Collect all outer edges
    const outerEdges = [];
    
    cells.forEach(cell => {
        const row = Math.round(cell.lat / cellSize);
        const col = Math.round(cell.lng / cellSize);
        
        const north = cell.lat + halfCell;
        const south = cell.lat - halfCell;
        const east = cell.lng + halfCell;
        const west = cell.lng - halfCell;
        
        // Check each neighbor - if missing, edge is outer
        if (!cellGrid.has(`${row + 1},${col}`)) {
            // North edge is outer
            outerEdges.push([[north, west], [north, east]]);
        }
        if (!cellGrid.has(`${row - 1},${col}`)) {
            // South edge is outer
            outerEdges.push([[south, west], [south, east]]);
        }
        if (!cellGrid.has(`${row},${col + 1}`)) {
            // East edge is outer
            outerEdges.push([[north, east], [south, east]]);
        }
        if (!cellGrid.has(`${row},${col - 1}`)) {
            // West edge is outer
            outerEdges.push([[north, west], [south, west]]);
        }
    });
    
    // Step 3: Connect edges into closed paths
    return connectEdgesIntoPaths(outerEdges);
}
```

---

## 2. DATA FLOW ARCHITECTURE

### 2.1 Complete Data Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                                       │
├────────────────┬────────────────┬─────────────────┬────────────────────────┤
│ OpenStreetMap  │ Kerala Census  │ KSEB Data       │ Local Body Data        │
│ (EV Stations)  │ (Population)   │ (Substations)   │ (Adoption Rates)       │
└───────┬────────┴───────┬────────┴────────┬────────┴───────────┬────────────┘
        │                │                 │                    │
        ▼                ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ETL LAYER (Python Scripts)                          │
│  - CSV parsing & cleaning                                                    │
│  - Coordinate validation (Kerala bounds check)                              │
│  - Data normalization                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SQLite DATABASE (source.db)                         │
├──────────────────┬──────────────────┬──────────────────┬───────────────────┤
│ ev_stations      │ petrol_stations  │ population_zones │ substations       │
│ ─────────────    │ ───────────────  │ ────────────────│ ───────────────   │
│ lat REAL         │ lat REAL         │ zone_id TEXT     │ lat REAL          │
│ lng REAL         │ lng REAL         │ density REAL     │ lng REAL          │
│ name TEXT        │ name TEXT        │ district TEXT    │ voltage TEXT      │
│ operator TEXT    │ operator TEXT    │ lat_center REAL  │ capacity TEXT     │
│ brand TEXT       │ brand TEXT       │ lng_center REAL  │                   │
│ (600+ records)   │ (2,503 records)  │ (73 zones)       │                   │
└──────────────────┴──────────────────┴──────────────────┴───────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                           │
├─────────────────────────────────┬───────────────────────────────────────────┤
│ Next.js API Routes (Frontend)   │ Flask API (Backend/Algorithm)              │
│ ───────────────────────────────│────────────────────────────────────────   │
│ /api/stations                   │ /api/grid                                  │
│   - GET ?type=ev&bounds=...     │   - POST polygon → grid cells              │
│   - GET ?type=petrol&bounds=... │                                            │
│                                 │ /api/find-optimal-locations                │
│ /api/population_density         │   - POST cells + n → ranked locations      │
│   - GET ?lat=...&lng=...        │                                            │
│                                 │ /api/heat-map                              │
│ /api/adoption_likelihood        │   - POST polygon → cost grid               │
│   - GET ?district=...           │                                            │
└─────────────────────────────────┴───────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React/Next.js)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Components:                                                                  │
│ ├── KeralMapAnalyzer.js (Main orchestrator - 1,500+ lines)                  │
│ ├── Header.jsx (Toolbar with layer toggles)                                  │
│ ├── MapView.jsx (Leaflet container)                                          │
│ ├── StatsPanel.jsx (Area analysis sidebar)                                   │
│ ├── NavigationMenu.jsx (Find nearest station)                                │
│ ├── RegionSelector.jsx (Optimal location browser)                            │
│ └── OptimalLocationModal.jsx (N input dialog)                                │
│                                                                              │
│ Utilities:                                                                   │
│ ├── optimalLocationFinder.js (Visualization logic)                          │
│ ├── optimalLocationFinderAPI.js (Backend communication)                      │
│ ├── mapUtils.js (Leaflet helpers)                                           │
│ └── districtData.js (Static district metadata)                               │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VISUALIZATION (Leaflet.js)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layers:                                                                      │
│ ├── Base Tile Layer (CartoDB Voyager)                                        │
│ ├── chargingLayerRef (EV station markers - green)                           │
│ ├── petrolLayerRef (Petrol station markers - red)                           │
│ ├── gridLayerRef (Analysis grid overlay)                                    │
│ ├── heatMapLayerRef (Cost visualization)                                    │
│ ├── densityLayerRef (Population heatmap)                                    │
│ ├── substationLayerRef (Power infrastructure)                               │
│ ├── adoptionLayerRef (EV adoption likelihood)                               │
│ └── optimalLayerRef (Ranked location boundaries)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request Flow: Find Optimal Locations

```
User Action: Click "Find Optimal Locations" → Enter N=5

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Frontend Collects Data                                              │
├────────────────────────────────────────────────────────────────────────────┤
│ // From KeralMapAnalyzer.js - handleFindOptimalLocations()                  │
│                                                                             │
│ const requestData = {                                                       │
│   polygon: drawnPolygon.toGeoJSON(),           // User-drawn area           │
│   n: 5,                                         // Requested locations       │
│   chargingStations: visibleEVStations,          // From /api/stations        │
│   substations: visibleSubstations,              // From layer data           │
│   populationDensity: areaStats.populationDensity,                           │
│   adoptionLikelihood: areaStats.adoptionScore                               │
│ };                                                                          │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 2: API Request to Flask Backend                                        │
├────────────────────────────────────────────────────────────────────────────┤
│ POST http://localhost:5000/api/find-optimal-locations                       │
│ Content-Type: application/json                                              │
│                                                                             │
│ {                                                                           │
│   "polygon": { "type": "Polygon", "coordinates": [...] },                   │
│   "n": 5,                                                                   │
│   "chargingStations": [{"lat": 10.0, "lng": 76.0}, ...],                   │
│   "substations": [{"lat": 10.1, "lng": 76.1, "voltage": "66kV"}, ...],     │
│   "populationDensity": 2494,                                                │
│   "adoptionLikelihood": 72                                                  │
│ }                                                                           │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Backend Processing (Flask/Python)                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ def find_optimal_locations():                                               │
│     # 3a. Generate grid cells within polygon                                │
│     cells = generate_grid_cells(polygon, cell_size=0.005)  # ~500m          │
│                                                                             │
│     # 3b. Calculate cost for each cell                                      │
│     for cell in cells:                                                      │
│         cell['cost'] = calculate_total_cost(...)                            │
│                                                                             │
│     # 3c. Partition into GREEN/YELLOW/RED                                   │
│     green = [c for c in cells if c['cost'] <= -33]                         │
│     yellow = [c for c in cells if -33 < c['cost'] <= 33]                   │
│     red = [c for c in cells if c['cost'] > 33]                             │
│                                                                             │
│     # 3d. Extract N cost ranks using greedy + flood-fill                    │
│     ranks = extract_cost_ranks(green, n=5, ...)                             │
│     if len(ranks) < 5:                                                      │
│         ranks.extend(extract_cost_ranks(yellow, n=5-len(ranks), ...))       │
│                                                                             │
│     return jsonify(ranks)                                                   │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 4: Response Structure                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ {                                                                           │
│   "success": true,                                                          │
│   "locations": [                                                            │
│     {                                                                       │
│       "costRank": 1,                                                        │
│       "cost": -55.00,                                                       │
│       "subLocationCount": 3,                                                │
│       "subLocations": [                                                     │
│         {                                                                   │
│           "cells": [                                                        │
│             {"lat": 10.015, "lng": 76.285, "cost": -55.00, "cellSize": 0.005}│
│           ],                                                                │
│           "centroid": {"lat": 10.015, "lng": 76.285}                        │
│         },                                                                  │
│         // ... more sub-locations with same cost                            │
│       ]                                                                     │
│     },                                                                      │
│     {                                                                       │
│       "costRank": 2,                                                        │
│       "cost": -54.00,                                                       │
│       // ...                                                                │
│     }                                                                       │
│   ]                                                                         │
│ }                                                                           │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 5: Frontend Visualization                                               │
├────────────────────────────────────────────────────────────────────────────┤
│ // From optimalLocationFinder.js - plotOptimalLocations()                   │
│                                                                             │
│ 1. Create optimalLayerRef (Leaflet FeatureGroup)                            │
│ 2. For each costRank:                                                       │
│    - Assign color from COLOR_PALETTE[costRank - 1]                          │
│    - For each subLocation:                                                  │
│      - Draw cell rectangles with black border + colored fill                │
│      - Calculate centroid for marker placement                              │
│ 3. Zoom map to first (best) location                                        │
│ 4. Add legend control showing rank colors                                   │
│ 5. Display RegionSelector component for browsing                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. LAYER SYSTEM

### 3.1 Available Layers

| Layer ID | Toggle Button | Data Source | Visualization |
|----------|---------------|-------------|---------------|
| `chargingLayerRef` | "EV Stations" | SQLite `ev_stations` | Green circle markers |
| `petrolLayerRef` | "Petrol" | SQLite `petrol_stations` | Red circle markers |
| `gridLayerRef` | "Grid" | Generated from polygon | Grey grid lines |
| `densityLayerRef` | "Density" | `districtData.js` (73 zones) | Choropleth heatmap |
| `substationLayerRef` | "Substations" | Static data | Yellow lightning markers |
| `adoptionLayerRef` | "Adoption" | Computed per district | Gradient overlay |
| `heatMapLayerRef` | "Heat Map" | Backend cost calculation | Green→Yellow→Red gradient |
| `optimalLayerRef` | (Auto on find) | Backend optimal locations | Colored cell boundaries |

### 3.2 Heat Map Color Mapping

```javascript
// From mapUtils.js - getHeatMapColor()

function getHeatMapColor(cost) {
    /**
     * Maps cost value to color gradient.
     * 
     * Cost Scale: -100 to +100
     * Color Scale: Green (#00ff00) → Yellow (#ffff00) → Red (#ff0000)
     */
    
    // Normalize cost to [0, 1]
    const normalized = (cost + 100) / 200;
    
    if (normalized <= 0.33) {
        // GREEN zone: cost ≤ -33
        // Interpolate green to yellow-green
        const t = normalized / 0.33;
        return interpolateColor('#00ff00', '#80ff00', t);
    } else if (normalized <= 0.66) {
        // YELLOW zone: -33 < cost ≤ 33
        // Interpolate yellow-green to orange
        const t = (normalized - 0.33) / 0.33;
        return interpolateColor('#80ff00', '#ff8000', t);
    } else {
        // RED zone: cost > 33
        // Interpolate orange to red
        const t = (normalized - 0.66) / 0.34;
        return interpolateColor('#ff8000', '#ff0000', t);
    }
}
```

---

## 4. FEATURE SPECIFICATIONS

### 4.1 Features for Infrastructure Planners (Government/CPOs)

#### 4.1.1 Polygon-Based Area Analysis
```
User Flow:
1. Click "Draw Area" button
2. Click on map to create polygon vertices
3. Double-click to complete polygon
4. System automatically calculates:
   - Total area (km²)
   - Population density (people/km²)
   - District identification
   - EV penetration rate (%)
   - Vehicle distribution (EV vs ICE)
   - Existing infrastructure count
```

**Benefit:** Analyze any custom region without pre-defined boundaries.

#### 4.1.2 Multi-Layer Toggle Visualization
```
Available Toggles:
- EV Stations: See current coverage gaps
- Petrol Stations: Identify conversion candidates
- Density ON/OFF: Visualize population hotspots
- Substations ON/OFF: Check power grid proximity
- Adoption ON/OFF: See EV readiness by area
- Heat Map: View composite favorability score
- Grid: Inspect individual cells
```

**Benefit:** Combine factors visually to understand why certain areas are recommended.

#### 4.1.3 Optimal Location Finder with N Ranks
```
Input: Number of location ranks (1-10)
Output: 
- N cost ranks (e.g., Rank 1 = cost -55, Rank 2 = cost -54, ...)
- Each rank has 1+ sub-locations (scattered regions with same score)
- Visual boundary around each region
- Legend showing rank-to-color mapping
```

**Benefit:** Not just "best location" but top N alternatives with justification (cost score).

#### 4.1.4 Region Filtering and Navigation
```
Features:
- Click rank badge to filter map to only that rank
- Arrow navigation between sub-locations of same rank
- "Show All" to reset filter
- Zoom-to-region on selection
```

**Benefit:** Quickly compare alternatives and navigate large result sets.

#### 4.1.5 Data Export
```
Export Format: JSON
Contents:
- Polygon coordinates
- All ranked locations with:
  - Coordinates (lat/lng)
  - Cost score
  - Sub-location cells
- Analysis parameters used
```

**Benefit:** Import into GIS systems, share with stakeholders, document decisions.

---

### 4.2 Features for End Users (EV Owners)

#### 4.2.1 View All Stations
```
On page load:
- All EV charging stations in Kerala displayed (green markers)
- All petrol stations displayed (red markers)
- Click marker for details (name, operator, brand)
```

**Benefit:** See entire charging network at a glance.

#### 4.2.2 Find Nearest Station with Navigation
```
User Flow:
1. Click "Navigate" button in header
2. Select "EV Charging Station" or "Petrol Station"
3. Browser requests GPS location permission
4. System finds nearest station using Haversine distance
5. Shows distance in km
6. Click "View Route" to see embedded mini-map:
   - Start marker (blue pulse animation) at user location
   - End marker (green/red) at station
   - Dashed route line connecting them
7. Exit route anytime
```

**Benefit:** Reduce range anxiety with quick navigation to nearest charger.

#### 4.2.3 Station Details Popup
```
EV Station Popup:
- Station name
- Operator (Tata Power, ChargeZone, etc.)
- Click to navigate

Petrol Station Popup:
- Station name
- Brand (HP, BP, IOCL, etc.)
- Operator
```

**Benefit:** Make informed choice between multiple nearby options.

---

## 5. STATIC DATA STRUCTURES

### 5.1 District Data (districtData.js)

```javascript
// 14 Kerala districts with static metadata

export const districtData = {
    "Thiruvananthapuram": {
        bounds: [[8.17, 76.65], [8.87, 77.35]],
        population: 3301427,
        area: 2192,  // km²
        evPenetration: 12.8,  // %
        chargingDensity: 0.045,  // stations per km²
        vehicleOwnership: 0.114,  // 11.4% of population
        adoptionScore: 68  // 0-100 scale
    },
    "Ernakulam": {
        bounds: [[9.70, 76.10], [10.35, 77.05]],
        population: 3282388,
        area: 2408,
        evPenetration: 14.5,
        chargingDensity: 0.055,
        vehicleOwnership: 0.118,
        adoptionScore: 78
    },
    // ... 12 more districts
};
```

### 5.2 Color Palette for Optimal Locations

```javascript
// From optimalLocationFinder.js

const COLOR_PALETTE = [
    '#10b981',  // Rank 1: Emerald (best)
    '#3b82f6',  // Rank 2: Blue
    '#8b5cf6',  // Rank 3: Violet
    '#f59e0b',  // Rank 4: Amber
    '#ef4444',  // Rank 5: Red
    '#ec4899',  // Rank 6: Pink
    '#06b6d4',  // Rank 7: Cyan
    '#84cc16',  // Rank 8: Lime
    '#f97316',  // Rank 9: Orange
    '#6366f1',  // Rank 10: Indigo
];

const RANK_EMOJIS = ['🥇', '🥈', '🥉', '#4', '#5', '#6', '#7', '#8', '#9', '#10'];
```

---

## 6. API ENDPOINT SPECIFICATIONS

### 6.1 Next.js API Routes

#### GET /api/stations
```
Query Parameters:
- type: 'ev' | 'petrol'
- bounds: 'minLat,minLng,maxLat,maxLng' (optional)
- polygon: GeoJSON string (optional)

Response:
{
    "stations": [
        {
            "lat": 10.015,
            "lng": 76.285,
            "name": "Tata Power Charging Hub",
            "operator": "Tata Power",
            "brand": null
        },
        ...
    ],
    "count": 45
}
```

#### GET /api/population_density
```
Query Parameters:
- lat: number
- lng: number

Response:
{
    "density": 2494,
    "zone": "Ernakulam Urban",
    "district": "Ernakulam"
}
```

### 6.2 Flask API Routes

#### POST /api/find-optimal-locations
```
Request Body:
{
    "polygon": { "type": "Polygon", "coordinates": [...] },
    "n": 5,
    "chargingStations": [...],
    "substations": [...],
    "populationDensity": 2494,
    "adoptionLikelihood": 72
}

Response:
{
    "success": true,
    "processingTime": "1.23s",
    "cellsProcessed": 847,
    "zonesAnalyzed": {
        "green": 234,
        "yellow": 412,
        "red": 201
    },
    "locations": [
        {
            "costRank": 1,
            "cost": -55.00,
            "subLocationCount": 3,
            "subLocations": [...]
        },
        ...
    ]
}
```

#### POST /api/grid
```
Request Body:
{
    "polygon": { "type": "Polygon", "coordinates": [...] },
    "cellSize": 0.005  // degrees (~500m)
}

Response:
{
    "cells": [
        {"lat": 10.015, "lng": 76.285, "row": 0, "col": 0},
        {"lat": 10.015, "lng": 76.290, "row": 0, "col": 1},
        ...
    ],
    "totalCells": 847,
    "gridDimensions": {"rows": 23, "cols": 37}
}
```

#### POST /api/heat-map
```
Request Body:
{
    "polygon": { "type": "Polygon", "coordinates": [...] },
    "chargingStations": [...],
    "substations": [...],
    "densityData": {...},
    "adoptionData": {...}
}

Response:
{
    "heatMapCells": [
        {"lat": 10.015, "lng": 76.285, "cost": -55.00, "color": "#00ff00"},
        {"lat": 10.015, "lng": 76.290, "cost": -42.00, "color": "#40ff00"},
        ...
    ]
}
```

---

## 7. COMPONENT ARCHITECTURE

### 7.1 Component Hierarchy

```
App (Next.js)
└── KeralMapAnalyzer (Main orchestrator)
    ├── Header
    │   ├── Logo + Title
    │   ├── Navigation Button → NavigationMenu
    │   ├── Draw Area Button
    │   ├── Find Optimal Button → OptimalLocationModal
    │   ├── Clear Button
    │   ├── Export Button
    │   └── Trash Button
    │
    ├── Secondary Toolbar (conditional: hasPolygon)
    │   ├── MARKERS Section
    │   │   ├── EV Stations Toggle
    │   │   └── Petrol Toggle
    │   ├── LAYERS Section
    │   │   ├── Density Toggle
    │   │   ├── Substations Toggle
    │   │   └── Adoption Toggle
    │   └── VIEW Section
    │       ├── Grid Toggle
    │       └── Heat Map Toggle
    │
    ├── MapView (Leaflet container)
    │   ├── TileLayer (CartoDB Voyager)
    │   ├── chargingLayerRef (FeatureGroup)
    │   ├── petrolLayerRef (FeatureGroup)
    │   ├── gridLayerRef (FeatureGroup)
    │   ├── heatMapLayerRef (FeatureGroup)
    │   ├── densityLayerRef (FeatureGroup)
    │   ├── substationLayerRef (FeatureGroup)
    │   ├── adoptionLayerRef (FeatureGroup)
    │   ├── optimalLayerRef (FeatureGroup)
    │   └── Draw Controls
    │
    ├── StatsPanel (conditional: hasPolygon)
    │   ├── Area Analysis Card
    │   ├── EV Infrastructure Card
    │   ├── Vehicle Distribution Card
    │   └── Demographics Card
    │
    ├── NavigationMenu (modal)
    │   ├── Station Type Selector
    │   ├── Loading State
    │   ├── Result Display
    │   └── Route Map View (embedded Leaflet)
    │
    ├── OptimalLocationModal (modal)
    │   └── N input field
    │
    └── RegionSelector (conditional: hasOptimalLocations)
        ├── Rank Pills (clickable filters)
        ├── Sub-location Navigator (arrows + counter)
        ├── Show All Button
        └── Clear Button
```

### 7.2 State Management (KeralMapAnalyzer.js)

```javascript
// Core map state
const [mapInstance, setMapInstance] = useState(null);
const [drawnPolygon, setDrawnPolygon] = useState(null);
const [isDrawing, setIsDrawing] = useState(false);

// Layer visibility toggles
const [showCharging, setShowCharging] = useState(true);
const [showPetrol, setShowPetrol] = useState(false);
const [showGrid, setShowGrid] = useState(false);
const [showHeatMap, setShowHeatMap] = useState(false);
const [showDensity, setShowDensity] = useState(true);
const [showSubstations, setShowSubstations] = useState(true);
const [showAdoption, setShowAdoption] = useState(false);

// Analysis results
const [areaStats, setAreaStats] = useState(null);
const [optimalLocations, setOptimalLocations] = useState(null);
const [selectedRegionIndex, setSelectedRegionIndex] = useState(null);
const [filterByRank, setFilterByRank] = useState(null);

// Navigation state
const [isNavigationOpen, setIsNavigationOpen] = useState(false);
const [userLocation, setUserLocation] = useState(null);
const [nearestStation, setNearestStation] = useState(null);
const [stationType, setStationType] = useState(null);

// Layer references (Leaflet FeatureGroups)
const chargingLayerRef = useRef(null);
const petrolLayerRef = useRef(null);
const gridLayerRef = useRef(null);
const heatMapLayerRef = useRef(null);
const densityLayerRef = useRef(null);
const substationLayerRef = useRef(null);
const adoptionLayerRef = useRef(null);
const optimalLayerRef = useRef(null);
```

---

## 8. DATABASE SCHEMA

```sql
-- source.db (SQLite)

-- EV Charging Stations
CREATE TABLE ev_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    name TEXT,
    operator TEXT,
    brand TEXT,
    socket_type TEXT,
    capacity TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Petrol Stations
CREATE TABLE petrol_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    name TEXT,
    operator TEXT,
    brand TEXT,
    city TEXT,
    phone TEXT,
    website TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Population Density Zones
CREATE TABLE population_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id TEXT UNIQUE NOT NULL,
    zone_name TEXT,
    district TEXT,
    density REAL,  -- people per km²
    lat_center REAL,
    lng_center REAL,
    bounds_json TEXT  -- GeoJSON polygon
);

-- Power Substations
CREATE TABLE substations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    name TEXT,
    voltage TEXT,  -- e.g., "66kV", "110kV", "220kV"
    capacity_mva REAL,
    district TEXT
);

-- Indexes for spatial queries
CREATE INDEX idx_ev_stations_coords ON ev_stations(lat, lng);
CREATE INDEX idx_petrol_stations_coords ON petrol_stations(lat, lng);
CREATE INDEX idx_substations_coords ON substations(lat, lng);
```

---

## 9. PERFORMANCE CHARACTERISTICS

### 9.1 Algorithm Complexity

| Operation | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| Grid generation | O(area / cellSize²) | O(n) cells |
| Cost calculation (per cell) | O(s + sub) | O(1) |
| Haversine distance | O(1) | O(1) |
| KDTree nearest neighbor | O(log n) | O(n) |
| Flood-fill (hash-based) | O(n) | O(n) |
| Zone partitioning | O(n) | O(n) |
| Total find-optimal | O(n × (s + log sub)) | O(n) |

Where:
- n = number of grid cells
- s = number of charging stations
- sub = number of substations

### 9.2 Benchmarks

```
Test Area: 100 km² polygon in Ernakulam
Grid Cell Size: 500m × 500m
Total Cells: ~400

Results:
- Grid generation: 12ms
- Cost calculation: 180ms
- Zone partitioning: 8ms
- Flood-fill + ranking: 45ms
- Total API response: ~250ms

Memory Usage:
- Cell data: ~50KB
- Station data: ~200KB
- Total: <1MB per request
```

---

## 10. DEPLOYMENT CONFIGURATION

### 10.1 Environment Setup

```bash
# Frontend (Next.js)
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:5000

# Backend (Flask)
FLASK_PORT=5000
FLASK_DEBUG=true
DATABASE_PATH=./source.db
```

### 10.2 Dependencies

**Frontend (package.json):**
```json
{
    "next": "^14.0.0",
    "react": "^19.0.0",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "lucide-react": "^0.300.0",
    "tailwindcss": "^3.4.0"
}
```

**Backend (requirements.txt):**
```
flask==3.0.0
flask-cors==4.0.0
numpy==1.26.0
scipy==1.11.0
shapely==2.0.0
```

---

This documentation provides complete technical context for AI agents to understand, analyze, and extend the Kerala EV Charging Infrastructure Optimizer project.
