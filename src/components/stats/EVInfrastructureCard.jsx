import React from 'react';
import { Zap } from 'lucide-react';
import StatCard from './StatCard';

const EVInfrastructureCard = ({ stats }) => (
  <StatCard 
    title="EV Infrastructure" 
    icon={Zap} 
    color="green"
    footer="Based on Kerala's 13.5% avg EV adoption rate (FY24)"
  >
    <div className="space-y-1">
      <div className="stat-row">
        <span className="stat-label">Charging Stations</span>
        <span className="stat-data text-emerald-400">{stats.evStations}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">EV Vehicles</span>
        <span className="stat-data">{stats.evVehicles.toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">EV Penetration</span>
        <span className="stat-data">
          <span className="badge badge-success">{stats.evPenetration}%</span>
        </span>
      </div>
    </div>
  </StatCard>
);

export default EVInfrastructureCard;