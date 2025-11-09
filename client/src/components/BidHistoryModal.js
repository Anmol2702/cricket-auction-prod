import React from 'react';
import './BidHistoryModal.css';

const BidHistoryModal = ({ player, teams, onClose }) => {
  if (!player) {
    return null;
  }

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Bid History for {player.name}</h2>
        <p>Sold for: <strong>₹{player.price}</strong> to <strong>{getTeamName(player.soldTo)}</strong></p>
        <ul className="bid-list">
          {player.bidHistory && player.bidHistory.length > 0 ? (
            player.bidHistory.map((bid, index) => (
              <li key={index} className="bid-item">
                <span>{getTeamName(bid.teamId)}</span>
                <strong>₹{bid.bidAmount}</strong>
              </li>
            ))
          ) : (
            <li>No bids were recorded for this player.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default BidHistoryModal;