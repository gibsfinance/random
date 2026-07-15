pragma circom 2.1.6;

// ZK-Sudoku solve (M3 "role-flip"). Proves the prover knows a VALID solution to a
// committed PUBLIC puzzle, WITHOUT revealing the solution, and binds the proof to a
// public `player` via a nullifier so it cannot be replayed or front-run in a timed
// race.
//
// Public inputs:  puzzle[81] (0 = blank, else 1..9), player
// Public output:  nullifier
// Private inputs: solution[81]
//
// WHY THIS SHAPE (see docs/superpowers/plans + the design spec):
//   M2's circuit required Poseidon(solution‖salt) == commit for a HOUSE-committed
//   `salt`. That was house-exploitable: (a) an honest player cannot reproduce the
//   house's secret salt, so as specified they literally could not prove; and (b) a
//   malicious house could commit a value matching no real / an ambiguous / unsolvable
//   puzzle, so an honest solver forfeited the stake at the deadline. Fix: the win
//   proof no longer references any house secret. It proves ONLY "solution ⊨ public
//   puzzle" and any valid solution wins. Solvability is guaranteed separately by the
//   HOUSE proving a solve of the same puzzle at open (same circuit), so the player is
//   protected without a uniqueness proof.
//
// nullifier scheme (mirror bit-for-bit in src/sudoku.ts):
//   rowDigest[r] = Poseidon(solution[r*9 .. r*9+8])     (9 inputs)  for r = 0..8
//   nullifier    = Poseidon(rowDigest[0..8], player)    (10 inputs)
// Every Poseidon call is <= 16 inputs (circomlib's limit) via a two-level sponge.
// The nullifier is preimage-resistant in `solution` (a watcher who cannot solve the
// puzzle cannot compute it) and is bound to `player`, so copying the proof for a
// different player is impossible and the contract can record it to block replay.
//
// Public-signal order (snarkjs emits OUTPUTS first, then public inputs in declaration
// order): pub = [nullifier, puzzle[0..80], player]  (83 signals). SudokuRules.sol packs
// exactly this order.

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template SudokuSolve() {
    signal input puzzle[81];
    signal input player;

    signal input solution[81];

    signal output nullifier;

    // --- 1. each solution[i] in [1,9] ---
    // Num2Bits(4) forces (solution[i]-1) into [0,15]: if solution[i]==0 then solution[i]-1 == p-1,
    // which is NOT a 4-bit number, so witness generation fails (correct lower bound — NOTE a bare
    // LessThan here would wrongly accept 0 via field wraparound). LessThan(4) then forces
    // (solution[i]-1) < 9, i.e. solution[i] <= 9. Together: solution[i] in [1,9]. (Redundant with the
    // permutation check below, kept as explicit, correct defense-in-depth.)
    component rbits[81];
    component range[81];
    for (var i = 0; i < 81; i++) {
        rbits[i] = Num2Bits(4);
        rbits[i].in <== solution[i] - 1;

        range[i] = LessThan(4);
        range[i].in[0] <== solution[i] - 1;
        range[i].in[1] <== 9;
        range[i].out === 1;
    }

    // --- 2. puzzle[i] != 0 => solution[i] == puzzle[i] ---
    // encoded as: IsZero(puzzle[i]) OR IsEqual(solution[i], puzzle[i])
    component isZero[81];
    component isEq[81];
    signal agreeOr[81];
    for (var i = 0; i < 81; i++) {
        isZero[i] = IsZero();
        isZero[i].in <== puzzle[i];

        isEq[i] = IsEqual();
        isEq[i].in[0] <== solution[i];
        isEq[i].in[1] <== puzzle[i];

        agreeOr[i] <== isZero[i].out + isEq[i].out - isZero[i].out * isEq[i].out;
        agreeOr[i] === 1;
    }

    // --- 3. rows / cols / 3x3 boxes are each a permutation of 1..9 ---
    // For every group of 9 cells and every value v in 1..9, exactly one
    // cell in the group equals v.
    var groups[27][9];
    var g = 0;

    // rows
    for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
            groups[g][c] = r * 9 + c;
        }
        g++;
    }
    // columns
    for (var c = 0; c < 9; c++) {
        for (var r = 0; r < 9; r++) {
            groups[g][r] = r * 9 + c;
        }
        g++;
    }
    // 3x3 boxes
    for (var br = 0; br < 3; br++) {
        for (var bc = 0; bc < 3; bc++) {
            var k = 0;
            for (var dr = 0; dr < 3; dr++) {
                for (var dc = 0; dc < 3; dc++) {
                    groups[g][k] = (br * 3 + dr) * 9 + (bc * 3 + dc);
                    k++;
                }
            }
            g++;
        }
    }

    component permEq[27][9][9];
    signal permAcc[27][9][10];
    for (var gi = 0; gi < 27; gi++) {
        for (var v = 1; v <= 9; v++) {
            permAcc[gi][v - 1][0] <== 0;
            for (var ci = 0; ci < 9; ci++) {
                permEq[gi][v - 1][ci] = IsEqual();
                permEq[gi][v - 1][ci].in[0] <== solution[groups[gi][ci]];
                permEq[gi][v - 1][ci].in[1] <== v;
                permAcc[gi][v - 1][ci + 1] <== permAcc[gi][v - 1][ci] + permEq[gi][v - 1][ci].out;
            }
            permAcc[gi][v - 1][9] === 1;
        }
    }

    // --- 4. nullifier: row-wise Poseidon(9) sponge, then Poseidon(10) with `player` ---
    // rowDigest[r] = Poseidon(solution row r); nullifier = Poseidon(rowDigest[0..8], player).
    // Binds all 81 cells + the player into one field element. No house salt/commit here.
    component rowHash[9];
    signal rowDigest[9];
    for (var r = 0; r < 9; r++) {
        rowHash[r] = Poseidon(9);
        for (var c = 0; c < 9; c++) {
            rowHash[r].inputs[c] <== solution[r * 9 + c];
        }
        rowDigest[r] <== rowHash[r].out;
    }

    component nullHash = Poseidon(10);
    for (var r = 0; r < 9; r++) {
        nullHash.inputs[r] <== rowDigest[r];
    }
    nullHash.inputs[9] <== player;
    nullifier <== nullHash.out;
}

component main {public [puzzle, player]} = SudokuSolve();
