import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuction } from '../context/AuctionContext';
import EditTeamModal from './EditTeamModal';
import './TeamManagement.css';

const TeamManagement = ({ serverUrl }) => {
  const { state } = useAuction();
  const { teams } = state;
  const [editingTeam, setEditingTeam] = useState(null);

  const handleSave = async (teamId, updatedData) => {
    try {
      await axios.put(`${serverUrl}/teams/${teamId}`, updatedData);
      toast.success(`Team "${updatedData.name}" updated successfully.`);
      setEditingTeam(null); // Close modal on success
    } catch (error) {
      toast.error('Failed to update team.');
      console.error(error);
    }
  };

  return (
    <>
      <div className="team-management-container">
        <h2>Team Management</h2>
        <div className="team-list-table-container">
          <table>
            <thead>
              <tr>
                <th>Team Name</th>
                <th>Owner Name</th>
                <th>Purse</th>
                <th>Players</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id}>
                  <td>{team.name}</td>
                  <td>{team.ownerName}</td>
                  <td>₹{team.purse}</td>
                  <td>{team.squad?.length || 0}</td>
                  <td className="team-actions">
                    <button onClick={() => setEditingTeam(team)} className="edit-btn">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default TeamManagement;