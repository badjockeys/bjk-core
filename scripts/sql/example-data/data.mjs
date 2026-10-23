// Example users and posts for a local Bad Jockeys, so the feed, map, profiles and notifications have something in
// them. generate.mjs grows these into the full set, build-sql.mjs turns that into SQL, and seed.mjs (run by the
// setup) uploads the photos and clips and runs it.
//
// Every id starts with "e0000000", so a re-run can replace exactly this data and nothing else.

/** Every example account signs in with this password. Local use only. */
export const PASSWORD = "BadJockeys!2026";

/**
 * The person running it locally: tagged as a passenger once (Pending) and told about it in the bell, and given
 * OWNER_PLAN through the API's Plans:Overrides user secret (until billing exists).
 */
export const OWNER_EMAIL = "aaron.greenhalgh@badjockey.com";
export const OWNER_PLAN = "premium_plus";

const userId = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const postId = (n) => `e0000000-0000-4000-8001-${String(n).padStart(12, "0")}`;
const mediaId = (post, n) => `e0000000-0000-4000-8002-${String(post * 10 + n).padStart(12, "0")}`;
const commentId = (n) => `e0000000-0000-4000-8003-${String(n).padStart(12, "0")}`;
const communityId = (n) => `e0000000-0000-4000-8007-${String(n).padStart(12, "0")}`;
const discussionId = (n) => `e0000000-0000-4000-8008-${String(n).padStart(12, "0")}`;
const replyId = (n) => `e0000000-0000-4000-8009-${String(n).padStart(12, "0")}`;
export const ids = { userId, postId, mediaId, commentId, communityId, discussionId, replyId };

export const users = [
  { n: 1, handle: "dashcam_dave", name: "Dashcam Dave", email: "dave@example.test", location: "Prescot", bio: "Driving instructor. Front, rear and side cameras, so I see it all." },
  { n: 2, handle: "pedal_power_priya", name: "Priya Shah", email: "priya@example.test", location: "Liverpool", bio: "Commute by bike every day. Helmet cam on, always." },
  { n: 3, handle: "lane_one_larry", name: "Larry Holt", email: "larry@example.test", location: "Warrington", bio: "HGV driver. The M6 is my office." },
  { n: 4, handle: "mancunian_mo", name: "Mo Ahmed", email: "mo@example.test", location: "Manchester", bio: "Taxi by day, road bike at weekends." },
  { n: 5, handle: "yorkshire_jen", name: "Jen Barker", email: "jen@example.test", location: "Leeds", bio: "School run veteran. Seen everything at the gates." },
  { n: 6, handle: "south_circ_sam", name: "Sam Okafor", email: "sam@example.test", location: "London", bio: "Delivery rider. London traffic keeps me sharp." },
  { n: 7, handle: "roundabout_rita", name: "Rita Kelly", email: "rita@example.test", location: "St Helens", bio: "Retired, plenty of time to upload clips." },
  { n: 8, handle: "biker_ben", name: "Ben Turner", email: "ben@example.test", location: "Huyton", bio: "Motorcyclist. Mirrors, then mirrors again." },
];

// Places, grouped so the heat map has cells with 3 or more incidents.
const P = {
  prescotHigh: [53.4296, -2.8016, "High Street, Prescot"],
  prescotBypass: [53.4268, -2.8105, "A58 Prescot Bypass, Prescot"],
  warringtonRd: [53.4176, -2.7524, "A57 Warrington Road, Rainhill"],
  whiston: [53.4152, -2.7951, "Old Colliery Road, Whiston"],
  huyton: [53.4111, -2.8392, "Huyton Lane, Huyton"],
  m62j7: [53.4085, -2.7618, "M62 junction 7, Rainhill"],
  sthelens: [53.4531, -2.7369, "Westfield Street, St Helens"],
  lpoolStrand: [53.4058, -2.9925, "The Strand, Liverpool"],
  lpoolLime: [53.4076, -2.9776, "Lime Street, Liverpool"],
  lpoolDuke: [53.4011, -2.9839, "Duke Street, Liverpool"],
  lpoolQueens: [53.4161, -2.9926, "Queensway Tunnel entrance, Liverpool"],
  warrBridge: [53.3863, -2.5932, "Bridge Street, Warrington"],
  warrWinwick: [53.4004, -2.5952, "A49 Winwick Road, Warrington"],
  warrM6: [53.4196, -2.5743, "M6 junction 21A, Warrington"],
  mcrOxford: [53.4686, -2.2378, "Oxford Road, Manchester"],
  mcrDeansgate: [53.4790, -2.2493, "Deansgate, Manchester"],
  mcrPortland: [53.4777, -2.2365, "Portland Street, Manchester"],
  mcrMancunian: [53.4632, -2.2462, "A57(M) Mancunian Way, Manchester"],
  leedsHeadrow: [53.8009, -1.5476, "The Headrow, Leeds"],
  leedsKirkstall: [53.8150, -1.6020, "Kirkstall Road, Leeds"],
  leedsInner: [53.7952, -1.5562, "Inner Ring Road, Leeds"],
  londonOldSt: [51.5257, -0.0877, "Old Street roundabout, London"],
  londonElephant: [51.4946, -0.1004, "Elephant and Castle, London"],
  londonVauxhall: [51.4861, -0.1236, "Vauxhall Cross, London"],
};

// author, place, days ago, UK time, types (main first), title, description, vehicle, photos, reported, reactions,
// comments [author, text, replies?]
export const posts = [
  { n: 1, by: 1, at: P.prescotHigh, ago: 1, time: "08:12", types: ["BusStopOrLane"], title: "Parked across the bus stop on the High Street", text: "Third morning running. Buses have to stop in the road.", vehicle: ["Car", "Ford", "Focus", "Grey"], photos: 2, reported: false, reactions: { Angry: [2, 3, 7], Like: [4] }, comments: [[2, "Same car was there on Friday."], [7, "Council need to put a camera up.", [[1, "Reported it to them this morning."]]]] },
  { n: 2, by: 8, at: P.prescotBypass, ago: 2, time: "17:40", types: ["OvertakeOnBend", "SpeedingFastRoad"], title: "Overtook three cars into the bend on the bypass", text: "Easily 60 in a 40, then cut back in just before the traffic island.", vehicle: ["Car", "BMW", "3 Series", "Black"], photos: 1, reported: true, reactions: { Shocked: [1, 3, 5], Angry: [2] }, comments: [[1, "That bend is a nightmare."]] },
  { n: 3, by: 7, at: P.warringtonRd, ago: 3, time: "15:20", types: ["PhoneInHand"], title: "On the phone through the lights on Warrington Road", text: "Phone in hand, looking down, drifted into the bus lane.", vehicle: ["Van", "Ford", "Transit Custom", "White"], photos: 1, reported: false, reactions: { Angry: [1, 4] }, comments: [] },
  { n: 4, by: 1, at: P.whiston, ago: 4, time: "08:45", types: ["Tailgating", "BrakeTesting"], title: "Tailgated, then a brake test outside the hospital", text: "Flashed me for doing 30 in a 30, then overtook and slammed on.", vehicle: ["Car", "Audi", "A3", "White"], photos: 2, reported: true, reactions: { Angry: [2, 3, 4, 5, 6], Shocked: [8] }, comments: [[3, "Outside a hospital as well."], [5, "Hope the police do something with this."]], passengerOwner: true },
  { n: 5, by: 8, at: P.huyton, ago: 5, time: "19:05", types: ["Weaving"], title: "Cut across two lanes for the Huyton Lane turn", text: "No indicator, no mirror check. I had to grab the front brake hard.", vehicle: ["Car", "Vauxhall", "Corsa", "Red"], photos: 1, reported: false, reactions: { Shocked: [1, 7] }, comments: [] },
  { n: 6, by: 3, at: P.m62j7, ago: 6, time: "06:50", types: ["MiddleLaneHogging", "Undertaking"], title: "Middle lane hogging, then undertaken by a van", text: "Empty inside lane for a mile. Van behind lost patience.", vehicle: ["Car", "Toyota", "Yaris", "Silver"], photos: 1, reported: false, reactions: { Like: [1, 4], Laugh: [6] }, comments: [[4, "Classic M62."]] },
  { n: 7, by: 7, at: P.sthelens, ago: 7, time: "14:55", types: ["SchoolZigZags"], title: "Double parked on the school zigzags", text: "Kids walking out between parked cars. Every single day.", vehicle: ["Car", "Land Rover", "Range Rover Evoque", "Black"], photos: 2, reported: false, reactions: { Angry: [1, 5, 8] }, comments: [[5, "Same at our school in Leeds."]] },
  { n: 8, by: 2, at: P.lpoolStrand, ago: 1, time: "08:30", types: ["ClosePassCyclist"], title: "Close pass on The Strand, inches from my elbow", text: "Plenty of room in the next lane. Went past at speed anyway.", vehicle: ["Lorry", null, null, "White"], photos: 1, reported: true, reactions: { Shocked: [1, 4, 6, 8], Angry: [3] }, comments: [[6, "Scary. Glad you're OK."], [4, "That's well under a metre and a half."]] },
  { n: 9, by: 2, at: P.lpoolLime, ago: 3, time: "18:15", types: ["RanRedLight"], title: "Straight through the red at Lime Street", text: "Light had been red for a good two seconds. People were already crossing.", vehicle: ["Taxi", null, null, "Black"], photos: 1, reported: false, reactions: { Angry: [1, 7] }, comments: [] },
  { n: 10, by: 6, at: P.lpoolDuke, ago: 8, time: "23:10", types: ["StreetRacing", "SpeedingInTown"], title: "Racing up Duke Street late at night", text: "Two cars side by side, revving at every light.", vehicle: ["Car", "Volkswagen", "Golf", "Blue"], photos: 1, reported: true, reactions: { Shocked: [2, 3] }, comments: [] },
  { n: 11, by: 1, at: P.lpoolQueens, ago: 10, time: "07:55", types: ["PushingInAtMerge", "Tailgating"], title: "Pushed in at the tunnel then sat on my bumper", text: "Queue jumped at the merge and then tailgated all the way through.", vehicle: ["Van", "Mercedes-Benz", "Sprinter", "White"], photos: 1, reported: false, reactions: { Angry: [2, 8] }, comments: [[8, "Every morning at the tunnel."]] },
  { n: 12, by: 3, at: P.warrBridge, ago: 2, time: "12:30", types: ["PavementParking"], title: "Parked on the pavement outside the shops", text: "Wheelchair user had to go into the road to get past.", vehicle: ["Car", "Nissan", "Qashqai", "Grey"], photos: 1, reported: false, reactions: { Angry: [5, 7] }, comments: [] },
  { n: 13, by: 3, at: P.warrWinwick, ago: 5, time: "16:40", types: ["PhoneInHand", "MiddleLaneHogging"], title: "Video call while driving on Winwick Road", text: "Phone held up in front of the steering wheel. Doing 25 in the outside lane.", vehicle: ["Car", "Kia", "Sportage", "White"], photos: 1, reported: true, reactions: { Shocked: [1, 2, 4] }, comments: [] },
  { n: 14, by: 3, at: P.warrM6, ago: 9, time: "05:45", types: ["Tailgating"], title: "Car glued to the back of my trailer on the M6", text: "Couldn't see him in the mirrors at all. If I'd braked he'd have been under the trailer.", vehicle: ["Car", "Mercedes-Benz", "C-Class", "Silver"], photos: 1, reported: false, reactions: { Shocked: [1, 8], Like: [7] }, comments: [[8, "Terrifying from your side."]] },
  { n: 15, by: 4, at: P.mcrOxford, ago: 1, time: "09:05", types: ["ClosePassCyclist", "OvertakeAtJunction"], title: "Overtook me on the cycle lane approach on Oxford Road", text: "Bus lane, cycle lane, didn't matter. Swerved straight in front.", vehicle: ["Car", "Tesla", "Model 3", "White"], photos: 1, reported: true, reactions: { Angry: [2, 6] }, comments: [[2, "Oxford Road is getting worse."]] },
  { n: 16, by: 4, at: P.mcrDeansgate, ago: 4, time: "22:30", types: ["ParkingOther"], title: "Parked in the taxi rank on Deansgate", text: "Left the hazards on and went into the bar.", vehicle: ["Car", "Mercedes-Benz", "A-Class", "Black"], photos: 1, reported: false, reactions: { Laugh: [6], Angry: [1] }, comments: [] },
  { n: 17, by: 4, at: P.mcrPortland, ago: 6, time: "17:15", types: ["RanRedLight", "PhoneInHand"], title: "Ran the red on Portland Street, phone in hand", text: "Didn't even look up.", vehicle: ["Van", "Ford", "Transit", "White"], photos: 1, reported: false, reactions: { Angry: [2, 5] }, comments: [] },
  { n: 18, by: 4, at: P.mcrMancunian, ago: 12, time: "07:20", types: ["Weaving", "SpeedingFastRoad"], title: "Weaving across all lanes on the Mancunian Way", text: "Undertook three cars and then cut back into the outside lane.", vehicle: ["Car", "Audi", "A4", "Grey"], photos: 1, reported: true, reactions: { Shocked: [1, 3] }, comments: [] },
  { n: 19, by: 5, at: P.leedsHeadrow, ago: 2, time: "15:10", types: ["BlockingDriveway"], title: "Blocking the dropped kerb on The Headrow", text: "Mum with a pram had to lift it down the kerb.", vehicle: ["Car", "Volkswagen", "Polo", "Red"], photos: 1, reported: false, reactions: { Angry: [7] }, comments: [] },
  { n: 20, by: 5, at: P.leedsKirkstall, ago: 6, time: "08:40", types: ["GotOutOfVehicle"], title: "Driver got out and kicked my door on Kirkstall Road", text: "All because I wouldn't let him in from the side road.", vehicle: ["Car", "BMW", "X5", "Black"], photos: 2, reported: true, reactions: { Shocked: [1, 2, 3, 4], Angry: [6, 7] }, comments: [[1, "Hope you sent this to West Yorkshire Police."], [5, "I have. They've given me a reference."]] },
  { n: 21, by: 5, at: P.leedsInner, ago: 14, time: "18:50", types: ["SpeedingInTown"], title: "Way over the limit in the Inner Ring Road tunnel", text: "Passed me like I was parked.", vehicle: ["Motorbike", null, null, "Green"], photos: 1, reported: false, reactions: { Shocked: [8] }, comments: [] },
  { n: 22, by: 6, at: P.londonOldSt, ago: 1, time: "07:35", types: ["ClosePassCyclist", "LorryOrBusDriving"], title: "Bus pulled in on top of me at Old Street", text: "Indicated after it had already started moving over.", vehicle: ["Bus", null, null, "Red"], photos: 1, reported: true, reactions: { Shocked: [2, 4] }, comments: [[2, "Buses and bikes at Old Street, never fun."]] },
  { n: 23, by: 6, at: P.londonElephant, ago: 3, time: "19:25", types: ["NotLooking", "PhoneInHand"], title: "Scrolling through the junction at Elephant and Castle", text: "Head down the whole way round.", vehicle: ["Car", "Toyota", "Prius", "Silver"], photos: 1, reported: false, reactions: { Angry: [4] }, comments: [] },
  { n: 24, by: 6, at: P.londonVauxhall, ago: 11, time: "08:05", types: ["RanRedLight", "ClosePassCyclist"], title: "Ran the red and squeezed past me at Vauxhall Cross", text: "Cycle lane was full, so he just used the junction box.", vehicle: ["Van", "Volkswagen", "Transporter", "White"], photos: 1, reported: false, reactions: { Angry: [2] }, comments: [] },
  { n: 25, by: 7, at: P.prescotHigh, ago: 9, time: "11:15", types: ["DisabledBay"], title: "Disabled bay, no blue badge", text: "Jumped out to the cashpoint and left it there twenty minutes.", vehicle: ["Car", "Mini", "Hatch", "Yellow"], photos: 1, reported: false, reactions: { Angry: [1, 8] }, comments: [] },
  { n: 26, by: 8, at: P.warringtonRd, ago: 13, time: "16:55", types: ["OvertakeOnBend", "SpeedingFastRoad"], title: "Overtaking on the hill on Warrington Road", text: "Blind crest, double white lines, still went for it.", vehicle: ["Car", "Ford", "Fiesta", "Blue"], photos: 1, reported: true, reactions: { Shocked: [1, 3, 7] }, comments: [[7, "Someone will get killed there."]] },
];

// Communities (owner, 23 Oct 2026): places (with an area) and topics, each run by one of the hand-written members.
// generate.mjs fills them with members, shared posts, discussions and replies. If the owner account exists, it's a
// moderator of the private Leeds School Run, which has a few requests waiting.
export const communities = [
  { n: 1, owner: 1, name: "Knowsley Road Watch", visibility: "Public", area: ["Prescot", 53.43, -2.8, 10], description: "Bad driving around Prescot, Huyton, Whiston and Rainhill.", rules: "Blur plates and faces. No names or addresses. Report it to Merseyside Police too.", discussions: [["Lickers Lane at school time", "Cars parked on both pavements again. Anyone know if the council are doing anything?"], ["Is the A58 bypass camera working?", "Seen people doing 60 past it every night this week."]] },
  { n: 2, owner: 4, name: "Manchester Road Watch", visibility: "Public", area: ["Manchester", 53.48, -2.25, 15], description: "Manchester and Salford: clips, near misses and the junctions to avoid.", rules: "Keep it about the driving, not the driver.", discussions: [["Mancunian Way roadworks", "Anyone else seeing people cut across at the last second?"], ["Oxford Road bus gate", "Taxis using it at all hours. Is that allowed now?"], ["Best dashcam for a taxi?", "Front and rear, needs to cope with nights."]] },
  { n: 3, owner: 5, name: "Leeds School Run", visibility: "Private", area: ["Leeds", 53.8, -1.55, 10], description: "Parents watching the school gates in Leeds.", rules: "Never post children's faces. Members only, so be kind.", discussions: [["Zigzags outside St Mary's", "Three cars on them this morning. I've emailed the head."], ["Walking bus on Fridays?", "Would anyone join a walking bus from the park?"]] },
  { n: 4, owner: 2, name: "Cyclists UK", visibility: "Public", area: null, description: "Close passes, dooring and the good drivers too.", rules: "Helmet cam clips welcome. No abuse of any road user.", discussions: [["What counts as a close pass?", "The Highway Code says at least 1.5 metres at up to 30 mph."], ["Best helmet camera under £150?", null]] },
  { n: 5, owner: 3, name: "HGV Drivers", visibility: "Private", area: null, description: "Professional drivers sharing what they see from the cab.", rules: "Drivers only. Ask to join and tell us what you drive.", discussions: [["Undertaking at the M6 roadworks", "Every day at junction 21A. Cars sitting in the blind spot."]] },
  { n: 6, owner: 6, name: "London Riders", visibility: "Public", area: ["London", 51.51, -0.13, 15], description: "Bikes, scooters and delivery riders in London.", rules: null, discussions: [["Old Street roundabout layout", "Is anyone else finding the new layout worse?"]] },
];

export const COMMUNITY_REPLIES = [
  "Same here, every single day.",
  "I've reported it twice. Nothing happens.",
  "Thanks for posting, good to know it's not just me.",
  "Avoid it at 8:30 if you can.",
  "Worth emailing the council with the clips.",
  "Got one of those on camera last week too.",
  "Agreed. Something needs to change there.",
];
