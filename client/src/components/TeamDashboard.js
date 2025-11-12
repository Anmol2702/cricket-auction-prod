import React, { useState } from 'react';

// We now accept leadingTeamId to know which card to highlight
function TeamDashboard({ teams, leadingTeamId, user, onApplyBooster }) {
  const [expandedTeamId, setExpandedTeamId] = useState(null);

  const handleTeamClick = (teamId) => {
    setExpandedTeamId(expandedTeamId === teamId ? null : teamId);
  };

  const handleBoosterClick = (e, teamId) => {
    e.stopPropagation(); // Prevent card from toggling when booster button is clicked
    onApplyBooster(teamId);
  };

  return (
    <div className="team-dashboard-container">
      <h2>Team Dashboards</h2>
      <div className="team-cards">
        {teams.map(team => {
          // Check if the current team's card is the winning one
          const isLeading = team.id === leadingTeamId;
          const isExpanded = team.id === expandedTeamId;
          return (
            <div 
              key={team.id} 
              // Conditionally apply the 'winning' class
              className={`team-card ${isLeading ? 'winning' : ''} ${isExpanded ? 'expanded' : ''}`}
              onClick={() => handleTeamClick(team.id)}
            >
              <h3>{team.name}</h3>
              <p>Owner: {team.ownerName}</p>
              <p>Purse: {team.purse} P</p>
              <p className="max-bid">Max Bid: ₹{team.maxBid}</p>
              {user.role === 'auctioneer' && (
                <button
                  className="booster-btn team-booster-btn"
                  onClick={(e) => handleBoosterClick(e, team.id)}
                  disabled={team.boostersAvailable <= 0}
                >
                  Give Booster ({team.boostersAvailable} left)
                </button>
              )}
              {isExpanded && (
                <div className="squad-list">
                  <h4>Squad ({team.squad.length})</h4>
                  <ul>
                    {team.squad.length > 0 ? (
                      team.squad.map(player => (
                        <li key={player.id}>{player.name} - ₹{player.sellingPrice}</li>
                      ))
                    ) : (
                      <li>No players bought yet.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TeamDashboard;