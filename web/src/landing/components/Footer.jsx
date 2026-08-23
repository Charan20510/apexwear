import { Link } from 'react-router-dom';
import { FOOTER_COLS, FOOTER_LEGAL } from '../data.js';
import useScrollReveal from '../hooks/useScrollReveal.js';

export default function Footer() {
  const [ref, visible] = useScrollReveal(0.2, true);
  return (
    <footer className="foot foot--reveal" data-nav-theme="dark">
      <div ref={ref} className={`wrap foot__inner${visible ? ' is-visible' : ''}`}>

        <div className="foot__brand">
          <span className="foot__logo">APEXWEAR</span>
          <p className="foot__tag">Heavyweight essentials built to outlast trends — worn hard, kept for years.</p>
        </div>

        <hr className="foot__rule" />

        <div className="foot__cols">
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.links.map((link) => (
                  <li key={link.to}><Link to={link.to}>{link.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="foot__bar">
          <p className="foot__copy">© 2026 APEXWEAR, INC. ALL RIGHTS RESERVED.</p>
          <ul className="foot__legal">
            {FOOTER_LEGAL.map((l) => (
              <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
            ))}
          </ul>
        </div>

      </div>
    </footer>
  );
}
