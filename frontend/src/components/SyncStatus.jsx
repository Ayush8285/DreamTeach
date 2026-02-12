import { useState, useEffect, useRef } from 'react';
import { triggerSync, getSyncProgress, getAutomationLog } from '../lib/api';

const STAGES = [
  { key: 'scraping', label: 'Scraping inventory', icon: '1' },
  { key: 'syncing', label: 'Syncing to database', icon: '2' },
  { key: 'training', label: 'Training ML models', icon: '3' },
  { key: 'predicting', label: 'Generating predictions', icon: '4' },
];

function SyncStatus({ syncStatus, onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [stage, setStage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [autoLog, setAutoLog] = useState(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  // Poll /sync-progress every 3s while syncing
  useEffect(() => {
    if (!syncing) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await getSyncProgress();
        const { is_syncing, stage: s } = res.data;
        setStage(s);

        if (!is_syncing && s === 'done') {
          setSyncing(false);
          setStage('done');
          onSyncComplete();
        } else if (!is_syncing && s.startsWith('error')) {
          setSyncing(false);
          setError(s);
        }
      } catch {
        // ignore poll failures
      }
    }, 3000);

    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [syncing, onSyncComplete]);

  const handleSync = async () => {
    setSyncing(true);
    setStage('scraping');
    setElapsed(0);
    setError('');
    try {
      await triggerSync();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
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

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const stageIdx = STAGES.findIndex(s => s.key === stage);
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

        {/* Progress tracker */}
        {(syncing || stage === 'done') && (
          <div className="mb-5 p-4 bg-gray-50 rounded-lg border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                {syncing ? 'Pipeline running...' : 'Pipeline complete!'}
              </span>
              <span className="text-xs font-mono text-gray-500">{formatTime(elapsed)}</span>
            </div>

            <div className="flex items-center gap-1 mb-3">
              {STAGES.map((s, i) => {
                const isDone = stageIdx > i || stage === 'done';
                const isActive = stageIdx === i && syncing;
                return (
                  <div key={s.key} className="flex items-center flex-1">
                    <div className={`w-full h-2 rounded-full transition-all duration-500 ${
                      isDone ? 'bg-green-500' : isActive ? 'bg-yellow-400 animate-pulse' : 'bg-gray-200'
                    }`} />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {STAGES.map((s, i) => {
                const isDone = stageIdx > i || stage === 'done';
                const isActive = stageIdx === i && syncing;
                return (
                  <div key={s.key} className="text-center">
                    <div className={`w-7 h-7 rounded-full mx-auto mb-1 flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      isDone ? 'bg-green-500 text-white' : isActive ? 'bg-yellow-400 text-yellow-900 animate-pulse' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isDone ? '\u2713' : s.icon}
                    </div>
                    <p className={`text-xs ${isDone ? 'text-green-700 font-medium' : isActive ? 'text-yellow-700 font-medium' : 'text-gray-400'}`}>
                      {s.label}
                    </p>
                  </div>
                );
              })}
            </div>

            {stage === 'done' && (
              <div className="mt-3 p-2 bg-green-50 rounded text-sm text-green-700 text-center font-medium">
                Sync complete! Data has been refreshed.
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
        )}

        {last ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          <h3 className="font-semibold text-gray-700 mb-4">Automation Log</h3>
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
          {autoLog.sync_history?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">Automated Sync History:</p>
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
                    {autoLog.sync_history.map((s, i) => (
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
