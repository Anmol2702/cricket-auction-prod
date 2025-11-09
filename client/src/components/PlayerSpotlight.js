import React from 'react';
import Timer from './Timer';
import './PlayerSpotlight.css';

function PlayerSpotlight({ player, timeLeft, currentBid, leadingTeam }) {
  if (!player) {
    return (
      <div className="player-spotlight-container">
        <div className="spotlight-card placeholder">
          <h3>Waiting for next player...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="player-spotlight-container">
      <div className="spotlight-card">
        <div className="player-info">
          <h2>{player.name}</h2>
          <p>{player.country} &bull; {player.skill}</p>
          <span className={`player-category ${player.category}`}>{player.category}</span>
        </div>
        <div className="bidding-info">
          <div className="base-price">Base Price: ₹{player.basePrice}</div>
          <Timer timeLeft={timeLeft} />
          <div className="current-bid-spotlight">
            <p>Current Bid</p>
            <span className="bid-amount-spotlight">₹{currentBid}</span>
          </div>
          <div className="leading-team-spotlight">
            <p>Leading Team</p>
            <span className="team-name-spotlight">
              {leadingTeam ? leadingTeam.name : '---'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerSpotlight;