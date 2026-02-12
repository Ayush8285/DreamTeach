import { useState, useEffect } from 'react';

function getDealTag(diff) {
  if (diff == null) return null;
  if (diff > 2000) return { label: 'Great Deal', cls: 'bg-green-100 text-green-800' };
  if (diff > 0) return { label: 'Good Value', cls: 'bg-emerald-50 text-emerald-700' };
  if (diff > -2000) return { label: 'Fair', cls: 'bg-gray-100 text-gray-600' };
  return { label: 'Overpriced', cls: 'bg-red-100 text-red-700' };
}

function VehicleTable({ vehicles }) {
  const [sortField, setSortField] = useState('price');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Reset to page 1 when vehicles data changes
  useEffect(() => setPage(1), [vehicles]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sorted = [...vehicles].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const totalPages = Math.ceil(sorted.length / perPage);
  const rows = sorted.slice((page - 1) * perPage, page * perPage);

  const columns = [
    { key: 'title', label: 'Vehicle', w: 'min-w-[240px]' },
    { key: 'year', label: 'Year' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { key: 'price', label: 'Price' },
    { key: 'predicted_price', label: 'Predicted' },
    { key: 'price_difference', label: 'Deal' },
    { key: 'mileage', label: 'Mileage' },
    { key: 'body_style', label: 'Body' },
  ];

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">
          Inventory ({vehicles.length} vehicles)
        </h3>
        <span className="text-xs text-gray-400">Click headers to sort</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 ${col.w || ''}`}
                >
                  {col.label}
                  <span className="ml-1 text-gray-400">
                    {sortField === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((v, idx) => {
              const deal = getDealTag(v.price_difference);
              return (
                <tr key={v.vin || idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {v.listing_url ? (
                      <a href={v.listing_url} target="_blank" rel="noopener noreferrer"
                        className="font-medium text-gray-900 hover:text-audi-red truncate block max-w-xs">
                        {v.title || 'N/A'}
                      </a>
                    ) : (
                      <span className="font-medium text-gray-900 truncate block max-w-xs">{v.title || 'N/A'}</span>
                    )}
                    <span className="text-xs text-gray-400">VIN: {v.vin || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{v.year || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{v.make || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{v.model || '-'}</td>
                  <td className="px-4 py-3 font-semibold">{v.price ? `$${v.price.toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-3 text-blue-600">
                    {v.predicted_price ? `$${v.predicted_price.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {deal ? (
                      <>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${deal.cls}`}>
                          {deal.label}
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {v.price_difference > 0 ? '+' : ''}{v.price_difference?.toLocaleString()} $
                        </p>
                      </>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {v.mileage ? `${v.mileage.toLocaleString()} km` : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{v.body_style || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {!vehicles.length && (
        <div className="text-center py-12 text-gray-400">
          No vehicles found. Run a sync to populate data.
        </div>
      )}
    </div>
  );
}

export default VehicleTable;
