// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ECDSA} from "solady/src/utils/ECDSA.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {Ownable} from "solady/src/auth/Ownable.sol";
import {SkillPayouts} from "./SkillPayouts.sol";

/// Groth16 proof for the ZK-skill circuits (contracts/zk/generated/*Verifier.sol shape). The two
/// Rules wrappers (SudokuRules, WordleRules) expose the typed helpers below; kept as minimal
/// interfaces so SkillSettle doesn't pull the verifiers into its own compilation unit.
interface ISudokuRules {
    function checkSolve(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[81] calldata puzzle,
        uint256 commit
    ) external view returns (bool);
}

interface IWordleRules {
    function checkClue(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 commit,
        uint256[5] calldata guess,
        uint256[5] calldata clue
    ) external view returns (bool);
}

/// Escrowed settlement backend for the ZK SKILL games — the proof-driven analog of HouseChannel
/// (whose ZK path is Noir/UltraHonk + conservation). Here a round settles from a Groth16 proof that
/// the player met the game's win condition against the puzzle/word the house COMMITTED at open:
///
///   • Sudoku (gameId 31): FULLY TRUSTLESS + permissionless. The player submits a solve proof; the
///     contract verifies it against the committed puzzle+commitment and pays the flat multiplier. The
///     house cannot block a valid solve; the player cannot fake one. No solve by the deadline → loss.
///
///   • Wordle (gameId 30): the player submits an all-green clue proof (a proven SOLVE) AND the house
///     co-signs the guesses-used (the multiplier scale). The ZK proof stops the house denying a solve
///     or the player faking one; the house co-sign stops the player UNDERSTATING guesses-used to grab
///     a richer multiplier — a single clue proof attests honesty, not the guess's POSITION in the
///     sequence. Trustless guess-sequence binding (so Wordle needs no house co-sign) + the house's
///     word+salt reveal on a griefed solve are the interactive-channel hardening in M3.
///
/// Chips (ERC20) escrow, house-signed open terms, per-table escrow reservation — mirrors HouseChannel.
contract SkillSettle is Ownable {
    using SafeTransferLib for address;

    error BadStatus();
    error BadGame();
    error BadSig();
    error NotPlayer();
    error Expired();
    error InsufficientPool();
    error EscrowTooSmall();
    error BadPuzzle();
    error BadProof();
    error NotAllGreen();
    error BadGuesses();
    error DeadlineNotPassed();

    enum Status { None, Live, Settled }

    struct Table {
        address player;
        uint256 escrowPlayer; // the stake
        uint256 escrowHouse;  // reserved from housePool at open; covers the max payout profit
        uint8 gameId;
        uint256 commit;       // Poseidon commitment (word/solution) — a circuit public signal
        bytes32 puzzleHash;   // keccak256(abi.encode(puzzle)) for sudoku; 0 for wordle
        uint64 deadline;      // block.number by which the player must settle a win, else reclaim
        Status status;
    }

    /// House-signed authorization for a single escrowed open. `escrowHouse` MUST cover the game's max
    /// payout profit (checked at open against the escrow ceiling) so a winner can always be paid.
    struct SkillOpenTerms {
        bytes32 tableId;
        address player;
        uint256 escrowPlayer;
        uint256 escrowHouse;
        uint8 gameId;
        uint256 commit;
        bytes32 puzzleHash;
        uint64 clockBlocks;
        uint64 expiry;
    }

    uint64 public constant MIN_CLOCK_BLOCKS = 30;      // ~5 min at 10s blocks
    uint64 public constant MAX_CLOCK_BLOCKS = 60480;   // ~1 week

    address public immutable chips;
    address public immutable sudokuRules;
    address public immutable wordleRules;
    bytes32 public immutable domainSeparator;

    address public houseKey;
    uint256 public housePool;
    mapping(bytes32 tableId => Table) public tables;

    event HouseFunded(uint256 amount);
    event HouseWithdrawn(uint256 amount);
    event HouseKeySet(address indexed key);
    event Opened(bytes32 indexed tableId, address indexed player, uint8 gameId, uint256 escrowPlayer, uint256 escrowHouse);
    event Settled(bytes32 indexed tableId, uint256 payoutPlayer, uint256 payoutHouse);
    event Reclaimed(bytes32 indexed tableId, uint256 toHouse);

    constructor(address chips_, address sudokuRules_, address wordleRules_) {
        chips = chips_;
        sudokuRules = sudokuRules_;
        wordleRules = wordleRules_;
        _initializeOwner(msg.sender);
        domainSeparator = keccak256(abi.encode(keccak256("SkillSettle(v1)"), block.chainid, address(this)));
    }

    function setHouseKey(address key) external onlyOwner {
        houseKey = key;
        emit HouseKeySet(key);
    }

    function fundHouse(uint256 amount) external onlyOwner {
        housePool += amount;
        chips.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseFunded(amount);
    }

    function withdrawHouse(uint256 amount) external onlyOwner {
        if (housePool < amount) revert InsufficientPool();
        housePool -= amount;
        chips.safeTransfer(msg.sender, amount);
        emit HouseWithdrawn(amount);
    }

    // ---- open ------------------------------------------------------------------------------------

    function _structHash(SkillOpenTerms calldata t) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("SkillOpenTerms(bytes32 tableId,address player,uint256 escrowPlayer,uint256 escrowHouse,uint8 gameId,uint256 commit,bytes32 puzzleHash,uint64 clockBlocks,uint64 expiry)"),
            t.tableId, t.player, t.escrowPlayer, t.escrowHouse, t.gameId, t.commit, t.puzzleHash, t.clockBlocks, t.expiry
        ));
    }

    /// EIP-712-flavoured digest the house signs to authorize an open (domain-bound to this contract +
    /// chain, so a signature cannot be replayed onto another SkillSettle or chain).
    function openDigest(SkillOpenTerms calldata t) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, _structHash(t)));
    }

    /// The escrow ceiling (×100) for a gameId — the richest payout the house could owe. `escrowHouse`
    /// is validated against it so a winner is always payable.
    function _maxMultX100(uint8 gameId) internal pure returns (uint256) {
        if (gameId == SkillPayouts.SUDOKU_GAME_ID) return SkillPayouts.SUDOKU_MULT_X100;
        if (gameId == SkillPayouts.WORDLE_GAME_ID) return SkillPayouts.wordleMaxMultX100();
        revert BadGame();
    }

    /// Player opens an escrowed skill round: escrows their stake, reserves the house escrow from the
    /// pool, authorized by the house's signature over `terms`. One player tx.
    function open(SkillOpenTerms calldata terms, bytes calldata houseSig) external {
        if (terms.player != msg.sender) revert NotPlayer();
        if (block.timestamp > terms.expiry) revert Expired();
        if (terms.clockBlocks < MIN_CLOCK_BLOCKS || terms.clockBlocks > MAX_CLOCK_BLOCKS) revert BadStatus();
        Table storage t = tables[terms.tableId];
        if (t.status != Status.None) revert BadStatus();
        if (ECDSA.recoverCalldata(openDigest(terms), houseSig) != houseKey) revert BadSig();

        // escrowHouse must cover the max payout PROFIT: pot - stake >= stake*(maxMult-100)/100.
        uint256 maxProfit = SkillPayouts.payout(terms.escrowPlayer, _maxMultX100(terms.gameId)) - terms.escrowPlayer;
        if (terms.escrowHouse < maxProfit) revert EscrowTooSmall();
        if (housePool < terms.escrowHouse) revert InsufficientPool();
        housePool -= terms.escrowHouse;

        t.player = msg.sender;
        t.escrowPlayer = terms.escrowPlayer;
        t.escrowHouse = terms.escrowHouse;
        t.gameId = terms.gameId;
        t.commit = terms.commit;
        t.puzzleHash = terms.puzzleHash;
        t.deadline = uint64(block.number) + terms.clockBlocks;
        t.status = Status.Live;

        chips.safeTransferFrom(msg.sender, address(this), terms.escrowPlayer);
        emit Opened(terms.tableId, msg.sender, terms.gameId, terms.escrowPlayer, terms.escrowHouse);
    }

    // ---- settle ----------------------------------------------------------------------------------

    /// Sudoku (gameId 31): permissionless, fully trustless. Anyone (in practice the player) submits a
    /// Groth16 solve proof; the contract verifies it against the table's committed puzzle + commitment
    /// and pays the flat solve multiplier. `puzzle` is bound to the house-signed puzzleHash so it
    /// cannot be swapped for an easier board post-hoc.
    function settleSudoku(
        bytes32 tableId,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[81] calldata puzzle
    ) external {
        Table storage t = tables[tableId];
        if (t.status != Status.Live) revert BadStatus();
        if (t.gameId != SkillPayouts.SUDOKU_GAME_ID) revert BadGame();
        if (keccak256(abi.encode(puzzle)) != t.puzzleHash) revert BadPuzzle();
        if (!ISudokuRules(sudokuRules).checkSolve(a, b, c, puzzle, t.commit)) revert BadProof();

        uint256 payoutPlayer = SkillPayouts.payout(t.escrowPlayer, SkillPayouts.SUDOKU_MULT_X100);
        _payout(t, tableId, payoutPlayer);
    }

    /// Wordle (gameId 30): the player submits an all-green clue proof (a proven solve) and the house
    /// co-signs `guessesUsed` (the multiplier scale). BOTH gates are required — see the contract-level
    /// note. `houseSig` is over the domain-bound (tableId, guessesUsed) tuple.
    function settleWordle(
        bytes32 tableId,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata guess,
        uint256[5] calldata clue,
        uint256 guessesUsed,
        bytes calldata houseSig
    ) external {
        Table storage t = tables[tableId];
        if (t.status != Status.Live) revert BadStatus();
        if (t.gameId != SkillPayouts.WORDLE_GAME_ID) revert BadGame();
        if (guessesUsed < 1 || guessesUsed > SkillPayouts.WORDLE_MAX_GUESSES) revert BadGuesses();
        if (!SkillPayouts.isAllGreen(clue)) revert NotAllGreen();

        bytes32 countDigest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, keccak256(abi.encode(tableId, guessesUsed))));
        if (ECDSA.recoverCalldata(countDigest, houseSig) != houseKey) revert BadSig();
        if (!IWordleRules(wordleRules).checkClue(a, b, c, t.commit, guess, clue)) revert BadProof();

        uint256 payoutPlayer = SkillPayouts.payout(t.escrowPlayer, SkillPayouts.wordleMultX100(guessesUsed));
        _payout(t, tableId, payoutPlayer);
    }

    /// Loss path: after the solve deadline with no winning settle, the player did not meet the win
    /// condition in time — the house reclaims the whole pot (stake + its own escrow). Permissionless.
    function reclaim(bytes32 tableId) external {
        Table storage t = tables[tableId];
        if (t.status != Status.Live) revert BadStatus();
        if (uint64(block.number) <= t.deadline) revert DeadlineNotPassed();
        uint256 stake = t.escrowPlayer; // capture before _payout zeroes it
        _payout(t, tableId, 0); // nothing to the player; whole pot returns to the pool
        emit Reclaimed(tableId, stake);
    }

    /// Pay `payoutPlayer` to the player and return the rest of the pot to the house pool. The escrow
    /// ceiling checked at open guarantees payoutPlayer <= pot.
    function _payout(Table storage t, bytes32 tableId, uint256 payoutPlayer) internal {
        uint256 pot = t.escrowPlayer + t.escrowHouse;
        address player = t.player;
        t.status = Status.Settled;
        t.escrowPlayer = 0;
        t.escrowHouse = 0;
        housePool += pot - payoutPlayer; // the house's share (incl. a lost stake) returns to the pool
        emit Settled(tableId, payoutPlayer, pot - payoutPlayer);
        if (payoutPlayer > 0) chips.safeTransfer(player, payoutPlayer);
    }
}
