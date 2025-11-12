import React, { createContext, useReducer, useContext } from 'react';

const AuctionContext = createContext();

const initialState = {
  players: [],
  teams: [],
  soldPlayers: [],
  unsoldPlayers: [],
  currentPlayer: null,
  currentBid: 0,
  leadingTeamId: null,
  timeLeft: 0,
  user: JSON.parse(localStorage.getItem('user')), // Load user from localStorage
  settings: {},
};

function auctionReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      localStorage.setItem('user', JSON.stringify(action.payload));
      return { ...state, user: action.payload };
    case 'LOGOUT':
      localStorage.removeItem('user');
      return { ...state, user: null };
    case 'SET_INITIAL_DATA':
      const allPlayers = action.payload.players || [];
      const soldPlayers = allPlayers.filter(p => p.status === 'sold');
      const unsoldPlayers = allPlayers.filter(p => p.status === 'unsold');
      const availablePlayers = allPlayers.filter(p => p.status === 'available');
      return {
        ...state,
        teams: action.payload.teams || state.teams,
        players: availablePlayers,
        soldPlayers: soldPlayers,
        unsoldPlayers: unsoldPlayers,
      };
    case 'AUCTION_STATE_SYNC':
      return { ...state, ...action.payload };
    case 'TIMER_UPDATE':
      return { ...state, timeLeft: action.payload };
    case 'PLAYER_NOMINATED':
      return { ...state, currentPlayer: action.payload, currentBid: action.payload.basePrice, leadingTeamId: null };
    case 'BID_UPDATE':
      return { ...state, currentBid: action.payload.currentBid, leadingTeamId: action.payload.leadingTeamId };
    case 'PLAYER_SOLD':
      return {
        ...state,
        players: state.players.filter(p => p.id !== action.payload.player.id),
        soldPlayers: [...state.soldPlayers, { 
          ...action.payload.player, 
          status: 'sold', 
          sellingPrice: action.payload.price, 
          soldTo: action.payload.soldTo,
          // This is the crucial fix: add the bidHistory from the event payload
          bidHistory: action.payload.bidHistory 
        }],
        teams: state.teams.map(t => t.id === action.payload.updatedTeam.id ? action.payload.updatedTeam : t),
        currentPlayer: null,
        currentBid: 0,
        leadingTeamId: null,
      };
    case 'PLAYER_UNSOLD':
      return {
        ...state,
        players: state.players.filter(p => p.id !== action.payload.player.id),
        unsoldPlayers: [...state.unsoldPlayers, { ...action.payload.player, status: 'unsold' }],
        currentPlayer: null,
        currentBid: 0,
        leadingTeamId: null,
      };
    case 'NEW_ROUND_STARTED':
        return {
            ...state,
            unsoldPlayers: [], // Clear unsold players for the new round
            players: [...state.players, ...state.unsoldPlayers.map(p => ({...p, status: 'available'}))]
        };
    case 'BOOSTER_APPLIED':
        return {
            ...state,
            teams: state.teams.map(t => t.id === action.payload.updatedTeam.id ? action.payload.updatedTeam : t),
        };
    // This is the new case for handling on-the-fly team edits
    case 'TEAM_UPDATED':
        return {
            ...state,
            teams: state.teams.map(team =>
            team.id === action.payload.updatedTeam.id ? action.payload.updatedTeam : team
            ),
        };
    default:
      return state;
  }
}

export const AuctionProvider = ({ children }) => {
  const [state, dispatch] = useReducer(auctionReducer, initialState);
  return (
    <AuctionContext.Provider value={{ state, dispatch }}>
      {children}
    </AuctionContext.Provider>
  );
};

export const useAuction = () => useContext(AuctionContext);