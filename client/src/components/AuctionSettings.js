import React, { useState, useEffect } from 'react';
import './AuctionSettings.css';
import { toast } from 'react-toastify';
import { useAuction } from '../context/AuctionContext';

// These default settings provide a safe fallback and prevent crashes.
const defaultSettings = {
  timerDuration: 15,
  platinumBasePrice: 3000,
  goldBasePrice: 5000,
  diamondBasePrice: 10000,
  minPlatinumPlayers: 2,
  minGoldPlayers: 3,
  minDiamondPlayers: 1,
  pointsPerBooster: 10000,
  initialBoostersPerTeam: 3,
  bidIncrements: [
    { from: 0, to: 10000, step: 1000 },
    { from: 10000, to: 30000, step: 2000 },
    { from: 30000, to: '', step: 5000 }, // Use empty string for Infinity in UI
  ],
};

const AuctionSettings = ({ onSettingsSet }) => {
  const { state } = useAuction();
  const { settings } = state;

  // Initialize state from the live auction settings if they exist, otherwise use defaults.
  // This is the key fix: the form will now show the current settings.
  const [formState, setFormState] = useState(
    settings && settings.bidIncrements ? settings : defaultSettings
  );

  // This effect keeps the form in sync if the settings are updated from the server
  // while the component is open.
  useEffect(() => {
    if (settings && settings.bidIncrements) {
      // The server stores 'Infinity', but the UI input needs an empty string.
      const uiFriendlySettings = {
        ...settings,
        bidIncrements: settings.bidIncrements.map(tier => ({ ...tier, to: tier.to === Infinity ? '' : tier.to })),
      };
      setFormState(uiFriendlySettings);
    }
  }, [settings]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleTierChange = (index, field, value) => {
    const newTiers = [...formState.bidIncrements];
    newTiers[index][field] = value;
    setFormState(prev => ({ ...prev, bidIncrements: newTiers }));
  };

  const addTier = () => {
    const lastTier = formState.bidIncrements[formState.bidIncrements.length - 1];
    setFormState(prev => ({
      ...prev,
      bidIncrements: [
        ...prev.bidIncrements,
        { from: lastTier.to || 0, to: '', step: 5000 }
      ]
    }));
  };

  const removeTier = (index) => {
    if (formState.bidIncrements.length <= 1) return;
    const newTiers = formState.bidIncrements.filter((_, i) => i !== index);
    setFormState(prev => ({ ...prev, bidIncrements: newTiers }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSettingsSet(formState);
    toast.success('Auction settings saved successfully!');
  };

  return (
    <div className="settings-container">
      <form onSubmit={handleSubmit} className="settings-form">
        <h2>Auction Settings</h2>
        
        <div className="settings-section">
          <h3>General</h3>
          <div className="form-group">
            <label>Timer Duration (seconds)</label>
            <input type="number" name="timerDuration" value={formState.timerDuration} onChange={handleChange} />
          </div>
        </div>

        <div className="settings-section">
          <h3>Base Prices</h3>
          <div className="form-group">
            <label>Diamond Base Price</label>
            <input type="number" name="diamondBasePrice" value={formState.diamondBasePrice} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Platinum Base Price</label>
            <input type="number" name="platinumBasePrice" value={formState.platinumBasePrice} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Gold Base Price</label>
            <input type="number" name="goldBasePrice" value={formState.goldBasePrice} onChange={handleChange} />
          </div>
        </div>

        <div className="settings-section">
          <h3>Team Composition</h3>
          <div className="form-group">
            <label>Min Diamond Players</label>
            <input type="number" name="minDiamondPlayers" value={formState.minDiamondPlayers} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Min Platinum Players</label>
            <input type="number" name="minPlatinumPlayers" value={formState.minPlatinumPlayers} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Min Gold Players</label>
            <input type="number" name="minGoldPlayers" value={formState.minGoldPlayers} onChange={handleChange} />
          </div>
        </div>

        <div className="settings-section">
          <h3>Boosters</h3>
          <div className="form-group">
            <label>Points per Booster</label>
            <input type="number" name="pointsPerBooster" value={formState.pointsPerBooster} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Initial Boosters per Team</label>
            <input type="number" name="initialBoostersPerTeam" value={formState.initialBoostersPerTeam} onChange={handleChange} />
          </div>
        </div>

        <div className="settings-section">
          <h3>Bid Increments</h3>
          {formState.bidIncrements.map((tier, index) => (
            <div key={index} className="tier-row">
              <input type="number" value={tier.from} onChange={(e) => handleTierChange(index, 'from', e.target.value)} placeholder="From" />
              <input type="number" value={tier.to} onChange={(e) => handleTierChange(index, 'to', e.target.value)} placeholder="To (leave blank for infinity)" />
              <input type="number" value={tier.step} onChange={(e) => handleTierChange(index, 'step', e.target.value)} placeholder="Step" />
              <button type="button" onClick={() => removeTier(index)} className="remove-tier-btn">&times;</button>
            </div>
          ))}
          <button type="button" onClick={addTier} className="add-tier-btn">Add Tier</button>
        </div>

        <button type="submit" className="save-settings-btn">Save Settings & Start Auction</button>
      </form>
    </div>
  );
};

export default AuctionSettings;