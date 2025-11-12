import React, { useState } from 'react';
import './AuctionLog.css';
import BidHistoryModal from './BidHistoryModal';

const AuctionLog = ({ soldPlayers, teams }) => {
  const [viewingHistoryFor, setViewingHistoryFor] = useState(null);

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  return (
    <>
      <div className="auction-log">
        <h2>Auction Log</h2>
        <div className="log-entries">
          {soldPlayers.length === 0 ? (
            <p className="empty-log">No players sold yet.</p>
          ) : (
            // Reverse the array to show most recent sales first
            soldPlayers.slice().reverse().map((player) => (
              <div 
                key={player.id} // Use a stable key
                className={`log-entry ${player.status} ${player.status === 'sold' ? 'clickable' : ''}`} 
                onClick={() => player.status === 'sold' && setViewingHistoryFor(player)}
              >
                <span className="player-name">{player.name}</span>
                {player.status === 'sold' ? (
                  <span className="sale-info">
                    Sold to <strong>{getTeamName(player.soldTo || player.teamId)}</strong> for <strong>₹{player.sellingPrice}</strong>
                  </span>
                ) : (
                  <span className="sale-info">
                    Unsold
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {viewingHistoryFor && (
        <BidHistoryModal 
          player={viewingHistoryFor} 
          teams={teams} 
          onClose={() => setViewingHistoryFor(null)} 
        />
      )}
    </>
  );
};

export default AuctionLog;