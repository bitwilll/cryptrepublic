export function Kicker({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`kicker ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
