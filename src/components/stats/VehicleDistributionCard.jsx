import React from 'react';
import { Car } from 'lucide-react';
import StatCard from './StatCard';

const VehicleDistributionCard = ({ stats }) => (
  <StatCard 
    title="Vehicle Distribution" 
    icon={Car} 
    color="orange"
    footer="Based on Kerala's vehicle ownership rate of 11.4%"
  >
    <div className="space-y-1">
      <div className="stat-row">
        <span className="stat-label">Petrol/Diesel</span>
        <span className="stat-data">{stats.petrolVehicles.toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Total Vehicles</span>
        <span className="stat-data text-amber-400">
          {(stats.evVehicles + stats.petrolVehicles).toLocaleString()}
        </span>
      </div>
    </div>
  </StatCard>
);

export default VehicleDistributionCard;