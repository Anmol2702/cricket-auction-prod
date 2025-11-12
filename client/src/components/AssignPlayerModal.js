import React, { useState } from 'react';
import { useAuction } from '../context/AuctionContext';
import './EditTeamModal.css'; // Reuse styles for consistency

const AssignPlayerModal = ({ player, onClose, onAssign }) => {
  const { state } = useAuction();
  const { teams } = state;
  const [teamId, setTeamId] = useState('');
  const [price, setPrice] = useState(player.basePrice || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!teamId) {
      alert('Please select a team.');
      return;
    }
    onAssign(player.id, { teamId, price: parseInt(price, 10) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Assign Player: {player.name}</h2>
        <form onSubmit={handleSubmit} className="edit-team-form">
          <div className="form-group">
            <label>Assign to Team</label>
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
            <label>Selling Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              step="100"
            />
          </div>
          <button type="submit" className="save-btn">Confirm Assignment</button>
        </form>
      </div>
    </div>
  );
};

export default AssignPlayerModal;