export function StatTile({
  value,
  label,
  mono = true,
}: {
  value: React.ReactNode;
  label: string;
  mono?: boolean;
}) {
  return (
    <div>
      <b style={mono ? { fontFamily: "var(--mono)" } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}
