import { Suspense } from 'react';

// project-imports
import Loader from './Loader';

// ==============================|| LOADABLE - LAZY LOADING ||============================== //

/**
 * In a React/Vite app, when you have many pages, the total file size gets huge. Instead of making the user download the whole site at once, we
 * use Lazy Loading (loading pages only when you click on them).
 * These two files handle what the user sees during that "waiting gap."
 * @param {any} Component
 * @returns
 */
const Loadable = (Component) => (props) => {
  return (
      <Suspense fallback={<Loader />}> 
          <Component {...props} />
    </Suspense>
  );
};

export default Loadable;
