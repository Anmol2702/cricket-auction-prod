// client/src/components/AuctioneerControls.js

import React from 'react';

function AuctioneerControls({ onSell, onNominateRandom, onReset, onMock, onHardcodeAssign, onNewRound, isMocking, currentPlayer, leadingTeamId, unsoldPlayers }) {
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
        disabled={!canNominate || isMocking}
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
        onClick={onMock}
        className="mock-btn"
        disabled={isMocking}
      >
        {isMocking ? 'Mocking in Progress...' : 'Mock Auction'}
      </button>
      <button
        onClick={onNewRound}
        className="start-round-btn"
        disabled={isMocking || !unsoldPlayers || unsoldPlayers.length === 0}
      >
        Start New Round
      </button>
      <button
        onClick={onHardcodeAssign}
        className="hardcode-btn"
        disabled={isMocking}
      >
        Assign Core Players
      </button>
      <button
        onClick={onReset}
        className="reset-btn"
        disabled={isMocking}
      >
        Reset Auction
      </button>
    </div>
  );
}

export default AuctioneerControls;