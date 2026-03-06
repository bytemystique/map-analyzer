import React from 'react';

const StatCard = ({ title, icon: Icon, color, children, footer }) => {
  const colorMap = {
    green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    orange: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  };
  
  const colors = colorMap[color] || colorMap.purple;

  return (
    <div className={`card ${colors.border}`}>
      <div className="card-header">
        <div className={`card-icon ${colors.bg}`}>
          <Icon size={18} className={colors.text} />
        </div>
        <h3 className="card-title">{title}</h3>
      </div>
      {children}
      {footer && (
        <div className="mt-4 pt-3 border-t border-white/5 text-xs text-gray-500">
          {footer}
        </div>
      )}
    </div>
  );
};

export default StatCard;