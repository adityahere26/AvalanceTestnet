// Contract test on an in-memory chain. Players are plain accounts here; in the dApp
// they are SmoothSend smart accounts, which look identical to the contract (msg.sender).
import assert from "node:assert/strict";
import ganache from "ganache";
import { BrowserProvider, ContractFactory } from "ethers";
import { compile } from "./compile.js";

const provider = new BrowserProvider(
  ganache.provider({ logging: { quiet: true }, chain: { chainId: 43113, hardfork: "shanghai", vmErrorsOnRPCResponse: true } })
);
const [deployer, alice, bob, carol] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));

const { abi, bytecode } = compile();
const game = await new ContractFactory(abi, bytecode, deployer).deploy();
await game.waitForDeployment();

const Status = { Waiting: 0n, Active: 1n, XWon: 2n, OWon: 3n, Draw: 4n, Cancelled: 5n };

// Simulate first so custom-error names surface (ganache omits revert data on estimateGas), then send.
async function send(signer, fn, ...args) {
  const c = game.connect(signer);
  await c[fn].staticCall(...args);
  return (await c[fn](...args)).wait();
}
async function newGame() {
  await send(alice, "createGame");
  const id = (await game.gameCount()) - 1n;
  await send(bob, "joinGame", id);
  return id;
}
async function playMoves(id, cells) {
  for (let i = 0; i < cells.length; i++) await send(i % 2 === 0 ? alice : bob, "play", id, cells[i]);
}

// 1. Create + join
await send(alice, "createGame");
let g = await game.getGame(0);
assert.equal(g.playerX, alice.address);
assert.equal(g.status, Status.Waiting);
await assert.rejects(send(alice, "joinGame", 0), /CannotJoinOwnGame/);
await send(bob, "joinGame", 0);
g = await game.getGame(0);
assert.equal(g.playerO, bob.address);
assert.equal(g.status, Status.Active);
await assert.rejects(send(carol, "joinGame", 0), /NotWaiting/);
console.log("✓ create and join; can't join own or full game");

// 2. Turn order and cell rules
await assert.rejects(send(bob, "play", 0, 4), /NotYourTurn/);
await send(alice, "play", 0, 4);
await assert.rejects(send(alice, "play", 0, 0), /NotYourTurn/);
await assert.rejects(send(bob, "play", 0, 4), /CellTaken/);
await assert.rejects(send(bob, "play", 0, 9), /BadCell/);
await assert.rejects(send(carol, "play", 0, 0), /NotYourTurn/);
console.log("✓ turn order, taken cells, bad cells and outsiders rejected");

// 3. X wins on a diagonal: X 4, O 1, X 0, O 2, X 8
await send(bob, "play", 0, 1);
await send(alice, "play", 0, 0);
await send(bob, "play", 0, 2);
await send(alice, "play", 0, 8);
g = await game.getGame(0);
assert.equal(g.status, Status.XWon);
await assert.rejects(send(bob, "play", 0, 3), /NotActive/);
console.log("✓ diagonal win detected; no moves after game over");

// 4. O wins on a column: X 0, O 1, X 3, O 4, X 8, O 7
const g2 = await newGame();
await playMoves(g2, [0, 1, 3, 4, 8, 7]);
assert.equal((await game.getGame(g2)).status, Status.OWon);
console.log("✓ O column win detected");

// 5. Draw: X O X / X O O / O X X
const g3 = await newGame();
await playMoves(g3, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
assert.equal((await game.getGame(g3)).status, Status.Draw);
console.log("✓ draw after 9 moves");

// 6. Stats
const sa = await game.stats(alice.address);
const sb = await game.stats(bob.address);
assert.deepEqual([sa.wins, sa.losses, sa.draws], [1n, 1n, 1n]);
assert.deepEqual([sb.wins, sb.losses, sb.draws], [1n, 1n, 1n]);
console.log("✓ win/loss/draw stats recorded");

// 7. Cancel a waiting game
await send(alice, "createGame");
const g4 = (await game.gameCount()) - 1n;
await assert.rejects(send(bob, "cancelGame", g4), /NotPlayer/);
await send(alice, "cancelGame", g4);
assert.equal((await game.getGame(g4)).status, Status.Cancelled);
await assert.rejects(send(bob, "joinGame", g4), /NotWaiting/);
console.log("✓ creator can cancel an unjoined game");

// 8. Timeout: bob stalls, alice claims the win
const g5 = await newGame();
await send(alice, "play", g5, 0);
await assert.rejects(send(alice, "claimTimeout", g5), /TimeoutNotReached/);
await provider.send("evm_increaseTime", [301]);
await provider.send("evm_mine", []);
await assert.rejects(send(bob, "claimTimeout", g5), /NotPlayer/); // bob is the one stalling
await send(alice, "claimTimeout", g5);
assert.equal((await game.getGame(g5)).status, Status.XWon);
console.log("✓ idle opponent loses by timeout");

// 9. Views
const [ids, list] = await game.recentGames(3);
assert.deepEqual(ids.toArray(), [g5, g4, g3]);
assert.equal(list[0].status, Status.XWon);
assert.deepEqual((await game.getPlayerGames(bob.address)).toArray(), [0n, g2, g3, g5]);
console.log("✓ recentGames and getPlayerGames");

// ---------- Single-player vs the computer ----------
const computer = await game.getAddress();
const board = async (id) => (await game.getGame(id)).board.map(Number);
const winningCell = (b, p) => {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const l of lines) {
    const empty = l.filter((c) => b[c] === 0);
    if (empty.length === 1 && l.filter((c) => b[c] === p).length === 2) return empty[0];
  }
  return -1;
};
async function newSolo() {
  await send(carol, "createSoloGame");
  return (await game.gameCount()) - 1n;
}

// 10. Solo game setup
const s1 = await newSolo();
g = await game.getGame(s1);
assert.equal(g.playerX, carol.address);
assert.equal(g.playerO, computer);
assert.equal(g.status, Status.Active);
assert.equal(await game.isSolo(s1), true);
assert.equal(await game.isSolo(0), false);
await assert.rejects(send(bob, "joinGame", s1), /NotWaiting/);
await assert.rejects(send(bob, "play", s1, 0), /NotYourTurn/);
await assert.rejects(send(carol, "claimTimeout", s1), /NotPlayer/);
console.log("✓ solo game: contract is player O; nobody else can join or play");

// 11. Computer replies in the same transaction, takes the centre first
await send(carol, "play", s1, 0);
g = await game.getGame(s1);
assert.equal(g.moves, 2n);
assert.equal(g.turn, 1n);
assert.equal(Number(g.board[4]), 2);
console.log("✓ computer replies instantly (took the centre)");

// 12. Computer blocks a threat
await send(carol, "play", s1, 1); // X threatens 0-1-2
assert.equal((await board(s1))[2], 2);
console.log("✓ computer blocks");

// 13. Computer takes a win when offered (O has 2 and 4, threatens 6)
await send(carol, "play", s1, 3);
g = await game.getGame(s1);
assert.equal(Number(g.board[6]), 2);
assert.equal(g.status, Status.OWon);
console.log("✓ computer wins when it can");

// 14. Human beats the computer with a fork: X 0, X 8, then the free corner
const s2 = await newSolo();
await send(carol, "play", s2, 0); // O takes 4
await send(carol, "play", s2, 8); // O takes corner 2 or 6
let b = await board(s2);
const freeCorner = b[2] === 0 ? 2 : 6;
await send(carol, "play", s2, freeCorner); // blocks O and creates two threats; O blocks one
b = await board(s2);
const finisher = winningCell(b, 1);
assert.notEqual(finisher, -1);
await send(carol, "play", s2, finisher);
assert.equal((await game.getGame(s2)).status, Status.XWon);
console.log("✓ computer is beatable with a fork");

// 15. Solo results go to soloStats, not two-player stats
const ss = await game.soloStats(carol.address);
assert.deepEqual([ss.wins, ss.losses, ss.draws], [1n, 1n, 0n]);
const ps = await game.stats(carol.address);
assert.deepEqual([ps.wins, ps.losses, ps.draws], [0n, 0n, 0n]);
assert.deepEqual((await game.soloStats(computer)).toArray(), [0n, 0n, 0n]);
assert.deepEqual((await game.getPlayerGames(carol.address)).toArray(), [s1, s2]);
console.log("✓ solo results tracked separately in soloStats");

// 16. A full solo game always ends (win, loss or draw) whatever the human plays
for (let round = 0; round < 5; round++) {
  const id = await newSolo();
  while ((await game.getGame(id)).status === Status.Active) {
    const empty = (await board(id)).flatMap((v, i) => (v === 0 ? [i] : []));
    await send(carol, "play", id, empty[(round * 7 + empty.length) % empty.length]);
  }
  assert.ok((await game.getGame(id)).status >= Status.XWon);
}
console.log("✓ 5 solo games with varied moves all finish correctly");

// ---------- Rigged mode: the computer cheats and can never lose ----------
const Mode = { PvP: 0n, Solo: 1n, Rigged: 2n };
const Cheat = { None: 0n, Steal: 1n, Erase: 2n, DoubleMove: 3n, Technicality: 4n };

// 17. Modes are recorded
assert.equal((await game.getGame(0)).mode, Mode.PvP);
assert.equal((await game.getGame(s1)).mode, Mode.Solo);
await send(carol, "createRiggedGame");
const r0 = (await game.gameCount()) - 1n;
g = await game.getGame(r0);
assert.equal(g.mode, Mode.Rigged);
assert.equal(g.playerO, computer);
assert.equal(g.lastCheat, Cheat.None);
await assert.rejects(send(bob, "joinGame", r0), /NotWaiting/);
await assert.rejects(send(bob, "play", r0, 0), /NotYourTurn/);
console.log("✓ rigged game created; mode stored for every game type");

// 18. A smart human (wins when it can, blocks, else varies) never beats the cheater
const soloBefore = (await game.soloStats(carol.address)).toArray();
const seen = { Steal: 0, Erase: 0, DoubleMove: 0, Technicality: 0 };
const GAMES = 40;
let longest = 0;
for (let n = 0; n < GAMES; n++) {
  const id = n === 0 ? r0 : (await send(carol, "createRiggedGame"), (await game.gameCount()) - 1n);
  let turns = 0;
  while ((await game.getGame(id)).status === Status.Active) {
    const b = await board(id);
    const empty = b.flatMap((v, i) => (v === 0 ? [i] : []));
    let cell = winningCell(b, 1); // try to win
    if (cell === -1) cell = winningCell(b, 2); // block the computer
    if (cell === -1) cell = empty[(n * 5 + turns * 3) % empty.length];
    await send(carol, "play", id, cell);
    const after = await game.getGame(id);
    for (const [name, v] of Object.entries(Cheat)) if (v !== 0n && after.lastCheat === v) seen[name]++;
    turns++;
    assert.ok(turns <= 20, `game ${id} did not end`);
  }
  const done = await game.getGame(id);
  assert.equal(done.status, Status.OWon, `game ${id} ended with status ${done.status}`);
  longest = Math.max(longest, turns);
}
console.log(`✓ ${GAMES} rigged games: computer won all of them (longest took ${longest} human moves)`);
console.log(`  cheats seen: ${JSON.stringify(seen)}`);
assert.ok(seen.Steal > 0, "expected a stolen winning move");
assert.ok(seen.Erase > 0, "expected an erased mark");
assert.ok(seen.DoubleMove > 0, "expected a double move");
console.log("✓ steal, erase and double-move cheats all happen");

// 19. Stats: rigged losses tracked separately, no wins or draws possible
const rs = await game.riggedStats(carol.address);
assert.deepEqual([rs.wins, rs.losses, rs.draws], [0n, BigInt(GAMES), 0n]);
assert.deepEqual((await game.soloStats(carol.address)).toArray(), soloBefore);
console.log("✓ rigged results go to riggedStats (0 wins, 0 draws)");

// 20. Normal solo mode is unaffected and still beatable (fork from test 14 again)
const s3 = await newSolo();
await send(carol, "play", s3, 0);
await send(carol, "play", s3, 8);
b = await board(s3);
await send(carol, "play", s3, b[2] === 0 ? 2 : 6);
await send(carol, "play", s3, winningCell(await board(s3), 1));
assert.equal((await game.getGame(s3)).status, Status.XWon);
assert.equal((await game.getGame(s3)).cheats, 0n);
console.log("✓ normal solo mode never cheats and is still beatable");

console.log("\nAll tests passed.");
process.exit(0);
