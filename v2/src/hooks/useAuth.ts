import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  const { user, session, profile, loading, initialized } = useAuthStore()
  return {
    user,
    session,
    profile,
    loading,
    initialized,
    isAuthenticated: !!session,
  }
}
