const io = require('socket.io-client');
const axios = require('axios');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// --- Configuration ---
const argv = yargs(hideBin(process.argv))
  .option('url', {
    alias: 'u',
    description: 'The URL of the auction server',
    type: 'string',
    default: 'https://cricket-auction-server.onrender.com' // Default to your deployed server
  })
  .option('teams', {
    alias: 't',
    description: 'Number of team clients to simulate',
    type: 'number',
    default: 4
  })
  .option('bidChance', {
    alias: 'b',
    description: 'The probability (0 to 1) that a team will bid on a player',
    type: 'number',
    default: 0.7
  })
  .help()
  .alias('help', 'h')
  .argv;

const SERVER_URL = argv.url;
const NUM_TEAM_CLIENTS = argv.teams;
const BID_CHANCE = argv.bidChance;

let auctionState = {
  player: null,
  currentBid: 0,
  leadingTeamId: null,
};

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const log = (clientType, id, message) => {
  console.log(`[${clientType} ${id}] ${message}`);
};

// --- Auctioneer Client Logic ---
const createAuctioneerClient = () => {
  const socket = io(SERVER_URL);
  const clientId = 'AUCTIONEER';

  let isPlayerOnBlock = false;

  socket.on('connect', () => {
    log(clientId, '', 'Connected to server.');
    nominateLoop();
  });

  socket.on('player_nominated', (player) => {
    log(clientId, '', `Nominated ${player.name}.`);
    isPlayerOnBlock = true;
  });

  socket.on('player_sold', ({ player }) => {
    log(clientId, '', `${player.name} was sold.`);
    isPlayerOnBlock = false;
  });

  socket.on('player_unsold', ({ player }) => {
    log(clientId, '', `${player.name} was unsold.`);
    isPlayerOnBlock = false;
  });

  const nominateLoop = async () => {
    while (true) {
      if (!isPlayerOnBlock) {
        log(clientId, '', 'Nominating a new player in 5 seconds...');
        await sleep(5000);
        socket.emit('nominate_random_player');
      }
      await sleep(2000); // Wait before checking again
    }
  };
};

// --- Team Client Logic ---
const createTeamClient = (team) => {
  const socket = io(SERVER_URL);
  const clientId = team.name;

  socket.on('connect', () => { log('TEAM', clientId, `Connected.`); });

  socket.on('auction_state_sync', (state) => { auctionState = { ...auctionState, ...state }; });
  socket.on('bid_update', (data) => { auctionState = { ...auctionState, ...data }; });

  socket.on('player_nominated', async (player) => {
    // This is the key fix: update the shared state when a new player is nominated.
    auctionState.player = player;
    log('TEAM', clientId, `${player.name} is up for auction.`);
    if (Math.random() < BID_CHANCE) {
      log('TEAM', clientId, 'Decided to bid.');
      await bidLoop(player, team.id);
    } else {
      log('TEAM', clientId, 'Decided not to bid.');
    }
  });

  // It's important for team clients to know when an auction ends
  // so their bid loops can terminate correctly.
  socket.on('player_sold', ({ player }) => {
    auctionState.player = null;
  });
  socket.on('player_unsold', ({ player }) => {
    auctionState.player = null;
  });

  const bidLoop = async (player, teamId) => {
    while (auctionState.player && auctionState.player.id === player.id) {
      if (auctionState.leadingTeamId !== teamId) {
        const delay = Math.random() * 3000 + 500; // wait 0.5-3.5s
        await sleep(delay);
        if (auctionState.player && auctionState.player.id === player.id && auctionState.leadingTeamId !== teamId) {
            log('TEAM', clientId, `Placing bid...`);
            socket.emit('make_bid', { teamId: team.id });
        }
      }
      await sleep(1000); // Wait before re-evaluating
    }
  };
};

// --- Main Execution ---
const main = async () => {
  console.log(`Starting load test against ${SERVER_URL}`);
  console.log(`Simulating 1 Auctioneer and ${NUM_TEAM_CLIENTS} Teams.`);

  try {
    const response = await axios.get(`${SERVER_URL}/teams`);
    const allTeams = response.data;

    if (allTeams.length < NUM_TEAM_CLIENTS) {
      throw new Error(`Server only has ${allTeams.length} teams, but you requested to simulate ${NUM_TEAM_CLIENTS}.`);
    }

    createAuctioneerClient();
    await sleep(1000);

    for (let i = 0; i < NUM_TEAM_CLIENTS; i++) {
      createTeamClient(allTeams[i]);
      await sleep(500);
    }
    console.log('All clients initialized. Test is running...');
  } catch (error) {
    console.error('Failed to start load test:', error.message);
    console.error('Is the server running? You may need to reset the auction to repopulate teams.');
  }
};

main();