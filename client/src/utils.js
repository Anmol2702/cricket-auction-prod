export const getBidIncrement = (currentBid, increments) => {
  // This logic should live on the server to ensure a single source of truth.
  // The client should receive the next possible bid amount directly from the server state.
  if (!increments || increments.length === 0) {
    // Fallback if settings aren't loaded yet
    return 1000;
  }

  for (const tier of increments) {
    if (currentBid >= tier.from && currentBid < tier.to) {
      return tier.step;
    }
  }

  // Fallback for very high bids
  return increments[increments.length - 1].step;
};