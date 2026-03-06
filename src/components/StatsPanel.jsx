import React from 'react';
import { MapPin, X } from 'lucide-react';
import AreaCard from './stats/AreaCard';
import EVInfrastructureCard from './stats/EVInfrastructureCard';
import VehicleDistributionCard from './stats/VehicleDistributionCard';
import DemographicsCard from './stats/DemographicsCard';
import IncomeCard from './stats/IncomeCard';
import CoordinatesCard from './stats/CoordinatesCard';
import DataSourcesCard from './stats/DataSourcesCard';

const StatsPanel = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="w-[380px] shrink-0 glass border-l-0 overflow-hidden flex flex-col animate-slide-in">
      {/* Header */}
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <MapPin size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Area Analysis</h2>
            <p className="text-sm text-gray-500">{stats.district}</p>
          </div>
        </div>
      </div>
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <AreaCard area={stats.area} />
        <EVInfrastructureCard stats={stats} />
        <VehicleDistributionCard stats={stats} />
        <DemographicsCard stats={stats} />
        <IncomeCard avgIncome={stats.avgIncome} />
        <CoordinatesCard coordinates={stats.coordinates} />
        <DataSourcesCard />
      </div>
    </div>
  );
};

export default StatsPanel;