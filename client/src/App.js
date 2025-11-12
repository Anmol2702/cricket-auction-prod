import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PlayerList from './components/PlayerList';
import TeamDashboard from './components/TeamDashboard';
import PlayerSpotlight from './components/PlayerSpotlight';
import BiddingControls from './components/BiddingControls';
import AuctioneerControls from './components/AuctioneerControls';
import LoginScreen from './components/LoginScreen';
import Tabs from './components/Tabs';
import AuctionSettings from './components/AuctionSettings';
import './components/AuctionSettings.css';
import PlayerManagement from './components/PlayerManagement';
import UserManagement from './components/UserManagement';
import TeamManagement from './components/TeamManagement';
import AuctionLog from './components/AuctionLog';
import MockAuctionControl from './components/MockAuctionControl';
import { useAuction } from './context/AuctionContext';
import './App.css';

// Determine server URL dynamically. This works for both localhost and local network access.
const serverHostname = window.location.hostname;
const serverUrl = process.env.NODE_ENV === 'production' ? 'http://65.1.148.141:3001' : `http://${serverHostname}:3001`;
const socket = io(serverUrl, { // Forcing polling as a more robust connection method to bypass potential WebSocket issues.
  transports: ['polling'],
});

// Helper function for fuzzy string matching (Levenshtein distance)
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // increment along the first column of each row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // increment each column in the first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function App() {
  const { state, dispatch } = useAuction();
  const { players, teams, currentPlayer, currentBid, leadingTeamId, user, timeLeft, soldPlayers, unsoldPlayers, settings } = state;
  console.log('%c--- App Component Render ---', 'color: blue; font-weight: bold;');
  console.log('Current user state on render:', user);

  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [showMockModal, setShowMockModal] = useState(false);
  const [isMockingInProgress, setIsMockingInProgress] = useState(false);
  const [auctioneerView, setAuctioneerView] = useState('auction'); // 'auction', 'players', or 'settings'

  const fetchData = useCallback(async () => {
    try {
      const teamsResponse = await axios.get(`${serverUrl}/teams`);
      // Always fetch players so the audience can see the lists.
      const playersResponse = await axios.get(`${serverUrl}/players`);
      dispatch({
        type: 'SET_INITIAL_DATA',
        payload: { teams: teamsResponse.data, players: playersResponse.data },
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [dispatch]);

  useEffect(() => {
    socket.on('connect_error', (err) => {
      console.error("Socket connection error:", err.message);
      toast.error(`Connection Error: ${err.message}`);
    });

    socket.on('auction_state_sync', (state) => {
      dispatch({ type: 'AUCTION_STATE_SYNC', payload: state });
    });

    socket.on('timer_update', (time) => {
      dispatch({ type: 'TIMER_UPDATE', payload: time });
    });
    socket.on('player_nominated', (player) => {
      dispatch({ type: 'PLAYER_NOMINATED', payload: player });
    });
    socket.on('bid_update', (data) => {
      dispatch({ type: 'BID_UPDATE', payload: data });
    });
    socket.on('player_sold', (data) => {
      dispatch({ type: 'PLAYER_SOLD', payload: data });
    });
    socket.on('player_unsold', (data) => {
      dispatch({ type: 'PLAYER_UNSOLD', payload: data });
    });

    socket.on('auction_reset', () => {
      toast.info("The auction is being reset by the admin. The page will reload shortly.");
      // Log out the user to clear stale session data from localStorage
      dispatch({ type: 'LOGOUT' });
      // Reload the page to get a fresh state from the server, forcing re-login
      setTimeout(() => window.location.reload(), 3000);
    });

    socket.on('no_players_available', () => {
      toast.warn("There are no more players available to nominate.");
    });

    socket.on('new_round_started', () => {
      dispatch({ type: 'NEW_ROUND_STARTED' });
    });

    socket.on('bid_error', (message) => {
      toast.error(`Bid Failed: ${message}`);
    });

    socket.on('booster_applied', (data) => {
      dispatch({ type: 'BOOSTER_APPLIED', payload: data });
    });

    socket.on('booster_error', (message) => {
      toast.error(`Booster Failed: ${message}`);
    });

    socket.on('team_updated', ({ updatedTeam }) => {
      dispatch({ type: 'TEAM_UPDATED', payload: updatedTeam });
    });

    // New listener to force a full data refetch for all clients
    socket.on('force_refetch_data', () => {
      fetchData();
    });

    socket.on('mock_auction_complete', (message) => {
      toast.success(message);
      setIsMockingInProgress(false);
      setShowMockModal(false); // Close modal on completion
    });

    socket.on('mock_auction_error', (message) => {
      toast.error(`Mock Auction Failed: ${message}`);
      setIsMockingInProgress(false);
      setShowMockModal(false); // Close modal on error
    });


    return () => {
      socket.off('connect_error');
      socket.off('auction_state_sync');
      socket.off('timer_update');
      socket.off('player_nominated');
      socket.off('bid_update');
      socket.off('player_sold');
      socket.off('player_unsold');
      socket.off('auction_reset');
      socket.off('no_players_available');
      socket.off('new_round_started');
      socket.off('bid_error');
      socket.off('booster_applied');
      socket.off('booster_error');
      socket.off('team_updated');
      socket.off('force_refetch_data');
      socket.off('mock_auction_complete');
      socket.off('mock_auction_error');
    };
  }, [dispatch, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogin = (loggedInUser) => {
    // The user object from the server is already enriched with team data.
    console.log('%cApp.js: handleLogin called. Dispatching user to context:', 'color: green; font-weight: bold;', loggedInUser);
    dispatch({ type: 'LOGIN', payload: loggedInUser });
    console.log('%cApp.js: dispatch has been called.', 'color: green; font-weight: bold;');
  };
  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
  };
  const handleStartMockAuction = (numberOfPlayers) => {
    setIsMockingInProgress(true);
    socket.emit('start_mock_auction', { numberOfPlayers });
    setShowMockModal(false); // Close modal immediately to watch the auction
  };

  const handleNominateRandomPlayer = () => {
    socket.emit('nominate_random_player');
  };
  const handleResetAuction = async () => {
    if (window.confirm('Are you sure you want to reset the entire auction? This cannot be undone.')) {
      try {
        const response = await axios.get(`${serverUrl}/reset-auction`);
        // The server will emit 'auction_reset' which is already handled to reload the page.
        if (response.data.initialPasswords) {
          const passwords = response.data.initialPasswords;
          const passwordMessage = Object.entries(passwords)
            .map(([username, password]) => `${username}: ${password}`)
            .join('\n');
          alert('Auction Reset! Initial Passwords:\n\n' + passwordMessage + '\n\nPlease share these securely.');
        }
      } catch (error) {
        console.error("Error resetting auction:", error);
        toast.error("Failed to reset the auction. Please check the server logs.");
      }
    }
  };
  const handleApplyBooster = (teamId) => {
    socket.emit('apply_booster', { teamId });
  };
  const handleSellPlayer = () => { socket.emit('sell_player'); };
  const handleBid = (teamId) => {
    if (currentPlayer && teamId) {
      socket.emit('make_bid', { teamId });
    }
  };
  const handleNewRound = () => {
    socket.emit('start_new_round');
  };
  const handleHardcodeAssignments = async () => {
    if (!window.confirm('Are you sure you want to assign the 6 core players? This will override any previous sales for these players.')) {
      return;
    }

    // Using the full names which are most likely correct based on user feedback history.
    const assignments = [
      { playerName: 'Anmol Khilwani', teamName: 'Anmol Team', price: 25000 },
      { playerName: 'Shubam Chichar', teamName: 'Shubam Chichar Team', price: 25000 },
      { playerName: 'Karan Shadija', teamName: 'Karan Shadija Team', price: 10000 },
      { playerName: 'Sourabh Raheja', teamName: 'Sourabh Raheja Team', price: 10000 },
      { playerName: 'Mohit', teamName: 'Mohit Tolani Team', price: 10000 },
      { playerName: 'Raghav', teamName: 'Raghav Sahu Team', price: 10000 }
    ];

    const allPlayers = [...players, ...soldPlayers, ...unsoldPlayers];
    const assignmentPromises = [];

    console.log(`--- Starting Hardcoded Assignments ---`);
    console.log(`Found ${allPlayers.length} total players and ${teams.length} teams.`);

    for (const assignment of assignments) {
      // Fuzzy find player using Levenshtein distance
      let bestMatch = null;
      let minDistance = Infinity;
      const targetPlayerName = assignment.playerName.toLowerCase();

      for (const p of allPlayers) {
        const distance = levenshteinDistance(p.name.toLowerCase(), targetPlayerName);
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = p;
        }
      }
      
      console.log(`[Assignment for: ${assignment.playerName}]`);
      console.log(` -> Fuzzy match found: '${bestMatch?.name}' with distance ${minDistance}.`);

      // Set a threshold for matching. If distance is > 3, it's likely not the right player.
      const player = (minDistance <= 3) ? bestMatch : null;
      const team = teams.find(t => t.name.toLowerCase() === assignment.teamName.toLowerCase());

      if (player && team) {
        console.log(` -> SUCCESS: Found player '${player.name}' and team '${team.name}'. Preparing assignment.`);
        if (player.status === 'sold') {
          // Use the 'reassign' endpoint as it correctly handles refunds.
          assignmentPromises.push(
            axios.post(`${serverUrl}/players/${player.id}/reassign`, { newTeamId: team.id, price: assignment.price })
          );
        } else {
          // For 'available' or 'unsold' players, use the simpler 'assign' endpoint.
          assignmentPromises.push(
            axios.post(`${serverUrl}/players/${player.id}/assign`, { teamId: team.id, price: assignment.price })
          );
        }
      } else {
        console.error(` -> FAILURE: Could not complete assignment for "${assignment.playerName}".`);
        if (!player) console.error(`    - Reason: Player not found or match distance (${minDistance}) too high.`);
        if (!team) console.error(`    - Reason: Team "${assignment.teamName}" not found.`);
        toast.warn(`Could not find player "${assignment.playerName}" or team "${assignment.teamName}".`);
      }
    }

    if (assignmentPromises.length === 0) {
        toast.error("No valid assignments could be prepared. Please check player and team names.");
        return;
    }

    try {
      // Use Promise.allSettled to see results of all promises, even if some fail.
      const results = await Promise.allSettled(assignmentPromises);
      let successCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          console.error(`Assignment failed for promise ${index}:`, result.reason.response?.data || result.reason.message);
          toast.error(`An assignment failed. Check console for details.`);
        }
      });

      if (successCount > 0) {
        toast.success(`${successCount} core players assigned successfully!`);
      }
      console.log('--- Finished Hardcoded Assignments ---');

    } catch (error) {
      // This catch block is less likely to be hit with allSettled, but good to have.
      console.error("A critical error occurred during hardcode assignments:", error);
      toast.error('A critical error occurred. Check the console.');
    }
  };

  const leadingTeam = teams.find(team => team.id === leadingTeamId);
  
  // --- PRIMARY RENDER LOGIC ---

  // Case 1: User is NOT logged in.
  if (!user) {
    if (showLoginScreen) {
      return <LoginScreen onLogin={(loggedInUser) => {
        handleLogin(loggedInUser);
        setShowLoginScreen(false); // Hide login screen on success
      }} />;
    }
    // If not showing login screen, render the Audience View.
    return (
      <div className="App">
        <ToastContainer position="top-center" autoClose={3000} hideProgressBar={false} />
        <header className="App-header">
          <h1>Cricket Auction</h1>
          <button onClick={() => setShowLoginScreen(true)} className="login-button">Login as Auctioneer/Team</button>
        </header>
        <main className="auction-container">
          <PlayerList availablePlayers={players} unsoldPlayers={unsoldPlayers} />
          <div className="right-panel">
            <PlayerSpotlight player={currentPlayer} timeLeft={timeLeft} currentBid={currentBid} leadingTeam={leadingTeam} />
            <TeamDashboard teams={teams.map(t => ({...t, squad: soldPlayers.filter(p => p.soldTo === t.id || p.teamId === t.id)}))} leadingTeamId={leadingTeamId} user={{ role: 'audience' }} onApplyBooster={() => {}} />
            <AuctionLog soldPlayers={soldPlayers} teams={teams} />
          </div>
        </main>
      </div>
    );
  }

  // Case 2: User IS logged in. All code from here assumes `user` is not null.
  const isAuctioneer = user.role === 'auctioneer';

  // --- Guard Clause: The Definitive Fix ---
  // If a user is logged in but the settings haven't been configured by the auctioneer yet,
  // we must show a waiting screen. This prevents the app from crashing when it tries to access
  // properties of a non-existent 'settings' object during the race condition.
  if (user && (!settings || !settings.settingsSet)) {
    if (isAuctioneer) {
      // If the user is the auctioneer, show them the settings page to get started.
      return <AuctionSettings onSettingsSet={(newSettings) => socket.emit('set_auction_settings', newSettings)} />;
    } else {
      // If the user is a team owner, they must wait for the auctioneer to act.
      return (
        <div className="App">
          <header className="App-header"><h1>Cricket Auction</h1></header>
          <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.5rem' }}>
            <h2>Waiting for the auctioneer to start the auction...</h2>
          </div>
        </div>
      );
    }
  }

  const teamsWithSquads = teams.map(team => {
    // This now checks for both `soldTo` (from live auction) and `teamId` (from manual assignment)
    const squad = soldPlayers.filter(p => p.status === 'sold' && (p.soldTo === team.id || p.teamId === team.id));

    // Restore client-side maxBid calculation to ensure the UI (e.g., bid button) can be enabled/disabled correctly.
    // The server will still perform the final, authoritative validation upon receiving a bid.
    const currentDiamondCount = squad.filter(p => p.category === 'Diamond').length;
    const currentPlatinumCount = squad.filter(p => p.category === 'Platinum').length;
    const currentGoldCount = squad.filter(p => p.category === 'Gold').length;

    let diamondSlotsToFill = Math.max(0, settings.minDiamondPlayers - currentDiamondCount);
    let platinumSlotsToFill = Math.max(0, settings.minPlatinumPlayers - currentPlatinumCount);
    let goldSlotsToFill = Math.max(0, settings.minGoldPlayers - currentGoldCount);

    // This logic must match the server's calculateMaxBidForTeam function
    if (currentPlayer) {
      const category = currentPlayer.category;
      if (category === 'Diamond' && diamondSlotsToFill > 0) diamondSlotsToFill--;
      else if (category === 'Platinum' && platinumSlotsToFill > 0) platinumSlotsToFill--;
      else if (category === 'Gold' && goldSlotsToFill > 0) goldSlotsToFill--;
    }

    const moneyToReserve = 
      (diamondSlotsToFill * settings.diamondBasePrice) +
      (platinumSlotsToFill * settings.platinumBasePrice) +
      (goldSlotsToFill * settings.goldBasePrice);

    const maxBid = team.purse - moneyToReserve;

    return {
      ...team,
      squad,
      // This is the key fix: Pass the calculated counts into the team object.
      diamondPlayersCount: currentDiamondCount,
      platinumPlayersCount: currentPlatinumCount,
      goldPlayersCount: currentGoldCount,
      maxBid: maxBid > 0 ? maxBid : 0, // Ensure maxBid is not negative
    };
  });

  const userTeamWithDetails = user && user.teamId ? teamsWithSquads.find(t => t.id === user.teamId) : null;

  const nonAuctioneerTabs = [];
  if (user && user.role === 'team_owner') {
    nonAuctioneerTabs.push({
      label: 'Bidding',
      content: <BiddingControls 
                  onBid={handleBid}
                  user={{...user, ...(userTeamWithDetails || {})}}
                  leadingTeamId={leadingTeamId}
                  currentPlayer={currentPlayer}
                />
    });
  }
  if (user) {
    nonAuctioneerTabs.push({
      label: 'Team Dashboards',
      content: <TeamDashboard
                  teams={teamsWithSquads}
                  leadingTeamId={leadingTeamId}
                  user={user}
                  onApplyBooster={handleApplyBooster}
                />
    });
    nonAuctioneerTabs.push({
      label: 'Auction Log',
      content: <AuctionLog soldPlayers={soldPlayers} teams={teams} />
    });
    nonAuctioneerTabs.push({
      label: 'Player List',
      content: <PlayerList availablePlayers={players} unsoldPlayers={unsoldPlayers} />
    });
  }

  return (
    <div className="App">
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar={false} />
      {showMockModal && (
        <MockAuctionControl 
          onStart={handleStartMockAuction}
          onClose={() => setShowMockModal(false)}
          isMocking={isMockingInProgress}
        />
      )}
      {/* Header for Logged-in Users */}
      <header className="App-header">
        <h1>Cricket Auction</h1>
        {user && <button onClick={handleLogout} className="logout-button">Logout</button>}
      </header>
      
      {isAuctioneer ? ( // AUCTIONEER VIEW
        <>
          <div className="view-toggle-container">
            <button onClick={() => setAuctioneerView('auction')} className={auctioneerView === 'auction' ? 'active' : ''}>Auction Dashboard</button>
            <button onClick={() => setAuctioneerView('players')} className={auctioneerView === 'players' ? 'active' : ''}>Player Management</button>
            <button onClick={() => setAuctioneerView('users')} className={auctioneerView === 'users' ? 'active' : ''}>User Management</button>
            <button onClick={() => setAuctioneerView('teams')} className={auctioneerView === 'teams' ? 'active' : ''}>Team Management</button>
            <button onClick={() => setAuctioneerView('settings')} className={auctioneerView === 'settings' ? 'active' : ''}>Settings</button>
          </div>
          {(() => {
            switch (auctioneerView) {
              case 'players':
                return <PlayerManagement onDataChange={fetchData} serverUrl={serverUrl} />;
              case 'users':
                return <UserManagement serverUrl={serverUrl} />;
              case 'teams':
                return <TeamManagement serverUrl={serverUrl} />;
              case 'settings':
                return <AuctionSettings onSettingsSet={(newSettings) => socket.emit('set_auction_settings', newSettings)} />;
              case 'auction':
              default:
                return (
                  <main className="auction-container">
                    <PlayerList availablePlayers={players} unsoldPlayers={unsoldPlayers} />
                    <div className="right-panel">
                      <AuctioneerControls onSell={handleSellPlayer} onNominateRandom={handleNominateRandomPlayer} onReset={handleResetAuction} onMock={() => setShowMockModal(true)} onHardcodeAssign={handleHardcodeAssignments} onNewRound={handleNewRound} isMocking={isMockingInProgress} currentPlayer={currentPlayer} leadingTeamId={leadingTeamId} unsoldPlayers={unsoldPlayers} />
                      <PlayerSpotlight player={currentPlayer} timeLeft={timeLeft} currentBid={currentBid} leadingTeam={leadingTeam} />
                      <TeamDashboard teams={teamsWithSquads} leadingTeamId={leadingTeamId} user={user} onApplyBooster={handleApplyBooster} />
                      <AuctionLog soldPlayers={soldPlayers} teams={teams} />
                    </div>
                  </main>
                );
            }
          })()}
        </>
      ) : (
        <main className="auction-container">
          {/* --- TEAM OWNER / AUDIENCE LAYOUT (mobile-friendly) --- */}
          {user.viewPreference === 'tabs' ? (
            <div className="tab-view-panel">
              <PlayerSpotlight player={currentPlayer} timeLeft={timeLeft} currentBid={currentBid} leadingTeam={leadingTeam} />
              <Tabs tabs={nonAuctioneerTabs} />
            </div>
          ) : (
            <>
              <div className="right-panel">
                <PlayerSpotlight player={currentPlayer} timeLeft={timeLeft} currentBid={currentBid} leadingTeam={leadingTeam} />
                {user.role === 'team_owner' && (
                  <BiddingControls 
                    onBid={handleBid} 
                    user={{...user, ...(userTeamWithDetails || {})}}
                    leadingTeamId={leadingTeamId}
                    currentPlayer={currentPlayer}
                  />
                )}
                <TeamDashboard
                  teams={teamsWithSquads}
                  leadingTeamId={leadingTeamId}
                  user={user}
                  onApplyBooster={handleApplyBooster}
                />
                <AuctionLog soldPlayers={soldPlayers} teams={teams} />
              </div>
              <PlayerList availablePlayers={players} unsoldPlayers={unsoldPlayers} />
            </>
          )}
        </main>
      )}
    </div>
  );
}

export default App;