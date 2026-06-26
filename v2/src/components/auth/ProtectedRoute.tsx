import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const { loading, initialized, session, profile } = useAuthStore()

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!profile || !profile.ativo) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
