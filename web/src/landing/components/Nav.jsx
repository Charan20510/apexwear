import { Link } from 'react-router-dom';
import { useWishlist } from '../hooks/useWishlist.js';
import useNavTheme from '../hooks/useNavTheme.js';
import Typewriter from './Typewriter.jsx';

export default function Nav() {
  const { count } = useWishlist();
  const navTheme = useNavTheme();
  return (
    <header className={`nav nav--on-${navTheme}`}>
      <div className="nav__in">
        <Link className="brand" to="/" aria-label="Apexwear home">
          <span className="brand__logo-wrap">
            <span className="brand__logo-stack" aria-hidden="true">
              <img
                src="images/logo.png"
                alt=""
                className="brand__logo brand__logo--on-light"
                width="80"
                height="55"
              />
              <img
                src="images/logo_white.png"
                alt=""
                className="brand__logo brand__logo--on-dark"
                width="80"
                height="55"
              />
            </span>
            <span className="brand__tw-wrap" aria-hidden="true">
              <Typewriter texts={['APEXWEAR']} className="brand__tw" />
            </span>
          </span>
        </Link>
        <div className="nav__icons">
          {/* Outline icons — .iconbtn supplies fill:none/stroke:currentColor, so they
              follow the nav's light/dark theme automatically. */}
          <Link to="/login" className="iconbtn" aria-label="Account">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9.25" strokeLinecap="round" />
              <circle cx="12" cy="9.75" r="2.75" strokeLinecap="round" />
              <path
                d="M5.6 19.2a7.2 7.2 0 0 1 12.8 0"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <span className="heartwrap">
            <Link to="/mywishlist" className="iconbtn" aria-label="Wishlist">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </Link>
            {count > 0 && <span className="heartcount">{count}</span>}
          </span>

          <span className="cartwrap">
            <Link to="/cart" className="iconbtn" aria-label="Cart">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M2.5 3.5h2.4l1.1 5m0 0 1.4 6.4h9.3l1.7-6.4H6zm.6 6.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="16.5" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </Link>
          </span>
        </div>
      </div>
    </header>
  );
}
