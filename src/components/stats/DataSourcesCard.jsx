import React from 'react';
import { Database } from 'lucide-react';

const DataSourcesCard = () => (
  <div className="glass-light rounded-xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <Database size={14} className="text-purple-400" />
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Data Sources</p>
    </div>
    <ul className="space-y-1.5 text-xs text-gray-500">
      <li className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
        Kerala Census 2024 (35.3M population)
      </li>
      <li className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
        RBI Kerala Income Report 2024
      </li>
      <li className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        KSEB EV Infrastructure (960 stations)
      </li>
      <li className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        Kerala MVD Vehicle Statistics
      </li>
    </ul>
  </div>
);

export default DataSourcesCard;