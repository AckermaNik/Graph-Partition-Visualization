import { lazy } from 'react';

// project-imports
import Loadable from '@/components/Loadable';
import DashboardLayout from '@/layout/Dashboard';
const VisualizationPage = Loadable(lazy(() => import('@/views/navigation/dashboard/VisualizationPage')));

const VisualizationRoutes = {
  path: '/',
  element: <DashboardLayout />,
  children: [
    {
      path: 'visualization',
      element: <VisualizationPage />
    }
  ]
};

export default VisualizationRoutes;
