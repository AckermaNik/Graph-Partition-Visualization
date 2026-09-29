import { Outlet } from 'react-router-dom';
import { TourProvider } from '@reactour/tour';

// project-imports
import Drawer from './Drawer';
import Footer from './Footer';
import Header from './Header';
import NavigationScroll from '@/components/NavigationScroll';

export default function MainLayout() {
  return (
    <TourProvider steps={[]} showBadge={false} showCloseButton>
      <Drawer />
      <Header />
      <div className="pc-container">
        <div className="pc-content">
          <NavigationScroll>
            <Outlet />
          </NavigationScroll>
        </div>
      </div>
    </TourProvider>
  );
}