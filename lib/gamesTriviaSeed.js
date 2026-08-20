// Seed content for trivia_questions. Deliberately restricted to
// high-confidence, widely-documented facts rather than obscure specifics
// (exact track records, precise historical dates/margins) that risk being
// wrong -- getting a "trivia" fact wrong in front of users is worse than a
// smaller question bank. Flagged for a human sanity-check before this goes
// live, per the plan discussed before this file was written. Run via
// `node scripts/seedTrivia.mjs` (one-time / re-run to append more later).
export const TRIVIA_SEED = [
  // ── Racing ──────────────────────────────────────────────────────────────
  { category: 'racing', difficulty: 'easy', question: 'What is the most famous race in Australian horse racing, run on the first Tuesday of November?', options: ['The Everest', 'Melbourne Cup', 'Cox Plate', 'Golden Slipper'], correct_option: 1 },
  { category: 'racing', difficulty: 'easy', question: 'Which champion mare won 33 consecutive races, an Australian record, before retiring in 2019?', options: ['Black Caviar', 'Winx', 'Makybe Diva', 'Sunline'], correct_option: 1 },
  { category: 'racing', difficulty: 'easy', question: 'Which horse is the only one to win the Melbourne Cup three times, in 2003, 2004 and 2005?', options: ['Phar Lap', 'Makybe Diva', 'Think Big', 'Rain Lover'], correct_option: 1 },
  { category: 'racing', difficulty: 'medium', question: 'Black Caviar retired with an unbeaten record of how many starts?', options: ['18', '21', '25', '30'], correct_option: 2 },
  { category: 'racing', difficulty: 'medium', question: 'Which jockey rode Winx for the majority of her unbeaten streak?', options: ['James McDonald', 'Hugh Bowman', 'Damien Oliver', 'Craig Williams'], correct_option: 1 },
  { category: 'racing', difficulty: 'medium', question: 'The Cox Plate is run at which Melbourne racecourse?', options: ['Flemington', 'Caulfield', 'Moonee Valley', 'Sandown'], correct_option: 2 },
  { category: 'racing', difficulty: 'easy', question: 'What is the official distance of the Melbourne Cup?', options: ['2400m', '2800m', '3200m', '3600m'], correct_option: 2 },
  { category: 'racing', difficulty: 'medium', question: 'Phar Lap, one of Australia’s most legendary racehorses, won the Melbourne Cup in which decade?', options: ['1910s', '1920s', '1930s', '1940s'], correct_option: 2 },
  { category: 'racing', difficulty: 'easy', question: 'Which race is often called "the world’s richest race on turf" and is run at Royal Randwick in October?', options: ['The Everest', 'Golden Slipper', 'Doncaster Mile', 'Epsom Handicap'], correct_option: 0 },
  { category: 'racing', difficulty: 'medium', question: 'The Golden Slipper, Australia’s premier race for two-year-olds, is held at which Sydney racecourse?', options: ['Randwick', 'Warwick Farm', 'Rosehill Gardens', 'Canterbury Park'], correct_option: 2 },
  { category: 'racing', difficulty: 'easy', question: 'In horse racing, what does "SP" commonly stand for?', options: ['Starting Price', 'Sprint Placing', 'Stake Percentage', 'Speed Point'], correct_option: 0 },
  { category: 'racing', difficulty: 'easy', question: 'What is a horse called if it has never won a race?', options: ['A colt', 'A maiden', 'A filly', 'A gelding'], correct_option: 1 },
  { category: 'racing', difficulty: 'medium', question: 'What term describes a horse being removed from a race after final declarations?', options: ['Withdrawn', 'Scratched', 'Retired', 'Suspended'], correct_option: 1 },
  { category: 'racing', difficulty: 'easy', question: 'Which of these is NOT one of the four official race-day track condition ratings in Australia?', options: ['Good', 'Soft', 'Heavy', 'Fast'], correct_option: 3 },
  { category: 'racing', difficulty: 'medium', question: 'The Caulfield Cup and Melbourne Cup are traditionally run in which order each spring?', options: ['Melbourne Cup first, then Caulfield Cup', 'Caulfield Cup first, then Melbourne Cup', 'On the same day', 'Melbourne Cup, then Cox Plate, then Caulfield Cup'], correct_option: 1 },
  { category: 'racing', difficulty: 'hard', question: 'Makybe Diva was bred in which country before racing in Australia?', options: ['New Zealand', 'Ireland', 'United Kingdom', 'France'], correct_option: 1 },
  { category: 'racing', difficulty: 'easy', question: 'What colour silks/jacket does a jockey wear that are unique to each race, representing the owner?', options: ['Team colours', 'Racing colours', 'Stable colours', 'Trainer colours'], correct_option: 1 },
  { category: 'racing', difficulty: 'medium', question: 'In a race field, what is the "barrier"?', options: ['The finish line', 'The starting stall position', 'The track rail', 'The betting limit'], correct_option: 1 },
  { category: 'racing', difficulty: 'easy', question: 'What is the term for a bet where you must pick the horse to finish 1st, 2nd or 3rd?', options: ['Win bet', 'Place bet', 'Each-way bet', 'Quinella'], correct_option: 1 },
  { category: 'racing', difficulty: 'medium', question: 'Sydney’s Royal Randwick and Rosehill Gardens are both home tracks of which racing club?', options: ['Melbourne Racing Club', 'Australian Turf Club', 'Sydney Turf Club', 'Racing NSW'], correct_option: 1 },

  // ── Sports (general) ────────────────────────────────────────────────────
  { category: 'sports', difficulty: 'easy', question: 'How many players are on an AFL team on the field at one time?', options: ['15', '18', '20', '22'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'In which city were the 2000 Summer Olympics held?', options: ['Melbourne', 'Sydney', 'Brisbane', 'Perth'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'How many players make up a rugby league (NRL) starting side?', options: ['11', '13', '15', '17'], correct_option: 1 },
  { category: 'sports', difficulty: 'medium', question: 'What trophy do NRL premiers lift each season?', options: ['The Shield', 'The Provan-Summons Trophy', 'The Cup', 'The J.J. Giltinan Shield'], correct_option: 3 },
  { category: 'sports', difficulty: 'easy', question: 'In cricket, how many balls make up a standard over?', options: ['4', '5', '6', '8'], correct_option: 2 },
  { category: 'sports', difficulty: 'easy', question: 'What is the maximum break possible in a single visit in snooker?', options: ['100', '147', '155', '180'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'The Australian Open tennis Grand Slam is held each year in which city?', options: ['Sydney', 'Adelaide', 'Melbourne', 'Brisbane'], correct_option: 2 },
  { category: 'sports', difficulty: 'medium', question: 'How often are the Summer Olympic Games held?', options: ['Every 2 years', 'Every 3 years', 'Every 4 years', 'Every 5 years'], correct_option: 2 },
  { category: 'sports', difficulty: 'easy', question: 'In golf, what term describes a score of one under par on a hole?', options: ['Eagle', 'Bogey', 'Birdie', 'Albatross'], correct_option: 2 },
  { category: 'sports', difficulty: 'easy', question: 'How many points is a try worth in rugby league, before the conversion?', options: ['3', '4', '5', '6'], correct_option: 2 },
  { category: 'sports', difficulty: 'medium', question: 'The America’s Cup is a competition in which sport?', options: ['Rowing', 'Sailing', 'Swimming', 'Powerboat racing'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'How many players are on court for one basketball team during play?', options: ['4', '5', '6', '7'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'What colour jersey does the leader of the Tour de France wear?', options: ['Green', 'Polka dot', 'Yellow', 'White'], correct_option: 2 },
  { category: 'sports', difficulty: 'medium', question: 'In AFL, how many points is a "behind" worth?', options: ['0', '1', '2', '6'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'The Ashes is a Test cricket series contested between Australia and which other country?', options: ['South Africa', 'India', 'England', 'New Zealand'], correct_option: 2 },
  { category: 'sports', difficulty: 'medium', question: 'What is the term for a boxing match ending with neither fighter able to continue via decision on points, but no knockout?', options: ['Technical draw', 'Decision', 'Split verdict', 'Stoppage'], correct_option: 1 },
  { category: 'sports', difficulty: 'easy', question: 'In soccer/football, how many players (including the goalkeeper) does each team have on the field?', options: ['9', '10', '11', '12'], correct_option: 2 },
  { category: 'sports', difficulty: 'medium', question: 'The State of Origin is an annual rugby league series between Queensland and which other state?', options: ['Victoria', 'South Australia', 'Western Australia', 'New South Wales'], correct_option: 3 },
  { category: 'sports', difficulty: 'easy', question: 'How many majors make up tennis’s Grand Slam in a calendar year?', options: ['3', '4', '5', '6'], correct_option: 1 },
  { category: 'sports', difficulty: 'medium', question: 'In Formula 1, how many points does a race winner earn (under the standard points system)?', options: ['15', '20', '25', '30'], correct_option: 2 },
];
