import React from "react";
import { Info, MousePointer2 } from "lucide-react";

const MapView = ({ mapRef, drawing, pointCount, hasPolygon }) => (
  <div className="flex-1 relative z-0">
    <div ref={mapRef} className="w-full h-full" />
    
    {/* Drawing Mode Indicator */}
    {drawing && (
      <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-10 animate-fade-in">
        <div className="glass rounded-2xl px-6 py-3 flex items-center gap-3 shadow-2xl">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center animate-pulse">
            <MousePointer2 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-medium text-sm">Click on map to add points</p>
            <p className="text-gray-400 text-xs">
              {pointCount} point{pointCount !== 1 ? 's' : ''} added
              {pointCount >= 3 && <span className="text-emerald-400 ml-1">• Ready to complete</span>}
            </p>
          </div>
        </div>
      </div>
    )}
    
    {/* Data Source Attribution - only show when polygon exists */}
    {hasPolygon && (
      <div className="absolute bottom-4 left-4 z-10 animate-fade-in">
        <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2.5 max-w-xs">
          <div className="shrink-0 w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Info size={12} className="text-purple-400" />
          </div>
          <span className="text-xs text-gray-400 leading-relaxed">
            Data: Kerala Census 2024, RBI Reports, KSEB EV Infrastructure
          </span>
        </div>
      </div>
    )}
  </div>
);

export default MapView;
