import React, { useState } from "react";
import { X, MapPin, Loader2, Target, Zap } from "lucide-react";

const OptimalLocationModal = ({ isOpen, onClose, onFindLocations }) => {
  const [stationCount, setStationCount] = useState(3);
  const [isClosing, setIsClosing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleClose = () => {
    if (isProcessing) return; // Prevent closing during processing
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (stationCount > 0 && stationCount <= 50) {
      setIsProcessing(true);
      setProgress(0);

      // Use setTimeout to allow UI to update
      setTimeout(async () => {
        try {
          await onFindLocations(stationCount, (progressValue) => {
            setProgress(progressValue);
          });
          handleClose();
        } catch (error) {
          console.error("Error finding locations:", error);
          alert(
            "An error occurred while finding optimal locations. Please try again."
          );
        } finally {
          setIsProcessing(false);
          setProgress(0);
        }
      }, 100);
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center transition-all duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      style={{ zIndex: 9999 }}
      onClick={!isProcessing ? handleClose : undefined}
    >
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md"></div>

      {/* Modal */}
      <div
        className={`relative glass rounded-2xl shadow-2xl p-6 w-full max-w-md transform transition-all duration-200 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Target size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Find Optimal Locations
              </h2>
              <p className="text-sm text-gray-400">
                for EV Charging Stations
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label
              htmlFor="stationCount"
              className="block text-sm font-medium text-gray-300 mb-3"
            >
              Number of Charging Stations
            </label>
            <input
              id="stationCount"
              type="number"
              min="1"
              max="50"
              value={stationCount}
              onChange={(e) => setStationCount(parseInt(e.target.value) || 1)}
              disabled={isProcessing}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-lg font-semibold text-white placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Enter number (1-50)"
            />
            <p className="mt-2 text-xs text-gray-500">
              The algorithm will find the most favorable locations based on cost analysis
            </p>
          </div>

          {/* Info Box */}
          <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Zap size={18} className="text-purple-400 mt-0.5 shrink-0" />
              <p className="text-sm text-gray-300">
                <strong className="text-purple-400">How it works:</strong> The system analyzes grid cells
                considering charging proximity, population density, substations,
                and adoption likelihood to find optimal placements.
              </p>
            </div>
          </div>

          {isProcessing && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="animate-spin text-emerald-400" size={20} />
                <span className="text-sm font-medium text-emerald-400">
                  Finding optimal locations... {Math.round(progress)}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This may take a moment for large areas...
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 hover:text-white transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Processing...
                </>
              ) : (
                <>
                  <Target size={18} />
                  Find Locations
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OptimalLocationModal;
