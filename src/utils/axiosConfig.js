import axios from 'axios';

const axiosInstance = axios.create();

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Rediriger vers la page de configuration si nécessaire
      if (error.response.data.requiresConfiguration) {
        window.location.href = '/configure-zoho';
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance; 