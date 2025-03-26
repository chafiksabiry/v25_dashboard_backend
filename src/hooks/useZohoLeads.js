import { useState, useEffect } from 'react';

export const useZohoLeads = () => {
  const [leads, setLeads] = useState([]);
  const [pipelineLeads, setPipelineLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('zohoToken') || 'temp_access_token_' + Date.now();
      
      const response = await fetch('/api/zoho/leads', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        if (data.requiresConfiguration) {
          // Rediriger vers la page de configuration
          window.location.href = '/configure-zoho';
          return;
        }
        throw new Error(data.message);
      }

      setLeads(data.data);
    } catch (err) {
      setError(err.message);
      console.error('Erreur lors de la récupération des leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipelineLeads = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('zohoToken') || 'temp_access_token_' + Date.now();
      
      const response = await fetch('/api/zoho/leads/pipeline', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        if (data.requiresConfiguration) {
          window.location.href = '/configure-zoho';
          return;
        }
        throw new Error(data.message);
      }

      setPipelineLeads(data.data);
    } catch (err) {
      setError(err.message);
      console.error('Erreur lors de la récupération des leads du pipeline:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    leads,
    pipelineLeads,
    loading,
    error,
    fetchLeads,
    fetchPipelineLeads
  };
}; 