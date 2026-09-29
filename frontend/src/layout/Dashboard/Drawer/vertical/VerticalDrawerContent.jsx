import PropTypes from 'prop-types';

// project-imports
import SimpleBarScroll from '@/components/third-party/SimpleBar';
import Navigation from '../DrawerContent';

export default function VerticalDrawerContent() {
  return (
    <SimpleBarScroll style={{ height: 'calc(100vh - 74px)' }}>
      <Navigation />
    </SimpleBarScroll>
  );
}