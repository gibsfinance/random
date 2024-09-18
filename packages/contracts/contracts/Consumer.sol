// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// import {console} from "hardhat/console.sol";

import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {LibPRNG} from "solady/src/utils/LibPRNG.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {EfficientHashLib} from "solady/src/utils/EfficientHashLib.sol";
import {LibMulticaller} from "multicaller/src/LibMulticaller.sol";
import {IRandom} from "./implementations/IRandom.sol";
import {PreimageLocation} from "./PreimageLocation.sol";
import {ERC20} from "solady/src/tokens/ERC20.sol";
import {Errors} from "./Constants.sol";

error SecretMismatch();

event Undermine(uint256 id, bytes32 preimage);

event Chain(bytes32 indexed owner, uint256 id, bytes32 key);

event ConsumerReveal(uint256 id, bytes32 formerSecret);

contract Consumer {
    using EfficientHashLib for bytes32;
    using SafeTransferLib for address;

    uint256 internal constant ZERO = 0;
    uint256 internal constant ONE = 1;
    uint256 internal constant NINE_SIX = 96;
    uint256 internal constant ONE_SIX_ZERO = 160;

    bytes32 internal immutable PREIMAGE_ZERO;

    address internal immutable rand;

    uint256 internal _id;

    struct Link {
        uint256 id;
        address owner;
        bool underminable;
        bytes32 key;
        bytes32 preimage;
        bytes32 revealed;
    }

    constructor(address _rand) payable {
        rand = _rand;
        PREIMAGE_ZERO = bytes32(ZERO).hash();
    }

    mapping(bytes32 preimage => bytes32 formerSecret) internal _preimageToSecret;
    mapping(bytes32 preimage => uint256 id) internal _preimageToId;
    mapping(uint256 id => bytes32 owner) internal _owner;
    mapping(uint256 id => bytes32 preimage) internal _preimage;
    mapping(uint256 id => bytes32 key) internal _key;

    function _undermineExpired(uint256 id, bytes32 hashed, bytes32 seed) internal {
        // order preimage cannot be overriden until after all secrets have been revealed
        // this creates a high incentive for both player 1, and rule enforcer to get secrets on chain
        // before the expired line is crossed. either:
        // 1) player 1 wins, and they want to claim their winnings (high incentive to keep secret safe)
        // 2) player 1 loses, so the rule enforcer is incented to claim their winnings
        // 3) if either one waits too long - and allows others overwrite the preimage,
        //    then the benefiting party risks a re-roll of the randomness seed
        unchecked {
            if (seed == bytes32(ZERO)) {
                return;
            }
            if (hashed == _preimage[id]) {
                return;
            }
            if (uint256(_owner[id] >> ONE_SIX_ZERO) == ZERO) {
                revert Errors.Misconfigured();
            }
            // originator of the chained secret+preimage can reject updates
            // it is up to anyone who would wish to turn this feature on to check that it will work ahead of time
            // we allow non secret holdes to update the order preimage in order to maximally incent
            // randomenss campaign completion
            // think of it like chips with an expiry time. you might be able to cash them in,
            // but the desk might also refuse to honor them if the expiry time is too far from the defined values
            // in that case, they are worthless
            // if a casino wants to have an intermediate period they can enforce that in their own contract
            emit Undermine({id: id, preimage: hashed});
            _preimage[id] = hashed;
            // note that the preimage may not be what was originally intended - we do not track in the contract
        }
    }

    /**
     * @param id the id of the chained randomness to reveal
     * @dev calling tell should be considered risky in that it will revert if you are
     * a) do not have the original secret
     * b) unable to set the preimage to the hash of your revealed secret because you were too late
     * either way, at the end of this function call, you should have a preimageToSecret
     * that is set so that you can use it (it will not be bytes32(0))
     */
    function tell(uint256 id, bytes32 revealedSecret) external {
        unchecked {
            if (_preimageToSecret[_preimage[id]] != bytes32(ZERO)) {
                return;
            }
            IRandom.Randomness memory r = IRandom(rand).randomness(_key[id]);
            bytes32 hashed = revealedSecret.hash();
            if (IRandom(rand).expired({timeline: r.timeline})) {
                _undermineExpired({
                    id: id,
                    hashed: hashed,
                    seed: r.seed
                });
            }
            if (hashed != _preimage[id]) {
                // console.log(id);
                // console.logBytes32(hashed);
                // console.logBytes32(_preimage[id]);
                revert SecretMismatch();
            }
            _preimageToSecret[hashed] = revealedSecret;
            emit ConsumerReveal({id: id, formerSecret: revealedSecret});
            // we do not emit an event here because it is more likely that users will simply
            // do it themselves via a contract or only care about the latest
        }
    }

    function chain(address owner, bool onlySameTx, bool underminable, bytes32 preimage)
        external
        payable
        returns (uint256 id)
    {
        bytes32 key = IRandom(rand).latest(owner, onlySameTx);
        if (key == bytes32(ZERO)) {
            revert Errors.Misconfigured();
        }
        return _chainTo({
            owner: LibMulticaller.senderOrSigner(),
            underminable: underminable,
            preimage: preimage,
            key: key
        });
    }

    function chainTo(address owner, bool underminable, bytes32 preimage, bytes32 key)
        external
        payable
        returns (uint256)
    {
        return _chainTo({
            owner: owner,
            underminable: underminable,
            preimage: preimage,
            key: key
        });
    }

    function latestId() external view returns (uint256) {
        return _id;
    }

    function link(uint256 idParam) external view returns (Link memory l) {
        bytes32 key = _key[idParam];
        if (key == bytes32(ZERO)) {
            return l;
        }
        bytes32 preimage = _preimage[idParam];
        bytes32 o = _owner[idParam];
        l = Link({
            id: idParam,
            key: key,
            owner: address(bytes20(o << NINE_SIX)),
            underminable: o >> ONE_SIX_ZERO == 0x00 ? false : true,
            preimage: preimage,
            revealed: _preimageToSecret[preimage]
        });
    }

    function _chainTo(address owner, bool underminable, bytes32 preimage, bytes32 key) internal returns (uint256 id) {
        unchecked {
            if (preimage == bytes32(ZERO) || preimage == PREIMAGE_ZERO) {
                revert Errors.Misconfigured();
            }
            id = _preimageToId[preimage];
            bytes32 o = bytes32((underminable ? (ONE << ONE_SIX_ZERO) : ZERO) | uint256(uint160(owner)));
            if (_preimage[id] == preimage) {
                if (_owner[id] == o) {
                    return id;
                }
            }
            id = ++_id;
            _owner[id] = o;
            _preimage[id] = preimage;
            _key[id] = key;
            // allow for reverse lookup
            _preimageToId[preimage] = id;
            emit Chain({owner: o, id: id, key: key});
        }
    }
}
