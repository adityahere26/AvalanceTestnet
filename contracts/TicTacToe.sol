// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TicTacToe
/// @notice On-chain Tic-Tac-Toe: two-player games, or single-player vs the contract.
///         Every action (create, join, move) is a normal contract call. In the dApp these
///         calls are sent through SmoothSend, which sponsors gas, so players never need AVAX.
///         Players are identified by msg.sender (their SmoothSend smart account).
///
///         Single-player: the contract itself is player O (playerO == address(this)).
///         After each human move, the computer replies in the same transaction.
contract TicTacToe {
    enum Status { Waiting, Active, XWon, OWon, Draw, Cancelled }

    struct Game {
        address playerX; // creator, moves first
        address playerO;
        uint8[9] board;  // 0 = empty, 1 = X, 2 = O. Index = row * 3 + col
        uint8 turn;      // 1 = X to move, 2 = O to move
        uint8 moves;
        Status status;
        uint64 lastMoveAt;
    }

    struct Stats {
        uint32 wins;
        uint32 losses;
        uint32 draws;
    }

    /// @notice If the player to move is idle this long, the other player can claim the win.
    uint256 public constant TURN_TIMEOUT = 5 minutes;

    Game[] private _games;
    mapping(address => uint256[]) private _playerGames;
    mapping(address => Stats) public stats;     // two-player games
    mapping(address => Stats) public soloStats; // games vs the computer

    event GameCreated(uint256 indexed gameId, address indexed playerX);
    event GameJoined(uint256 indexed gameId, address indexed playerO);
    event MovePlayed(uint256 indexed gameId, address indexed player, uint8 cell);
    event GameEnded(uint256 indexed gameId, Status status);

    error GameNotFound();
    error NotWaiting();
    error NotActive();
    error CannotJoinOwnGame();
    error NotYourTurn();
    error CellTaken();
    error BadCell();
    error NotPlayer();
    error TimeoutNotReached();

    // ---------- Actions ----------

    /// @notice Start a game against the computer. You are X and move first.
    function createSoloGame() external returns (uint256 gameId) {
        gameId = _games.length;
        Game storage g = _games.push();
        g.playerX = msg.sender;
        g.playerO = address(this);
        g.turn = 1;
        g.status = Status.Active;
        g.lastMoveAt = uint64(block.timestamp);
        _playerGames[msg.sender].push(gameId);
        emit GameCreated(gameId, msg.sender);
        emit GameJoined(gameId, address(this));
    }

    function createGame() external returns (uint256 gameId) {
        gameId = _games.length;
        Game storage g = _games.push();
        g.playerX = msg.sender;
        g.turn = 1;
        g.status = Status.Waiting;
        g.lastMoveAt = uint64(block.timestamp);
        _playerGames[msg.sender].push(gameId);
        emit GameCreated(gameId, msg.sender);
    }

    function joinGame(uint256 gameId) external {
        Game storage g = _game(gameId);
        if (g.status != Status.Waiting) revert NotWaiting();
        if (msg.sender == g.playerX) revert CannotJoinOwnGame();
        g.playerO = msg.sender;
        g.status = Status.Active;
        g.lastMoveAt = uint64(block.timestamp);
        _playerGames[msg.sender].push(gameId);
        emit GameJoined(gameId, msg.sender);
    }

    function play(uint256 gameId, uint8 cell) external {
        Game storage g = _game(gameId);
        if (g.status != Status.Active) revert NotActive();
        if (cell > 8) revert BadCell();
        address expected = g.turn == 1 ? g.playerX : g.playerO;
        if (msg.sender != expected) revert NotYourTurn();
        if (g.board[cell] != 0) revert CellTaken();

        g.board[cell] = g.turn;
        g.moves++;
        g.lastMoveAt = uint64(block.timestamp);
        emit MovePlayed(gameId, msg.sender, cell);

        if (_resolve(gameId, g)) return;

        // Single-player: the computer answers immediately, in this same transaction.
        if (g.playerO == address(this)) {
            uint8 reply = _computerMove(gameId, g);
            g.board[reply] = 2;
            g.moves++;
            emit MovePlayed(gameId, address(this), reply);
            _resolve(gameId, g);
        }
    }

    function isSolo(uint256 gameId) external view returns (bool) {
        return _game(gameId).playerO == address(this);
    }

    /// @notice Creator can cancel a game nobody has joined yet.
    function cancelGame(uint256 gameId) external {
        Game storage g = _game(gameId);
        if (g.status != Status.Waiting) revert NotWaiting();
        if (msg.sender != g.playerX) revert NotPlayer();
        g.status = Status.Cancelled;
        emit GameEnded(gameId, Status.Cancelled);
    }

    /// @notice If your opponent hasn't moved for TURN_TIMEOUT, you win.
    function claimTimeout(uint256 gameId) external {
        Game storage g = _game(gameId);
        if (g.status != Status.Active) revert NotActive();
        address waitingOn = g.turn == 1 ? g.playerX : g.playerO;
        address claimer = g.turn == 1 ? g.playerO : g.playerX;
        if (msg.sender != claimer) revert NotPlayer();
        if (block.timestamp < uint256(g.lastMoveAt) + TURN_TIMEOUT) revert TimeoutNotReached();
        _finish(gameId, g, waitingOn == g.playerX ? Status.OWon : Status.XWon);
    }

    // ---------- Free read-only views ----------

    function gameCount() external view returns (uint256) {
        return _games.length;
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return _game(gameId);
    }

    function getPlayerGames(address player) external view returns (uint256[] memory) {
        return _playerGames[player];
    }

    /// @notice Up to `limit` most recent games, newest first. Returns ids alongside games.
    function recentGames(uint256 limit) external view returns (uint256[] memory ids, Game[] memory list) {
        uint256 total = _games.length;
        uint256 n = total < limit ? total : limit;
        ids = new uint256[](n);
        list = new Game[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = total - 1 - i;
            list[i] = _games[total - 1 - i];
        }
    }

    // ---------- Internal ----------

    function _game(uint256 gameId) private view returns (Game storage) {
        if (gameId >= _games.length) revert GameNotFound();
        return _games[gameId];
    }

    /// @dev Ends the game if the last move won or filled the board, else passes the turn.
    function _resolve(uint256 gameId, Game storage g) private returns (bool ended) {
        if (_hasWon(g.board, g.turn)) {
            _finish(gameId, g, g.turn == 1 ? Status.XWon : Status.OWon);
            return true;
        }
        if (g.moves == 9) {
            _finish(gameId, g, Status.Draw);
            return true;
        }
        g.turn = g.turn == 1 ? 2 : 1;
        return false;
    }

    function _finish(uint256 gameId, Game storage g, Status result) private {
        g.status = result;
        if (g.playerO == address(this)) {
            Stats storage s = soloStats[g.playerX];
            if (result == Status.XWon) s.wins++;
            else if (result == Status.OWon) s.losses++;
            else s.draws++;
        } else if (result == Status.Draw) {
            stats[g.playerX].draws++;
            stats[g.playerO].draws++;
        } else {
            (address winner, address loser) =
                result == Status.XWon ? (g.playerX, g.playerO) : (g.playerO, g.playerX);
            stats[winner].wins++;
            stats[loser].losses++;
        }
        emit GameEnded(gameId, result);
    }

    /// @dev Computer strategy: win if it can, else block, else centre, else a corner,
    ///      else a side. Strong but beatable (a fork beats it). Ties between corners
    ///      or sides vary per game, using only game data (not block data) so gas
    ///      estimation always matches execution.
    function _computerMove(uint256 gameId, Game storage g) private view returns (uint8) {
        uint8[9] storage b = g.board;
        uint8 cell = _completeLine(b, 2); // win
        if (cell < 9) return cell;
        cell = _completeLine(b, 1); // block
        if (cell < 9) return cell;
        if (b[4] == 0) return 4;

        uint256 r = uint256(keccak256(abi.encode(gameId, g.playerX, g.moves)));
        uint8[4] memory corners = [0, 2, 6, 8];
        uint8[4] memory sides = [1, 3, 5, 7];
        for (uint256 i = 0; i < 4; i++) {
            uint8 c = corners[(r + i) % 4];
            if (b[c] == 0) return c;
        }
        for (uint256 i = 0; i < 4; i++) {
            uint8 c = sides[(r + i) % 4];
            if (b[c] == 0) return c;
        }
        revert NotActive(); // unreachable: board full means the game already ended
    }

    /// @dev Returns the empty cell that would complete a line of `p`, or 9 if none.
    function _completeLine(uint8[9] storage b, uint8 p) private view returns (uint8) {
        uint8[3][8] memory lines = [
            [uint8(0), 1, 2], [uint8(3), 4, 5], [uint8(6), 7, 8],
            [uint8(0), 3, 6], [uint8(1), 4, 7], [uint8(2), 5, 8],
            [uint8(0), 4, 8], [uint8(2), 4, 6]
        ];
        for (uint256 i = 0; i < 8; i++) {
            (uint8 a, uint8 c, uint8 d) = (lines[i][0], lines[i][1], lines[i][2]);
            if (b[a] == p && b[c] == p && b[d] == 0) return d;
            if (b[a] == p && b[d] == p && b[c] == 0) return c;
            if (b[c] == p && b[d] == p && b[a] == 0) return a;
        }
        return 9;
    }

    function _hasWon(uint8[9] storage b, uint8 p) private view returns (bool) {
        return (b[0] == p && b[1] == p && b[2] == p) || (b[3] == p && b[4] == p && b[5] == p)
            || (b[6] == p && b[7] == p && b[8] == p) || (b[0] == p && b[3] == p && b[6] == p)
            || (b[1] == p && b[4] == p && b[7] == p) || (b[2] == p && b[5] == p && b[8] == p)
            || (b[0] == p && b[4] == p && b[8] == p) || (b[2] == p && b[4] == p && b[6] == p);
    }
}
