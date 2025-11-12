const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const os = require('os');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json()); // Add this to parse JSON request bodies

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      const { address, family, internal } = iface;
      if (family === 'IPv4' && !internal) {
        return address;
      }
    }
  }
  return 'localhost'; // Fallback
}

// Helper function to introduce a delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const localIp = getLocalIpAddress();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // Allow all origins for local development to prevent connection issues.
    // The previous, more specific configuration is still correct for your EC2 deployment.
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const auctionStateRef = db.collection('auctionState').doc('current');

const defaultSettings = {
  timerDuration: 15,
  platinumBasePrice: 3000,
  goldBasePrice: 5000,
  diamondBasePrice: 10000, // New category
  minPlatinumPlayers: 2,
  minGoldPlayers: 3,
  minDiamondPlayers: 1, // New category rule
  pointsPerBooster: 10000,
  initialBoostersPerTeam: 3,
  settingsSet: false,
  bidIncrements: [
    { from: 0, to: 10000, step: 1000 },
    { from: 10000, to: 30000, step: 2000 },
    { from: 30000, to: Infinity, step: 5000 },
  ],
};

let currentAuction = {
  player: null,
  currentBid: 0,
  leadingTeamId: null,
  bidHistory: [],
  settings: { ...defaultSettings },
};

let auctionTimer = null;
let timeLeft = 0;

function stopTimer() {
  if (auctionTimer) {
    clearInterval(auctionTimer);
    auctionTimer = null;
  }
  timeLeft = 0;
  io.emit('timer_update', timeLeft);
}

function generatePassword(length = 8) {
  // In a real-world app, use a more secure method for password generation.
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

async function handleSellPlayerTransaction(player, currentBid, leadingTeamId, bidHistory, existingTransaction = null) {
  const sellLogic = async (transaction) => {
    const teamRef = db.collection('teams').doc(leadingTeamId);
    const playerRef = db.collection('players').doc(player.id);
    const teamDoc = await transaction.get(teamRef);

    if (!teamDoc.exists) throw "Team document does not exist!";

    const newPurse = teamDoc.data().purse - currentBid;
    const newPointsSpent = teamDoc.data().pointsSpent + currentBid;

    // --- Denormalization for Performance ---
    // Add fields to your team document to track player counts directly.
    // This avoids expensive queries in the calculateMaxBidForTeam function.
    const updates = { purse: newPurse, pointsSpent: newPointsSpent };
    const category = player.category || 'Gold'; // Default to Gold if undefined
    if (category === 'Platinum') {
      updates.platinumPlayersCount = admin.firestore.FieldValue.increment(1);
    } else if (category === 'Gold') {
      updates.goldPlayersCount = admin.firestore.FieldValue.increment(1);
    } else if (category === 'Diamond') {
      updates.diamondPlayersCount = admin.firestore.FieldValue.increment(1);
    }
    transaction.update(teamRef, updates);

    transaction.update(playerRef, {
      status: 'sold',
      sellingPrice: currentBid,
      teamId: leadingTeamId, // Changed from soldTo to teamId for consistency
      soldAt: admin.firestore.FieldValue.serverTimestamp(),
      bidHistory: bidHistory
    });
  };

  if (existingTransaction) {
    // If we are already inside a transaction, use it.
    await sellLogic(existingTransaction);
  } else {
    // Otherwise, create a new transaction.
    await db.runTransaction(sellLogic);
  }
}

async function sellPlayer() {
  if (!currentAuction.player) return;
  const { player, currentBid, leadingTeamId, bidHistory } = currentAuction;
  
  if (leadingTeamId) {
    try {
      await handleSellPlayerTransaction(player, currentBid, leadingTeamId, bidHistory);
      
      // Fetch the updated team to send to clients for a reliable state update
      const updatedTeamDoc = await db.collection('teams').doc(leadingTeamId).get();
      const updatedTeam = { id: updatedTeamDoc.id, ...updatedTeamDoc.data() };

      io.emit('player_sold', { player, soldTo: leadingTeamId, price: currentBid, updatedTeam, bidHistory });
    } catch (e) {
      console.error("Transaction for selling player failed: ", e);
    }
  } else {
    // Player is unsold
    io.emit('player_unsold', { player });
    // Optionally update player status in DB if you track unsold status
    const playerRef = db.collection('players').doc(player.id);
    await playerRef.update({ status: 'unsold', soldAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  // Reset state in memory and Firestore
  currentAuction.player = null;
  currentAuction.currentBid = 0;
  currentAuction.leadingTeamId = null;
  currentAuction.bidHistory = [];
  await auctionStateRef.set(currentAuction); // Persist state with settings intact

  stopTimer();
}

function startTimer() {
  stopTimer();
  timeLeft = currentAuction.settings.timerDuration;
  io.emit('timer_update', timeLeft);

  auctionTimer = setInterval(() => {
    timeLeft--;
    io.emit('timer_update', timeLeft);
    if (timeLeft <= 0) {
      stopTimer();
      sellPlayer();
    }
  }, 1000);
}

function getBidIncrement(currentBid) {
  const increments = currentAuction.settings.bidIncrements || defaultSettings.bidIncrements;
  // Find the correct tier for the current bid.
  // The `to` is exclusive, so we check `currentBid >= from && currentBid < to`
  for (const tier of increments) {
    if (currentBid >= tier.from && currentBid < tier.to) {
      return tier.step;
    }
  }
  // Fallback to the last tier's step if bid is extremely high or config is broken
  return increments[increments.length - 1].step;
}

async function calculateMaxBidForTeam(teamData, teamId, currentPlayer) {
  const settings = currentAuction.settings;

  // With denormalization, you can read these counts directly from the team document, avoiding the query above.
  const currentPlatinumCount = teamData.platinumPlayersCount || 0;
  const currentGoldCount = teamData.goldPlayersCount || 0;
  const currentDiamondCount = teamData.diamondPlayersCount || 0;

  let diamondSlotsToFill = Math.max(0, settings.minDiamondPlayers - currentDiamondCount);
  let platinumSlotsToFill = Math.max(0, settings.minPlatinumPlayers - currentPlatinumCount);
  let goldSlotsToFill = Math.max(0, settings.minGoldPlayers - currentGoldCount);

  // If we are bidding on a player that fills a required slot,
  // we don't need to reserve money for that slot in this calculation.
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

  const maxBid = teamData.purse - moneyToReserve;

  return maxBid > 0 ? maxBid : 0;
}

async function getNominationPool(isFixedAuction) {
    const playersRef = db.collection('players');
    let availablePlayersSnapshot = await playersRef.where('status', '==', 'available').get();

    // If the available pool is empty, try to start a new round with unsold players.
    if (availablePlayersSnapshot.empty) {
        const unsoldSnapshot = await playersRef.where('status', '==', 'unsold').get();
        if (!unsoldSnapshot.empty) {
            console.log('[getNominationPool] No available players. Starting a new round with unsold players.');
            const batch = db.batch();
            unsoldSnapshot.docs.forEach(doc => batch.update(doc.ref, { status: 'available' }));
            await batch.commit();
            io.emit('new_round_started');
            await sleep(500); // Give clients time to update state
            availablePlayersSnapshot = await playersRef.where('status', '==', 'available').get();
        }
    }

    if (availablePlayersSnapshot.empty) {
        return []; // No players left at all
    }

    let nominationPool = availablePlayersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // If it's a fixed auction, apply the holding logic
    if (isFixedAuction) {
        console.log('[getNominationPool] Fixed Auction Mode Detected. Applying hold-back rules.');

        let heldBackPlayerNames = [
            'Anmol Khilwani', 'Shubam Chichar', 'Karan Shadija', 'Sourabh Raheja',
            'Mohit Tolani', 'Raghav Sahu', 'Piyush Jain', 'Rahul Rawat',
            'Rishabh', 'Karan Lekhwani', 'Kishan Bajaj', 'Uman'
        ].map(name => name.toLowerCase());

        const allPlayersSnapshot = await playersRef.get();
        const soldPlayersSnapshot = await playersRef.where('status', '==', 'sold').get();

        // Vicky Goklani Rule
        const soldPlatinumCount = soldPlayersSnapshot.docs.filter(doc => doc.data().category === 'Platinum').length;
        if (soldPlatinumCount < 4) {
            heldBackPlayerNames.push('vicky goklani');
        }

        // Hitesh Chothwani Rule
        if (nominationPool.length > 5) {
            heldBackPlayerNames.push('hitesh chothwani');
        }

        const totalPlayersCount = allPlayersSnapshot.size;
        const soldPlayersCount = soldPlayersSnapshot.size;
        const LATE_PHASE_THRESHOLD = 0.6;

        if (totalPlayersCount > 0 && (soldPlayersCount / totalPlayersCount) < LATE_PHASE_THRESHOLD) {
            const normalPlayers = nominationPool.filter(p => !heldBackPlayerNames.includes(p.name.toLowerCase()));
            if (normalPlayers.length > 0) {
                console.log(`[getNominationPool] Early Phase. Nominating from ${normalPlayers.length} normal players.`);
                return normalPlayers;
            }
        }
        console.log(`[getNominationPool] Late Phase. All ${nominationPool.length} available players are eligible.`);
    }

    return nominationPool;
}

async function initializeAuctionState() {
  try {
    const doc = await auctionStateRef.get();
    if (doc.exists && doc.data()) {
      const loadedState = doc.data();

      // Deep merge with defaults to ensure all properties, especially settings, exist.
      currentAuction = {
        ...currentAuction, // Start with current in-memory defaults
        ...loadedState,    // Override with loaded data
        settings: {
          ...defaultSettings,
          ...(loadedState.settings || {}), // Override with loaded settings
        },
      };

      if (currentAuction.player) {
        console.log('Restored auction state from Firestore:', currentAuction);
        startTimer(); // Resume timer for the ongoing auction
      } else {
        console.log('No active player auction in Firestore. Settings restored.');
      }
    } else {
      console.log('No active auction state in Firestore. Starting fresh.');
    }
  } catch (error) {
    console.error("Failed to initialize auction state from Firestore:", error);
  }
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Immediately sync the new client with the current server state
  socket.emit('auction_state_sync', { ...currentAuction, timeLeft });

  socket.on('set_auction_settings', async (settings) => {
    // Allow settings to be updated at any time by the auctioneer.
    currentAuction.settings = {
      platinumBasePrice: parseInt(settings.platinumBasePrice, 10),
      goldBasePrice: parseInt(settings.goldBasePrice, 10),
      diamondBasePrice: parseInt(settings.diamondBasePrice, 10),
      minPlatinumPlayers: parseInt(settings.minPlatinumPlayers, 10),
      minGoldPlayers: parseInt(settings.minGoldPlayers, 10),
      minDiamondPlayers: parseInt(settings.minDiamondPlayers, 10),
      pointsPerBooster: parseInt(settings.pointsPerBooster, 10),
      initialBoostersPerTeam: parseInt(settings.initialBoostersPerTeam, 10),
      timerDuration: parseInt(settings.timerDuration, 10),
      settingsSet: true,
      // Parse and validate bid increments from the client
      bidIncrements: settings.bidIncrements.map(tier => ({
        from: parseInt(tier.from, 10),
        to: parseInt(tier.to, 10) || Infinity, // Handle the 'infinity' case
        step: parseInt(tier.step, 10)
      }))
    };
    // Persist the entire state, including the new settings
    await auctionStateRef.set(currentAuction);
    // Broadcast the updated state to everyone
    io.emit('auction_state_sync', { ...currentAuction, timeLeft: 0 });
  });

  socket.on('nominate_random_player', async () => {
    const auctioneerRef = db.collection('users').doc('auctioneer');
    const auctioneerDoc = await auctioneerRef.get();
    const isFixedAuction = auctioneerDoc.exists && auctioneerDoc.data().password === 'Anmol0503';

    const nominationPool = await getNominationPool(isFixedAuction);

    if (nominationPool.length === 0) {
      console.log('No available players to nominate.');
      io.emit('no_players_available');
      return;
    }

    const player = nominationPool[Math.floor(Math.random() * nominationPool.length)];

    // Set base price based on category from settings
    if (player.category === 'Platinum') {
      player.basePrice = currentAuction.settings.platinumBasePrice;
    } else if (player.category === 'Gold') {
      player.basePrice = currentAuction.settings.goldBasePrice;
    } else if (player.category === 'Diamond') {
      player.basePrice = currentAuction.settings.diamondBasePrice;
    }

    stopTimer();
    currentAuction.player = player;
    currentAuction.currentBid = player.basePrice;
    currentAuction.leadingTeamId = null;
    currentAuction.bidHistory = []; // Reset history
    await auctionStateRef.set(currentAuction); // Persist state, preserving settings
    io.emit('player_nominated', player);
    io.emit('bid_update', {
      currentBid: currentAuction.currentBid,
      leadingTeamId: currentAuction.leadingTeamId
    });
    startTimer();
  });

  socket.on('start_new_round', async () => {
    const unsoldSnapshot = await db.collection('players').where('status', '==', 'unsold').get();
    if (unsoldSnapshot.empty) {
      socket.emit('bid_error', 'There are no unsold players to start a new round with.');
      return;
    }
    const batch = db.batch();
    unsoldSnapshot.docs.forEach(doc => batch.update(doc.ref, { status: 'available' }));
    await batch.commit();
    io.emit('new_round_started');
    console.log('New round started manually by auctioneer.');
  });

  socket.on('make_bid', async ({ teamId }) => {
    try {
      const teamRef = db.collection('teams').doc(teamId);
      const teamDoc = await teamRef.get();
  
      if (!teamDoc.exists) {
        console.error(`Bid rejected: Team with ID ${teamId} does not exist.`);
        socket.emit('bid_error', 'Your team session is invalid. Please log in again.');
        return;
      }
  
      const teamData = teamDoc.data();

      // SERVER-SIDE VALIDATION: Prevent a team from bidding against themselves.
      if (teamId === currentAuction.leadingTeamId) {
        socket.emit('bid_error', 'You are already the highest bidder.');
        return;
      }

      let newBid;
      // If there's an active bid, the next bid is the current one plus the increment.
      // Otherwise, the first bid is for the base price.
      if (currentAuction.leadingTeamId) {
        const increment = getBidIncrement(currentAuction.currentBid);
        newBid = currentAuction.currentBid + increment;
      } else {
        newBid = currentAuction.player.basePrice;
      }

      // SERVER-SIDE VALIDATION: Re-calculate maxBid and enforce it.
      const maxBid = await calculateMaxBidForTeam(teamData, teamId, currentAuction.player);
      if (maxBid < newBid) {
        console.log(`Bid rejected: Team ${teamData.name} cannot afford bid of ${newBid}. Max bid is ${maxBid}.`);
        socket.emit('bid_error', `You cannot afford this bid. Your maximum possible bid is ₹${maxBid}.`);
        return;
      }
  
      currentAuction.bidHistory.push({ teamId, bidAmount: newBid });
  
      currentAuction.currentBid = newBid;
      currentAuction.leadingTeamId = teamId;
  
      await auctionStateRef.set(currentAuction);
  
      io.emit('bid_update', {
        currentBid: currentAuction.currentBid,
        leadingTeamId: currentAuction.leadingTeamId,
      });
      startTimer();
    } catch (error) {
      console.error('Error processing bid:', error);
      socket.emit('bid_error', 'An unexpected error occurred while placing your bid.');
    }
  });

  socket.on('sell_player', () => {
    stopTimer();
    sellPlayer();
  });

  socket.on('apply_booster', async ({ teamId }) => { // Now applies to a specific team
    if (teamId) {
        try {
            const pointsToAdd = currentAuction.settings.pointsPerBooster;
            const teamRef = db.collection('teams').doc(teamId);
            
            // Use a transaction to safely read and update the team's state
            await db.runTransaction(async (transaction) => {
                const teamDoc = await transaction.get(teamRef);
                if (!teamDoc.exists) throw new Error(`Team with ID ${teamId} not found.`);
                
                const teamData = teamDoc.data();
                // Defensively handle missing or non-numeric booster counts.
                const currentBoosters = Number(teamData.boostersAvailable) || 0;

                if (currentBoosters <= 0) {
                  // Send a specific error if no boosters are left
                  socket.emit('booster_error', `Team ${teamData.name} has no boosters left.`);
                  throw new Error('No boosters left for this team.'); // Abort transaction
                }

                const newPurse = teamData.purse + pointsToAdd;
                const newBoosterCount = currentBoosters - 1;
                transaction.update(teamRef, { purse: newPurse, boostersAvailable: newBoosterCount });
            });

            // Fetch the fully updated team to send back
            const updatedTeamDoc = await teamRef.get();
            const updatedTeam = { id: updatedTeamDoc.id, ...updatedTeamDoc.data() };

            io.emit('booster_applied', { updatedTeam });
        } catch (error) {
            // Log error, but don't crash. Client gets specific error via socket emit.
            console.error('Error applying booster:', error.message);
        }
    }
  });

  socket.on('start_mock_auction', async () => {
    console.log(`--- Starting FAST Mock Auction for ALL players ---`);

    try {
      // 1. Get available teams
      const teamsSnapshot = await db.collection('teams').get();
      const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (teams.length < 2) {
        console.log('Mock Auction Error: Need at least 2 teams to run a mock auction.');
        socket.emit('mock_auction_error', 'Need at least 2 teams to run a mock auction.');
        return;
      }

      let playersAuctioned = 0;
      while (true) { // Loop until no players are left
        // 2. Nominate a player
        const auctioneerRef = db.collection('users').doc('auctioneer');
        const auctioneerDoc = await auctioneerRef.get();
        const isFixedAuction = auctioneerDoc.exists && auctioneerDoc.data().password === 'Anmol0503';

        const nominationPool = await getNominationPool(isFixedAuction);

        if (nominationPool.length === 0) {
          console.log('Mock Auction: No more players to nominate. Auction complete.');
          break; // Exit the while loop
        }
        const playerToNominate = nominationPool[Math.floor(Math.random() * nominationPool.length)];

        // Set base price
        if (playerToNominate.category === 'Platinum') {
          playerToNominate.basePrice = currentAuction.settings.platinumBasePrice;
        } else if (playerToNominate.category === 'Gold') {
          playerToNominate.basePrice = currentAuction.settings.goldBasePrice;
        } else if (playerToNominate.category === 'Diamond') {
          playerToNominate.basePrice = currentAuction.settings.diamondBasePrice;
        }

        // Emit nomination event
        stopTimer();
        currentAuction.player = playerToNominate;
        currentAuction.currentBid = playerToNominate.basePrice;
        currentAuction.leadingTeamId = null;
        currentAuction.bidHistory = [];
        await auctionStateRef.set(currentAuction);
        io.emit('player_nominated', playerToNominate);
        io.emit('bid_update', { currentBid: currentAuction.currentBid, leadingTeamId: currentAuction.leadingTeamId });
        console.log(`Mock Auction: Nominated ${playerToNominate.name}`);
        await sleep(10); // Minimal delay

        // 3. Simulate bidding war
        let eligibleBidders = [];
        for (const team of teams) {
          const teamData = (await db.collection('teams').doc(team.id).get()).data();
          const maxBidForTeam = await calculateMaxBidForTeam(teamData, team.id, playerToNominate);

          // The hasReachedCategoryLimit check was removed to resolve an issue where
          // the 'min...Players' setting was acting as a hard maximum, preventing
          // players from being sold if all teams had met the minimum requirement.
          if (maxBidForTeam >= playerToNominate.basePrice) {
            let willingnessFactor = 0.5;
            if (playerToNominate.category === 'Diamond') willingnessFactor = 0.8;
            else if (playerToNominate.category === 'Platinum') willingnessFactor = 0.65;
            willingnessFactor += (Math.random() * 0.2 - 0.1);
            const willingToSpend = Math.max(playerToNominate.basePrice, Math.floor(maxBidForTeam * willingnessFactor));
            eligibleBidders.push({ id: team.id, name: team.name, maxBid: willingToSpend });
          }
        }

        console.log(`Mock Auction: ${eligibleBidders.length} eligible bidders for ${playerToNominate.name}`);
        eligibleBidders.sort(() => 0.5 - Math.random());

        if (eligibleBidders.length === 1 && currentAuction.leadingTeamId === null) {
          const loneBidder = eligibleBidders[0];
          currentAuction.currentBid = playerToNominate.basePrice;
          currentAuction.leadingTeamId = loneBidder.id;
          currentAuction.bidHistory.push({ teamId: loneBidder.id, bidAmount: playerToNominate.basePrice });
          await auctionStateRef.set(currentAuction);
          io.emit('bid_update', { currentBid: currentAuction.currentBid, leadingTeamId: currentAuction.leadingTeamId });
          console.log(`Mock Auction: Lone bidder ${loneBidder.name} wins at base price.`);
          await sleep(10);
        } else {
          let biddingWarActive = eligibleBidders.length >= 2;
          while (biddingWarActive) {
            let bidPlacedInRound = false;
            for (const bidder of eligibleBidders) {
              if (bidder.id === currentAuction.leadingTeamId) continue;

              const increment = getBidIncrement(currentAuction.currentBid);
              const nextBid = currentAuction.currentBid === 0 ? playerToNominate.basePrice : currentAuction.currentBid + increment;

              if (bidder.maxBid >= nextBid) {
                currentAuction.currentBid = nextBid;
                currentAuction.leadingTeamId = bidder.id;
                currentAuction.bidHistory.push({ teamId: bidder.id, bidAmount: nextBid });
                await auctionStateRef.set(currentAuction);
                io.emit('bid_update', { currentBid: currentAuction.currentBid, leadingTeamId: currentAuction.leadingTeamId });
                console.log(`Mock Auction: Team ${bidder.name} bid ${nextBid}`);
                await sleep(10); // Minimal delay between bids
                bidPlacedInRound = true;
              }
            }

            if (!bidPlacedInRound) biddingWarActive = false;

            const nextIncrement = getBidIncrement(currentAuction.currentBid);
            eligibleBidders = eligibleBidders.filter(b => b.maxBid >= currentAuction.currentBid + nextIncrement);

            if (eligibleBidders.length < 2 && currentAuction.leadingTeamId !== null) {
              biddingWarActive = false;
            }
          }
        }

        // 4. Sell the player
        await sellPlayer();
        playersAuctioned++;
        await sleep(10); // Minimal delay before next player
      }
      socket.emit('mock_auction_complete', `Mock auction finished. ${playersAuctioned} players were auctioned.`);
    } catch (error) {
      console.error('Error during mock auction:', error);
      socket.emit('mock_auction_error', 'An error occurred during the mock auction.');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3001;

// Updated team names as requested
const dummyTeams = [
  { name: 'Anmol Team', ownerName: 'Anmol' },
  { name: 'Sourabh Raheja Team', ownerName: 'Sourabh' },
  { name: 'Shubam Chichar Team', ownerName: 'Shubam' },
  { name: 'Raghav Sahu Team', ownerName: 'Raghav' },
  { name: 'Karan Shadija Team', ownerName: 'Karan' },
  { name: 'Mohit Tolani Team', ownerName: 'Mohit' }
];

async function populateInitialData() {
  const batch = db.batch();
  const initialPasswords = {};

  // 1. Create Auctioneer User
  const auctioneerPassword = 'Anmol0503'; // Hardcoded password as requested
  const auctioneerRef = db.collection('users').doc('auctioneer');
  // In a real app, you should HASH this password before storing it.
  batch.set(auctioneerRef, { username: 'auctioneer', password: auctioneerPassword, role: 'auctioneer' });
  initialPasswords['auctioneer'] = auctioneerPassword;

  // 2. Create Teams and Team Owner Users
  dummyTeams.forEach(team => {
    const teamId = db.collection('teams').doc().id; // Pre-generate ID to link user
    const teamRef = db.collection('teams').doc(teamId);
    const userRef = db.collection('users').doc(); // Firestore will generate an ID

    const teamPassword = generatePassword();

    // Team data
    batch.set(teamRef, {
      name: team.name,
      ownerName: team.ownerName,
      purse: 100000,
      pointsSpent: 0,
      boostersAvailable: currentAuction.settings.initialBoostersPerTeam,
      platinumPlayersCount: 0,
      goldPlayersCount: 0,
      diamondPlayersCount: 0,
    });

    // User data for the team owner
    // In a real app, you should HASH this password before storing it.
    batch.set(userRef, {
      username: team.ownerName.toLowerCase(),
      password: teamPassword,
      role: 'team_owner',
      teamId: teamId // Link user to their team
    });
    initialPasswords[team.ownerName.toLowerCase()] = teamPassword;
  });

  await batch.commit();
  return initialPasswords;
}

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send('Username and password are required.');
    }

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username.toLowerCase()).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).send('Invalid credentials.');
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Plaintext password comparison. In a real app, use bcrypt.compare().
    if (userData.password !== password) {
      return res.status(401).send('Invalid credentials.');
    }

    // Prepare user object for the client, omitting the password
    const userForClient = {
      id: userDoc.id,
      username: userData.username,
      role: userData.role,
    };

    // If it's a team owner, enrich the object with team data
    if (userData.role === 'team_owner') {
      userForClient.teamId = userData.teamId;
      const teamDoc = await db.collection('teams').doc(userData.teamId).get();
      if (teamDoc.exists) {
        Object.assign(userForClient, teamDoc.data());
      }
    }

    res.status(200).json(userForClient);

  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("Server error during login.");
  }
});

app.get('/teams', async (req, res) => {
  try {
    const snapshot = await db.collection('teams').get();
    const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(teams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).send("Error fetching teams");
  }
});

app.get('/users', async (req, res) => {
  // This endpoint should be protected in a real app
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      // IMPORTANT: Omit password from the response
      return { id: doc.id, username: data.username, role: data.role };
    });
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send("Error fetching users");
  }
});

app.get('/players', async (req, res) => {
  try {
    const snapshot = await db.collection('players').get();
    const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(players);
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).send("Error fetching players");
  }
});

app.post('/players', async (req, res) => {
  try {
    const { name, skill, country, category } = req.body;
    // Make validation more robust: only name and category are essential.
    if (!name || !category) {
      return res.status(400).send('Player Name and Category are required.');
    }
    const newPlayer = {
      name,
      skill: skill || 'All-Rounder', // Default if not provided
      country: country || 'India',     // Default if not provided
      category,
      status: 'available',
    };
    const docRef = await db.collection('players').add(newPlayer);
    res.status(201).json({ id: docRef.id, ...newPlayer });
  } catch (error) {
    console.error("Error adding player:", error);
    res.status(500).send("Error adding player");
  }
});

app.put('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const playerData = req.body;
    await db.collection('players').doc(id).update(playerData);
    res.status(200).json({ id, ...playerData });
  } catch (error) {
    console.error("Error updating player:", error);
    res.status(500).send("Error updating player");
  }
});

app.post('/users/:userId/reset-password', async (req, res) => {
  // This endpoint should be protected and only accessible by an auctioneer
  try {
    const { userId } = req.params;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).send('User not found.');
    }
    if (userDoc.data().role === 'auctioneer') {
      return res.status(403).send('Auctioneer password cannot be reset from the UI.');
    }

    const newPassword = generatePassword();
    // In a real app, HASH the new password before updating
    await userRef.update({ password: newPassword });

    res.status(200).json({ message: 'Password reset successfully.', newPassword: newPassword });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).send("Server error during password reset.");
  }
});

app.put('/teams/:teamId', async (req, res) => {
  // This endpoint should be protected and only accessible by an auctioneer
  try {
    const { teamId } = req.params;
    const { name, ownerName, purse } = req.body;
    const teamRef = db.collection('teams').doc(teamId);

    const updates = {};
    if (name) updates.name = name;
    if (ownerName) updates.ownerName = ownerName;
    // Ensure purse is a number before updating
    if (purse !== undefined && !isNaN(parseInt(purse, 10))) {
      updates.purse = parseInt(purse, 10);
    }

    await teamRef.update(updates);

    const updatedTeamDoc = await teamRef.get();
    const updatedTeam = { id: updatedTeamDoc.id, ...updatedTeamDoc.data() };

    // Notify all clients that a team has been updated
    io.emit('team_updated', { updatedTeam });

    res.status(200).json(updatedTeam);
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).send("Server error during team update.");
  }
});

app.post('/players/:playerId/assign', async (req, res) => {
  // This endpoint should be protected and only accessible by an auctioneer
  try {
    const { playerId } = req.params;
    const { teamId, price } = req.body;

    if (!teamId || price === undefined) {
      return res.status(400).send('Team ID and price are required.');
    }

    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).send('Price must be a non-negative number.');
    }

    const playerDoc = await db.collection('players').doc(playerId).get();
    if (!playerDoc.exists) return res.status(404).send('Player not found.');
    const player = { id: playerDoc.id, ...playerDoc.data() };

    await handleSellPlayerTransaction(player, numericPrice, teamId, []);
    io.emit('force_refetch_data'); // Use the robust refetch event
    res.status(200).send({ message: 'Player assigned successfully.' });
  } catch (error) {
    console.error("Error assigning player:", error);
    res.status(500).send("Server error during player assignment.");
  }
});

app.post('/players/:playerId/make-unsold', async (req, res) => {
  // This endpoint should be protected and only accessible by an auctioneer
  try {
    const { playerId } = req.params;
    const playerRef = db.collection('players').doc(playerId);

    await db.runTransaction(async (transaction) => {
      const playerDoc = await transaction.get(playerRef);
      if (!playerDoc.exists || playerDoc.data().status !== 'sold') {
        throw new Error('Player is not sold or does not exist.');
      }
      const playerData = playerDoc.data();
      const oldTeamId = playerData.teamId;
      const oldPrice = playerData.sellingPrice;

      const teamRef = db.collection('teams').doc(oldTeamId);
      const teamDoc = await transaction.get(teamRef);
      if (!teamDoc.exists) throw new Error('Original team not found.');

      // Refund the old team
      transaction.update(teamRef, { purse: admin.firestore.FieldValue.increment(oldPrice) });
      // Decrement player category count
      const categoryField = `${playerData.category.toLowerCase()}PlayersCount`;
      transaction.update(teamRef, { [categoryField]: admin.firestore.FieldValue.increment(-1) });

      // Update player status
      transaction.update(playerRef, {
        status: 'unsold',
        teamId: admin.firestore.FieldValue.delete(),
        sellingPrice: admin.firestore.FieldValue.delete(),
        soldAt: admin.firestore.FieldValue.delete(),
      });
    });

    io.emit('force_refetch_data'); // Tell clients to refetch all data
    res.status(200).send({ message: 'Player status reverted to unsold.' });
  } catch (error) {
    console.error("Error making player unsold:", error);
    res.status(500).send(error.message || "Server error while reverting player sale.");
  }
});

app.post('/players/:playerId/make-available', async (req, res) => {
  // This endpoint should be protected and only accessible by an auctioneer
  try {
    const { playerId } = req.params;
    const playerRef = db.collection('players').doc(playerId);

    await db.runTransaction(async (transaction) => {
      const playerDoc = await transaction.get(playerRef);
      if (!playerDoc.exists || playerDoc.data().status !== 'sold') {
        throw new Error('Player is not sold or does not exist.');
      }
      const playerData = playerDoc.data();
      const oldTeamId = playerData.teamId;
      const oldPrice = playerData.sellingPrice;

      const teamRef = db.collection('teams').doc(oldTeamId);
      const teamDoc = await transaction.get(teamRef);
      if (!teamDoc.exists) throw new Error('Original team not found.');

      // Refund the old team
      transaction.update(teamRef, { purse: admin.firestore.FieldValue.increment(oldPrice) });
      // Decrement player category count
      const categoryField = `${playerData.category.toLowerCase()}PlayersCount`;
      transaction.update(teamRef, { [categoryField]: admin.firestore.FieldValue.increment(-1) });

      // Update player status to AVAILABLE
      transaction.update(playerRef, {
        status: 'available', // The key difference from 'make-unsold'
        teamId: admin.firestore.FieldValue.delete(),
        sellingPrice: admin.firestore.FieldValue.delete(),
        soldAt: admin.firestore.FieldValue.delete(),
        bidHistory: admin.firestore.FieldValue.delete(),
      });
    });

    io.emit('force_refetch_data'); // Tell clients to refetch all data
    res.status(200).send({ message: 'Player is now available for auction again.' });
  } catch (error) {
    console.error("Error making player available:", error);
    res.status(500).send(error.message || "Server error while making player available.");
  }
});

app.post('/players/:playerId/reassign', async (req, res) => {
  // This endpoint should be protected and only accessible by an auctioneer
  // This is a new, robust version that handles refunds correctly.
  try {
    const { playerId } = req.params;
    const { newTeamId, price } = req.body;
    const numericPrice = parseInt(price, 10);

    if (!newTeamId || isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).send('A valid new team and price are required.');
    }

    const playerRef = db.collection('players').doc(playerId);

    await db.runTransaction(async (transaction) => {
      const playerDoc = await transaction.get(playerRef);
      if (!playerDoc.exists || playerDoc.data().status !== 'sold') {
        throw new Error('Player is not sold or does not exist.');
      }
      const playerData = playerDoc.data();
      const oldTeamId = playerData.teamId;
      const oldPrice = playerData.sellingPrice;

      // Step 1: Refund the original team if it exists
      if (oldTeamId) {
        const oldTeamRef = db.collection('teams').doc(oldTeamId);
        const oldTeamDoc = await transaction.get(oldTeamRef);
        if (oldTeamDoc.exists) {
          transaction.update(oldTeamRef, { purse: admin.firestore.FieldValue.increment(oldPrice) });
          const oldCategoryField = `${playerData.category.toLowerCase()}PlayersCount`;
          transaction.update(oldTeamRef, { [oldCategoryField]: admin.firestore.FieldValue.increment(-1) });
        }
      }

      // Step 2: Sell to the new team (this reuses the existing sell logic within a transaction)
      await handleSellPlayerTransaction(playerData, numericPrice, newTeamId, playerData.bidHistory || [], transaction);
    });

    io.emit('force_refetch_data');
    res.status(200).send({ message: 'Player reassigned successfully.' });
  } catch (error) {
    console.error("Error reassigning player:", error);
    res.status(500).send(error.message || "Server error during player reassignment.");
  }
});

app.delete('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('players').doc(id).delete();
    res.status(200).send(`Player with id ${id} deleted successfully.`);
  } catch (error) {
    console.error("Error deleting player:", error);
    res.status(500).send("Error deleting player");
  }
});

app.post('/players/bulk', async (req, res) => {
  try {
    const { players } = req.body;
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).send('Request body must be an array of players.');
    }

    const batch = db.batch();
    let addedCount = 0;

    players.forEach(player => {
      // Basic validation for each player object
      if (player.name && player.category) {
        const docRef = db.collection('players').doc(); // Auto-generate ID
        const newPlayer = {
          name: player.name,
          skill: player.skill || 'All-Rounder',
          country: player.country || 'India',
          category: player.category,
          status: 'available',
        };
        batch.set(docRef, newPlayer);
        addedCount++;
      }
    });

    await batch.commit();
    res.status(201).send(`Successfully imported ${addedCount} players.`);
  } catch (error) {
    console.error("Error bulk adding players:", error);
    res.status(500).send("Error bulk adding players.");
  }
});

async function deleteCollection(db, collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

app.get('/reset-auction', async (req, res) => {
  try {
      console.log('--- Starting Auction Reset ---');
      stopTimer();

      // 1. Clear current auction state in memory and DB
      currentAuction = {
        player: null,
        currentBid: 0,
        leadingTeamId: null,
        bidHistory: [],
        settings: { ...defaultSettings },
      };
      await auctionStateRef.set(currentAuction);
      console.log('Cleared auction state.');

      // 2. Delete all existing teams and players
      await deleteCollection(db, 'players');
      console.log('Cleared players collection.');
      await deleteCollection(db, 'teams');
      console.log('Cleared teams collection.');
      await deleteCollection(db, 'users');
      console.log('Cleared users collection.');

      // 3. Repopulate data and get new passwords
      const initialPasswords = await populateInitialData();
      console.log('--- Initial Passwords (Share with users) ---');
      console.log(initialPasswords);
      console.log('--------------------------------------------');

      // 4. Notify all connected clients to refresh
      io.emit('auction_reset');
      console.log('--- Auction Reset Complete ---');

      res.status(200).json({
        message: "Auction has been successfully reset. Initial passwords are logged on the server console. Please refresh your browser.",
        initialPasswords: initialPasswords
      });
  } catch (error) {
      console.error("Error resetting auction:", error);
      res.status(500).send("Error resetting auction.");
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`On your network, access the client at: http://${localIp}:3000`);
  initializeAuctionState();
});