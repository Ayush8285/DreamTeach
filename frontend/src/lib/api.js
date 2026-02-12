import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
});

export const getVehicles = (includeRemoved = false) =>
  api.get(`/vehicles?include_removed=${includeRemoved}`);

export const getVehicle = (id) => api.get(`/vehicles/${id}`);

export const searchVehicles = (params) => api.get('/vehicles/search', { params });

export const getVehicleStats = () => api.get('/vehicles/stats');

export const getVehiclePriceHistory = (id) => api.get(`/vehicles/${id}/price-history`);

export const predictVehiclePrice = (id) => api.get(`/vehicles/${id}/predict`);

export const getAllPredictions = () => api.get('/ml/predictions');

export const getModelSummary = () => api.get('/ml/summary');

export const getSyncStatus = () => api.get('/sync-status');

export const triggerSync = () => api.post('/trigger-sync');

export const getSyncProgress = () => api.get('/sync-progress');

export const getAutomationLog = () => api.get('/automation-log');

export const getHealth = () => api.get('/health');

export default api;
