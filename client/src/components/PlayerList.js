// client/src/components/PlayerList.js

import React from 'react';

function PlayerList({ availablePlayers, unsoldPlayers }) {
  return (
    <div className="player-list-container">
      <div className="list-section">
        <h2>Available Players</h2>
        <ul className="player-list">
          {availablePlayers.length > 0 ? (
            availablePlayers.map(player => (
              <li key={player.id} className="player-item">
                <span className="player-name">{player.name}</span>
                <span className={`player-category ${player.category}`}>{player.category}</span>
              </li>
            ))
          ) : (
            <li className="player-item-empty">No players available.</li>
          )}
        </ul>
      </div>
      <div className="list-section">
        <h2>Unsold Players</h2>
        <ul className="player-list">
          {unsoldPlayers.length > 0 ? (
            unsoldPlayers.map(player => (
              <li key={player.id} className="player-item unsold">
                <span className="player-name">{player.name}</span>
                <span className={`player-category ${player.category}`}>{player.category}</span>
              </li>
            ))
          ) : (
            <li className="player-item-empty">No unsold players.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default PlayerList;