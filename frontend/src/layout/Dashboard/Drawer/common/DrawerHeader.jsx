import { Link } from 'react-router-dom';

// react-bootstrap
import Image from 'react-bootstrap/Image';

// project-import
import { APP_DEFAULT_PATH } from '@/config';
import logo from '@/assets/images/logo2.svg';

export const DrawerHeader = () => {
  return (
    <div className="m-header">
      <Link to={APP_DEFAULT_PATH + 'exploring'} className="b-brand text-primary">
        <Image src={logo} className="logo logo-lg" style={{ filter: 'brightness(0) invert(1)' }} alt="logo" />
      </Link>
    </div>
  );
};
