import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, MapPin, Trash2, Minimize2, Eye, Filter, Navigation } from "lucide-react";

/**
 * RegionSelector - Compact floating UI panel for selecting and navigating optimal regions
 * Works with costRanks structure from backend (already grouped by cost)
 */
const RegionSelector = ({ 
  costRanks, 
  onSelectRegion, 
  onShowAll,    // Show all markers
  onClose,      // Hide selector (keeps locations on map)
  onClear,      // Clear all locations
  onFilterByRank // Filter to show only specific rank
}) => {
  const [currentRank, setCurrentRank] = useState(0);
  const [currentSubIndex, setCurrentSubIndex] = useState(0);
  const [isShowingAll, setIsShowingAll] = useState(true); // Start showing all
  const [filterRank, setFilterRank] = useState(null); // null = no filter, number = filter by that rank
  const [isIndividualMode, setIsIndividualMode] = useState(false); // Individual location navigation

  // Color palette matching optimalLocationFinder.js
  const COLORS = [
    { primary: '#10b981', secondary: '#059669', light: '#d1fae5' },
    { primary: '#3b82f6', secondary: '#2563eb', light: '#dbeafe' },
    { primary: '#8b5cf6', secondary: '#7c3aed', light: '#ede9fe' },
    { primary: '#f59e0b', secondary: '#d97706', light: '#fef3c7' },
    { primary: '#ef4444', secondary: '#dc2626', light: '#fee2e2' },
  ];

  const rankEmojis = ['🥇', '🥈', '🥉'];

  useEffect(() => {
    // Don't auto-select on mount - show all markers initially
    // User can click to select a specific region
  }, []);

  if (!costRanks || costRanks.length === 0) {
    return null;
  }

  const currentRankData = costRanks[currentRank];
  const currentSubLocations = currentRankData?.subLocations || [];
  const hasMultipleSubLocations = currentSubLocations.length > 1;

  // Handle filter toggle - click to filter, double-click or click when already filtered to navigate
  const handleRankClick = (rankIndex) => {
    if (filterRank === rankIndex) {
      // Already filtering this rank - clear filter
      setFilterRank(null);
      if (onFilterByRank) onFilterByRank(null);
      setIsShowingAll(true);
    } else {
      // Set filter for this rank
      setFilterRank(rankIndex);
      setCurrentRank(rankIndex);
      setCurrentSubIndex(0);
      setIsShowingAll(false);
      if (onFilterByRank) onFilterByRank(rankIndex);
    }
  };

  // Navigate to specific location (individual mode)
  const handleRankNavigate = (rankIndex) => {
    setCurrentRank(rankIndex);
    setCurrentSubIndex(0);
    setIsShowingAll(false);
    const rank = costRanks[rankIndex];
    if (rank && rank.subLocations[0]) {
      onSelectRegion(rank.subLocations[0], rankIndex, 0, rank.cost);
    }
  };

  const toggleIndividualMode = () => {
    setIsIndividualMode(!isIndividualMode);
    if (!isIndividualMode) {
      // Entering individual mode - select first location of current rank
      const rank = costRanks[currentRank];
      if (rank && rank.subLocations[0]) {
        onSelectRegion(rank.subLocations[0], currentRank, 0, rank.cost);
      }
    } else {
      // Exiting individual mode - show all (with filter if active)
      if (filterRank !== null) {
        if (onFilterByRank) onFilterByRank(filterRank);
      } else {
        handleShowAll();
      }
    }
  };

  const handleShowAll = () => {
    setIsShowingAll(true);
    setFilterRank(null);
    setIsIndividualMode(false);
    if (onFilterByRank) onFilterByRank(null);
    if (onShowAll) {
      onShowAll();
    }
  };

  const handlePrevSubRegion = () => {
    if (currentSubIndex > 0) {
      const newIndex = currentSubIndex - 1;
      setCurrentSubIndex(newIndex);
      setIsShowingAll(false);
      onSelectRegion(currentSubLocations[newIndex], currentRank, newIndex, currentRankData.cost);
    }
  };

  const handleNextSubRegion = () => {
    if (currentSubIndex < currentSubLocations.length - 1) {
      const newIndex = currentSubIndex + 1;
      setCurrentSubIndex(newIndex);
      setIsShowingAll(false);
      onSelectRegion(currentSubLocations[newIndex], currentRank, newIndex, currentRankData.cost);
    }
  };

  return (
    <div 
      className="fixed left-1/2 transform -translate-x-1/2"
      style={{ zIndex: 9999, maxWidth: "90vw", minWidth: "320px", bottom: "24px" }}
    >
      <div className="glass rounded-2xl overflow-hidden shadow-2xl">
        {/* Compact Header with Controls */}
        <div 
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: isShowingAll 
            ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' 
            : `linear-gradient(135deg, ${COLORS[currentRank % COLORS.length].primary}, ${COLORS[currentRank % COLORS.length].secondary})` }}
        >
          <span className="text-white font-medium text-sm">
            {filterRank !== null 
              ? `🔍 Rank ${filterRank + 1} Only` 
              : isShowingAll 
                ? '📍 All Locations' 
                : `${rankEmojis[currentRank] || `#${currentRank + 1}`} Optimal Location`}
          </span>
          <div className="flex items-center gap-1">
            <button 
              onClick={toggleIndividualMode}
              className={`p-1.5 rounded-lg transition-all duration-200 ${isIndividualMode 
                ? 'text-white bg-white/30' 
                : 'text-white/70 hover:text-white hover:bg-white/20'}`}
              title={isIndividualMode ? "Exit individual view" : "Individual location view"}
            >
              <Navigation size={16} />
            </button>
            <button 
              onClick={handleShowAll}
              className={`p-1.5 rounded-lg transition-all duration-200 ${isShowingAll && filterRank === null
                ? 'text-white bg-white/30' 
                : 'text-white/70 hover:text-white hover:bg-white/20'}`}
              title="Show all locations"
            >
              <Eye size={16} />
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200"
              title="Minimize"
            >
              <Minimize2 size={16} />
            </button>
            <button 
              onClick={onClear}
              className="p-1.5 text-white/70 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all duration-200"
              title="Clear all"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-4 py-3">
          {/* Rank Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {costRanks.map((rank, idx) => {
              const colors = COLORS[idx % COLORS.length];
              const isFiltered = filterRank === idx;
              const isSelected = isIndividualMode && currentRank === idx;
              return (
                <button
                  key={idx}
                  onClick={() => isIndividualMode ? handleRankNavigate(idx) : handleRankClick(idx)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                    transition-all duration-200 shrink-0 border
                    ${isFiltered || isSelected
                      ? 'text-white border-transparent shadow-lg' 
                      : filterRank !== null && !isFiltered
                        ? 'text-gray-500 bg-white/5 border-white/5 opacity-50'
                        : 'text-gray-300 bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                    }
                  `}
                  style={isFiltered || isSelected ? { 
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                    boxShadow: `0 4px 15px ${colors.primary}40`
                  } : {}}
                  title={isIndividualMode ? `Navigate to rank ${idx + 1}` : isFiltered ? 'Click to show all' : `Filter to rank ${idx + 1} only`}
                >
                  <span>{idx < 3 ? rankEmojis[idx] : `#${idx + 1}`}</span>
                  <span className="hidden sm:inline">{rank.cost.toFixed(2)}</span>
                  {rank.subLocationCount > 1 && (
                    <span className={`
                      text-[10px] px-1.5 py-0.5 rounded-md
                      ${isFiltered || isSelected ? 'bg-white/25' : 'bg-white/10'}
                    `}>
                      ×{rank.subLocationCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sub-location Navigator (compact design) - only in individual mode */}
          {isIndividualMode && hasMultipleSubLocations && (
            <div className="flex items-center justify-center gap-3 border-t border-white/5 pt-3 mt-2">
              <button
                onClick={handlePrevSubRegion}
                disabled={currentSubIndex === 0}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  currentSubIndex === 0 
                    ? 'text-gray-600 cursor-not-allowed bg-white/5' 
                    : 'text-white hover:scale-105'
                }`}
                style={currentSubIndex > 0 ? { 
                  background: `linear-gradient(135deg, ${COLORS[currentRank % COLORS.length].primary}, ${COLORS[currentRank % COLORS.length].secondary})`,
                  boxShadow: `0 4px 15px ${COLORS[currentRank % COLORS.length].primary}40`
                } : {}}
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                <MapPin size={14} className="text-gray-500" />
                <input
                  type="number"
                  min={1}
                  max={currentSubLocations.length}
                  value={currentSubIndex + 1}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(currentSubLocations.length, parseInt(e.target.value) || 1));
                    setCurrentSubIndex(val - 1);
                    setIsShowingAll(false);
                    onSelectRegion(currentSubLocations[val - 1], currentRank, val - 1, currentRankData.cost);
                  }}
                  className="w-12 text-center text-sm font-bold bg-transparent border-none outline-none text-white"
                />
                <span className="text-sm text-gray-500">/ {currentSubLocations.length}</span>
              </div>

              <button
                onClick={handleNextSubRegion}
                disabled={currentSubIndex >= currentSubLocations.length - 1}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  currentSubIndex >= currentSubLocations.length - 1 
                    ? 'text-gray-600 cursor-not-allowed bg-white/5' 
                    : 'text-white hover:scale-105'
                }`}
                style={currentSubIndex < currentSubLocations.length - 1 ? { 
                  background: `linear-gradient(135deg, ${COLORS[currentRank % COLORS.length].primary}, ${COLORS[currentRank % COLORS.length].secondary})`,
                  boxShadow: `0 4px 15px ${COLORS[currentRank % COLORS.length].primary}40`
                } : {}}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegionSelector;
