import { lazy } from 'react';
// project-imports
import Loadable from '@/components/Loadable';
import DashboardLayout from '@/layout/Dashboard';

// render - dashboard page
const LoginPage = Loadable(lazy(() => import('@/views/navigation/dashboard/LoginPage')));
const LoadingPage = Loadable(lazy(() => import('@/views/navigation/dashboard/LoadingPage')));
const AppPage = Loadable(lazy(() => import('@/views/navigation/dashboard/AppInfoPage')));
const ExplorePage = Loadable(lazy(() => import('@/views/navigation/dashboard/ExplorePage')));

// ==============================|| NAVIGATION ROUTING ||============================== //

const NavigationRoutes = {
  path: '/',
  element: <DashboardLayout />,
  children: [
    {
      index: true,
      element: <LoadingPage />
    },
    {
      path: 'login',
      element: <LoginPage />
    },
    {
      path: 'loading',
      element: <LoadingPage />
    },
    {
      path: 'app/information',
      element: <AppPage />
    },
    {
      path: 'exploring',
      element: <ExplorePage />
    }
  ]
};

export default NavigationRoutes;
