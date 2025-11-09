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

const localIp = getLocalIpAddress();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // Temporarily allow all origins for debugging purposes
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

async function handleSellPlayerTransaction(player, currentBid, leadingTeamId, bidHistory) {
  await db.runTransaction(async (transaction) => {
    const teamRef = db.collection('teams').doc(leadingTeamId);
    const playerRef = db.collection('players').doc(player.id);
    const teamDoc = await transaction.get(teamRef);

    if (!teamDoc.exists) throw "Team document does not exist!";

    const teamData = teamDoc.data();
    const newPurse = teamDoc.data().purse - currentBid;
    const newPointsSpent = teamDoc.data().pointsSpent + currentBid;

    // --- Denormalization for Performance ---
    // Add fields to your team document to track player counts directly.
    // This avoids expensive queries in the calculateMaxBidForTeam function.
    const updates = { purse: newPurse, pointsSpent: newPointsSpent };
    if (player.category === 'Platinum') {
      updates.platinumPlayersCount = admin.firestore.FieldValue.increment(1);
    } else if (player.category === 'Gold') {
      updates.goldPlayersCount = admin.firestore.FieldValue.increment(1);
    } else if (player.category === 'Diamond') {
      updates.diamondPlayersCount = admin.firestore.FieldValue.increment(1);
    }
    transaction.update(teamRef, updates);

    transaction.update(playerRef, {
      status: 'sold',
      sellingPrice: currentBid,
      teamId: leadingTeamId,
      soldAt: admin.firestore.FieldValue.serverTimestamp(),
      bidHistory: bidHistory
    });
  });
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

async function calculateMaxBidForTeam(teamData, teamId) {
  const settings = currentAuction.settings;

  // Query for players sold to this team
  const squadSnapshot = await db.collection('players').where('teamId', '==', teamId).where('status', '==', 'sold').get();
  const squad = squadSnapshot.docs.map(doc => doc.data());

  // With denormalization, you can read these counts directly from the team document, avoiding the query above.
  const currentPlatinumCount = teamData.platinumPlayersCount || 0;
  const currentGoldCount = teamData.goldPlayersCount || 0;
  const currentDiamondCount = teamData.diamondPlayersCount || 0;

  const platinumSlotsToFill = Math.max(0, settings.minPlatinumPlayers - currentPlatinumCount);
  const goldSlotsToFill = Math.max(0, settings.minGoldPlayers - currentGoldCount);
  const diamondSlotsToFill = Math.max(0, settings.minDiamondPlayers - currentDiamondCount);

  const moneyToReserveForPlatinum = platinumSlotsToFill * settings.platinumBasePrice;
  const moneyToReserveForGold = goldSlotsToFill * settings.goldBasePrice;
  const moneyToReserveForDiamond = diamondSlotsToFill * settings.diamondBasePrice;
  const totalMoneyToReserve = moneyToReserveForPlatinum + moneyToReserveForGold + moneyToReserveForDiamond;

  const disposableCash = teamData.purse - totalMoneyToReserve;

  let highestBasePriceNeeded = 0;
  if (platinumSlotsToFill > 0) {
    highestBasePriceNeeded = Math.max(highestBasePriceNeeded, settings.platinumBasePrice);
  }
  if (goldSlotsToFill > 0) {
    highestBasePriceNeeded = Math.max(highestBasePriceNeeded, settings.goldBasePrice);
  }
  if (diamondSlotsToFill > 0) {
    highestBasePriceNeeded = Math.max(highestBasePriceNeeded, settings.diamondBasePrice);
  }

  const maxBid = disposableCash + highestBasePriceNeeded;

  return maxBid > 0 ? maxBid : 0;
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
    const playersRef = db.collection('players');
    let snapshot = await playersRef.where('status', '==', 'available').get();

    // If no 'available' players, check for 'unsold' players and reset them
    if (snapshot.empty) {
      const unsoldSnapshot = await playersRef.where('status', '==', 'unsold').get();

      if (!unsoldSnapshot.empty) {
        const batch = db.batch();
        unsoldSnapshot.docs.forEach(doc => {
          batch.update(doc.ref, { status: 'available' });
        });
        await batch.commit();

        // Notify clients and re-fetch
        io.emit('new_round_started');
        console.log('New round started. Unsold players are now available.');
        await new Promise(resolve => setTimeout(resolve, 500)); // Give clients a moment
        snapshot = await playersRef.where('status', '==', 'available').get();
      }
    }

    if (snapshot.empty) {
      console.log('No available players to nominate.');
      io.emit('no_players_available');
      return;
    }

    const availablePlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const randomIndex = Math.floor(Math.random() * availablePlayers.length);
    const player = availablePlayers[randomIndex];

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
      const maxBid = await calculateMaxBidForTeam(teamData, teamId);
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

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3001;

const dummyTeams = [
  { name: 'Mumbai Champions', ownerName: 'Akash', purse: 100000, pointsSpent: 0 },
  { name: 'Delhi Dynamos', ownerName: 'Priya', purse: 100000, pointsSpent: 0 },
  { name: 'Kolkata Knights', ownerName: 'Rohan', purse: 100000, pointsSpent: 0 },
  { name: 'Chennai Kings', ownerName: 'Sana', purse: 100000, pointsSpent: 0 }
];

async function populateTeams() {
  const batch = db.batch();
  dummyTeams.forEach(team => {
    const docRef = db.collection('teams').doc();
    // Add the initial booster count from settings when populating
    const teamWithBoosters = {
      ...team,
      boostersAvailable: currentAuction.settings.initialBoostersPerTeam,
    };
    batch.set(docRef, teamWithBoosters);
  });
  await batch.commit();
}

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

app.get('/populate-teams', async (req, res) => {
  try {
    await populateTeams();
    res.status(200).send("Successfully populated teams!");
  } catch (error) {
    res.status(500).send("Error populating teams.");
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

      // 3. Repopulate teams (players will be added via UI)
      await populateTeams();

      // 4. Notify all connected clients to refresh
      io.emit('auction_reset');
      console.log('--- Auction Reset Complete ---');

      res.status(200).send("Auction has been successfully reset. Please refresh your browser.");
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