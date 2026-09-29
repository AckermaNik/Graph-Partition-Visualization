import { createBrowserRouter } from 'react-router-dom';

// project-imports

import NavigationRoutes from './NavigationRoutes';
import Visualization from './VisualizationRoutes';

// ==============================|| ROUTING RENDER ||============================== //

const router = createBrowserRouter([NavigationRoutes, Visualization], {
  basename: '/'
});

export default router;
