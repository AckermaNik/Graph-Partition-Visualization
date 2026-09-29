import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

//project imports
import MainCard from '@/components/MainCard';

// ─── inline SVG icons ─────────────────────────────────────────────────────────
const IconCluster = () => (
  <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="4" fill="currentColor" opacity="0.9" />
    <circle cx="5" cy="7" r="2.5" fill="currentColor" opacity="0.55" />
    <circle cx="23" cy="7" r="2.5" fill="currentColor" opacity="0.55" />
    <circle cx="5" cy="21" r="2.5" fill="currentColor" opacity="0.55" />
    <circle cx="23" cy="21" r="2.5" fill="currentColor" opacity="0.55" />
    <line x1="10" y1="12" x2="7" y2="9" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
    <line x1="18" y1="12" x2="21" y2="9" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
    <line x1="10" y1="16" x2="7" y2="19" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
    <line x1="18" y1="16" x2="21" y2="19" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
  </svg>
);

const IconCypher = () => (
  <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <polyline points="9,8 4,14 9,20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="19,8 24,14 19,20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <line x1="16" y1="6" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
  </svg>
);

const IconDatabase = () => (
  <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <ellipse cx="14" cy="8" rx="9" ry="3.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M5 8v6c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5V8" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M5 14v6c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-6" stroke="currentColor" strokeWidth="1.8" fill="none" />
  </svg>
);

// ─── Feature data ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <IconCluster />,
    accent: '#3b82f6',
    title: 'Cluster Visualization',
    bullets: [
      "View your database's available partitions as clusters",
      'Inspect cross & intra-partition relationships across \n clusters',
      'Inspect significant partition statistics with one click'
    ]
  },
  {
    icon: <IconCypher />,
    accent: '#10b981',
    title: 'Cypher Queries',
    bullets: [
      'Execute safe read-only queries via the top query bar',
      'Multiple, write or admin operations are not allowed',
      'Auto LIMIT of 100 records if missing',
      'Zoom, fit & PNG export your graph '
    ]
  },
  {
    icon: <IconDatabase />,
    accent: '#f59e0b',
    title: 'Database Insights',
    bullets: [
      'General database schema introspection',
      'Inspect your database metadata',
      'Export full database schema as .csv',
      'Node data inspection with global statistics'
    ]
  }
];

// ─── Card ─────────────────────────────────────────────────────────────────────
function FeatureCard({ feature, index }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    const t = setTimeout(
      () => {
        el.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      },
      100 + index * 90
    );
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div ref={ref} className="wc-card" style={{ '--accent': feature.accent }}>
      <div className="wc-card-bar" />
      <div className="wc-card-inner">
        <div className="wc-card-head">
          <span className="wc-icon" style={{ color: feature.accent }}>
            {feature.icon}
          </span>
          <span className="wc-title">{feature.title}</span>
        </div>
        <ul className="wc-bullets">
          {feature.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const heroRef = useRef(null);
  const navigate = useNavigate();
  const isVisualization = location.pathname === '/visualization';

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    el.style.opacity = '0';
    const t = setTimeout(() => {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '1';
    }, 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="wc-root">

      <div className="wc-hero" ref={heroRef}>

        <h1 className={`pb-2 ${!isVisualization ? 'pt-5' : ''}`}>Start Exploration</h1>

        {!isVisualization && (
          <>
            <p>Connect to your Neo4j instance and explore your graph data</p>
            <Link to="/" className="wc-login-link">
              Connect to your instance
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </>
        )}

      </div>

      <MainCard bodyClassName=" " style={{ width: '100%', height: '100%' }}>
        {/* Horizontal cards */}
        <div className="wc-row">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </MainCard>
    </div>
  );
}
