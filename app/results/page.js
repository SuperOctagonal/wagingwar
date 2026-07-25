import ResultsPageClient from './ResultsPageClient';
import { normaliseVenue } from '@/lib/venues';

// No "| Waging War" suffix here — the root layout's title.template
// ('%s | Waging War') already appends it; hardcoding it here doubled up.
const DEFAULT_TITLE = 'Race Results and Model Accuracy';
const DEFAULT_DESCRIPTION = 'Check past race results and see how accurate the Waging War model rankings were, race by race.';

function titleCaseVenue(rawVenue) {
  return normaliseVenue(rawVenue)
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatResultsDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Dynamic per-venue/date SEO metadata for shared/crawled result links
// (?date=YYYY-MM-DD&venue=...) — falls back to the generic title/description
// for the bare /results landing view. Pure string formatting from the
// params only (no DB call), so this stays fast and never breaks even if
// the specific race turns out not to exist. Lives here rather than
// layout.js because layouts never receive searchParams in the App
// Router — only page.js does.
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const dateParam = params?.date;
  const venueParam = params?.venue;

  if (dateParam && venueParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const formattedDate = formatResultsDate(dateParam);
    if (formattedDate) {
      const venueName = titleCaseVenue(venueParam);
      return {
        title: `${venueName} Results ${formattedDate}`,
        description: `See how Waging War's model ranked every runner at ${venueName} on ${formattedDate}, compared against the real result.`,
      };
    }
  }

  return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
}

export default function ResultsPage() {
  return <ResultsPageClient />;
}
