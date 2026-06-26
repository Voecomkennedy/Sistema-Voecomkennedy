import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'reservas', element: <PlaceholderPage titulo="Reservas" fase="Fase 5" /> },
      { path: 'operacional', element: <PlaceholderPage titulo="Operacional" fase="Fase 6" /> },
      { path: 'clientes', element: <PlaceholderPage titulo="Clientes" fase="Fase 4" /> },
      { path: 'financeiro', element: <PlaceholderPage titulo="Financeiro" fase="Fase 7" /> },
      { path: 'documentos', element: <PlaceholderPage titulo="Documentos" fase="Fase 9" /> },
      { path: 'configuracoes', element: <PlaceholderPage titulo="Configurações" fase="Fase 10" /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
