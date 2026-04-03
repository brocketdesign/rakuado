import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export function useAuth() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const res = await api.get('/user/me')
      return res.data
    },
    retry: false,
    staleTime: 60000,
  })

  const login = async (email) => {
    const res = await api.post('/user/login', { email })
    return res.data
  }

  const logout = async () => {
    await api.get('/user/logout')
    window.location.href = '/login'
  }

  const isAdmin = useQuery({
    queryKey: ['is-admin'],
    queryFn: async () => {
      const res = await api.get('/user/is-admin')
      return res.data?.isAdmin || false
    },
    enabled: !!data,
    retry: false,
  })

  return {
    user: error ? null : data,
    isLoading,
    isAdmin: isAdmin.data || false,
    login,
    logout,
    refetch,
  }
}
