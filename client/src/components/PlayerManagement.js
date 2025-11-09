import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { useAuction } from '../context/AuctionContext';
import './PlayerManagement.css';
import { toast } from 'react-toastify';

const serverUrl = process.env.NODE_ENV === 'production' ? 'https://cricket-auction-server.onrender.com' : `http://${window.location.hostname}:3001`;

const DEFAULT_FORM_STATE = {
  name: '',
  skill: 'All-Rounder',
  country: 'India',
  category: 'Gold',
};

function PlayerManagement({ onDataChange }) {
  const { state } = useAuction();
  const { players } = state;
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE);
  const [editingPlayerId, setEditingPlayerId] = useState(null);

  useEffect(() => {
    if (editingPlayerId) {
      const playerToEdit = players.find(p => p.id === editingPlayerId);
      if (playerToEdit) {
        setFormState(playerToEdit);
      }
    } else {
      setFormState(DEFAULT_FORM_STATE);
    }
  }, [editingPlayerId, players]);

  const handleChange = (e) => {
    setFormState({ ...formState, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formState.name) {
      toast.error("Player name cannot be empty.");
      return;
    }

    try {
      if (editingPlayerId) {
        // Update existing player
        await axios.put(`${serverUrl}/players/${editingPlayerId}`, formState);
        toast.success(`Player "${formState.name}" updated successfully.`);
      } else {
        // Add new player
        await axios.post(`${serverUrl}/players`, formState);
        toast.success(`Player "${formState.name}" added successfully.`);
      }
      onDataChange(); // Trigger data refetch in App.js
      setEditingPlayerId(null);
      setFormState(DEFAULT_FORM_STATE);
    } catch (error) {
      console.error("Error saving player:", error);
      toast.error("Failed to save player.");
    }
  };

  const handleDelete = async (playerId, playerName) => {
    if (window.confirm(`Are you sure you want to delete ${playerName}? This cannot be undone.`)) {
      try {
        await axios.delete(`${serverUrl}/players/${playerId}`);
        toast.success(`Player "${playerName}" deleted.`);
        onDataChange();
      } catch (error) {
        console.error("Error deleting player:", error);
        toast.error("Failed to delete player.");
      }
    }
  };

  const cancelEdit = () => {
    setEditingPlayerId(null);
    setFormState(DEFAULT_FORM_STATE);
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const playersToImport = results.data.map(row => {
          const categoryRaw = row['Category'] || row['category'];
          let formattedCategory = null;
          // Check if category exists and is a string before processing
          if (categoryRaw && typeof categoryRaw === 'string') {
            const trimmedCategory = categoryRaw.trim();
            if (trimmedCategory) { // Ensure it's not an empty string after trimming
              formattedCategory = trimmedCategory.charAt(0).toUpperCase() + trimmedCategory.slice(1).toLowerCase();
            }
          }
          return {
            name: (row['Name'] || row['name'] || '').trim(),
            category: formattedCategory,
            skill: (row['Skill'] || row['skill'] || '').trim(),
            country: (row['Country'] || row['country'] || '').trim(),
          };
        }).filter(p => p.name && p.category);

        if (playersToImport.length === 0) {
          toast.error("No valid players found in CSV. Ensure columns 'Name' and 'Category' exist.");
          return;
        }

        try {
          const response = await axios.post(`${serverUrl}/players/bulk`, { players: playersToImport });
          toast.success(response.data);
          onDataChange(); // Refresh the player list
        } catch (error) {
          console.error("Error importing players:", error);
          toast.error("Failed to import players.");
        }
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        toast.error("Failed to parse CSV file.");
      }
    });
    e.target.value = null; // Reset file input
  };

  return (
    <div className="player-management-container">
      <div className="player-import-card">
        <h2>Import Players from CSV</h2>
        <p>Upload a CSV file with columns: <strong>Name, Category, Skill, Country</strong>. 'Name' and 'Category' are required.</p>
        <label className="import-csv-button">
          Import CSV
          <input type="file" accept=".csv" onChange={handleFileImport} style={{ display: 'none' }} />
        </label>
      </div>

      <div className="player-form-card">
        <h2>{editingPlayerId ? 'Edit Player' : 'Add New Player'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <input name="name" value={formState.name} onChange={handleChange} placeholder="Player Name" required />
            <input name="country" value={formState.country} onChange={handleChange} placeholder="Country" />
          </div>
          <div className="form-row">
            <select name="skill" value={formState.skill} onChange={handleChange}>
              <option value="Batsman">Batsman</option>
              <option value="Bowler">Bowler</option>
              <option value="All-Rounder">All-Rounder</option>
              <option value="Wicket-Keeper">Wicket-Keeper</option>
            </select>
            <select name="category" value={formState.category} onChange={handleChange}>
              <option value="Platinum">Platinum</option>
              <option value="Diamond">Diamond</option>
              <option value="Gold">Gold</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit">{editingPlayerId ? 'Update Player' : 'Add Player'}</button>
            {editingPlayerId && <button type="button" onClick={cancelEdit} className="cancel-btn">Cancel</button>}
          </div>
        </form>
      </div>

      <div className="player-list-card">
        <h2>All Players ({players.length})</h2>
        <div className="player-list-table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Skill</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td><span className={`player-category ${player.category}`}>{player.category}</span></td>
                  <td>{player.skill}</td>
                  <td>{player.status}</td>
                  <td className="player-actions">
                    <button onClick={() => setEditingPlayerId(player.id)} className="edit-btn">Edit</button>
                    <button onClick={() => handleDelete(player.id, player.name)} className="delete-btn">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default PlayerManagement;
