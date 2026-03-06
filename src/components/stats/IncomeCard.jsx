import React from 'react';
import { DollarSign } from 'lucide-react';

const IncomeCard = ({ avgIncome }) => (
  <div className="card border-yellow-500/20">
    <div className="card-header">
      <div className="card-icon bg-yellow-500/10">
        <DollarSign size={18} className="text-yellow-400" />
      </div>
      <h3 className="card-title">Average Income</h3>
    </div>
    <p className="stat-value text-yellow-400">₹{avgIncome.toLocaleString()}<span className="text-sm text-gray-500 font-normal">/month</span></p>
    <div className="mt-4 pt-3 border-t border-white/5 text-xs text-gray-500">
      District per capita NSDP (2024): ₹{(avgIncome * 12).toLocaleString()}/year
    </div>
  </div>
);

export default IncomeCard;