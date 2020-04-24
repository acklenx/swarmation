import Bugsnag from '@bugsnag/js';
import BugsnagPluginExpress from '@bugsnag/plugin-express';
import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';

import {directions} from '../client/directions';
import {Formation, getFormations} from '../formations';
import * as map from '../map';
import {Player} from '../player';
import {serverListen, serverSend} from '../protocol';
import {validate, sign} from './signing';

Bugsnag.start({
  apiKey: '598a6c87f69350bfffd18829c6e8a87c',
  plugins: [BugsnagPluginExpress],
  // @ts-expect-error
  onUncaughtException(e: Error) {
    console.log(e.stack);
  },
});

const NAMES = [
  'Saber',
  'Tooth',
  'Moose',
  'Lion',
  'Peanut',
  'Jelly',
  'Thyme',
  'Zombie',
  'Cranberry',
  'Pipa',
  'Walnut',
  'Puddle',
  'Ziya',
  'Key',
];

const MAX_POINTS = 26;
const MAX_IDLE = 120;
const IDLE_AFTER_TURNS = 2;

const CLIENTS: {[id: string]: WebSocket | undefined} = {};

const formations = Object.values(getFormations());

let FORMATION: Formation;
let TIME = 0;

// Configuration

const app = express();
const middleware = Bugsnag.getPlugin('express');
app.use(middleware.requestHandler);

const server = http.createServer(app);
const wss = new WebSocket.Server({server});

app.use('/', express.static('public'));

// Routes

// Error Handling

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error | null, _: express.Request, res: express.Response, _next: unknown) => {
  err && Bugsnag.notify(err);
  res.status(500).send('Something broke!');
});

app.use(middleware.errorHandler);

function shutdown() {
  serverSend(Object.values(CLIENTS) as WebSocket[], {type: 'restart'});
  setTimeout(() => {
    process.exit();
  }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

export const PLAYERS: {[id: string]: Player | undefined} = {};

function getActivePlayers(): number {
  let n = 0;
  for (const player of Object.values(PLAYERS) as Player[]) {
    if (player.active) n++;
  }
  return n;
}

function placePlayer(numberOfPlayers: number): [number, number] {
  // Enough room around the center for 4x the number of players
  const radius = Math.ceil(4 * Math.sqrt(numberOfPlayers / Math.PI));
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  return [Math.round(x), Math.round(y)];
}

// IO

let nextId = 0;

wss.on('connection', (client) => {
  const id = `${nextId++}`;
  let left;
  let top;
  do {
    [left, top] = placePlayer(Object.keys(PLAYERS).length);
  } while (map.exists(left, top));

  const name = NAMES[Math.floor(Math.random() * NAMES.length)];

  const player = {
    id,
    left,
    top,
    name,
    active: true,
    flashing: false,
    lockedIn: false,
    idleTurns: 0,
    succeeded: 0,
    total: 0,
    score: 0,
  };
  PLAYERS[id] = player;
  CLIENTS[id] = client;
  map.set(left, top, player);

  serverSend([client], {type: 'welcome', id, players: Object.values(PLAYERS) as Player[]});
  serverSend(Object.values(CLIENTS).filter((c) => c !== client) as WebSocket[], {
    type: 'player',
    player,
  });

  if (FORMATION && TIME > 0) {
    serverSend([client], {
      type: 'nextFormation',
      formation: FORMATION.name,
      time: TIME,
      map: FORMATION.map,
      active: getActivePlayers(),
    });
  }

  client.on('close', () => {
    delete CLIENTS[player.id];
    if (PLAYERS[player.id]) {
      map.unset(PLAYERS[player.id]!.left, PLAYERS[player.id]!.top);
      delete PLAYERS[player.id];
    }
    serverSend(Object.values(CLIENTS) as WebSocket[], {type: 'disconnected', id});
  });

  serverListen(client, (message) => {
    switch (message.type) {
      case 'restore': {
        const saveData = validate(message.data) as {
          name: string;
          score: number;
          succeeded: number;
          total: number;
        } | null;

        if (saveData) {
          const {score, succeeded, total, name} = saveData;
          player.score += score;
          player.succeeded += succeeded;
          player.total += total;
          player.name = name;
          serverSend(Object.values(CLIENTS) as WebSocket[], {type: 'player', player});
        }
        break;
      }

      case 'move': {
        const {left, top, id} = player;
        const {direction, time} = message;
        const [newLeft, newTop] = directions[direction](left, top);
        player.active = true;
        const moved = map.move(left, top, newLeft, newTop, player);
        if (moved) {
          player.left = newLeft;
          player.top = newTop;
        }
        serverSend(Object.values(CLIENTS) as WebSocket[], {
          type: 'position',
          id,
          left: player.left,
          top: player.top,
          time,
        });
        break;
      }

      case 'flash': {
        serverSend(Object.values(CLIENTS).filter((c) => c !== client) as WebSocket[], {
          ...message,
          id: player.id,
        });
        break;
      }

      case 'lockIn': {
        player.lockedIn = true;
        serverSend(Object.values(CLIENTS).filter((c) => c !== client) as WebSocket[], {
          ...message,
          id: player.id,
        });
        break;
      }

      default:
        throw new Error(
          `Message type ${
            // @ts-expect-error
            message.type
          } not implemented`
        );
    }
  });
});

// Formation countdown

function pickFormation(): Formation {
  const active = Math.max(2, getActivePlayers());
  const available = formations.filter(({size}) => size <= active);
  if (available.length === 0) return formations[0];
  return available[Math.floor(Math.random() * available.length)];
}

function startTurn() {
  const playerCount = Object.keys(PLAYERS).length;
  console.log(`Starting turn with ${playerCount} players (${getActivePlayers()} active).`);
  FORMATION = pickFormation();
  while (!FORMATION) FORMATION = pickFormation();
  TIME = FORMATION.difficulty;
  console.log(`Next formation is ${FORMATION.name} of size ${FORMATION.size}.`);
  serverSend(Object.values(CLIENTS) as WebSocket[], {
    type: 'nextFormation',
    formation: FORMATION.name,
    time: TIME,
    map: FORMATION.map,
    active: getActivePlayers(),
  });
}

function endTurn() {
  const players = map.checkFormation(FORMATION, PLAYERS as Record<string, Player>);
  const gain = FORMATION.difficulty;
  const loss = Math.round((MAX_POINTS - FORMATION.difficulty) / 4);
  const ids = Object.keys(players);
  console.log(`Formation ${FORMATION.name} completed with ${ids.length} participants.`);
  for (const player of Object.values(PLAYERS) as Player[]) {
    player.total++;
    player.lockedIn = false;
    if (ids.indexOf(player.id) >= 0) {
      player.succeeded++;
      player.active = true;
      player.score += gain;
    } else {
      player.score = Math.max(0, player.score - loss);
    }
    const client = CLIENTS[player.id];
    if (!client) throw new Error('Client for player not found');
    serverSend([client], {
      type: 'formation',
      formation: FORMATION.name,
      difficulty: FORMATION.difficulty,
      gain,
      loss,
      ids,
      save: sign({
        score: player.score,
        succeeded: player.succeeded,
        total: player.total,
        name: player.name,
      }),
    });
    if (player.active) {
      player.idleTurns = 0;
    } else {
      const client = CLIENTS[player.id];
      if (!client) throw new Error('Client for player not found');
      if (player.idleTurns === IDLE_AFTER_TURNS) {
        player.active = false;
        serverSend(Object.values(CLIENTS) as WebSocket[], {type: 'idle', id: player.id});
      }
      player.idleTurns++;
      if (player.idleTurns > MAX_IDLE) {
        serverSend([client], {type: 'kick', reason: 'idle'});
        serverSend(Object.values(CLIENTS).filter((c) => c !== client) as WebSocket[], {
          type: 'disconnected',
          id: player.id,
        });
        client.close();
        if (PLAYERS[player.id]) {
          map.unset(PLAYERS[player.id]!.left, PLAYERS[player.id]!.top);
        }
        delete PLAYERS[player.id];
        delete CLIENTS[player.id];
      }
    }
    player.active = false;
  }
}

// main loop
setInterval(() => {
  TIME--;
  if (TIME === 0) {
    if (FORMATION) endTurn();
  }
  if (TIME === -1) startTurn();
}, 1000);

// Only listen on $ node server.js
const port = parseInt(process.env.PORT || '0', 10) || parseInt(process.argv[2], 10) || 3000;
if (!module.parent) server.listen(port);
console.log(`Server now listening on port ${port}...`);
