import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export function useAdvertiser() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['advertiser-profile'],
    queryFn: async () => {
      const res = await api.get('/api/advertiser/profile')
      return res.data.advertiser
    },
    retry: false,
  })

  return {
    advertiser: data ?? null,
    hasProfile: !!data,
    isLoading,
    error,
    refetch,
  }
}
