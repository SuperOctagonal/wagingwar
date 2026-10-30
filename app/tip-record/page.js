import TipRecordClient from './TipRecordClient';

// Neutral title/meta per the copy rules -- no "guaranteed"/"profit-making"/
// "beats the market" framing anywhere, including here.
export const metadata = {
  title: 'Public Tip Record',
  description: 'The full settled track record of Waging War\'s top picks, every tip at the official starting price.',
};

export default function TipRecordPage() {
  return <TipRecordClient />;
}
