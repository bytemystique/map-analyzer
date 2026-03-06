/**
 * API utility functions for fetching all stations in Kerala
 */

const API_BASE_URL = 'http://localhost:5000';

/**
 * Fetch all EV charging stations in Kerala
 * @returns {Promise<Array>} Array of EV station objects
 */
export async function fetchAllEVStations() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/all-ev-stations`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch EV stations');
        }

        console.log(`✓ Fetched ${data.count} EV charging stations`);
        return data.stations;

    } catch (error) {
        console.error('Error fetching EV stations:', error);
        throw error;
    }
}

/**
 * Fetch all petrol stations in Kerala
 * @returns {Promise<Array>} Array of petrol station objects
 */
export async function fetchAllPetrolStations() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/all-petrol-stations`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch petrol stations');
        }

        console.log(`✓ Fetched ${data.count} petrol stations`);
        return data.stations;

    } catch (error) {
        console.error('Error fetching petrol stations:', error);
        throw error;
    }
}
