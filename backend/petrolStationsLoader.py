"""
Utility module to load and serve petrol stations data from CSV
"""
import csv
import os

def load_petrol_stations(csv_path='../cleaning/petrol.csv'):
    """
    Load petrol stations from CSV file
    
    Returns:
        list: List of petrol station dictionaries with lat, lng, name, operator, brand
    """
    stations = []
    
    # Get absolute path relative to this file
    current_dir = os.path.dirname(os.path.abspath(__file__))
    full_path = os.path.join(current_dir, csv_path)
    
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            # CSV is tab-separated based on the data
            reader = csv.DictReader(f, delimiter='\t')
            
            for row in reader:
                try:
                    lat = float(row.get('@lat', 0))
                    lon = float(row.get('@lon', 0))
                    
                    # Skip invalid coordinates
                    if lat == 0 or lon == 0:
                        continue
                    
                    # Filter for Kerala coordinates (approximately)
                    # Kerala bounds: lat 8.2 to 12.8, lng 74.8 to 77.5
                    if not (8.2 <= lat <= 12.8 and 74.8 <= lon <= 77.5):
                        continue
                    
                    station = {
                        'lat': lat,
                        'lng': lon,
                        'name': row.get('name', '').strip() or 'Petrol Station',
                        'operator': row.get('operator', '').strip(),
                        'brand': row.get('brand', '').strip(),
                        'city': row.get('addr:city', '').strip(),
                        'phone': row.get('phone', '').strip(),
                        'website': row.get('website', '').strip()
                    }
                    
                    stations.append(station)
                    
                except (ValueError, TypeError) as e:
                    # Skip rows with invalid data
                    continue
        
        print(f"✓ Loaded {len(stations)} petrol stations from CSV")
        return stations
        
    except FileNotFoundError:
        print(f"❌ Error: Could not find petrol stations CSV at {full_path}")
        return []
    except Exception as e:
        print(f"❌ Error loading petrol stations: {str(e)}")
        return []


def get_all_petrol_stations():
    """
    Get all petrol stations in Kerala
    
    Returns:
        list: List of petrol station dictionaries
    """
    return load_petrol_stations()
