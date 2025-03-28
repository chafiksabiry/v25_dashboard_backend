import React, { useEffect } from 'react';
import { useZohoLeads } from '../hooks/useZohoLeads';

export const LeadManagement = () => {
  const { leads, pipelineLeads, loading, error, fetchLeads, fetchPipelineLeads } = useZohoLeads();

  useEffect(() => {
    fetchLeads();
    fetchPipelineLeads();
  }, []);

  if (loading) {
    return <div className="text-center p-4">Chargement...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        Erreur: {error}
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Gestion des Leads</h2>
      
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-3">Leads du Pipeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelineLeads.map((lead) => (
            <div key={lead.id} className="bg-white p-4 rounded-lg shadow">
              <h4 className="font-bold">{lead.Deal_Name}</h4>
              <p className="text-gray-600">{lead.Stage}</p>
              <p className="text-gray-600">{lead.Amount} €</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-3">Tous les Leads</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map((lead) => (
            <div key={lead.id} className="bg-white p-4 rounded-lg shadow">
              <h4 className="font-bold">{lead.Deal_Name}</h4>
              <p className="text-gray-600">{lead.Email}</p>
              <p className="text-gray-600">{lead.Phone}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 