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

contract SudokuSolveVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant deltax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant deltay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant deltay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;

    
    uint256 constant IC0x = 20728592047304758489491425498162970669345192774500083480884941344449945759659;
    uint256 constant IC0y = 17060097573266866604125256496852963224357058145970781504681234287463952257822;
    
    uint256 constant IC1x = 4695194406113497784405887981287266200579127435601754537744325827499331842325;
    uint256 constant IC1y = 16107159883068782052209635085202432352996606274672519647198447416121624790035;
    
    uint256 constant IC2x = 6649526961599689590253058654527660784980654449327583633273727680830145032093;
    uint256 constant IC2y = 10637215992979693129465344230291310622947078897366568785336976523512099571284;
    
    uint256 constant IC3x = 12491291347444022928584150431996241416154936625952314952402673121777862971134;
    uint256 constant IC3y = 21637166588252552951423177388029205427210553806891656746335526570855674342430;
    
    uint256 constant IC4x = 16678703609175138631953818980471621597778889212948277459750266290113584083106;
    uint256 constant IC4y = 7855652283679544639051911914703527564282625674777819237226889600598894285543;
    
    uint256 constant IC5x = 13571547029709517106112309576525224201561154649531214512838786906504725177546;
    uint256 constant IC5y = 10172988348514808609658998152271200248361583794940624876742917948566474067266;
    
    uint256 constant IC6x = 20342342922693449813347116937698604139969198941710250054030746910035786803097;
    uint256 constant IC6y = 16970821218390443369338953119169782016184551547310639958072678060521844946214;
    
    uint256 constant IC7x = 14831731401342079469647281454064593334432077748640171845709333661081066583989;
    uint256 constant IC7y = 18398777241227353212815906064760134978796822027738174910461762437471521747877;
    
    uint256 constant IC8x = 11185631155580403276720626492727494150427184006083617116056452998503275689732;
    uint256 constant IC8y = 4915148851018489571670802138154706902083567213722088893794395823974802502326;
    
    uint256 constant IC9x = 1098911151960174994384229672818964568371397492182637538750950516004857241016;
    uint256 constant IC9y = 7788991410526906486807489056365037348936179030702790264670166600653241055217;
    
    uint256 constant IC10x = 12236523780194785824558723045580258684301765109250687062282677622607415845698;
    uint256 constant IC10y = 17821344085411084762922470224067617961061456189333235654285415119647038677482;
    
    uint256 constant IC11x = 12169298856835293587666901701675178434075326545941783711498787539440721331350;
    uint256 constant IC11y = 18279327830117717437846696483890679709157318261980250131590606789483419721519;
    
    uint256 constant IC12x = 10646487328070985748754358941710630879118954409705968070651235017566744308956;
    uint256 constant IC12y = 2846262210794343971385531372861774297407776143348999200094616726430616895415;
    
    uint256 constant IC13x = 6744060761108660640598356989339110819213532077597793462014080814280507336351;
    uint256 constant IC13y = 13449507215521342693098466525979004440732655768765190679652647742479245602038;
    
    uint256 constant IC14x = 13865386510232338689767561898972446141517612720008557640160804600041155179663;
    uint256 constant IC14y = 10753241798703726724136494702063187517952887690386704582385374371051545668176;
    
    uint256 constant IC15x = 5293192063096144280138732426895705814798344701805875831267389516743537555821;
    uint256 constant IC15y = 17345932228239964510053231945255388711427978270226177020079969580195994811453;
    
    uint256 constant IC16x = 2029907128487126056050719545663812143439730817911266435189622966895053866551;
    uint256 constant IC16y = 19713094104766522540774257934405452849461005691399525744231140712209360741009;
    
    uint256 constant IC17x = 9539663896283155784727320857461273935946985473166995936987900549761713113744;
    uint256 constant IC17y = 7844887976626477549887927393847371062728041931486941098277306671612300113924;
    
    uint256 constant IC18x = 12282071652627439940642492018983436391340722821132563561451633804150698824606;
    uint256 constant IC18y = 19167728878876578713656356149599943666689143356625493223214622245425484606611;
    
    uint256 constant IC19x = 4651771149014677519963929456750003288983061065842278242056148718104327300849;
    uint256 constant IC19y = 2823392205552008513611634452032072332999939476730262808100098223654633525589;
    
    uint256 constant IC20x = 8666290291865583028595274144298996742173518272948539696173238143330326782634;
    uint256 constant IC20y = 16608387804545848278078140950506975610166622060454725330810414644577375425574;
    
    uint256 constant IC21x = 9276710076670170116836663966745701158018333465315522912749938414715404009656;
    uint256 constant IC21y = 11673559014157087382132445863161905414747889451164558871468284854208394821480;
    
    uint256 constant IC22x = 20974890858914454774394017251859895551777216528283812774955513090576008292644;
    uint256 constant IC22y = 10534373945704088611460391237557787773880323508934882310556420425051238704565;
    
    uint256 constant IC23x = 1943439489783340993514878798616434461328352109543996101031649658973193879485;
    uint256 constant IC23y = 1926776753975622535359008473930785350346778603179715860268344629026650061741;
    
    uint256 constant IC24x = 20999400896269167154708450787276954230434686401551618481447081140739133731244;
    uint256 constant IC24y = 16446692420195748082276332424143441057082034654894206021103063866390650941755;
    
    uint256 constant IC25x = 92697319112380072840952505793269204870223214495709857567984997242871107330;
    uint256 constant IC25y = 20939156992603268768022821661889008149785687500166853214730474296519582373034;
    
    uint256 constant IC26x = 13402113028572737958344640122699984107438383380578995190220495847310286188498;
    uint256 constant IC26y = 16547707487311304092685803863996425465096716586334285654561550022629142171956;
    
    uint256 constant IC27x = 17413529303381021139726799666760295824889608380314045347904549025569578566954;
    uint256 constant IC27y = 18420426080052703144406683601589062501098000304429367018828210382798676507296;
    
    uint256 constant IC28x = 2604140827203160860035482928446296913577841437468476063136040464510820159880;
    uint256 constant IC28y = 3973794513207005528733719543340594267275001483582465070808831473273308559902;
    
    uint256 constant IC29x = 17268660438378923235333591865002710961838616719687109980587556005697638157135;
    uint256 constant IC29y = 20320419196544704286420482167186771933150406559486562373348727758532861862310;
    
    uint256 constant IC30x = 5232881480665429974394183157393595490270891964178500394912525052959554869873;
    uint256 constant IC30y = 10163994290868026937409179402362170013715645829329822699329518979020684466144;
    
    uint256 constant IC31x = 9757349605465257863768264558299799278960558630972819939530464915264373314791;
    uint256 constant IC31y = 19764483151658150046001021098535763213966575668855221714097597481646527906905;
    
    uint256 constant IC32x = 12807794413094086093468738674153062017840301531617671979687005543787976548720;
    uint256 constant IC32y = 19572360913950987085456048850568252719186057502304984058474605897651516226772;
    
    uint256 constant IC33x = 17405773116341998178172981818648320951894024520097700050728358987103187604006;
    uint256 constant IC33y = 10668746167544338762238854628061762428608446742299187708542419046463492662284;
    
    uint256 constant IC34x = 21428700609805605419723748381348384588336574842888672616345581054343253798270;
    uint256 constant IC34y = 13334798016754158067803363181355246180627752787880517440987212618387941127552;
    
    uint256 constant IC35x = 3008956706235653262301283536172266424118443473692581311896448821681691119199;
    uint256 constant IC35y = 10914421418823290813192982530447398029890827888047562580897820361361258508393;
    
    uint256 constant IC36x = 1080044848116339368804714740164631468586605355357495323345999422859217607198;
    uint256 constant IC36y = 12251447008447359805496913039520546752778807550422309740074802432764585818244;
    
    uint256 constant IC37x = 17687565775018233696118786244815360924508587351910583909118742993085594209040;
    uint256 constant IC37y = 7110537231195830608540554580506572071466420813677980449950731130694329134138;
    
    uint256 constant IC38x = 12486204602849532177106142273044729620651591475507995338301452047935075621947;
    uint256 constant IC38y = 7410025953644722935525249042769446361016995025303527068497839812262878411486;
    
    uint256 constant IC39x = 10220303238516522161299172620643286497595255120324168214933321512962861151068;
    uint256 constant IC39y = 20571605838515032561287071138157729748010939230815088459063357741188301365020;
    
    uint256 constant IC40x = 9415263221513286480275530298704576953926921194223050355725529048621898942305;
    uint256 constant IC40y = 4080207879952814763264521880642148484678076923745710825593262250757092963324;
    
    uint256 constant IC41x = 1751256188116869501847087308325838068396287711807172150893442452009817335430;
    uint256 constant IC41y = 4574371531263467453800527532420639802911857137766963936155081795880374120253;
    
    uint256 constant IC42x = 13301934884182099445831733246377376648704007580201677255869554949825594800928;
    uint256 constant IC42y = 19309297998418720974043560830188714393647074929903025581947041962419565064172;
    
    uint256 constant IC43x = 19715662086888381901161318462567163445783407271939785644067123755264293518826;
    uint256 constant IC43y = 607401783898441334207168266666163570455558131310365413392050213829476084272;
    
    uint256 constant IC44x = 20186706927055294077423038855254592245140205709575579647267480413435472875593;
    uint256 constant IC44y = 3985150529574363451449665259925789380210177538988106425718340494639931751193;
    
    uint256 constant IC45x = 10702447616723692728613313928235806818525254897361024390444376626331217209977;
    uint256 constant IC45y = 16020270727818172969262710364028525233401320099344951063286821559396903627375;
    
    uint256 constant IC46x = 20852846585379564001879797861860318114894848390838529759585775212050338031854;
    uint256 constant IC46y = 15645017304322911060276394397534530473965677933936573418357752859700149407473;
    
    uint256 constant IC47x = 19465307106370628941294101589030273076437207611550207047434199285034308216584;
    uint256 constant IC47y = 2486884949793835227097135179535781151800983691075064771891530599090561288406;
    
    uint256 constant IC48x = 20914902790044959948500893517137734953315287825151531846635007602183842977078;
    uint256 constant IC48y = 7733596095724508162179709727310827725567274071769543125542223288855792991657;
    
    uint256 constant IC49x = 13529469724291710474889599576285272829894410318426231289886781672888847822069;
    uint256 constant IC49y = 11219925778698653980700812155944886848017002303424995028737771187893937625018;
    
    uint256 constant IC50x = 9327659980741518354965228404584037618996616099804782894382033487165841812527;
    uint256 constant IC50y = 6124446646806074362879313651211982176825260391715485870809915761477779624767;
    
    uint256 constant IC51x = 7461477010730982837370317627798548974879039303596217906020719586360357592665;
    uint256 constant IC51y = 6323923053682455199178467192415238248302271875182226014752482905839408377992;
    
    uint256 constant IC52x = 10955055180764592216759717199352430855674331858743348321158440973218644074644;
    uint256 constant IC52y = 19292569731443457207508384256900097512079732783134425825221222646090369129994;
    
    uint256 constant IC53x = 17188236955183295371239983769955705971601662924835757482410806333087323132468;
    uint256 constant IC53y = 21572154162763963415626967058109147025219407925440673011439679450724130650891;
    
    uint256 constant IC54x = 4597636458693721412591068992142675163611718945807697389536500564685276580651;
    uint256 constant IC54y = 13054627406798765436681514606166595579390794989213831618159455820417891632777;
    
    uint256 constant IC55x = 18482752378981187747512493296178021369289003653000314609773999268904709219664;
    uint256 constant IC55y = 435789653680809025740817194520898205701916725828501883269918582354148583478;
    
    uint256 constant IC56x = 19187851439984103093174517478840658915457137668333936434441507447635916698563;
    uint256 constant IC56y = 2432399055882428204851046766706467796560464618896038032789008271409561963316;
    
    uint256 constant IC57x = 2535106635988744704828560831356823724149478307245582102875970154553331797806;
    uint256 constant IC57y = 18394766711393407937009987601442355435791371293025665233580832197637452065624;
    
    uint256 constant IC58x = 17799408814591844654917559267265062187246110161900289721997490885739633662459;
    uint256 constant IC58y = 6874068608580375639043052456758187869791234051567536222338224241555175086289;
    
    uint256 constant IC59x = 9805831624089159150510344539758002153152816690268156951299753451864409032912;
    uint256 constant IC59y = 6465785840493386888920569013510620867816851271513971769792900411013561296171;
    
    uint256 constant IC60x = 9372692973498843741567824924348936312103286820509291164693804132012811016976;
    uint256 constant IC60y = 2371735506819733553640651237528893251108986561237047473252037342570399786052;
    
    uint256 constant IC61x = 10185837679385212364677403606682675317253852417889914366701513291969748525610;
    uint256 constant IC61y = 12263277907387430137211601310439651518724083561702841660836191823125089429536;
    
    uint256 constant IC62x = 10239953836501485244464085593967210181606204710259390776456884227032764728591;
    uint256 constant IC62y = 13733989149432501239399947307395340211301918671228043881019173284852392629900;
    
    uint256 constant IC63x = 14522281508776241391348634122108601710546486192218877826833780315070406463472;
    uint256 constant IC63y = 540097894112862836791263698078465754669927206954429867189781663757659185056;
    
    uint256 constant IC64x = 604640693573456252350928904955643814930546866767781825120793110386168619176;
    uint256 constant IC64y = 3700474544912403077017203470706397175846065733930724136909905977319028024082;
    
    uint256 constant IC65x = 2941953281020365226505107488169391911031351878477140553744401789825677941819;
    uint256 constant IC65y = 7689079359763296704687927276727033369359520308548151933783216545452823244760;
    
    uint256 constant IC66x = 12383546600635992755393960748328481270438542501001370194907461770633235279585;
    uint256 constant IC66y = 2417120287003444854062138154071546360918171102684457015141576614279582343689;
    
    uint256 constant IC67x = 10624166161674285319478886113180059798322511796224491543963090995389203659640;
    uint256 constant IC67y = 3413112114869766517113950570692628551600652159142407355492811639067025031265;
    
    uint256 constant IC68x = 16924003788420029145831595501015243685625500922222890963744156144252976227429;
    uint256 constant IC68y = 19048811959836533184820714556620366836949285657365499737683137729948256594211;
    
    uint256 constant IC69x = 20491520346349179474413084959244889885067819045397573163704209031630832915300;
    uint256 constant IC69y = 1894298453407397437656127311132143685913649753396771122854255405319219241564;
    
    uint256 constant IC70x = 13690893873159879353080085055320223758613415047133135723430004360507139197748;
    uint256 constant IC70y = 1677880409696857547800856048772328841896912960343712388667046906722934827075;
    
    uint256 constant IC71x = 21007323020699072607997702399629695868839112729623347549138253029330238428367;
    uint256 constant IC71y = 17511429680250065960555141379209879053570841827131131252787334219768490710538;
    
    uint256 constant IC72x = 14452894064185552968792580944221654030672927677013816890469766494286349818849;
    uint256 constant IC72y = 2992868102401415964565662297837660800617607066254645808380515362172618648484;
    
    uint256 constant IC73x = 20307298110954353402867517762026887421053224715427103952092853387082858458148;
    uint256 constant IC73y = 14761354201280876876306197764244403580048303514236677746911483807614243987981;
    
    uint256 constant IC74x = 13419816553743983693926399565609565433575134956267256816634786339523214475049;
    uint256 constant IC74y = 807742914697395422903153071523305093165454219707240151833997378284368188130;
    
    uint256 constant IC75x = 8344211534279288756931611376108443696511747454045998962396034753279162444002;
    uint256 constant IC75y = 14863550960946413990267577445401731201265826687481545016026209600264667340615;
    
    uint256 constant IC76x = 1568845250087335715728392813033481844030574596283785256792081563976229669675;
    uint256 constant IC76y = 20158738965671239892315699882844729124858555580444197380392523772559439502440;
    
    uint256 constant IC77x = 6683563644243459348847412111247299927617792686508561682205959098836517989961;
    uint256 constant IC77y = 6773216047894176981591335320670499358434920695292512928452560620081476503034;
    
    uint256 constant IC78x = 238536236144198310074307630235195089368229101371769926664384952125416250947;
    uint256 constant IC78y = 18255707843176000820124796991893016024563006349264073483877541772422976326817;
    
    uint256 constant IC79x = 2037283747932678820073393430527479818028305085838543307181537836562962165917;
    uint256 constant IC79y = 5985405363430794851300348630251662677806839173655166367529180502461523426091;
    
    uint256 constant IC80x = 4205471357238718933366065010318477040235533433670021997849787740519809410593;
    uint256 constant IC80y = 2402081370111718733135176640926124509416920694389853353787941627886297511840;
    
    uint256 constant IC81x = 8123307674805460292249431845184071833829234962419582522633262987900900900987;
    uint256 constant IC81y = 9811842651573732184141892229845429262957094639082623239893873852902060953626;
    
    uint256 constant IC82x = 13851240978987057038178783836371020340599593703330791508924176775911427814715;
    uint256 constant IC82y = 14996570244737195720234840432938009349616682232767831397109625181597102464911;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[82] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                
                g1_mulAccC(_pVk, IC31x, IC31y, calldataload(add(pubSignals, 960)))
                
                g1_mulAccC(_pVk, IC32x, IC32y, calldataload(add(pubSignals, 992)))
                
                g1_mulAccC(_pVk, IC33x, IC33y, calldataload(add(pubSignals, 1024)))
                
                g1_mulAccC(_pVk, IC34x, IC34y, calldataload(add(pubSignals, 1056)))
                
                g1_mulAccC(_pVk, IC35x, IC35y, calldataload(add(pubSignals, 1088)))
                
                g1_mulAccC(_pVk, IC36x, IC36y, calldataload(add(pubSignals, 1120)))
                
                g1_mulAccC(_pVk, IC37x, IC37y, calldataload(add(pubSignals, 1152)))
                
                g1_mulAccC(_pVk, IC38x, IC38y, calldataload(add(pubSignals, 1184)))
                
                g1_mulAccC(_pVk, IC39x, IC39y, calldataload(add(pubSignals, 1216)))
                
                g1_mulAccC(_pVk, IC40x, IC40y, calldataload(add(pubSignals, 1248)))
                
                g1_mulAccC(_pVk, IC41x, IC41y, calldataload(add(pubSignals, 1280)))
                
                g1_mulAccC(_pVk, IC42x, IC42y, calldataload(add(pubSignals, 1312)))
                
                g1_mulAccC(_pVk, IC43x, IC43y, calldataload(add(pubSignals, 1344)))
                
                g1_mulAccC(_pVk, IC44x, IC44y, calldataload(add(pubSignals, 1376)))
                
                g1_mulAccC(_pVk, IC45x, IC45y, calldataload(add(pubSignals, 1408)))
                
                g1_mulAccC(_pVk, IC46x, IC46y, calldataload(add(pubSignals, 1440)))
                
                g1_mulAccC(_pVk, IC47x, IC47y, calldataload(add(pubSignals, 1472)))
                
                g1_mulAccC(_pVk, IC48x, IC48y, calldataload(add(pubSignals, 1504)))
                
                g1_mulAccC(_pVk, IC49x, IC49y, calldataload(add(pubSignals, 1536)))
                
                g1_mulAccC(_pVk, IC50x, IC50y, calldataload(add(pubSignals, 1568)))
                
                g1_mulAccC(_pVk, IC51x, IC51y, calldataload(add(pubSignals, 1600)))
                
                g1_mulAccC(_pVk, IC52x, IC52y, calldataload(add(pubSignals, 1632)))
                
                g1_mulAccC(_pVk, IC53x, IC53y, calldataload(add(pubSignals, 1664)))
                
                g1_mulAccC(_pVk, IC54x, IC54y, calldataload(add(pubSignals, 1696)))
                
                g1_mulAccC(_pVk, IC55x, IC55y, calldataload(add(pubSignals, 1728)))
                
                g1_mulAccC(_pVk, IC56x, IC56y, calldataload(add(pubSignals, 1760)))
                
                g1_mulAccC(_pVk, IC57x, IC57y, calldataload(add(pubSignals, 1792)))
                
                g1_mulAccC(_pVk, IC58x, IC58y, calldataload(add(pubSignals, 1824)))
                
                g1_mulAccC(_pVk, IC59x, IC59y, calldataload(add(pubSignals, 1856)))
                
                g1_mulAccC(_pVk, IC60x, IC60y, calldataload(add(pubSignals, 1888)))
                
                g1_mulAccC(_pVk, IC61x, IC61y, calldataload(add(pubSignals, 1920)))
                
                g1_mulAccC(_pVk, IC62x, IC62y, calldataload(add(pubSignals, 1952)))
                
                g1_mulAccC(_pVk, IC63x, IC63y, calldataload(add(pubSignals, 1984)))
                
                g1_mulAccC(_pVk, IC64x, IC64y, calldataload(add(pubSignals, 2016)))
                
                g1_mulAccC(_pVk, IC65x, IC65y, calldataload(add(pubSignals, 2048)))
                
                g1_mulAccC(_pVk, IC66x, IC66y, calldataload(add(pubSignals, 2080)))
                
                g1_mulAccC(_pVk, IC67x, IC67y, calldataload(add(pubSignals, 2112)))
                
                g1_mulAccC(_pVk, IC68x, IC68y, calldataload(add(pubSignals, 2144)))
                
                g1_mulAccC(_pVk, IC69x, IC69y, calldataload(add(pubSignals, 2176)))
                
                g1_mulAccC(_pVk, IC70x, IC70y, calldataload(add(pubSignals, 2208)))
                
                g1_mulAccC(_pVk, IC71x, IC71y, calldataload(add(pubSignals, 2240)))
                
                g1_mulAccC(_pVk, IC72x, IC72y, calldataload(add(pubSignals, 2272)))
                
                g1_mulAccC(_pVk, IC73x, IC73y, calldataload(add(pubSignals, 2304)))
                
                g1_mulAccC(_pVk, IC74x, IC74y, calldataload(add(pubSignals, 2336)))
                
                g1_mulAccC(_pVk, IC75x, IC75y, calldataload(add(pubSignals, 2368)))
                
                g1_mulAccC(_pVk, IC76x, IC76y, calldataload(add(pubSignals, 2400)))
                
                g1_mulAccC(_pVk, IC77x, IC77y, calldataload(add(pubSignals, 2432)))
                
                g1_mulAccC(_pVk, IC78x, IC78y, calldataload(add(pubSignals, 2464)))
                
                g1_mulAccC(_pVk, IC79x, IC79y, calldataload(add(pubSignals, 2496)))
                
                g1_mulAccC(_pVk, IC80x, IC80y, calldataload(add(pubSignals, 2528)))
                
                g1_mulAccC(_pVk, IC81x, IC81y, calldataload(add(pubSignals, 2560)))
                
                g1_mulAccC(_pVk, IC82x, IC82y, calldataload(add(pubSignals, 2592)))
                

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
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            
            checkField(calldataload(add(_pubSignals, 960)))
            
            checkField(calldataload(add(_pubSignals, 992)))
            
            checkField(calldataload(add(_pubSignals, 1024)))
            
            checkField(calldataload(add(_pubSignals, 1056)))
            
            checkField(calldataload(add(_pubSignals, 1088)))
            
            checkField(calldataload(add(_pubSignals, 1120)))
            
            checkField(calldataload(add(_pubSignals, 1152)))
            
            checkField(calldataload(add(_pubSignals, 1184)))
            
            checkField(calldataload(add(_pubSignals, 1216)))
            
            checkField(calldataload(add(_pubSignals, 1248)))
            
            checkField(calldataload(add(_pubSignals, 1280)))
            
            checkField(calldataload(add(_pubSignals, 1312)))
            
            checkField(calldataload(add(_pubSignals, 1344)))
            
            checkField(calldataload(add(_pubSignals, 1376)))
            
            checkField(calldataload(add(_pubSignals, 1408)))
            
            checkField(calldataload(add(_pubSignals, 1440)))
            
            checkField(calldataload(add(_pubSignals, 1472)))
            
            checkField(calldataload(add(_pubSignals, 1504)))
            
            checkField(calldataload(add(_pubSignals, 1536)))
            
            checkField(calldataload(add(_pubSignals, 1568)))
            
            checkField(calldataload(add(_pubSignals, 1600)))
            
            checkField(calldataload(add(_pubSignals, 1632)))
            
            checkField(calldataload(add(_pubSignals, 1664)))
            
            checkField(calldataload(add(_pubSignals, 1696)))
            
            checkField(calldataload(add(_pubSignals, 1728)))
            
            checkField(calldataload(add(_pubSignals, 1760)))
            
            checkField(calldataload(add(_pubSignals, 1792)))
            
            checkField(calldataload(add(_pubSignals, 1824)))
            
            checkField(calldataload(add(_pubSignals, 1856)))
            
            checkField(calldataload(add(_pubSignals, 1888)))
            
            checkField(calldataload(add(_pubSignals, 1920)))
            
            checkField(calldataload(add(_pubSignals, 1952)))
            
            checkField(calldataload(add(_pubSignals, 1984)))
            
            checkField(calldataload(add(_pubSignals, 2016)))
            
            checkField(calldataload(add(_pubSignals, 2048)))
            
            checkField(calldataload(add(_pubSignals, 2080)))
            
            checkField(calldataload(add(_pubSignals, 2112)))
            
            checkField(calldataload(add(_pubSignals, 2144)))
            
            checkField(calldataload(add(_pubSignals, 2176)))
            
            checkField(calldataload(add(_pubSignals, 2208)))
            
            checkField(calldataload(add(_pubSignals, 2240)))
            
            checkField(calldataload(add(_pubSignals, 2272)))
            
            checkField(calldataload(add(_pubSignals, 2304)))
            
            checkField(calldataload(add(_pubSignals, 2336)))
            
            checkField(calldataload(add(_pubSignals, 2368)))
            
            checkField(calldataload(add(_pubSignals, 2400)))
            
            checkField(calldataload(add(_pubSignals, 2432)))
            
            checkField(calldataload(add(_pubSignals, 2464)))
            
            checkField(calldataload(add(_pubSignals, 2496)))
            
            checkField(calldataload(add(_pubSignals, 2528)))
            
            checkField(calldataload(add(_pubSignals, 2560)))
            
            checkField(calldataload(add(_pubSignals, 2592)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
