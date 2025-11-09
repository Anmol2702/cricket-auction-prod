import React, { useState } from 'react';
import './AuctionLog.css';
import BidHistoryModal from './BidHistoryModal';

const AuctionLog = ({ soldPlayers, teams }) => {
  const [historyPlayer, setHistoryPlayer] = useState(null);

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  };

  const handleShowHistory = (player) => {
    if (player.status === 'sold' && player.bidHistory) {
      setHistoryPlayer(player);
    }
  };

  const handleCloseHistory = () => {
    setHistoryPlayer(null);
  };

  return (
    <>
      <div className="auction-log">
        <h2>Auction Log</h2>
        <div className="log-entries">
          {soldPlayers.length === 0 ? (
            <p className="empty-log">No players sold yet.</p>
          ) : (
            soldPlayers.map((entry, index) => (
              <div key={index} className={`log-entry ${entry.status} ${entry.status === 'sold' ? 'clickable' : ''}`} onClick={() => handleShowHistory(entry)}>
                <span className="player-name">{entry.name}</span>
                {entry.status === 'sold' ? (
                  <span className="sale-info">
                    Sold to <strong>{getTeamName(entry.soldTo)}</strong> for <strong>₹{entry.price}</strong>
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
      <BidHistoryModal player={historyPlayer} teams={teams} onClose={handleCloseHistory} />
    </>
  );
};

export default AuctionLog;