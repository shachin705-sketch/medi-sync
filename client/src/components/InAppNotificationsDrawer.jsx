import React, { useState } from 'react';
import {
  X, Bell, CheckCheck, Zap, Lock, Truck, CheckCircle2,
  AlertTriangle, Building, Clock, Info
} from 'lucide-react';

export default function InAppNotificationsDrawer({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
  onNotificationClick
}) {
  const [filterCategory, setFilterCategory] = useState('all');

  if (!isOpen) return null;

  const filtered = notifications.filter((n) => {
    if (filterCategory === 'all') return true;
    return n.category === filterCategory;
  });

  const unreadCount = notifications.filter((n) => !n.read_status).length;

  const getCategoryIcon = (category, severity) => {
    switch (category) {
      case 'reservation':
        return <Lock size={15} className="text-blue-600" />;
      case 'approval':
        return <Zap size={15} className="text-teal-600" />;
      case 'dispatch':
        return <Truck size={15} className="text-purple-600" />;
      case 'receipt':
        return <CheckCircle2 size={15} className="text-emerald-600" />;
      case 'escalation':
        return <Building size={15} className="text-amber-600" />;
      default:
        return severity === 'critical' ? (
          <AlertTriangle size={15} className="text-red-600" />
        ) : (
          <Info size={15} className="text-slate-600" />
        );
    }
  };

  const getSeverityBadgeClass = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'success':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Bell size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-600 px-2 py-0.2 text-[10px] font-bold text-white">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Live automated redistribution events &amp; supply alerts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-semibold text-[#0B6E6E] hover:underline flex items-center gap-1 p-1.5 cursor-pointer"
                title="Mark all notifications as read"
              >
                <CheckCheck size={14} />
                <span className="hidden sm:inline">Mark read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0 bg-slate-50/60">
          {[
            { id: 'all', label: 'All' },
            { id: 'reservation', label: 'Reservations' },
            { id: 'approval', label: 'Approvals' },
            { id: 'dispatch', label: 'Dispatches' },
            { id: 'receipt', label: 'Receipts' },
            { id: 'escalation', label: 'Escalations' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                filterCategory === cat.id
                  ? 'bg-slate-900 text-white shadow-2xs font-bold'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs space-y-2">
              <Bell size={28} className="mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">No notifications in this category.</p>
              <p className="text-[11px]">System events and stock lifecycle milestones will appear here.</p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => onNotificationClick && onNotificationClick(item)}
                className={`p-3 rounded-xl transition cursor-pointer my-1 ${
                  item.read_status
                    ? 'hover:bg-slate-50/80 bg-white'
                    : 'bg-teal-50/40 hover:bg-teal-50/70 border-l-4 border-l-[#0B6E6E]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs flex-shrink-0">
                    {getCategoryIcon(item.category, item.severity)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.title}
                      </h4>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase flex-shrink-0 ${getSeverityBadgeClass(item.severity)}`}>
                        {item.severity}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {item.message}
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                      <span className="font-medium text-slate-500">
                        {item.phc_name ? `${item.phc_name} (${item.phc_district || 'TN'})` : 'Network Wide'}
                      </span>
                      <span className="font-mono">
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 text-center text-[10px] text-slate-400 flex-shrink-0 bg-slate-50">
          MediAlert AI Autonomous Medical Logistics Engine &bull; TN-DPH Network
        </div>
      </div>
    </div>
  );
}
