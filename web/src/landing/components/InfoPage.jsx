import { useParams, Link } from 'react-router-dom';
import Nav from './Nav.jsx';
import Footer from './Footer.jsx';
import { INFO_PAGES } from '../info.js';

// Footer info pages, plus the 404 fallback for any unrecognised slug (routed last in App.tsx).
export default function InfoPage() {
  const { slug } = useParams();
  const page = INFO_PAGES[slug];

  return (
    <div className="landing-root">
      <div className="reveal-content">
        <Nav />
        <main id="main">
          <section className="section">
            <div className="wrap">
              <div className="wishlist-header">
                <h1>{page ? page.title : 'Page not found'}</h1>
              </div>
              {page ? (
                <>
                  {page.blocks.map((text, i) => (
                    <p key={i} className="wishlist-empty">{text}</p>
                  ))}
                  {page.table && (
                    <table className="size-table">
                      <thead>
                        <tr>
                          {page.table.headers.map((h) => <th key={h}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {page.table.rows.map((row) => (
                          <tr key={row[0]}>
                            {row.map((cell, i) => <td key={i}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {page.cta && (
                    <p className="wishlist-empty">
                      <Link to={page.cta.to}>{page.cta.label}</Link>
                    </p>
                  )}
                </>
              ) : (
                <p className="wishlist-empty">
                  That page doesn't exist. <Link to="/shop">Browse the hoodies</Link> instead.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
