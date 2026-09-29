import { useLocation, Link } from 'react-router-dom';
import { handlerDrawerOpen } from '@/api/menu.js';

export default function NavItem({ item, onClick, children, liRef, liClassName = '' }) {
  const { pathname } = useLocation();
  const isVis = pathname === '/visualization';
  const isLoading = pathname === '/loading';
  const isSelected = item.url === pathname;
  const isMobile = window.innerWidth <= 1024;

  const handleClick = (e) => {
    if (isMobile) handlerDrawerOpen(false);

    // allow parent to override behavior
    if (onClick) return onClick(e);

    if (item.hidden) {
      e.preventDefault();
      return;
    }

    if (item.newTab) {
      e.preventDefault();
      const fullUrl = `${window.location.origin}${item.url}`;
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
      return;
    }
  };

  return (
    <>
      {(isVis || (isLoading && item.id === 'new-pr') || !item.hidden) && (
        <li ref={liRef} id={item.id} className={`pc-item ${isSelected ? 'active' : ''} ${liClassName}`}>
          <Link className="pc-link" to={item.url} onClick={handleClick} title={item.label}>
            <span className="pc-micon">
              <i className={item.icon} />
            </span>
          </Link>
          {children}
        </li>
      )}
    </>
  );
}
