import React from 'react';
import { Navigation } from 'lucide-react';

const CoordinatesCard = ({ coordinates }) => (
  <div className="card border-gray-500/20">
    <div className="card-header">
      <div className="card-icon bg-gray-500/10">
        <Navigation size={18} className="text-gray-400" />
      </div>
      <h3 className="card-title">Polygon Coordinates</h3>
    </div>
    <div className="space-y-1 max-h-32 overflow-y-auto text-xs font-mono text-gray-500 bg-black/20 rounded-lg p-3">
      {coordinates?.map((coord, i) => (
        <div key={i} className="py-0.5 text-gray-400">
          <span className="text-purple-400">P{i + 1}:</span> {coord}
        </div>
      ))}
    </div>
  </div>
);

export default CoordinatesCard;