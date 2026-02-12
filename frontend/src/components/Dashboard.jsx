import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter,
} from 'recharts';

const COLORS = ['#BB0A30', '#333', '#666', '#999', '#CCC', '#4A90D9', '#50C878', '#FFB347'];

function StatCard({ title, value, subtitle, color = 'black' }) {
  return (
    <div className="bg-white rounded-lg shadow p-5 border-l-4" style={{ borderLeftColor: color }}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function Dashboard({ vehicles, stats, syncStatus, mlSummary }) {
  const modelDist = stats?.models
    ? Object.entries(stats.models).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    : [];

  const priceBins = [];
  if (vehicles.length) {
    const bins = { '< $20k': 0, '$20-35k': 0, '$35-50k': 0, '$50-70k': 0, '$70-100k': 0, '> $100k': 0 };
    vehicles.forEach(v => {
      const p = v.price;
      if (!p) return;
      if (p < 20000) bins['< $20k']++;
      else if (p < 35000) bins['$20-35k']++;
      else if (p < 50000) bins['$35-50k']++;
      else if (p < 70000) bins['$50-70k']++;
      else if (p < 100000) bins['$70-100k']++;
      else bins['> $100k']++;
    });
    Object.entries(bins).forEach(([range, count]) => {
      if (count > 0) priceBins.push({ range, count });
    });
  }

  // year breakdown
  const yearDist = [];
  if (vehicles.length) {
    const years = {};
    vehicles.forEach(v => { if (v.year) years[v.year] = (years[v.year] || 0) + 1; });
    Object.entries(years).sort(([a], [b]) => a - b).forEach(([year, count]) => {
      yearDist.push({ year, count });
    });
  }

  const scatter = vehicles
    .filter(v => v.mileage && v.price)
    .map(v => ({ mileage: v.mileage, price: v.price, name: v.title }));

  // best deals — vehicles where ML thinks the listed price is below market value
  const deals = vehicles
    .filter(v => v.price && v.predicted_price && v.price_difference > 0)
    .sort((a, b) => b.price_difference - a.price_difference)
    .slice(0, 5);

  const lastSync = syncStatus?.last_sync;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Vehicles"
          value={stats?.total_active || vehicles.length || 0}
          subtitle="Currently listed"
          color="#BB0A30"
        />
        <StatCard
          title="Average Price"
          value={stats?.avg_price ? `$${Math.round(stats.avg_price).toLocaleString()}` : 'N/A'}
          subtitle={stats?.price_range ? `$${stats.price_range.min?.toLocaleString()} – $${stats.price_range.max?.toLocaleString()}` : ''}
          color="#333"
        />
        <StatCard
          title="Average Mileage"
          value={stats?.avg_mileage ? `${Math.round(stats.avg_mileage).toLocaleString()} km` : 'N/A'}
          color="#4A90D9"
        />
        <StatCard
          title="ML Model"
          value={mlSummary?.best_model || 'Not Trained'}
          subtitle={mlSummary?.metrics?.[mlSummary?.best_model]?.r2_score
            ? `R² = ${mlSummary.metrics[mlSummary.best_model].r2_score}`
            : 'Run sync to train'}
          color="#50C878"
        />
      </div>

      {lastSync && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-sm text-gray-600 mb-2">Last Sync</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <span>Time: <strong>{new Date(lastSync.timestamp).toLocaleString()}</strong></span>
            <span className="text-green-600">+{lastSync.added} added</span>
            <span className="text-blue-600">{lastSync.updated} updated</span>
            <span className="text-red-600">-{lastSync.removed} removed</span>
            <span>Total active: <strong>{lastSync.total_active}</strong></span>
          </div>
        </div>
      )}

      {deals.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Top Deals (Underpriced by ML Model)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {deals.map(d => (
              <div key={d.vin} className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                <p className="text-xs text-gray-500 mt-1">{d.mileage?.toLocaleString()} km</p>
                <div className="flex justify-between items-end mt-2">
                  <span className="text-sm font-bold">${d.price?.toLocaleString()}</span>
                  <span className="text-xs text-green-700 font-medium">+${d.price_difference?.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Price Distribution</h3>
          {priceBins.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priceBins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#BB0A30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">No data available</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Vehicles by Model</h3>
          {modelDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={modelDist}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, count }) => `${name} (${count})`}
                >
                  {modelDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">No data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Year Distribution</h3>
          {yearDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearDist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4A90D9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">No data available</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Mileage vs Price</h3>
          {scatter.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="mileage" name="Mileage" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="number" dataKey="price" name="Price" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val, name) => name === 'Price' ? `$${val.toLocaleString()}` : `${val.toLocaleString()} km`} />
                <Scatter data={scatter} fill="#BB0A30" />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
