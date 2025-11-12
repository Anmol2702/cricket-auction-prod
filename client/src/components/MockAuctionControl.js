import React, { useState, useEffect } from 'react';
import './MockAuctionControl.css';

const MockAuctionControl = ({ onStart, onClose, isMocking }) => {
  const [numberOfPlayers, setNumberOfPlayers] = useState(1);
  const [auctionAll, setAuctionAll] = useState(false);

  // Clear the number input when "auction all" is checked for better UX
  useEffect(() => {
    if (auctionAll) {
      setNumberOfPlayers('');
    }
  }, [auctionAll]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // If "auction all" is checked, send a high number. Otherwise, send the input value.
    const num = auctionAll ? 999 : parseInt(numberOfPlayers, 10);
    if (!auctionAll && (isNaN(num) || num < 1)) {
      alert('Please enter a valid number of players (at least 1).');
      return;
    }
    onStart(num);
  };

  return (
    <div className="modal-overlay" onClick={!isMocking ? onClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {!isMocking && <button className="modal-close" onClick={onClose}>&times;</button>}
        <h2>Start Mock Auction</h2>
        <p>This will simulate a realistic auction for a set number of players.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="numberOfPlayers">Number of Players to Mock</label>
            <input
              type="number"
              id="numberOfPlayers"
              value={numberOfPlayers}
              onChange={(e) => setNumberOfPlayers(e.target.value)}
              min="1"
              max="50" // A reasonable max
              required
              disabled={isMocking || auctionAll}
            />
          </div>
          <div className="form-group-checkbox">
            <input 
              type="checkbox"
              id="auctionAll"
              checked={auctionAll}
              onChange={(e) => setAuctionAll(e.target.checked)}
              disabled={isMocking}
            />
            <label htmlFor="auctionAll">Auction all remaining players</label>
          </div>
          <button type="submit" className="start-mock-btn" disabled={isMocking}>
            {isMocking ? 'Mocking in Progress...' : 'Start Mock'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MockAuctionControl;