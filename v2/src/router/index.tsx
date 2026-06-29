import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { ReservasPage } from '@/pages/ReservasPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { FinanceiroPage } from '@/pages/FinanceiroPage'
import { OperacionalPage } from '@/pages/OperacionalPage'
import { DocumentosPage } from '@/pages/DocumentosPage'
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

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
          { path: 'operacional', element: <OperacionalPage /> },
          { path: 'clientes', element: <ClientesPage /> },
          { path: 'financeiro', element: <FinanceiroPage /> },
          { path: 'documentos', element: <DocumentosPage /> },
          { path: 'configuracoes', element: <ConfiguracoesPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
