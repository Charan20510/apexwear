import Nav from './components/Nav.jsx';
import useScrollReveal from './hooks/useScrollReveal.js';
import ScrollSequence from './components/ScrollSequence.jsx';
import Coverflow from './components/Coverflow.jsx';
import ProductGrid from './components/ProductGrid.jsx';
import ScrollHorizontal from './components/ScrollHorizontal.jsx';
import Reviews from './components/Reviews.jsx';
import Footer from './components/Footer.jsx';
import AnimatedParticles from './components/AnimatedParticles.jsx';
import './styles.css';

export default function Landing() {
  const [headlineRef, headlineVisible] = useScrollReveal(0.2, true);

  return (
    // .landing-root carries the typography/background rules that used to sit on
    // `body`, so they apply here without touching the rest of the app.
    <div className="landing-root">
      <div className="reveal-content">
      <a className="skip" href="#main">Skip to main content</a>

      <Nav />

      <main id="main">
        <ScrollSequence />

        <section className="section section--muted" id="detail" aria-labelledby="detail-h" data-nav-theme="light">
          <AnimatedParticles
            shape="random"
            glyph="circle"
            colors={["#0a0a0a","#1a1a1a","#262626","#333333"]}
            backgroundColor="#F4F1EA"
            particleCount={16000}
            particleSize={2.8}
            particleOpacity={0.9}
            speed={0.7}
            interactive
            cursorMode="disperse"
            cursorRadius={200}
            cursorStrength={0.28}
          />
          <div ref={headlineRef} className={`detail-headline-wrap reveal${headlineVisible ? ' is-visible' : ''}`}>
            <img id="detail-h" className="section__head-img" src="images/detail-headline.png" alt="Built for the cold. Worn for the culture." />
          </div>
          <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
            <Coverflow />
          </div>
        </section>

        <ScrollHorizontal />

        <section className="section" id="buy" aria-labelledby="buy-h" data-nav-theme="light">
          <div className="wrap">
            <h2 id="buy-h" className="shop-heading">Shop the Collection</h2>
            <ProductGrid />
          </div>
        </section>

        <Reviews />
      </main>
      </div>

      <Footer />
    </div>
  );
}
