import React from 'react';
import { useAuction } from '../context/AuctionContext';
import { getBidIncrement } from '../utils';
import './BiddingControls.css';

function BiddingControls({ onBid, user, leadingTeamId, currentPlayer }) {
  const { state } = useAuction();
  const { currentBid, settings } = state;

  if (!user || user.role !== 'team_owner') {
    return null;
  }

  const isLeading = user.teamId === leadingTeamId;
  
  let nextBid;
  if (!leadingTeamId) {
    // If no one has bid, the first bid is for the base price (which is the currentBid)
    nextBid = currentBid;
  } else {
    // Otherwise, it's the current bid + increment
    nextBid = currentBid + getBidIncrement(currentBid, settings.bidIncrements);
  }
  // The user's maxBid is calculated in App.js.
  // We ensure it's treated as 0 if it's undefined or null for this check, making the component more robust.
  const maxBid = user.maxBid || 0;
  const canAfford = maxBid >= nextBid;

  let disabledReason = '';
  if (!currentPlayer) disabledReason = 'No player is being auctioned.';
  else if (isLeading) disabledReason = 'You are the leading bidder.';
  else if (!canAfford) disabledReason = `You cannot afford the next bid of ₹${nextBid}. (Max: ₹${maxBid})`;

  const isDisabled = !currentPlayer || isLeading || !canAfford;

  return (
    <div className="bidding-controls-container" title={disabledReason}>
      <button
        onClick={() => onBid(user.teamId)}
        className={`bid-btn ${isLeading ? 'leading' : ''}`}
        disabled={isDisabled}
      >
        {isLeading ? 'YOU ARE LEADING' : `BID ₹${nextBid}`}
      </button>
    </div>
  );
}

export default BiddingControls;