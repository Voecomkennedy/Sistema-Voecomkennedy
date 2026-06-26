import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { ReservasPage } from '@/pages/ReservasPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { FinanceiroPage } from '@/pages/FinanceiroPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'reservas', element: <ReservasPage /> },
          { path: 'operacional', element: <PlaceholderPage titulo="Operacional" fase="Fase 6" /> },
          { path: 'clientes', element: <ClientesPage /> },
          { path: 'financeiro', element: <FinanceiroPage /> },
          { path: 'documentos', element: <PlaceholderPage titulo="Documentos" fase="Fase 9" /> },
          { path: 'configuracoes', element: <PlaceholderPage titulo="Configurações" fase="Fase 10" /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
