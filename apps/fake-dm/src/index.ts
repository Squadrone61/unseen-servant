import * as readline from "node:readline/promises";
import { FakeDMClient } from "./fake-dm-client.js";

const workerUrl = process.env.UNSEEN_WORKER_URL ?? "http://localhost:8787";

async function getRoomCode(): Promise<string> {
  const fromArg = process.argv[2];
  if (fromArg) return fromArg.trim();
  const fromEnv = process.env.UNSEEN_ROOM_CODE;
  if (fromEnv) return fromEnv.trim();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Room code: ");
  rl.close();
  return answer.trim();
}

const roomCode = await getRoomCode();
if (!roomCode) {
  console.error("Room code is required");
  process.exit(1);
}

const client = new FakeDMClient({ workerUrl, roomCode });
client.connect();

console.log(`[fake-dm] Connecting to ${workerUrl} room=${roomCode}`);
console.log(`[fake-dm] Type !help in chat once connected.`);

process.on("SIGINT", () => {
  console.log("\n[fake-dm] Shutting down...");
  client.close();
  process.exit(0);
});
