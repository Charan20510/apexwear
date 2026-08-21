import Marquee from './Marquee.jsx';
import { REVIEWS } from '../data.js';

const firstRow = REVIEWS.slice(0, REVIEWS.length / 2);
const secondRow = REVIEWS.slice(REVIEWS.length / 2);

function ReviewCard({ img, name, username, body }) {
  return (
    <figure className="review-card">
      <div className="review-card__header">
        <img className="review-card__avatar" width="32" height="32" src={img} alt="" aria-hidden="true" />
        <div>
          <figcaption className="review-card__name">{name}</figcaption>
          <p className="review-card__user">{username}</p>
        </div>
      </div>
      <blockquote className="review-card__body">{body}</blockquote>
    </figure>
  );
}

export default function Reviews() {
  return (
    <section className="section section--muted reviews-section" aria-label="Customer reviews" data-nav-theme="light">
      <Marquee pauseOnHover>
        {firstRow.map((r) => <ReviewCard key={r.username} {...r} />)}
      </Marquee>
      <Marquee reverse pauseOnHover>
        {secondRow.map((r) => <ReviewCard key={r.username} {...r} />)}
      </Marquee>
      <div className="review-fade review-fade--left"  aria-hidden="true" />
      <div className="review-fade review-fade--right" aria-hidden="true" />
    </section>
  );
}
