import { useState, useEffect, useRef } from 'react';
import { triggerSync, getSyncProgress, getAutomationLog } from '../lib/api';

const STAGES = [
  { key: 'scraping', label: 'Scraping inventory', icon: '1' },
  { key: 'syncing', label: 'Syncing to database', icon: '2' },
  { key: 'training', label: 'Training ML models', icon: '3' },
  { key: 'predicting', label: 'Generating predictions', icon: '4' },
];

function SyncDetailRow({ sync }) {
  const [open, setOpen] = useState(false);
  const hasDetails = sync.updated_details?.length > 0 || sync.removed_details?.length > 0 || sync.added_details?.length > 0;

  return (
    <>
      <tr className={`hover:bg-gray-50 ${hasDetails ? 'cursor-pointer' : ''}`} onClick={() => hasDetails && setOpen(!open)}>
        <td className="px-4 py-2">
          {hasDetails && <span className="mr-1 text-gray-400">{open ? '\u25BC' : '\u25B6'}</span>}
          {new Date(sync.timestamp).toLocaleString()}
        </td>
        <td className="px-4 py-2 text-center">{sync.total_scraped}</td>
        <td className="px-4 py-2 text-center text-green-600">+{sync.added}</td>
        <td className="px-4 py-2 text-center text-blue-600">{sync.updated}</td>
        <td className="px-4 py-2 text-center text-red-600">-{sync.removed}</td>
        <td className="px-4 py-2 text-center font-medium">{sync.total_active}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50">
            <div className="space-y-3 text-xs">
              {sync.added_details?.length > 0 && (
                <div>
                  <p className="font-semibold text-green-700 mb-1">Added ({sync.added_details.length}):</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {sync.added_details.map((v, i) => (
                      <li key={i} className="text-green-600">{v.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {sync.updated_details?.length > 0 && (
                <div>
                  <p className="font-semibold text-blue-700 mb-1">Updated ({sync.updated_details.length}):</p>
                  {sync.updated_details.map((v, i) => (
                    <div key={i} className="mb-2 p-2 bg-blue-50 rounded">
                      <p className="font-medium text-blue-800">{v.title}</p>
                      {Object.entries(v.fields || {}).map(([field, val]) => (
                        <p key={field} className="text-gray-600 ml-2">
                          <span className="font-medium">{field}:</span>{' '}
                          <span className="text-red-500 line-through">{val.old ?? 'N/A'}</span>
                          {' \u2192 '}
                          <span className="text-green-600 font-medium">{val.new}</span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {sync.removed_details?.length > 0 && (
                <div>
                  <p className="font-semibold text-red-700 mb-1">Removed ({sync.removed_details.length}):</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {sync.removed_details.map((v, i) => (
                      <li key={i} className="text-red-600">{v.title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SyncHistoryTable({ history }) {
  return (
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
            <SyncDetailRow key={i} sync={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SyncStatus({ syncStatus, onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [stage, setStage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [autoLog, setAutoLog] = useState(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const failCountRef = useRef(0);

  // Poll /sync-progress every 5s while syncing
  useEffect(() => {
    if (!syncing) return;

    failCountRef.current = 0;

    pollRef.current = setInterval(async () => {
      try {
        const res = await getSyncProgress();
        const { is_syncing, stage: s } = res.data;
        failCountRef.current = 0;

        // Server restarted mid-sync (lost state) — stage is empty, not syncing
        if (!is_syncing && !s) {
          setSyncing(false);
          setError('Sync interrupted — server may have restarted. Check sync history for results.');
          return;
        }

        setStage(s);

        if (!is_syncing && s === 'done') {
          setSyncing(false);
          setStage('done');
          onSyncComplete();
          setTimeout(() => setStage(''), 8000);
        } else if (!is_syncing && s.startsWith('error')) {
          setSyncing(false);
          setError(s);
        }
      } catch {
        failCountRef.current += 1;
        // After 10 consecutive failures (~50s), stop polling and show error
        if (failCountRef.current >= 10) {
          setSyncing(false);
          setError('Lost connection to server. The sync may still be running — check back in a minute.');
        }
      }
    }, 5000);

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
            <div className={`text-center p-3 rounded ${last.added ? 'bg-green-50' : 'bg-gray-50 opacity-50'}`}>
              <p className={`text-xs ${last.added ? 'text-green-600' : 'text-gray-400'}`}>Added</p>
              <p className={`font-semibold text-xl ${last.added ? 'text-green-700' : 'text-gray-400'}`}>{last.added}</p>
            </div>
            <div className={`text-center p-3 rounded ${last.updated ? 'bg-blue-50' : 'bg-gray-50 opacity-50'}`}>
              <p className={`text-xs ${last.updated ? 'text-blue-600' : 'text-gray-400'}`}>Updated</p>
              <p className={`font-semibold text-xl ${last.updated ? 'text-blue-700' : 'text-gray-400'}`}>{last.updated}</p>
            </div>
            <div className={`text-center p-3 rounded ${last.removed ? 'bg-red-50' : 'bg-gray-50 opacity-50'}`}>
              <p className={`text-xs ${last.removed ? 'text-red-600' : 'text-gray-400'}`}>Removed</p>
              <p className={`font-semibold text-xl ${last.removed ? 'text-red-700' : 'text-gray-400'}`}>{last.removed}</p>
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
          {autoLog.sync_history?.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">Automated Sync History:</p>
              <SyncHistoryTable history={autoLog.sync_history} />
            </div>
          ) : (
            <p className="text-gray-400 text-sm mt-2">No automated syncs yet. The scheduler runs every {autoLog.sync_interval_hours} hours.</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Sync History (All)</h3>
        {history.length > 0 ? (
          <SyncHistoryTable history={history} />
        ) : (
          <p className="text-gray-400 text-center py-8">No sync history yet.</p>
        )}
      </div>
    </div>
  );
}

export default SyncStatus;
