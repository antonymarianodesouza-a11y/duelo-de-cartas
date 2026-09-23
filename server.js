// Servidor simples de "sala" para o Duelo de Cartas.
// Ele não sabe nada sobre as regras do jogo — só junta dois jogadores que
// digitaram o mesmo código de sala e repassa as mensagens de um pro outro.

const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Servidor do Duelo de Cartas está no ar.');
});

const wss = new WebSocket.Server({ server });

// roomCode -> array com até 2 conexões (jogadores)
const rooms = {};

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toLowerCase();
      if (!code) return;

      if (!rooms[code]) rooms[code] = [];

      if (rooms[code].length >= 2) {
        send(ws, { type: 'room-full' });
        return;
      }

      rooms[code].push(ws);
      ws.roomCode = code;
      send(ws, { type: 'joined', players: rooms[code].length });

      if (rooms[code].length === 2) {
        rooms[code].forEach((client) => send(client, { type: 'ready' }));
      }
      return;
    }

    // Qualquer outra mensagem: repassa pro outro jogador da mesma sala
    const code = ws.roomCode;
    if (code && rooms[code]) {
      rooms[code].forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data.toString());
        }
      });
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if (code && rooms[code]) {
      rooms[code] = rooms[code].filter((c) => c !== ws);
      if (rooms[code].length === 0) delete rooms[code];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor rodando na porta ' + PORT));

// A cada 30s, verifica quem ainda está vivo de verdade. Uma aba de navegador
// que foi minimizada, ficou em segundo plano ou perdeu conexão sem avisar
// direito acaba "presa" ocupando vaga na sala — isso libera essa vaga sozinho.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) { return ws.terminate(); } // dispara 'close', libera a sala
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
