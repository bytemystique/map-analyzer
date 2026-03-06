import React from 'react';
import { Users } from 'lucide-react';
import StatCard from './StatCard';

const DemographicsCard = ({ stats }) => (
  <StatCard 
    title="Demographics" 
    icon={Users} 
    color="purple"
    footer="Kerala state avg: 859 per km² (Census 2024)"
  >
    <div className="space-y-1">
      <div className="stat-row">
        <span className="stat-label">Population</span>
        <span className="stat-data">{stats.population.toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Density</span>
        <span className="stat-data text-purple-400">{stats.density} per km²</span>
      </div>
    </div>
  </StatCard>
);

export default DemographicsCard;