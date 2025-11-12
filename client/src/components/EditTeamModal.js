import React, { useState } from 'react';
import './EditTeamModal.css';

const EditTeamModal = ({ team, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: team.name,
    ownerName: team.ownerName,
    purse: team.purse,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Pass the ID and the updated data to the save handler
    onSave(team.id, {
      ...formData,
      purse: parseInt(formData.purse, 10) // Ensure purse is a number
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Edit Team: {team.name}</h2>
        <form onSubmit={handleSubmit} className="edit-team-form">
          <div className="form-group">
            <label>Team Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Owner Name</label>
            <input
              type="text"
              name="ownerName"
              value={formData.ownerName}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Purse</label>
            <input
              type="number"
              name="purse"
              value={formData.purse}
              onChange={handleChange}
            />
          </div>
          <button type="submit" className="save-btn">Save Changes</button>
        </form>
      </div>
    </div>
  );
};

export default EditTeamModal;