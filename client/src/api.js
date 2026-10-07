import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'
const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const refreshToken = localStorage.getItem('refreshToken')

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.url?.includes('/api/auth/refresh') ||
      !refreshToken
    ) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const response = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken })
      localStorage.setItem('accessToken', response.data.accessToken)
      localStorage.setItem('refreshToken', response.data.refreshToken)
      originalRequest.headers.Authorization = `Bearer ${response.data.accessToken}`
      return api(originalRequest)
    } catch (refreshError) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      window.location.assign('/login')
      return Promise.reject(refreshError)
    }
  },
)

export default api
