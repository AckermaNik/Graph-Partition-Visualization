/**the system's left menu items */
export function useMenuItems() {
  return [
    {
      id: 'db',
      icon: 'ph ph-database',
      url: '/app/database',
      hidden: true,
      label: 'Data base Technical information'
    },
    {
      id: 'new-pr',
      icon: 'ph ph-plus-circle',
      url: '/login',
      hidden: false,
      label: 'New project',
      newTab: true
    },
    {
      id: 'saved-queries',
      icon: 'ph ph-heart',
      url: '/',
      hidden: true,
      label: 'Saved queries'
    },
    {
      id: 'restart',
      icon: 'ph ph-graph',
      url: '/',
      hidden: true,
      label: 'Restart Graph Exploration'
    },
    {
      id: 'info',
      icon: 'ph ph-info',
      url: '/app/information',
      hidden: false,
      label: 'User Guide and Techinal Documentation',
      newTab: true
    },
    {
      id: 'guide',
      icon: 'ph ph-book-open-text',
      url: '',
      hidden: false,
      label: 'Pop up guide'
    },
    {
      id: 'schema',
      icon: 'ph ph-download',
      url: '',
      hidden: true,
      label: 'Export Database Schema'
    }
  ];
}
