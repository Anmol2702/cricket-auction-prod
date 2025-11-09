// client/src/components/LoginScreen.js

import React, { useState } from 'react';

// This component receives the 'onLogin' function from App.js
function LoginScreen({ onLogin, teams }) {
  const [viewPreference, setViewPreference] = useState('continuous'); // 'continuous' or 'tabs'

  const handleLoginClick = (user) => {
    // Auctioneer always gets continuous view
    const finalViewPreference = user.role === 'auctioneer' ? 'continuous' : viewPreference;
    onLogin({ ...user, viewPreference: finalViewPreference });
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Welcome to the Auction</h2>
        <p>Please select your role to continue</p>

        <div className="view-preference">
          <h4>Select View Layout:</h4>
          <div className="view-preference-selector">
            <label>
              <input 
                type="radio" 
                name="view" 
                value="continuous" 
                checked={viewPreference === 'continuous'} 
                onChange={(e) => setViewPreference(e.target.value)} 
              />
              <span>Continuous Scroll</span>
            </label>
            <label>
              <input 
                type="radio" 
                name="view" 
                value="tabs" 
                checked={viewPreference === 'tabs'} 
                onChange={(e) => setViewPreference(e.target.value)} 
              />
              <span>Tabbed View</span>
            </label>
          </div>
        </div>

        <div className="login-buttons">
          <button onClick={() => handleLoginClick({ role: 'auctioneer' })}>
            Login as Auctioneer
          </button>
          
          {/* Create a login button for each team owner */}
          {teams.map(team => (
            <button key={team.id} onClick={() => handleLoginClick({ role: 'team_owner', teamId: team.id })}>
              Login as Owner ({team.name})
            </button>
          ))}

          <button onClick={() => handleLoginClick({ role: 'audience' })}>
            Login as Audience
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;