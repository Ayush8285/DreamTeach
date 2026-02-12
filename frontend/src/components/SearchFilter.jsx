import { useState } from 'react';
import { searchVehicles } from '../lib/api';

function SearchFilter({ onResults, onReset }) {
  const [filters, setFilters] = useState({
    make: '', model: '', year_min: '', year_max: '',
    price_min: '', price_max: '', fuel_type: '', transmission: '',
  });
  const [searching, setSearching] = useState(false);

  const update = (e) => setFilters({ ...filters, [e.target.name]: e.target.value });

  const search = async (e) => {
    e.preventDefault();
    setSearching(true);
    try {
      const params = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v) params[k] = v;
      }
      const res = await searchVehicles(params);
      onResults(res.data.vehicles || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const reset = () => {
    setFilters({
      make: '', model: '', year_min: '', year_max: '',
      price_min: '', price_max: '', fuel_type: '', transmission: '',
    });
    onReset();
  };

  const inputCls = 'border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-audi-red focus:outline-none';

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h3 className="font-semibold text-gray-700 mb-3">Search & Filter</h3>
      <form onSubmit={search} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input name="make" value={filters.make} onChange={update} placeholder="Make (e.g. Audi)" className={inputCls} />
        <input name="model" value={filters.model} onChange={update} placeholder="Model (e.g. Q5)" className={inputCls} />
        <input name="year_min" type="number" value={filters.year_min} onChange={update} placeholder="Year from" className={inputCls} />
        <input name="year_max" type="number" value={filters.year_max} onChange={update} placeholder="Year to" className={inputCls} />
        <input name="price_min" type="number" value={filters.price_min} onChange={update} placeholder="Min price" className={inputCls} />
        <input name="price_max" type="number" value={filters.price_max} onChange={update} placeholder="Max price" className={inputCls} />
        <select name="fuel_type" value={filters.fuel_type} onChange={update} className={inputCls}>
          <option value="">All Fuel Types</option>
          <option value="Essence">Gasoline</option>
          <option value="Diesel">Diesel</option>
          <option value="Électrique">Electric</option>
          <option value="Hybride">Hybrid</option>
        </select>
        <select name="transmission" value={filters.transmission} onChange={update} className={inputCls}>
          <option value="">All Transmissions</option>
          <option value="Automatique">Automatic</option>
          <option value="Manuelle">Manual</option>
        </select>
        <div className="col-span-2 md:col-span-4 flex gap-2">
          <button type="submit" disabled={searching}
            className="px-4 py-2 bg-audi-red text-white rounded hover:bg-red-700 transition text-sm disabled:opacity-50">
            {searching ? 'Searching...' : 'Search'}
          </button>
          <button type="button" onClick={reset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition text-sm">
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

export default SearchFilter;
