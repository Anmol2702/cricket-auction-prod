import React, { useState } from 'react';
import { useAuction } from '../context/AuctionContext';
import './EditTeamModal.css'; // Reuse styles for consistency

const ReassignPlayerModal = ({ player, onClose, onReassign }) => {
  const { state } = useAuction();
  const { teams } = state;

  // Pre-fill the form with the player's current sale details
  const [teamId, setTeamId] = useState(player.teamId || '');
  const [price, setPrice] = useState(player.sellingPrice || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!teamId) {
      alert('Please select a team.');
      return;
    }
    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice < 0) {
      alert('Please enter a valid, non-negative price.');
      return;
    }
    onReassign(player.id, { newTeamId: teamId, price: numericPrice });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Re-assign Sold Player</h2>
        <p><strong>Player:</strong> {player.name}</p>
        <form onSubmit={handleSubmit} className="edit-team-form">
          <div className="form-group">
            <label>Assign to New Team</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
              <option value="" disabled>Select a team...</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>New Selling Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              step="100"
              min="0"
            />
          </div>
          <button type="submit" className="save-btn">Confirm Re-assignment</button>
        </form>
      </div>
    </div>
  );
};

export default ReassignPlayerModal;