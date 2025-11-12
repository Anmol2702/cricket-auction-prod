import React from 'react';
import './BidHistoryModal.css';

const BidHistoryModal = ({ player, teams, onClose }) => {
  if (!player) {
    return null;
  }

  // Create a quick lookup map for team names for efficiency
  const teamNameMap = teams.reduce((acc, team) => {
    acc[team.id] = team.name;
    return acc;
  }, {});

  const bidHistory = player.bidHistory || [];

  // This is the key fix: Check for both properties to find the winning team ID.
  const winningTeamId = player.soldTo || player.teamId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bid-history-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Bid History for {player.name}</h2>
        <div className="bid-history-list">
          {bidHistory.length > 0 ? (
            bidHistory.map((bid, index) => (
              <div key={index} className="bid-entry">
                <span className="bid-team-name">{teamNameMap[bid.teamId] || 'Unknown Team'}</span>
                <span className="bid-amount">bid ₹{bid.bidAmount}</span>
              </div>
            ))
          ) : (
            <p>No bids were placed for this player (manually assigned).</p>
          )}
        </div>
        <div className="final-price">
          <span className="label">Winning Bid</span>
          <span className="price-value">₹{player.sellingPrice}</span>
          <span className="team-value">by <strong>{teamNameMap[winningTeamId] || 'Unknown'}</strong></span>
        </div>
      </div>
    </div>
  );
};

export default BidHistoryModal;