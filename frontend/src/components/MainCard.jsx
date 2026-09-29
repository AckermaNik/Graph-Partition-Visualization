import PropTypes from 'prop-types';

// react-bootstrap
import Card from 'react-bootstrap/Card';
import Stack from 'react-bootstrap/Stack';

// ==============================|| MAIN CARD ||============================== //

export default function MainCard({//Object Destructuring->"unpacking" the props right in the function signature.
  children, //This is a unique, built-in React prop. It represents whatever you put between the opening and closing tags of the component.
  subheader,
  footer,
  secondary,
  content = true,
  title,
  className,  //css classes
  headerClassName,
  bodyClassName,
  footerClassName,
  ref //special prop used to grab a direct handle on the actual HTML DOM element
}) {
  return (
    <Card ref={ref} className={className}>
      {/* Header Section */}
      {title && (
        <Card.Header className={headerClassName}>
          <Stack direction="horizontal" gap={2} className="flex-wrap justify-content-between">
            <Stack className="align-self-center">
              {typeof title === 'string' ? <h5>{title}</h5> : title}
              {subheader && <small className="text-muted">{subheader}</small>}
            </Stack>
            {secondary}
          </Stack>
        </Card.Header>
      )}
      {/* Content */}
      {content && <Card.Body className={bodyClassName}>{children}</Card.Body>}
      {!content && children}
      {footer && <Card.Footer className={footerClassName}>{footer}</Card.Footer>}
    </Card>
  );
}


//PropTypes check your data while the app is actually running
MainCard.propTypes = {
  children: PropTypes.node, //This is the most flexible type. It means "anything that React can render"
  subheader: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  footer: PropTypes.node, //a string, a number, an HTML element (div), or even another component
  secondary: PropTypes.node,
  content: PropTypes.bool,
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  className: PropTypes.string,
  headerClassName: PropTypes.string,
  bodyClassName: PropTypes.string,
  footerClassName: PropTypes.string,
  ref: PropTypes.object //valid React reference object.
};
