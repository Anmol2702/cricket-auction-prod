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
import AuctionLog from './components/AuctionLog';
import { useAuction } from './context/AuctionContext';
import './App.css';

// Determine server URL dynamically. This works for both localhost and local network access.
const serverHostname = window.location.hostname;
const serverUrl = process.env.NODE_ENV === 'production' ? 'http://65.1.148.141:3001' : `http://${serverHostname}:3001`;
const socket = io(serverUrl);

function App() {
  const { state, dispatch } = useAuction();
  const { players, teams, currentPlayer, currentBid, leadingTeamId, user, timeLeft, soldPlayers, unsoldPlayers, settings } = state;
  const [auctioneerView, setAuctioneerView] = useState('auction'); // 'auction', 'players', or 'settings'

  useEffect(() => {
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

    return () => {
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
    };
  }, [dispatch]);

  const fetchData = useCallback(async () => {
    try {
      const teamsResponse = await axios.get(`${serverUrl}/teams`);
      // Always fetch players if user is logged in, not just on initial load
      const playersResponse = user ? await axios.get(`${serverUrl}/players`) : { data: [] };
      dispatch({
        type: 'SET_INITIAL_DATA',
        payload: { teams: teamsResponse.data, players: playersResponse.data },
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [user, dispatch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogin = (selectedUser) => {
    // If logging in as a team owner, enrich the user object with team details
    if (selectedUser.role === 'team_owner' && selectedUser.teamId) {
      const teamDetails = teams.find(t => t.id === selectedUser.teamId);
      if (teamDetails) {
        // The full user object now contains role, teamId, name, purse, etc.
        dispatch({ type: 'LOGIN', payload: { ...selectedUser, ...teamDetails } });
        return;
      }
    }
    dispatch({ type: 'LOGIN', payload: selectedUser }); // For auctioneer and audience
  };
  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
  };
  const handleNominateRandomPlayer = () => {
    socket.emit('nominate_random_player');
  };
  const handleResetAuction = async () => {
    if (window.confirm('Are you sure you want to reset the entire auction? This cannot be undone.')) {
      try {
        await axios.get(`${serverUrl}/reset-auction`);
        // The server will emit 'auction_reset' which is already handled to reload the page.
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

  const leadingTeam = teams.find(team => team.id === leadingTeamId);
  
  if (!user) {
    return <LoginScreen onLogin={handleLogin} teams={teams} />;
  }

  const isAuctioneer = user.role === 'auctioneer';

  // The initial settings screen is now handled by the auctioneer view toggle.
  if (isAuctioneer && !settings.settingsSet) {
    const handleSettingsSet = (newSettings) => {
      socket.emit('set_auction_settings', newSettings);
    };
    return <AuctionSettings onSettingsSet={handleSettingsSet} />;
  }

  const teamsWithSquads = teams.map(team => {
    const squad = soldPlayers.filter(p => p.status === 'sold' && p.soldTo === team.id);

    // Restore client-side maxBid calculation to ensure the UI (e.g., bid button) can be enabled/disabled correctly.
    // The server will still perform the final, authoritative validation upon receiving a bid.
    const currentDiamondCount = squad.filter(p => p.category === 'Diamond').length;
    const currentPlatinumCount = squad.filter(p => p.category === 'Platinum').length;
    const currentGoldCount = squad.filter(p => p.category === 'Gold').length;

    const diamondSlotsToFill = Math.max(0, settings.minDiamondPlayers - currentDiamondCount);
    const platinumSlotsToFill = Math.max(0, settings.minPlatinumPlayers - currentPlatinumCount);
    const goldSlotsToFill = Math.max(0, settings.minGoldPlayers - currentGoldCount);

    const moneyToReserveForDiamond = diamondSlotsToFill * settings.diamondBasePrice;
    const moneyToReserveForPlatinum = platinumSlotsToFill * settings.platinumBasePrice;
    const moneyToReserveForGold = goldSlotsToFill * settings.goldBasePrice;
    const totalMoneyToReserve = moneyToReserveForDiamond + moneyToReserveForPlatinum + moneyToReserveForGold;

    const disposableCash = team.purse - totalMoneyToReserve;

    let highestBasePriceNeeded = 0;
    if (diamondSlotsToFill > 0) {
      highestBasePriceNeeded = Math.max(highestBasePriceNeeded, settings.diamondBasePrice);
    }
    if (platinumSlotsToFill > 0) {
      highestBasePriceNeeded = Math.max(highestBasePriceNeeded, settings.platinumBasePrice);
    }
    if (goldSlotsToFill > 0) {
      highestBasePriceNeeded = Math.max(highestBasePriceNeeded, settings.goldBasePrice);
    }

    const maxBid = disposableCash + highestBasePriceNeeded;

    return {
      ...team,
      squad,
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
      <header className="App-header">
        <h1>Cricket Auction</h1>
        {user && <button onClick={handleLogout} className="logout-button">Logout</button>}
      </header>
      {isAuctioneer ? ( // AUCTIONEER VIEW
        <>
          <div className="view-toggle-container">
            <button onClick={() => setAuctioneerView('auction')} className={auctioneerView === 'auction' ? 'active' : ''}>Auction Dashboard</button>
            <button onClick={() => setAuctioneerView('players')} className={auctioneerView === 'players' ? 'active' : ''}>Player Management</button>
            <button onClick={() => setAuctioneerView('settings')} className={auctioneerView === 'settings' ? 'active' : ''}>Settings</button>
          </div>
          {(() => {
            switch (auctioneerView) {
              case 'players':
                return <PlayerManagement onDataChange={fetchData} />;
              case 'settings':
                return <AuctionSettings onSettingsSet={(newSettings) => socket.emit('set_auction_settings', newSettings)} />;
              case 'auction':
              default:
                return (
                  <main className="auction-container">
                    <PlayerList availablePlayers={players} unsoldPlayers={unsoldPlayers} />
                    <div className="right-panel">
                      <AuctioneerControls onSell={handleSellPlayer} onNominateRandom={handleNominateRandomPlayer} onReset={handleResetAuction} currentPlayer={currentPlayer} leadingTeamId={leadingTeamId} />
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