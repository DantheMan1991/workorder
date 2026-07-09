import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  return (
    <div className="app">
      <header className="appbar">
        {isHome ? (
          <Link to="/" className="brand">
            <img className="logo" src="/icon.svg" alt="" />
            <span>WorkOrder</span>
          </Link>
        ) : (
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
            ←
          </button>
        )}
        <div className="spacer" />
        {isHome && (
          <Link to="/new" className="btn primary sm">
            + New
          </Link>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
