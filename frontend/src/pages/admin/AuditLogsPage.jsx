import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Search, Filter, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { auditService } from '../../services/api';

export const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await auditService.getLogs({
        page,
        limit: pagination.limit,
        search,
        action: actionFilter,
      });
      if (res.success) {
        setLogs(res.logs);
        setPagination(res.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, search, actionFilter]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Security & Compliance Audit Trail</h1>
          <p className="text-xs text-gray-400 mt-1">
            Immutable log of all administrative actions, logins, suspensions, and balance changes.
          </p>
        </div>

        <button
          onClick={() => fetchLogs(pagination.page)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111827] border border-[#1F293D] text-gray-300 hover:text-white text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action or user..."
            className="w-full bg-[#0B0F19] border border-[#1F293D] rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Filter className="w-3.5 h-3.5" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-[#0B0F19] border border-[#1F293D] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Actions</option>
            <option value="USER_LOGIN">User Logins</option>
            <option value="FAILED_LOGIN_ATTEMPT">Failed Logins</option>
            <option value="CLIENT_CREATED">Client Created</option>
            <option value="PAYIN_CONFIRMED_CREDITED">PayIn Confirmed</option>
            <option value="PAYOUT_COMPLETED">Payout Completed</option>
            <option value="CLIENT_STATUS_SUSPENDED">Suspension</option>
            <option value="ADMIN_BOOTSTRAP">Admin Bootstrap</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111827] border border-[#1F293D] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0E1524] text-gray-400 border-b border-[#1F293D] uppercase text-[10px] tracking-wider">
                <th className="p-4">Timestamp</th>
                <th className="p-4">Action</th>
                <th className="p-4">Actor</th>
                <th className="p-4">Target User</th>
                <th className="p-4">IP Address</th>
                <th className="p-4">Safe Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F293D] font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-400 font-sans">Loading audit records...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500 font-sans">No audit logs found.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-[#151D2F]">
                    <td className="p-4 text-gray-400 font-sans">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-blue-600/10 text-blue-400 border border-blue-500/20 font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-white font-semibold">{log.performedByUsername}</td>
                    <td className="p-4 text-gray-300">{log.targetUsername || '-'}</td>
                    <td className="p-4 text-gray-500">{log.ipAddress || '127.0.0.1'}</td>
                    <td className="p-4 text-gray-400 font-sans max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-[#0E1524] border-t border-[#1F293D] px-6 py-3 flex items-center justify-between text-xs text-gray-400">
          <span>Total {pagination.total} audit entries recorded</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchLogs(pagination.page - 1)}
              className="p-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white">Page {pagination.page} of {pagination.totalPages}</span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchLogs(pagination.page + 1)}
              className="p-1.5 rounded-lg bg-[#111827] border border-[#1F293D] text-gray-300 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
