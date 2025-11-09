import React, { createContext, useReducer, useContext } from 'react';
import { toast } from 'react-toastify';

const AuctionContext = createContext();

// Restore user from localStorage
const savedUser = localStorage.getItem('auctionUser');
const initialUser = savedUser ? JSON.parse(savedUser) : null;

const initialState = {
  players: [],
  teams: [],
  currentPlayer: null,
  currentBid: 0,
  leadingTeamId: null,
  user: initialUser,
  unsoldPlayers: [],
  soldPlayers: [],
  settings: {
    timerDuration: 15,
    platinumBasePrice: 3000,
    goldBasePrice: 5000,
    minPlatinumPlayers: 2,
    minGoldPlayers: 3,
    pointsPerBooster: 10000,
    initialBoostersPerTeam: 3,
    settingsSet: false,
    bidIncrements: [
      { from: 0, to: 10000, step: 1000 },
      { from: 10000, to: 30000, step: 2000 },
      { from: 30000, to: Infinity, step: 5000 },
    ],
  },
  timeLeft: 0,
};

function auctionReducer(state, action) {
  switch (action.type) {
    case 'SET_INITIAL_DATA': {
      const allPlayers = action.payload.players;
      const availablePlayers = allPlayers.filter(p => p.status === 'available');
      const unsoldPlayers = allPlayers.filter(p => p.status === 'unsold');
      const logPlayers = allPlayers
        .filter(p => p.status === 'sold' || p.status === 'unsold')
        .map(p => (p.status === 'sold' ? { ...p, price: p.sellingPrice, soldTo: p.teamId } : p))
        .sort((a, b) => (b.soldAt?.seconds || 0) - (a.soldAt?.seconds || 0));

      return {
        ...state,
        teams: action.payload.teams,
        players: availablePlayers,
        unsoldPlayers: unsoldPlayers,
        soldPlayers: logPlayers,
      };
    }
    case 'LOGIN':
      localStorage.setItem('auctionUser', JSON.stringify(action.payload));
      return { ...state, user: action.payload };
    case 'LOGOUT':
      localStorage.removeItem('auctionUser');
      return { ...state, user: null };
    case 'AUCTION_STATE_SYNC':
      return {
        ...state,
        currentPlayer: action.payload.player,
        currentBid: action.payload.currentBid,
        leadingTeamId: action.payload.leadingTeamId,
        timeLeft: action.payload.timeLeft,
        settings: action.payload.settings || state.settings,
      };
    case 'TIMER_UPDATE':
      return { ...state, timeLeft: action.payload };
    case 'PLAYER_NOMINATED':
      return { ...state, currentPlayer: action.payload };
    case 'BID_UPDATE':
      return {
        ...state,
        currentBid: action.payload.currentBid,
        leadingTeamId: action.payload.leadingTeamId,
      };
    case 'PLAYER_SOLD': {
      const { player, soldTo, price, updatedTeam, bidHistory } = action.payload;
      const winningTeam = state.teams.find(t => t.id === soldTo);
      if (winningTeam) toast.success(`${player.name} sold to ${winningTeam.name} for ₹${price}!`, {
        toastId: `${player.id}-sold`,
      });
      
      const newLogEntry = { ...player, soldTo, price, status: 'sold', bidHistory };

      // Check if the logged-in user is the one who bought the player and update their state
      let updatedUser = state.user;
      if (state.user && state.user.teamId === soldTo) {
        updatedUser = { ...state.user, ...updatedTeam };
        localStorage.setItem('auctionUser', JSON.stringify(updatedUser)); // Persist change
      }

      return {
        ...state,
        // Use the authoritative team data from the server instead of calculating locally
        teams: state.teams.map(team => (team.id === soldTo ? updatedTeam : team)),
        players: state.players.filter(p => p.id !== player.id),
        currentPlayer: null,
        soldPlayers: [newLogEntry, ...state.soldPlayers],
        user: updatedUser,
      };
    }
    case 'PLAYER_UNSOLD': {
      const { player } = action.payload;
      toast.info(`${player.name} went unsold at ₹${player.basePrice}.`, {
        toastId: `${player.id}-unsold`,
      });
      const newLogEntry = { ...player, status: 'unsold' };
      return {
        ...state,
        currentPlayer: null,
        players: state.players.filter(p => p.id !== player.id), // Remove from available
        unsoldPlayers: [...state.unsoldPlayers, player], // Add to unsold
        soldPlayers: [newLogEntry, ...state.soldPlayers],
      };
    }
    case 'NEW_ROUND_STARTED': {
      toast.info("All unsold players are now available for nomination again!");
      return {
        ...state,
        players: [...state.players, ...state.unsoldPlayers],
        unsoldPlayers: [],
      };
    }
    case 'BOOSTER_APPLIED': {
      const { updatedTeam } = action.payload;
      toast.success(`Booster applied to ${updatedTeam.name}!`, {
        toastId: `${updatedTeam.id}-booster-${updatedTeam.boostersAvailable}`
      });
      
      let updatedUser = state.user;
      if (state.user && state.user.teamId === updatedTeam.id) {
          updatedUser = { ...state.user, ...updatedTeam };
          localStorage.setItem('auctionUser', JSON.stringify(updatedUser));
      }
  
      return {
          ...state,
          teams: state.teams.map(team => team.id === updatedTeam.id ? updatedTeam : team),
          user: updatedUser,
      };
    }
    default:
      return state;
  }
}

export function AuctionProvider({ children }) {
  const [state, dispatch] = useReducer(auctionReducer, initialState);
  return (
    <AuctionContext.Provider value={{ state, dispatch }}>
      {children}
    </AuctionContext.Provider>
  );
}

export const useAuction = () => useContext(AuctionContext);