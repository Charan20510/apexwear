export default function Marquee({
  reverse = false,
  pauseOnHover = false,
  repeat = 4,
  className = '',
  children,
}) {
  const cls = [
    'marquee',
    reverse ? 'marquee--reverse' : '',
    pauseOnHover ? 'marquee--pause' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {Array.from({ length: repeat }, (_, i) => (
        <div key={i} className="marquee__group" aria-hidden={i > 0 ? 'true' : undefined}>
          {children}
        </div>
      ))}
    </div>
  );
}
