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
        <a className="brand" href="/" aria-label="Apexwear home">
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
        </a>
        <div className="nav__icons">
          <nav aria-label="Primary">
            <ul className="nav__links">
              <li><a href="#" className="is-sale">Sale</a></li>
            </ul>
          </nav>
          <span className="heartwrap">
            <Link to="/wishlist" className="iconbtn" aria-label="Wishlist">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </Link>
            {count > 0 && <span className="heartcount">{count}</span>}
          </span>
        </div>
      </div>
    </header>
  );
}
