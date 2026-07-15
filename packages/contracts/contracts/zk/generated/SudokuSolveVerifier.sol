// SPDX-License-Identifier: GPL-3.0
// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: examples/games/zk-skill/circuits/sudoku_solve.circom (circom 2.x -> snarkjs 0.7.6 groth16).
// Regenerate: cd examples/games/zk-skill, then compile the circuit + groth16 setup against the
//   downloaded Hermez pot15 ptau and `snarkjs zkey export solidityverifier`, renaming the contract to
//   SudokuSolveVerifier. Then regenerate the matching fixture with scripts/genProofFixtures.ts (BOTH
//   from the SAME zkey — see that script's header).
// Trusted setup: the real Hermez/perpetual powersOfTau28_hez_final_15.ptau (downloaded, audited MPC) +
//   a deterministic groth16 phase-2 setup. Fine for tests; a per-circuit ceremony belongs to prod.
// Public-signal order: [nullifier, puzzle[0..80], player] (83 signals).
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

    
    uint256 constant IC0x = 12458021583765898500492243003334626601391958837656772363803860310723572433724;
    uint256 constant IC0y = 19509594413551078902839826076669296273691769996149785392783548517335389692067;
    
    uint256 constant IC1x = 7993427591687718952497318752005839587204998661606770166857365080886450366263;
    uint256 constant IC1y = 10108187486689692755688518426028654372619252897788491486758868803121821394;
    
    uint256 constant IC2x = 8136085404658652682427073534771707473296955990186650300262591107653487516495;
    uint256 constant IC2y = 8456970720002812254098637029678492880150636820634127986320025140636726378480;
    
    uint256 constant IC3x = 7831447965869715723714241360924697166730488084387293282362495821365900994100;
    uint256 constant IC3y = 4636125106084667462146334093243555874312765513960481332800776056048115461699;
    
    uint256 constant IC4x = 5941879580488450652030233762530153647447059217481598885491395415446054947463;
    uint256 constant IC4y = 8452805539352264661906812316818388725686001123517634440414068872038235782221;
    
    uint256 constant IC5x = 8849912070052439162163736370775717552279917814642027353082880098449859605276;
    uint256 constant IC5y = 12172342653760805849973769268591998393469083607828232171462049350015935587020;
    
    uint256 constant IC6x = 1695130136538713125731873919217309929876352426131628245190976072414966578046;
    uint256 constant IC6y = 11496592186431108621407320624418057223894556009224367426572353836873297087490;
    
    uint256 constant IC7x = 2671733093884919876281935759425637286225028778023536675841091359989026280327;
    uint256 constant IC7y = 11866203191838010390282557590685841222778463223736569433772350877960942944767;
    
    uint256 constant IC8x = 7473513182014404824353877769173763607172983775115566392028636350671344959236;
    uint256 constant IC8y = 2137372808525160889008367362676644128125802092031288130991121865121297291697;
    
    uint256 constant IC9x = 14841559431127576978854906140761235403009984972094045520072473053531629638452;
    uint256 constant IC9y = 7872704471138650105531303801888529005182634938466369871771224923641030887880;
    
    uint256 constant IC10x = 14439431666660605312717059146425239646239480691139581412627558277937252609037;
    uint256 constant IC10y = 1825069288124882615064418553217833688951606225577113088343458546374472910087;
    
    uint256 constant IC11x = 19552224376332968076212741585518068128592135722708305509881625231967944262494;
    uint256 constant IC11y = 19364354153479414111220685153002851934789304164534015970860907981947475989343;
    
    uint256 constant IC12x = 11185362400456500347103508478308196290759542044431802737801766990137326990922;
    uint256 constant IC12y = 14983320236808238088130991795984909578414913317130390965001338126301806015235;
    
    uint256 constant IC13x = 17553776389829665529588056487889582917541289318034601239416775178460117122754;
    uint256 constant IC13y = 11021522091183882090091947475800357086009095150865706594705445807188545212072;
    
    uint256 constant IC14x = 18492976685638781574695390551489346845220059833871652168632074044193293568774;
    uint256 constant IC14y = 17158648658922599556566114442973269448933370483260703923023139165945019889687;
    
    uint256 constant IC15x = 18667473626572376914065041538610155572060996265763039492593912274527122094945;
    uint256 constant IC15y = 9953416242179344790087458915997049858477777147659776606484770474373990010565;
    
    uint256 constant IC16x = 4391073140959943111932806323474904775826908690141584948712838741025294081669;
    uint256 constant IC16y = 7025241100933033315231384765494997531023021966228463684578376032907986028612;
    
    uint256 constant IC17x = 21177552981942248702633575874048012381816758025901778195652306495395811324626;
    uint256 constant IC17y = 11143788403878777659477964718779017468731819032788025191974481979341358043987;
    
    uint256 constant IC18x = 14658118658199706693120670951687470507249938546988370893231767892190644729882;
    uint256 constant IC18y = 21137979697095156454104476336124454873443793818399975272690554486314114212716;
    
    uint256 constant IC19x = 13697128414495520772750144278250771530603681181873761155267373344997264107120;
    uint256 constant IC19y = 9335092333961811636083799020959802163063196897637951484266535654142976162775;
    
    uint256 constant IC20x = 13119393575519674629335237207914083927381711914315327056903543354400377239046;
    uint256 constant IC20y = 1409948811441890705803072006511368311387968614113680102230576795062809283133;
    
    uint256 constant IC21x = 3401972136971595319395605918286382051961457274087494862612148752151150107755;
    uint256 constant IC21y = 7260377869592277176663919917768922607199858609745546030722098937532232108916;
    
    uint256 constant IC22x = 14224932969509579879097742725257838478644776244376006181102473215817247607497;
    uint256 constant IC22y = 21381764784705548060313644910314841494157723461149543033746733188587036216529;
    
    uint256 constant IC23x = 7204512606283732506531700079371888023313350886103555393433076798151959608985;
    uint256 constant IC23y = 21566167719494687755042882835634426889347295892417936655168388663461224310040;
    
    uint256 constant IC24x = 10834335189538330529825788118381313612919908228081503410681468989600992054133;
    uint256 constant IC24y = 10926989860887477308945828114734103459991940564555498935211636752339961592548;
    
    uint256 constant IC25x = 5530461543650821100715508002316915888320116586792816861512825266983105155506;
    uint256 constant IC25y = 8493200758080927762576316433701889252900142892213269772716397762966915665577;
    
    uint256 constant IC26x = 480596101784997717248696962840954366948598109092165504534883365400362708691;
    uint256 constant IC26y = 12191667675809324536911586023904564484172488790364398354397989888888482346657;
    
    uint256 constant IC27x = 19219979451229720836039384177946724381414473296928751206087396810814856036572;
    uint256 constant IC27y = 3016010568256769523839768554318678349852249841079684187674602636675680027043;
    
    uint256 constant IC28x = 14919232610492358236390702496515649545364358373902384717362824959687826374052;
    uint256 constant IC28y = 2867159243919997571960138805080492751348071633886357637886166772152124618761;
    
    uint256 constant IC29x = 10993859690232953415854067626465533157313563143368825574280230739619892178489;
    uint256 constant IC29y = 1855179526941392142063905264347193363579238245872492368406221171204246549653;
    
    uint256 constant IC30x = 5294663785371070700997890894197346017226028456689212314523209486645226061970;
    uint256 constant IC30y = 2178515475976155818792699492892647147356788799877584858897084618954455719981;
    
    uint256 constant IC31x = 7403763808289956234618030518172683410272593647747766040296359969387964084696;
    uint256 constant IC31y = 6671625758080773563244036178740014160751484712179524028578392510647193125357;
    
    uint256 constant IC32x = 21887836640725307765944667883177057496921448739272686784203361810942292637188;
    uint256 constant IC32y = 722310372745300467262352919622147010022756792639462452332613157815187947728;
    
    uint256 constant IC33x = 7263072329289564667301807202867878528653249222380569838094903117042081577372;
    uint256 constant IC33y = 21840129850075271448739037050883916243761877444064915127762954518436071360253;
    
    uint256 constant IC34x = 21330227013119841891506684068198670930730641593104027153644789002995572091793;
    uint256 constant IC34y = 4816981959391093616821447687653372558939395212377836009764575960891141114672;
    
    uint256 constant IC35x = 4787766700544467624876297291309129498327549083613911142718244476292049777579;
    uint256 constant IC35y = 20420365727450023429680430682544646305670284800121735868898385969244951708676;
    
    uint256 constant IC36x = 20940154134201057871943200867910175615966385679954116578501218170240073593817;
    uint256 constant IC36y = 733092492780573985019640566399234664230908607611883586482025754165951228216;
    
    uint256 constant IC37x = 6001115321150255181647282732432796763043638214197300787322470825084521806373;
    uint256 constant IC37y = 4227824607056160758696768506153522978871803190497509302367533060963853392426;
    
    uint256 constant IC38x = 4988897489925811536254577187770623178827198354359347475657194351942594746982;
    uint256 constant IC38y = 7343590539788978046369490709221959633948195024808451899391543083346080507267;
    
    uint256 constant IC39x = 1345524821886148821325004936335205039218228639879309935869036263220542772260;
    uint256 constant IC39y = 14546872443046475606927348267520626829961866509286077220452340626962325657196;
    
    uint256 constant IC40x = 19799832664919998287688687485363891389118347211929654752436899032983420132594;
    uint256 constant IC40y = 1595820266154882831510499087157911248444242738908195384207883114920153402839;
    
    uint256 constant IC41x = 13301957802535203677586903809911009396146749256055798820467350125830237752524;
    uint256 constant IC41y = 3617963384671791607356484490908968758270504297861814437934057541934839569978;
    
    uint256 constant IC42x = 12222817851083167503851645739934246436223460396076795907323998125632603579421;
    uint256 constant IC42y = 621782885545878142548907552155907811248213834222446059936193921353588404758;
    
    uint256 constant IC43x = 11742903893189749770636750152007102650718840775441068318029840728007970928626;
    uint256 constant IC43y = 3755437098203338731209187009015892748270475829608015400144468498868962272614;
    
    uint256 constant IC44x = 16827587499914091974546950605420850643619736173445515114928631487673304976041;
    uint256 constant IC44y = 21018958782891062877669981856547278474585177085517352938327003498584048816628;
    
    uint256 constant IC45x = 9270793530121600174534968182634062216687748151780503847660074523304430403930;
    uint256 constant IC45y = 424639283865989072802530959323138651217331281263452863837498572541052806857;
    
    uint256 constant IC46x = 18526613951353469198304746839146454714602902783131471272359243285016868854442;
    uint256 constant IC46y = 10467315492153536049049011197366952168619728963388566888229358106684498171789;
    
    uint256 constant IC47x = 6288595629620268223583467468931886271625936036101056819929728727621696943529;
    uint256 constant IC47y = 16339993509865613704274582474845914827754380803476563224352086260776075682876;
    
    uint256 constant IC48x = 14531864446291874109701879521266573649359529859829321507750276680043178190996;
    uint256 constant IC48y = 9965789616609867786777651268751443236377217864702240034841980868289534626671;
    
    uint256 constant IC49x = 16100206607243508994809570605153358591978679162120422760675745947881810183392;
    uint256 constant IC49y = 14445981102615559351450217505534374293090010661171949053971597860831076303116;
    
    uint256 constant IC50x = 567829388126840383239198521771676949115723667566558251895812858884765868506;
    uint256 constant IC50y = 16817104294092655335602926533730100135939259530162628991959009415520619129898;
    
    uint256 constant IC51x = 236747938145016102333433380443775602119493182673485327033718258366390367417;
    uint256 constant IC51y = 8272674441942233623497182952449086099611893887302007749047600637195127850077;
    
    uint256 constant IC52x = 2607363952256904492485254546891188798580882407448269370437578054812199893469;
    uint256 constant IC52y = 7505938733779883182135573163479372467058632903116569128981247302877715430862;
    
    uint256 constant IC53x = 431954361338492706508365846254566212720516455601908549526312366819508906138;
    uint256 constant IC53y = 19059680110060861076242010846733761180584854921253280073347016735446642078442;
    
    uint256 constant IC54x = 16838953777243085537114870597089581666863234239944245185096881607871580406388;
    uint256 constant IC54y = 17861454918031053619435213755958753301905471480749328887188511697222537204740;
    
    uint256 constant IC55x = 16857667773419722338288776912871380939780335675036433437635131912396307445216;
    uint256 constant IC55y = 13265829631703320801923878304809937724719226140290081721102604223741559907692;
    
    uint256 constant IC56x = 1671221122637893319416909049285224072897712004803507998496252232642459211934;
    uint256 constant IC56y = 17349437293799131519058546326223611969164954075573282507331071727176640660300;
    
    uint256 constant IC57x = 21041090389780813945097175649241306216869758480053393644555522753457627207609;
    uint256 constant IC57y = 1531079662708657752500700057294339791007834541488543392539307243022939441909;
    
    uint256 constant IC58x = 21042299122538568444874149000747457407045094887356502421786259979422183656165;
    uint256 constant IC58y = 9498983212194031133144561002023662481463506616054309266762621912762886721207;
    
    uint256 constant IC59x = 16124914319559086694120177672724246548597626594679332539496362449602920400590;
    uint256 constant IC59y = 15581167290240092907246057843402144491252806840035680680981277504193584379189;
    
    uint256 constant IC60x = 15408437150550303295691159083488395801561209402960173079431240504148714870751;
    uint256 constant IC60y = 11462066684936835590865051424151604893761940660257167686812087679562036739369;
    
    uint256 constant IC61x = 6206427306692979135091264243043613628612992753155878678763423105475835868822;
    uint256 constant IC61y = 3098513495538028485726118620737174894471362616245842191210906989150227383075;
    
    uint256 constant IC62x = 21627592535948725061982649622568932719212211932193057847816204255444621551858;
    uint256 constant IC62y = 1309408372343883347050211961015476809085812587479951318486790402607915283131;
    
    uint256 constant IC63x = 9965669617333617840837647823893370105286635630791154022309351785478286331171;
    uint256 constant IC63y = 8539774255255564043472988548450536970848621862354496273248432410160846194733;
    
    uint256 constant IC64x = 9733309389010414280927820101915467179886682184997064098541970714652829620174;
    uint256 constant IC64y = 2113247904878926223951519675916062468915875352566287020069344061362937328567;
    
    uint256 constant IC65x = 9064498042093228558460674275364357480552032581389424573413298614776648848874;
    uint256 constant IC65y = 2966571290978052502177316486379859484633565095046124854375702005783583855917;
    
    uint256 constant IC66x = 10039051014437340160548498415026186902242929514632243163170932201739501283853;
    uint256 constant IC66y = 16331142015037348204278753445415679447305785257511973892591518846221112645788;
    
    uint256 constant IC67x = 21764106948283432071660097416717639104336501059544609887575904063637802543884;
    uint256 constant IC67y = 10462806601744838637972059924015475966468239683554927628953162891529228108799;
    
    uint256 constant IC68x = 13402578599268289401106842443232808321875945677376406383184924045076456125407;
    uint256 constant IC68y = 11840796931094509970204463976230370542471340130685029487563148230151619044328;
    
    uint256 constant IC69x = 6028365459026563868919789755653153321264674006805802433351318016469439815405;
    uint256 constant IC69y = 4181626756788807334270134364091646554873769599961440938717355192849247970484;
    
    uint256 constant IC70x = 20461205908513666693277003886806143503940480433039858449572169457450397041455;
    uint256 constant IC70y = 17446955781838813143645591518472716028249062732915474407499676002082009652477;
    
    uint256 constant IC71x = 9773534332101259186600269602584760999346996324111906577557900147728782323859;
    uint256 constant IC71y = 14878564541012822837251022380219188180436696747077139464245599387045713741124;
    
    uint256 constant IC72x = 12867469205021503045327360831146499562007136178491015330195260229137439060429;
    uint256 constant IC72y = 2012929496017295969430430598592038059235046229878453448336768113151896247809;
    
    uint256 constant IC73x = 15787829695685261188546639647157191488995112781142833161521491175600113595622;
    uint256 constant IC73y = 18459508576635469570199573574786783892549116320177148645769017479193467336283;
    
    uint256 constant IC74x = 11574199226901018533985889704288126099283286666142398782218315439993476051184;
    uint256 constant IC74y = 8461036326872978877227052017026844868451135678176742025627133031569932321934;
    
    uint256 constant IC75x = 20200043341795137648206883956663301032199761304624516028449263111689290539848;
    uint256 constant IC75y = 2211995249884909631749568426571418941261666559296550354436934620204486840944;
    
    uint256 constant IC76x = 16460410993629074652072842274515374974947170480404204591641114350935657129351;
    uint256 constant IC76y = 10386401155451897879596877427971548390806291222841266114053324642390268502917;
    
    uint256 constant IC77x = 945546237095964424330389279352582312096660079286504214054673702400529678121;
    uint256 constant IC77y = 9627138714857737122534749812921129949420757932544479080368402678003890854736;
    
    uint256 constant IC78x = 3827406550100979072277933832223653321461224959690860392321053077468165154273;
    uint256 constant IC78y = 19692580657552175799575632245267159691431509687333245662650685189921084785842;
    
    uint256 constant IC79x = 20592815518594228426057131126417048909803470443812021754864630960852605107273;
    uint256 constant IC79y = 4961506888142302784932124774261610268550063034649723061390345549973063480327;
    
    uint256 constant IC80x = 14564041637540973229614600476800987779473651599334225731106125198282964737860;
    uint256 constant IC80y = 9269391269270555868062737651755045238536743449392659362746567983265865047956;
    
    uint256 constant IC81x = 11846343952160242066603831915916354965622879422838603730561085353301916710187;
    uint256 constant IC81y = 11777498702324658147758787512396204884321145885318855063975111528951513595981;
    
    uint256 constant IC82x = 18487087744265297508439198239053145666861526353624830640635924481722468359858;
    uint256 constant IC82y = 3280894447374440233251671515091614450905858218012725492660688183105139204910;
    
    uint256 constant IC83x = 164729879081412594719320883674718826677888350742978212043055054752339812132;
    uint256 constant IC83y = 10503023669976161995537248321838072103984779161539683647157784246210112826332;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[83] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC83x, IC83y, calldataload(add(pubSignals, 2624)))
                

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
            
            checkField(calldataload(add(_pubSignals, 2624)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
