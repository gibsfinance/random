// SPDX-License-Identifier: GPL-3.0
// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: examples/games/zk-skill/circuits (circom 2.1.6 -> snarkjs 0.7.6 groth16).
// Regenerate: cd examples/games/zk-skill && npx tsx scripts/genOnchainVerifiers.ts
// (or: pnpm --filter @gibs/zk-skill gen:onchain-verifiers)
// DEV/TEST trusted setup (fixed ptau + fixed contribution entropy) -- NOT for production.
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract WordleClueVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 19544738182846805664807031848603959123837164435867802544505915993805382892670;
    uint256 constant alphay  = 8690470285840177944921523601353880179304641750013482430554430926568104123204;
    uint256 constant betax1  = 14912924990997353501203452023595076566745983246073022806024690419747444241911;
    uint256 constant betax2  = 5380396991481874755820858052105244551989779926910450763341166488870317716581;
    uint256 constant betay1  = 10566037201783994428275771689872384518615843244027715361566085354726106458799;
    uint256 constant betay2  = 4886461282474940893584699962615032482890969690918089323555531724369738596644;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant deltax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant deltay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant deltay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;

    
    uint256 constant IC0x = 18628088205928319983032907965788582732485821994568127103789788181146237387838;
    uint256 constant IC0y = 14728385231709776661550032371119982759895202633446857748285865241295452941764;
    
    uint256 constant IC1x = 5076874794295818882169310488889213033966644050050083245967347466331254563005;
    uint256 constant IC1y = 20847351470787581946227149711142791467271513255760947570359352271720249698;
    
    uint256 constant IC2x = 15184851923931987945426960399570869910536809090841300393045891666079090305668;
    uint256 constant IC2y = 10220960290562681106314697355561019706809834372870410384988473618045074165448;
    
    uint256 constant IC3x = 5007229056784100094453237836598806649162441932584456533862355280787854888039;
    uint256 constant IC3y = 19026042508244506527380708400787397383255262355546587429715836542444030257011;
    
    uint256 constant IC4x = 666319271884490693673789508904714892533073439600345390648280012735628475111;
    uint256 constant IC4y = 6621402298166771706614675791788591223709836325924372097149593074974791507502;
    
    uint256 constant IC5x = 11904503835817057905911013941245239944652086173477950311381772169272737191554;
    uint256 constant IC5y = 14603372611137017018358898843433494808129586330647128138573917764044872494949;
    
    uint256 constant IC6x = 2089483426047441902405269538302164021707956203981863551732837857801870673451;
    uint256 constant IC6y = 8986539595786360384420374777149657403975977519221116876951735333765070964739;
    
    uint256 constant IC7x = 3705213546708959558256678068821318231890411721683614304698062197706759996621;
    uint256 constant IC7y = 21621342746919287740267544979044762304696023427982220892025393520484233646411;
    
    uint256 constant IC8x = 7504740429981022240698157306677567596982962992431359566729058184647369695538;
    uint256 constant IC8y = 21888173924127028596711578868213730568132464964154388920319509276512279132907;
    
    uint256 constant IC9x = 11928995654381800339489879036447903197541926971302809306226255721693324746645;
    uint256 constant IC9y = 9394859107599897449475292785176777355033119866163570393612831819090885733615;
    
    uint256 constant IC10x = 8473460735744022029721034031467534083977304908507659617644793505230758375434;
    uint256 constant IC10y = 386342218637935342536636871644265830514805276145916780162438343669247393255;
    
    uint256 constant IC11x = 20376666684080998276121107051969674332543118213005623988521469515925749046347;
    uint256 constant IC11y = 8203475691450266491621571372295069596677031733130063675927383601465608546425;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[11] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
