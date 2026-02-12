import { useState, useEffect, useRef, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import VehicleTable from './components/VehicleTable';
import SyncStatus from './components/SyncStatus';
import SearchFilter from './components/SearchFilter';
import MLMetrics from './components/MLMetrics';
import { getVehicles, getVehicleStats, getSyncStatus, getModelSummary } from './lib/api';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'predictions', label: 'ML Predictions' },
  { id: 'sync', label: 'Sync Status' },
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [mlSummary, setMlSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchActive = useRef(false);
  const initialLoad = useRef(true);

  const fetchData = useCallback(async () => {
    if (initialLoad.current) setLoading(true);
    setError(null);
    try {
      const [vehiclesRes, statsRes, syncRes, mlRes] = await Promise.allSettled([
        getVehicles(),
        getVehicleStats(),
        getSyncStatus(),
        getModelSummary(),
      ]);

      // skip vehicle overwrite while a search filter is active
      if (vehiclesRes.status === 'fulfilled' && !searchActive.current) {
        setVehicles(vehiclesRes.value.data.vehicles || []);
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (syncRes.status === 'fulfilled') setSyncStatus(syncRes.value.data);
      if (mlRes.status === 'fulfilled') setMlSummary(mlRes.value.data);
    } catch (err) {
      setError('Failed to connect to backend API. Make sure the server is running.');
      console.error(err);
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'vehicles') searchActive.current = false;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-black text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Audi West Island</h1>
              <p className="text-gray-400 text-sm">Inventory Intelligence Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                error ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'
              }`}>
                {error ? 'Disconnected' : 'Connected'}
              </span>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-audi-red text-white rounded hover:bg-red-700 transition text-sm"
              >
                Refresh
              </button>
            </div>
          </div>

          <nav className="flex gap-1 mt-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`px-4 py-2 rounded-t text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-gray-50 text-black'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Connection Error:</strong> {error}
          </div>
        )}

        {loading && !vehicles.length ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-audi-red mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading data...</p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <Dashboard vehicles={vehicles} stats={stats} syncStatus={syncStatus} mlSummary={mlSummary} />
            )}
            {activeTab === 'vehicles' && (
              <>
                <SearchFilter
                  onResults={(results) => { searchActive.current = true; setVehicles(results); }}
                  onReset={() => { searchActive.current = false; fetchData(); }}
                />
                <VehicleTable vehicles={vehicles} />
              </>
            )}
            {activeTab === 'predictions' && (
              <MLMetrics vehicles={vehicles} mlSummary={mlSummary} />
            )}
            {activeTab === 'sync' && (
              <SyncStatus syncStatus={syncStatus} onSyncComplete={fetchData} />
            )}
          </>
        )}
      </main>

      <footer className="bg-black text-gray-500 text-center py-4 text-xs mt-8">
        Made by Ayush &mdash; Audi West Island Inventory System v1.0.0
      </footer>
    </div>
  );
}

export default App;
