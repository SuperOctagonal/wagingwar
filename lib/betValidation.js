// Shared bet-entry validation for BetModal (races page) and Quick Log (mybets page).
export function validateBetForm({ betType, stake, odds, placeOdds }) {
  if (!stake || isNaN(+stake) || +stake <= 0) return 'Enter a valid stake';

  if ((betType === 'win' || betType === 'each-way') && (!odds || isNaN(+odds) || +odds <= 1)) {
    return 'Enter valid win odds';
  }
  if (betType === 'place' && (!odds || isNaN(+odds) || +odds <= 1)) {
    return 'Enter valid place odds';
  }
  if (betType === 'each-way' && (!placeOdds || isNaN(+placeOdds) || +placeOdds <= 1)) {
    return 'Enter valid place odds';
  }
  return null;
}
