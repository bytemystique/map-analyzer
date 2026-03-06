import React from 'react';
import { Maximize2 } from 'lucide-react';

const AreaCard = ({ area }) => (
  <div className="card border-blue-500/20">
    <div className="card-header">
      <div className="card-icon bg-blue-500/10">
        <Maximize2 size={18} className="text-blue-400" />
      </div>
      <h3 className="card-title">Area</h3>
    </div>
    <p className="stat-value gradient-text">{area} km²</p>
  </div>
);

export default AreaCard;