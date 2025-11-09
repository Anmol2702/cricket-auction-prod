import React, { useState } from 'react';
import { useAuction } from '../context/AuctionContext';
import './AuctionSettings.css';

function AuctionSettings({ onSettingsSet }) {
  const { state } = useAuction();
  const [settings, setSettings] = useState({ ...state.settings });

  const handleIncrementChange = (index, field, value) => {
    const newIncrements = [...settings.bidIncrements];
    newIncrements[index][field] = value;

    // Auto-update the 'from' of the next tier
    if (field === 'to' && index < newIncrements.length - 1) {
      newIncrements[index + 1].from = value;
    }

    setSettings({ ...settings, bidIncrements: newIncrements });
  };

  const handleChange = (e) => {
    setSettings({
      ...settings,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSettingsSet(settings);
  };

  return (
    <div className="settings-container">
      <form onSubmit={handleSubmit} className="settings-form">
        <h2>Set Auction Rules</h2>

        <div className="form-grid">
          <div className="form-group">
            <label>Timer Duration (s)</label>
            <input type="number" name="timerDuration" value={settings.timerDuration} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Initial Boosters</label>
            <input type="number" name="initialBoostersPerTeam" value={settings.initialBoostersPerTeam} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Platinum Base Price</label>
            <input type="number" name="platinumBasePrice" value={settings.platinumBasePrice} onChange={handleChange} step="100" />
          </div>
          <div className="form-group">
            <label>Gold Base Price</label>
            <input type="number" name="goldBasePrice" value={settings.goldBasePrice} onChange={handleChange} step="100" />
          </div>
          <div className="form-group">
            <label>Diamond Base Price</label>
            <input type="number" name="diamondBasePrice" value={settings.diamondBasePrice} onChange={handleChange} step="100" />
          </div>
          <div className="form-group">
            <label>Min Platinum Players</label>
            <input type="number" name="minPlatinumPlayers" value={settings.minPlatinumPlayers} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Min Gold Players</label>
            <input type="number" name="minGoldPlayers" value={settings.minGoldPlayers} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Min Diamond Players</label>
            <input type="number" name="minDiamondPlayers" value={settings.minDiamondPlayers} onChange={handleChange} />
          </div>
        </div>

        <h3>Bid Increments</h3>
        <div className="increment-tiers">
          {settings.bidIncrements.map((tier, index) => (
            <div key={index} className="increment-tier">
              <div className="form-group">
                <label>From</label>
                <input
                  type="number"
                  value={tier.from}
                  disabled // 'From' is derived from the previous 'To'
                />
              </div>
              <div className="form-group">
                <label>To</label>
                <input
                  type="number"
                  value={tier.to === Infinity ? '' : tier.to}
                  placeholder={index === settings.bidIncrements.length - 1 ? 'Infinity' : ''}
                  onChange={(e) => handleIncrementChange(index, 'to', e.target.value)}
                  disabled={index === settings.bidIncrements.length - 1}
                />
              </div>
              <div className="form-group">
                <label>Increment Step</label>
                <input
                  type="number"
                  value={tier.step}
                  onChange={(e) => handleIncrementChange(index, 'step', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <button type="submit" className="start-auction-btn">{state.settings.settingsSet ? 'Update Settings' : 'Start Auction'}</button>
      </form>
    </div>
  );
}

export default AuctionSettings;