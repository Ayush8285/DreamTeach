import { useState } from 'react';
import { triggerSync, getAutomationLog } from '../lib/api';

function SyncStatus({ syncStatus, onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [autoLog, setAutoLog] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setMsg('Sync pipeline started... This may take a few minutes.');
    try {
      await triggerSync();
      setMsg('Sync started in background. Refreshing in 30s...');
      setTimeout(() => {
        onSyncComplete();
        setSyncing(false);
        setMsg('Sync complete! Data refreshed.');
      }, 30000);
    } catch (err) {
      setMsg(`Sync error: ${err.response?.data?.detail || err.message}`);
      setSyncing(false);
    }
  };

  const loadAutoLog = async () => {
    try {
      const res = await getAutomationLog();
      setAutoLog(res.data);
    } catch (err) {
      console.error('Failed to load automation log:', err);
    }
  };

  const last = syncStatus?.last_sync;
  const history = syncStatus?.history || [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Sync Control</h3>
          <div className="flex gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="px-4 py-2 bg-audi-red text-white rounded hover:bg-red-700 transition text-sm disabled:opacity-50">
              {syncing ? 'Syncing...' : 'Trigger Manual Sync'}
            </button>
            <button onClick={loadAutoLog}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition text-sm">
              Automation Log
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded text-sm ${syncing ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
            {msg}
          </div>
        )}

        {last ? (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-xs text-gray-500">Last Sync</p>
              <p className="font-semibold text-sm">{new Date(last.timestamp).toLocaleString()}</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded">
              <p className="text-xs text-green-600">Added</p>
              <p className="font-semibold text-xl text-green-700">{last.added}</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded">
              <p className="text-xs text-blue-600">Updated</p>
              <p className="font-semibold text-xl text-blue-700">{last.updated}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded">
              <p className="text-xs text-red-600">Removed</p>
              <p className="font-semibold text-xl text-red-700">{last.removed}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-xs text-gray-500">Total Active</p>
              <p className="font-semibold text-xl">{last.total_active}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 mt-4">No sync yet. Click "Trigger Manual Sync" to start.</p>
        )}
      </div>

      {autoLog && (
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Automation Config</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-gray-50 rounded">
              <p className="text-xs text-gray-500">Scheduler</p>
              <p className={`font-semibold ${autoLog.scheduler_running ? 'text-green-600' : 'text-red-600'}`}>
                {autoLog.scheduler_running ? 'Running' : 'Stopped'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <p className="text-xs text-gray-500">Interval</p>
              <p className="font-semibold">Every {autoLog.sync_interval_hours} hours</p>
            </div>
          </div>
          {autoLog.configured_jobs?.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-600 mb-2">Scheduled Jobs:</p>
              {autoLog.configured_jobs.map((job, i) => (
                <div key={i} className="p-2 bg-blue-50 rounded text-sm mb-1">
                  <span className="font-medium">{job.name}</span> — Next: {job.next_run}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Sync History</h3>
        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Timestamp</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Scraped</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-green-600">Added</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-blue-600">Updated</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-red-600">Removed</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{new Date(s.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">{s.total_scraped}</td>
                    <td className="px-4 py-2 text-center text-green-600">+{s.added}</td>
                    <td className="px-4 py-2 text-center text-blue-600">{s.updated}</td>
                    <td className="px-4 py-2 text-center text-red-600">-{s.removed}</td>
                    <td className="px-4 py-2 text-center font-medium">{s.total_active}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No sync history yet.</p>
        )}
      </div>
    </div>
  );
}

export default SyncStatus;
