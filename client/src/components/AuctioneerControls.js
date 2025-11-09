// client/src/components/AuctioneerControls.js

import React from 'react';

function AuctioneerControls({ onSell, onNominateRandom, onReset, currentPlayer, leadingTeamId }) {
  // The "End Auction" button should be clickable as soon as a player is nominated.
  const canEndAuction = !!currentPlayer;
  // The "Nominate" button should only be clickable if there is NO player currently being auctioned.
  const canNominate = !currentPlayer;

  const endAuctionButtonText = leadingTeamId ? 'SOLD' : 'Mark as Unsold';

  return (
    <div className="auctioneer-controls-container">
      <button
        onClick={onNominateRandom}
        className="nominate-random-btn"
        disabled={!canNominate}
      >
        Nominate Random Player
      </button>
      <button 
        onClick={onSell} 
        className="sell-btn"
        disabled={!canEndAuction}
      >
        {endAuctionButtonText}
      </button>
      <button
        onClick={onReset}
        className="reset-btn"
      >
        Reset Auction
      </button>
    </div>
  );
}

export default AuctioneerControls;