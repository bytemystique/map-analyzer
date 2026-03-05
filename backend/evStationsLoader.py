"""
Utility module to load and serve EV charging stations data from source.db
"""
import sqlite3
import os

def load_ev_stations(db_path='../cleaning/source.db'):
    """
    Load EV charging stations from source.db database (Kerala data)
    
    Returns:
        list: List of EV station dictionaries with lat, lng, name, operator, access, usage_type, connectors
    """
    stations = []
    
    # Get absolute path relative to this file
    current_dir = os.path.dirname(os.path.abspath(__file__))
    full_path = os.path.join(current_dir, db_path)
    
    try:
        conn = sqlite3.connect(full_path)
        cursor = conn.cursor()
        
        # Query all EV stations from source.db
        # Fields: latitude, longitude, access_code, name, operator, usage_type, connectors
        query = """
            SELECT latitude, longitude, access_code, name, operator, usage_type, connectors
            FROM ev_stations
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        for row in rows:
            try:
                lat = float(row[0]) if row[0] else None
                lng = float(row[1]) if row[1] else None
                
                # Skip invalid coordinates
                if lat is None or lng is None:
                    continue
                
                station = {
                    'lat': lat,
                    'lng': lng,
                    'access': row[2] if row[2] else 'Unknown',
                    'name': row[3] if row[3] else 'EV Charging Station',
                    'operator': row[4] if row[4] else '',
                    'usage_type': row[5] if row[5] else '',
                    'connectors': row[6] if row[6] else ''
                }
                stations.append(station)
            except (ValueError, TypeError, IndexError) as e:
                # Skip rows with invalid data
                continue
        
        conn.close()
        print(f"✓ Loaded {len(stations)} EV charging stations from source.db")
        return stations
        
    except FileNotFoundError:
        print(f"❌ Error: Could not find source.db at {full_path}")
        return []
    except sqlite3.OperationalError as e:
        print(f"❌ Database error: {str(e)}")
        return []
    except Exception as e:
        print(f"❌ Error loading EV stations: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


def get_all_ev_stations():
    """
    Get all EV charging stations in Kerala from source.db
    
    Returns:
        list: List of EV station dictionaries
    """
    return load_ev_stations()
