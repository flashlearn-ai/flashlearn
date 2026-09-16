/** Progress ring. One implementation of the stroke-dash arithmetic, used by the
 *  details pane during a session and by the results card when it closes. */
export function Ring({ value, total, size, gradient, children }: {
  value: number;
  total: number;
  size: number;
  gradient?: boolean;
  children: React.ReactNode;
}) {
  const stroke = size < 90 ? 6 : 7;
  const radius = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : value / total;
  const centre = size / 2;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <circle cx={centre} cy={centre} r={radius} fill="none" stroke="#e7ece7" strokeWidth={stroke} />
        <circle
          cx={centre} cy={centre} r={radius} fill="none"
          stroke={gradient ? "url(#ring-gradient)" : "var(--emerald)"}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)}
        />
        {gradient && (
          <defs>
            <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#12965a" />
              <stop offset="1" stopColor="#6a45c0" />
            </linearGradient>
          </defs>
        )}
      </svg>
      {children}
    </div>
  );
}
