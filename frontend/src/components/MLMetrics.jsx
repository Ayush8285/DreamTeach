import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine,
} from 'recharts';

function MLMetrics({ vehicles, mlSummary }) {
  const models = mlSummary?.metrics || {};
  const importance = mlSummary?.feature_importance || {};

  const comparison = Object.entries(models)
    .filter(([_, m]) => !m.error)
    .map(([name, m]) => ({ name, r2: m.r2_score }));

  const importanceData = Object.entries(importance)
    .slice(0, 10)
    .map(([feat, val]) => ({
      feature: feat.replace('_encoded', '').replace('_', ' '),
      importance: Math.round(val * 10000) / 100,
    }));

  const predictions = vehicles
    .filter(v => v.price && v.predicted_price)
    .map(v => ({ actual: v.price, predicted: v.predicted_price, name: v.title }));

  const maxPrice = predictions.length
    ? Math.max(...predictions.map(d => Math.max(d.actual, d.predicted)))
    : 1;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 text-sm mb-1">How predictions work</h4>
        <p className="text-sm text-blue-700">
          We train multiple ML models on the current inventory data — using features like year, mileage,
          model, and trim — then pick the best performer by R² score. Each vehicle gets a "predicted price"
          based on what the model thinks it should cost. If the predicted price is higher than the listed price,
          it might be a good deal.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Model Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-green-600">Best Model</p>
            <p className="text-xl font-bold text-green-800">{mlSummary?.best_model || 'Not Trained'}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-600">Training Samples</p>
            <p className="text-xl font-bold text-blue-800">{vehicles.length || 0}</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xs text-purple-600">Features Used</p>
            <p className="text-xl font-bold text-purple-800">{mlSummary?.features?.length || 0}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Model Comparison</h3>
        {Object.keys(models).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Model</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">MAE ($)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">RMSE ($)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">R²</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">CV R² (mean ± std)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(models).map(([name, m]) => (
                  <tr key={name} className={`hover:bg-gray-50 ${name === mlSummary?.best_model ? 'bg-green-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      {name}
                      {name === mlSummary?.best_model && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Best</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">{m.mae ? `$${m.mae.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3 text-center">{m.rmse ? `$${m.rmse.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3 text-center font-semibold">
                      <span className={m.r2_score > 0.7 ? 'text-green-600' : m.r2_score > 0.4 ? 'text-yellow-600' : 'text-red-600'}>
                        {m.r2_score ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.cv_r2_mean != null ? `${m.cv_r2_mean} ± ${m.cv_r2_std}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.error
                        ? <span className="text-red-500 text-xs">Error</span>
                        : <span className="text-green-500 text-xs">Trained</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No models trained yet. Run a sync first.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Actual vs Predicted</h3>
          {predictions.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="actual" name="Actual" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="number" dataKey="predicted" name="Predicted" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                <ReferenceLine
                  segment={[{ x: 0, y: 0 }, { x: maxPrice, y: maxPrice }]}
                  stroke="#999"
                  strokeDasharray="5 5"
                  label="Perfect"
                />
                <Scatter data={predictions} fill="#BB0A30" />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">No predictions yet</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Feature Importance</h3>
          {importanceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={importanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="feature" width={100} tick={{ fontSize: 12 }} />
                <Tooltip formatter={v => `${v}%`} />
                <Bar dataKey="importance" fill="#333" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">No data</p>
          )}
        </div>
      </div>

      {comparison.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">R² Score Comparison</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="r2" name="R² Score" fill="#BB0A30" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default MLMetrics;
