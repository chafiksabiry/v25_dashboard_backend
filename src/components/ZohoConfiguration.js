import React, { useState } from 'react';

export const ZohoConfiguration = () => {
  const [credentials, setCredentials] = useState({
    refreshToken: '',
    clientId: '',
    clientSecret: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/zoho/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      // Stocker le token d'accès
      localStorage.setItem('zohoToken', data.accessToken);
      setSuccess(true);

      // Rediriger vers le dashboard après 2 secondes
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Configuration Zoho CRM</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          Configuration réussie ! Redirection...
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Refresh Token
          </label>
          <input
            type="text"
            value={credentials.refreshToken}
            onChange={(e) => setCredentials({...credentials, refreshToken: e.target.value})}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Client ID
          </label>
          <input
            type="text"
            value={credentials.clientId}
            onChange={(e) => setCredentials({...credentials, clientId: e.target.value})}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Client Secret
          </label>
          <input
            type="password"
            value={credentials.clientSecret}
            onChange={(e) => setCredentials({...credentials, clientSecret: e.target.value})}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? 'Configuration...' : 'Configurer'}
        </button>
      </form>
    </div>
  );
}; 