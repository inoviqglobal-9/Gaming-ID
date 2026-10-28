import React from 'react';

export const StatCard = ({ title, value, subtext, icon: Icon, badge, color = 'blue' }) => {
  const colorMap = {
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    green: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
  };

  return (
    <div className="relative overflow-hidden bg-[#111827] border border-[#1F293D] rounded-xl p-5 hover:border-blue-500/40 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
          <h4 className="mt-2 text-2xl font-bold text-white tracking-tight">{value}</h4>
          {subtext && <p className="mt-1 text-xs text-gray-400">{subtext}</p>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl border ${colorMap[color] || colorMap.blue}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      {badge && (
        <div className="mt-3 pt-3 border-t border-[#1F293D]/60 flex items-center justify-between text-xs text-gray-400">
          <span>{badge}</span>
        </div>
      )}
    </div>
  );
};
