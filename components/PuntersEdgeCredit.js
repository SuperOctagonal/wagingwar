// Required attribution per written agreement with PuntersEdge (Hamish
// Carter) -- plain text, same visual weight as surrounding body copy. Not
// fine print, not a tooltip, not styled down. Do not shrink/lighten/hide
// this without updating that agreement first.
export default function PuntersEdgeCredit({ style }) {
  return (
    <div style={{ fontSize: 13, color: '#111827', ...style }}>
      Prices by <a href="https://puntersedge.online" target="_blank" rel="noopener noreferrer" style={{ color: '#111827', textDecoration: 'underline' }}>PuntersEdge</a>
    </div>
  );
}
