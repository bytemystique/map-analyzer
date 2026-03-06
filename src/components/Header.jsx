import React from "react";
import {
  MapPin,
  Zap,
  Car,
  Maximize2,
  Trash2,
  Download,
  Grid3x3,
  Flame,
  Users,
  Plug,
  TrendingUp,
  Target,
  Pencil,
  Navigation,
  Home,
} from "lucide-react";

const ToolButton = ({ active, onClick, icon: Icon, label, variant = "default" }) => {
  const baseClasses = "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200";

  const variants = {
    default: active
      ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/25"
      : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5 hover:border-white/10",
    success: active
      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25"
      : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/30",
  };

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variants[variant]}`}
    >
      <Icon size={16} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
};

const Divider = () => (
  <div className="w-px h-8 bg-white/10 mx-1" />
);

const Header = ({
  drawing,
  onStartDrawing,
  onFinishDrawing,
  showCharging,
  showPetrol,
  onToggleCharging,
  onTogglePetrol,
  showAllEVStations,
  showAllPetrolStations,
  onToggleAllEVStations,
  onToggleAllPetrolStations,
  hasPolygon,
  onClear,
  onExport,
  showGrid,
  onToggleGrid,
  showHeatMap,
  onToggleHeatMap,
  showDensityLayer,
  onToggleDensityLayer,
  showSubstationsLayer,
  onToggleSubstationsLayer,
  showAdoptionLayer,
  onToggleAdoptionLayer,
  onFindOptimalLocations,
  onOpenNavigation,
  onReset,
}) => (
  <div className="fixed top-0 left-0 right-0 z-50">
    {/* Top Bar with branding and main actions */}
    <div className="glass border-b-0 rounded-none">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Kerala EV Analyzer</h1>
            <p className="text-xs text-gray-500">Infrastructure Planning Tool</p>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="flex items-center gap-2">
          {!drawing ? (
            <>
              <button
                onClick={onOpenNavigation}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-200"
              >
                <Navigation size={16} />
                <span className="hidden sm:inline">Navigate</span>
              </button>

              <button
                onClick={onStartDrawing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium text-sm shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-200"
              >
                <Pencil size={16} />
                Draw Area
              </button>

              <button
                onClick={onToggleAllEVStations}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${showAllEVStations
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-emerald-400 hover:border-emerald-500/30'
                  }`}
              >
                <Zap size={16} />
                <span className="hidden sm:inline">View EV Stations</span>
                <span className="sm:hidden">EV</span>
              </button>

              <button
                onClick={onToggleAllPetrolStations}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${showAllPetrolStations
                    ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-red-400 hover:border-red-500/30'
                  }`}
              >
                <Car size={16} />
                <span className="hidden sm:inline">View Petrol Stations</span>
                <span className="sm:hidden">Petrol</span>
              </button>
            </>
          ) : (
            <button
              onClick={onFinishDrawing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-200 animate-pulse"
            >
              <Maximize2 size={16} />
              Complete Polygon
            </button>
          )}

          {hasPolygon && (
            <>
              <button
                onClick={onFindOptimalLocations}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-200"
              >
                <Target size={16} />
                <span className="hidden sm:inline">Find Optimal</span>
              </button>

              <button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-gray-300 font-medium text-sm border border-white/10 hover:bg-white/10 hover:text-white transition-all duration-200"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Export</span>
              </button>

              <button
                onClick={onReset}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-gray-300 font-medium text-sm border border-white/10 hover:bg-white/10 hover:text-white transition-all duration-200"
                title="Return to Home"
              >
                <Home size={16} />
              </button>

              <button
                onClick={onClear}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 font-medium text-sm border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Secondary Toolbar - Layer Controls (only show when polygon exists) */}
    {hasPolygon && (
      <div
        className="absolute left-[60px] right-[400px] top-[72px] flex justify-center py-2"
        style={{
          animation: 'slideDown 0.3s ease-out',
        }}
      >
        <div className="glass rounded-2xl px-4 py-2 flex items-center gap-1 shadow-2xl border border-white/10 backdrop-blur-xl transition-all duration-300 hover:shadow-purple-500/10 hover:border-white/20">
          {/* Markers Section */}
          <div className="flex items-center gap-1 px-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider mr-2 hidden xl:inline">Markers</span>
            <ToolButton
              active={showCharging}
              onClick={onToggleCharging}
              icon={Zap}
              label="EV Stations"
              variant="success"
            />
            <ToolButton
              active={showPetrol}
              onClick={onTogglePetrol}
              icon={Car}
              label="Petrol"
            />
          </div>

          <Divider />

          {/* Analysis Layers */}
          <div className="flex items-center gap-1 px-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider mr-2 hidden xl:inline">Layers</span>
            <ToolButton
              active={showDensityLayer}
              onClick={onToggleDensityLayer}
              icon={Users}
              label="Density"
            />
            <ToolButton
              active={showSubstationsLayer}
              onClick={onToggleSubstationsLayer}
              icon={Plug}
              label="Substations"
            />
            <ToolButton
              active={showAdoptionLayer}
              onClick={onToggleAdoptionLayer}
              icon={TrendingUp}
              label="Adoption"
            />
          </div>

          <Divider />

          {/* Visualization */}
          <div className="flex items-center gap-1 px-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider mr-2 hidden xl:inline">View</span>
            <ToolButton
              active={showGrid}
              onClick={onToggleGrid}
              icon={Grid3x3}
              label="Grid"
            />
            <ToolButton
              active={showHeatMap}
              onClick={onToggleHeatMap}
              icon={Flame}
              label="Heat Map"
            />
          </div>
        </div>
      </div>
    )}
  </div>
);

export default Header;
