/** Hand-drawn style X and O. Strokes draw themselves in when they first appear. */
export default function Mark({ value, faded = false }) {
  if (value === 1) {
    return (
      <svg className={`mark x${faded ? " faded" : ""}`} viewBox="0 0 100 100" aria-hidden="true">
        <path pathLength="1" d="M28 28 L72 72" />
        <path pathLength="1" d="M72 28 L28 72" className="second" />
      </svg>
    );
  }
  if (value === 2) {
    return (
      <svg className={`mark o${faded ? " faded" : ""}`} viewBox="0 0 100 100" aria-hidden="true">
        <circle pathLength="1" cx="50" cy="50" r="24" transform="rotate(-90 50 50)" />
      </svg>
    );
  }
  return null;
}
