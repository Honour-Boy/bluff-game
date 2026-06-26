// ============================================================
// SOCKET CLIENT - Singleton socket.io-client instance
// ============================================================

import { io } from "socket.io-client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

let socket;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      // §M4 - never give up reconnecting mid-game. A free-tier host can sleep
      // for tens of seconds; capping attempts at 10 used to strand players. The
      // delay backs off to a 5s ceiling with jitter so a fleet of reconnecting
      // clients doesn't thundering-herd the instance as it wakes.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });
  }
  return socket;
}

export { SERVER_URL };
