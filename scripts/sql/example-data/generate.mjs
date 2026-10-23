// Grows the hand-written examples in data.mjs into a busy local Bad Jockeys: about 100 more members around the UK,
// a few hundred more posts (photo posts with several photos, video posts with one clip), and lots of activity on
// them: reactions, comments and replies (every member writes both), reactions on comments, "Who's at fault?" and
// "How bad was it?" votes, follows, followed posts, bookmarks, views, shares, badges and home areas.
//
// Everything comes from a fixed random seed, so every run produces exactly the same data.

import { COMMUNITY_REPLIES, communities as handCommunities, ids, posts as handPosts, users as handUsers } from "./data.mjs";

// --- Deterministic random numbers ---

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20261021;
// Restarted by buildExampleData, so every call (not just the first in a process) makes the same data.
let random = mulberry32(SEED);
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;
function sample(list, count) {
  const copy = [...list];
  const out = [];
  while (out.length < count && copy.length > 0) {
    out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  }
  return out;
}
function weighted(entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// --- Places: towns with a few roads each. Merseyside is weighted up (the beta area). ---

export const TOWNS = [
  { name: "Prescot", lat: 53.4296, lng: -2.8016, weight: 6, roads: ["High Street", "Eccleston Street", "A58 Prescot Bypass"] },
  { name: "Huyton", lat: 53.4111, lng: -2.8392, weight: 5, roads: ["Huyton Lane", "Archway Road", "Bluebell Lane"] },
  { name: "Whiston", lat: 53.4152, lng: -2.7951, weight: 4, roads: ["Lickers Lane", "Dragon Lane", "Old Colliery Road"] },
  { name: "Rainhill", lat: 53.4176, lng: -2.7524, weight: 4, roads: ["A57 Warrington Road", "View Road", "M62 junction 7"] },
  { name: "St Helens", lat: 53.4531, lng: -2.7369, weight: 5, roads: ["Westfield Street", "Corporation Street", "Linkway"] },
  { name: "Liverpool", lat: 53.4084, lng: -2.9916, weight: 8, roads: ["The Strand", "Lime Street", "Duke Street", "Scotland Road", "Edge Lane"] },
  { name: "Warrington", lat: 53.39, lng: -2.597, weight: 4, roads: ["Bridge Street", "A49 Winwick Road", "Cromwell Avenue"] },
  { name: "Wigan", lat: 53.545, lng: -2.6325, weight: 2, roads: ["Wallgate", "Robin Park Road"] },
  { name: "Manchester", lat: 53.4794, lng: -2.2453, weight: 5, roads: ["Oxford Road", "Deansgate", "Princess Parkway", "A57(M) Mancunian Way"] },
  { name: "Salford", lat: 53.4875, lng: -2.2901, weight: 2, roads: ["Chapel Street", "Regent Road"] },
  { name: "Leeds", lat: 53.7997, lng: -1.5492, weight: 3, roads: ["The Headrow", "Kirkstall Road", "Armley Gyratory"] },
  { name: "Sheffield", lat: 53.3811, lng: -1.4701, weight: 2, roads: ["Sheffield Parkway", "Ecclesall Road"] },
  { name: "Birmingham", lat: 52.4862, lng: -1.8904, weight: 3, roads: ["Hagley Road", "A38 Aston Expressway", "Bristol Road"] },
  { name: "London", lat: 51.5072, lng: -0.1276, weight: 5, roads: ["Old Street roundabout", "Elephant and Castle", "Vauxhall Cross", "Euston Road"] },
  { name: "Bristol", lat: 51.4545, lng: -2.5879, weight: 2, roads: ["M32 junction 3", "Temple Way"] },
  { name: "Newcastle", lat: 54.9783, lng: -1.6178, weight: 2, roads: ["Central Motorway", "Scotswood Road"] },
  { name: "Glasgow", lat: 55.8642, lng: -4.2518, weight: 2, roads: ["M8 Charing Cross", "Great Western Road"] },
  { name: "Cardiff", lat: 51.4816, lng: -3.1791, weight: 2, roads: ["Newport Road", "Cowbridge Road East"] },
  { name: "Nottingham", lat: 52.9548, lng: -1.1581, weight: 2, roads: ["Maid Marian Way", "A52 Clifton Bridge"] },
  { name: "Belfast", lat: 54.5973, lng: -5.9301, weight: 1, roads: ["Westlink", "Ormeau Road"] },
];

// Each road gets a fixed spot near its town, so posts on the same road cluster for the heat map.
const ROADS = TOWNS.flatMap((town) =>
  town.roads.map((road, i) => {
    const angle = (i + 1) * 2.1 + town.lat;
    return {
      town,
      lat: +(town.lat + Math.sin(angle) * 0.012).toFixed(4),
      lng: +(town.lng + Math.cos(angle) * 0.018).toFixed(4),
      place: `${road}, ${town.name}`,
    };
  }),
);

/** The home town of each hand-written member, by their profile location. */
const townByName = (name) => TOWNS.find((t) => t.name === name) ?? TOWNS[0];

// --- Members ---

const FIRST = [
  "Aaron", "Abbie", "Adam", "Aisha", "Alex", "Amelia", "Amir", "Ava", "Ben", "Bethany", "Callum", "Chloe", "Connor",
  "Daisy", "Daniel", "Ella", "Emily", "Ethan", "Faith", "Finn", "Freya", "George", "Grace", "Hannah", "Harry", "Holly",
  "Imran", "Isla", "Jack", "Jade", "Jake", "Jamal", "James", "Jess", "Joe", "Kai", "Katie", "Kieran", "Lauren", "Leah",
  "Liam", "Lucy", "Luke", "Maya", "Megan", "Mia", "Nathan", "Niamh", "Noah", "Olivia", "Omar", "Paige", "Reece", "Rhys",
  "Rosie", "Ryan", "Sara", "Scott", "Sophie", "Tom", "Tyler", "Zara", "Zoe",
];
const LAST = [
  "Ahmed", "Ali", "Atkinson", "Baker", "Bell", "Brennan", "Brown", "Byrne", "Campbell", "Carter", "Clarke", "Collins",
  "Davies", "Doyle", "Evans", "Fisher", "Fletcher", "Gallagher", "Green", "Hall", "Harris", "Hughes", "Jackson",
  "Jones", "Kaur", "Kelly", "Khan", "Lee", "Lewis", "Lloyd", "Macdonald", "Murphy", "Nolan", "Owen", "Patel", "Price",
  "Quinn", "Roberts", "Robinson", "Shaw", "Singh", "Smith", "Taylor", "Thomas", "Walker", "Ward", "Watson", "White",
  "Williams", "Wilson", "Wood", "Wright", "Young",
];
const HANDLE_STYLES = [
  (f, l) => `${f}_${l}`,
  (f, l) => `${f}${l[0]}`,
  (f, l, town) => `${f}_${town.replace(/\s/g, "")}`.slice(0, 30),
  (f) => `dashcam_${f}`,
  (f, l) => `${f}${l}`.slice(0, 30),
  (f) => `${f}_on_the_road`,
];
const BIOS = [
  "Front and rear dashcam. Just want people home safe.",
  "Commuter. Same roads every day, same bad habits.",
  "Delivery driver, 300 miles a week.",
  "Cyclist. Helmet cam because I have to.",
  "Learner driver, already seen enough.",
  "Driving instructor. My students drive better than this.",
  "Taxi driver, nights mostly.",
  "School run survivor.",
  "Motorbike commuter, all weathers.",
  "HGV driver. Watch the blind spot.",
  "Retired and on the roads a lot.",
  "Bus driver. You'd be amazed.",
  "Weekend road cyclist.",
  "Van driver for a building firm.",
  "Nurse, early starts and late finishes.",
];

export function generatedUsers(count = 100) {
  const taken = new Set(handUsers.map((u) => u.handle));
  const out = [];
  for (let i = 0; out.length < count; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const town = weighted(TOWNS.map((t) => [t, t.weight]));
    const style = pick(HANDLE_STYLES);
    let handle = style(first.toLowerCase(), last.toLowerCase(), town.name.toLowerCase())
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30);
    if (!/^[a-z]/.test(handle) || handle.length < 3) handle = `driver_${handle}`.slice(0, 30);
    while (taken.has(handle)) handle = `${handle.slice(0, 27)}${int(10, 99)}`;
    taken.add(handle);
    const n = handUsers.length + out.length + 1;
    out.push({
      n,
      handle,
      name: `${first} ${last}`,
      email: `${handle}@example.test`,
      location: town.name,
      bio: pick(BIOS),
    });
  }
  return out;
}

// --- Posts ---

const INTERACTION = new Set(["RoadRage", "DangerousOvertaking", "Tailgating", "CuttingUp", "Undertaking", "ClosePass"]);
const POST_TEXT = {
  RoadRage: [
    ["Got out of his car at the lights on {road}", "Shouting and banging on my window because I didn't move fast enough."],
    ["Followed me for two miles after I beeped", "Flashing his lights and right on my bumper the whole way."],
    ["Threw something at my car on {road}", "Over a lane change he didn't like."],
  ],
  DangerousOvertaking: [
    ["Overtook on a blind bend on {road}", "Oncoming car had to brake hard."],
    ["Overtook a cyclist into oncoming traffic", "Then cut straight back in."],
    ["Three cars in one go, double white lines", "No idea how nobody was hurt."],
  ],
  Tailgating: [
    ["Inches from my bumper on {road}", "At 50 mph. Couldn't see his number plate in my mirror."],
    ["Lorry tailgating in the rain", "Spray everywhere and about a car length behind."],
    ["Sat on my bumper in a 30", "Then overtook and braked in front of me."],
  ],
  MobilePhoneUse: [
    ["On a video call driving down {road}", "Phone held up over the steering wheel."],
    ["Texting at the lights, then pulled off on red", "Didn't look up once."],
    ["Phone in hand through the roundabout", "Drifted across two lanes."],
  ],
  Speeding: [
    ["Way over the limit past the school on {road}", "Kids everywhere at home time."],
    ["Flew past me in a 40", "Must have been doing 70."],
    ["Racing another car on {road}", "Both well over the limit."],
  ],
  RedLightRunning: [
    ["Straight through a red on {road}", "Lights had been red for a good two seconds."],
    ["Ran the red at the pedestrian crossing", "Someone had already stepped out."],
    ["Bus through the red", "Then a car followed it through."],
  ],
  CuttingUp: [
    ["Cut across three lanes for the exit", "No indicator, missed my front by a foot."],
    ["Cut me up at the roundabout on {road}", "Came from the left lane to go right."],
    ["Pushed in at the last second", "Then gave me the finger."],
  ],
  Undertaking: [
    ["Undertook a queue on the hard shoulder", "Then forced his way back in."],
    ["Undertaking on {road} at speed", "Weaving between lanes the whole way."],
    ["Went up the inside of a turning lorry", "Nearly went under it."],
  ],
  LaneHogging: [
    ["Middle lane hogging for miles", "Left lane completely empty."],
    ["Doing 50 in lane three", "Queue of cars behind trying to get past."],
    ["Wouldn't move over on {road}", "Undertaking was the only way past."],
  ],
  ClosePass: [
    ["Close pass on {road}", "Less than a foot from my handlebars."],
    ["Bus squeezed past me at the pinch point", "Mirror nearly took my elbow."],
    ["Overtook me on the crossing islands", "Had to brake to avoid the kerb."],
  ],
  BadParking: [
    ["Parked across the dropped kerb on {road}", "Wheelchair users have to go in the road."],
    ["On the zigzags outside the school", "At home time, of course."],
    ["Two disabled bays, no blue badge", "Popped in to the shop for half an hour."],
    ["Parked on the pavement, blocking it completely", "Pushchair had to go round in the traffic."],
  ],
  Other: [
    ["Reversing up the slip road on {road}", "Missed the exit, so went back for it."],
    ["Driving with no lights in the dark", "Couldn't see him until he was right on me."],
    ["Load falling off a trailer", "Bits of wood all over the lane."],
  ],
};
const CATEGORY_WEIGHTS = [
  ["BadParking", 9], ["MobilePhoneUse", 7], ["Tailgating", 7], ["Speeding", 6], ["DangerousOvertaking", 6],
  ["CuttingUp", 5], ["RedLightRunning", 5], ["ClosePass", 5], ["RoadRage", 4], ["Undertaking", 3],
  ["LaneHogging", 3], ["Other", 2],
];
const SECOND_TYPE = {
  Tailgating: ["RoadRage", "Speeding"], DangerousOvertaking: ["Speeding", "ClosePass"], RedLightRunning: ["MobilePhoneUse", "Speeding"],
  MobilePhoneUse: ["LaneHogging", "RedLightRunning"], CuttingUp: ["RoadRage"], Speeding: ["DangerousOvertaking"],
  Undertaking: ["Speeding"], LaneHogging: ["Undertaking"],
};
const VEHICLES = [
  ["Car", "Ford", "Focus"], ["Car", "Ford", "Fiesta"], ["Car", "BMW", "3 Series"], ["Car", "BMW", "X5"], ["Car", "Audi", "A3"],
  ["Car", "Audi", "Q5"], ["Car", "Volkswagen", "Golf"], ["Car", "Volkswagen", "Polo"], ["Car", "Vauxhall", "Corsa"],
  ["Car", "Vauxhall", "Astra"], ["Car", "Kia", "Sportage"], ["Car", "Nissan", "Qashqai"], ["Car", "Tesla", "Model 3"],
  ["Car", "Toyota", "Yaris"], ["Car", "Mercedes-Benz", "C-Class"], ["Car", "Mercedes-Benz", "A-Class"],
  ["Van", "Ford", "Transit"], ["Van", "Ford", "Transit Custom"], ["Van", "Mercedes-Benz", "Sprinter"], ["Van", "Volkswagen", "Transporter"],
  ["Lorry", "DAF", "XF"], ["Lorry", "Mercedes-Benz", "Actros"], ["Taxi", "Toyota", "Prius"], ["Motorbike", "Yamaha", "MT-07"],
  ["Motorbike", "Honda", "CB"], ["Bus", null, null], ["Bicycle", null, null], ["EScooter", null, null],
];
const COLOURS = ["Black", "White", "Silver", "Grey", "Blue", "Red", "Green", "Yellow", "Orange", "Brown", "Beige", "Purple", "Gold"];

const COMMENTS = [
  "Absolutely shocking.", "Same thing happened to me on this road last week.", "Report it, this is exactly what the police want.",
  "How was nobody hurt?", "That road is a nightmare at rush hour.", "Unbelievable.", "Good camera, really clear.",
  "This happens every single day round here.", "Need a speed camera on that stretch.", "Glad you're OK.",
  "Some people shouldn't have a licence.", "I'd have been shaking after that.", "Is there a rear camera angle?",
  "Council need to sort this junction out.", "Classic.", "Saw the same car doing this on Monday.",
  "Hope you sent it to the police.", "The audacity.", "Every week on here, same road.", "Proper scary that.",
  "You did well to stay calm.", "That's a ban if the police see it.", "Was this around 5pm? Traffic's mad then.",
  "My kids walk that way to school.", "Fair play for posting it.",
];
const REPLIES = [
  "Yep, sent it in this morning.", "Exactly what I thought.", "No rear camera unfortunately.", "Thanks, all fine.",
  "Couldn't agree more.", "Happens all the time.", "Not yet, will do tonight.", "Same here.", "Ha, sadly not surprised.",
  "It was about 5:15.", "They've been told about it loads of times.", "Fingers crossed something happens.",
  "Honestly I just pulled over afterwards.", "You'd think so.", "Shocking isn't it.",
];
const CHOICES = {
  Fault: [["OtherRoadUser", 12], ["Both", 2], ["FilmingDriver", 1], ["Nobody", 1]],
  Severity: [["Careless", 4], ["Dangerous", 5], ["Shocking", 3], ["Minor", 1]],
};
const REACTIONS = [["Angry", 40], ["Shocked", 25], ["Like", 25], ["Laugh", 10]];

function generatedPosts(allUsers, count, startN) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const main = weighted(CATEGORY_WEIGHTS);
    const types = [main];
    if (SECOND_TYPE[main] && chance(0.3)) types.push(pick(SECOND_TYPE[main]));
    const author = pick(allUsers);
    // Mostly posted near home, sometimes further afield.
    const home = townByName(author.location);
    const road = chance(0.75) ? pick(ROADS.filter((r) => r.town === home)) : pick(ROADS);
    const [title, text] = pick(POST_TEXT[main]);
    const roadName = road.place.split(",")[0];
    const vehicle = main === "BadParking" && chance(0.2) ? null : pick(VEHICLES);
    const video = chance(main === "BadParking" ? 0.15 : 0.5);
    out.push({
      n: startN + i,
      by: author.n,
      at: [road.lat, road.lng, road.place],
      ago: int(2, 60),
      time: `${String(int(6, 21)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`,
      types,
      title: title.replace("{road}", roadName),
      text,
      vehicle: vehicle ? [vehicle[0], vehicle[1], vehicle[2], pick(COLOURS)] : null,
      photos: video ? 0 : int(2, 6),
      video,
      reported: chance(0.3),
    });
  }
  return out;
}

// --- Activity ---

function km(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * The whole example data set. Posts carry `reactions`, flat `comments` ({ id, by, text, parent, minute, reactions }),
 * `votes`, `followers`, `views`, `shares`; the rest is in `engagement`. Minutes are after the post's own time and
 * never later than a day before now.
 */
export function buildExampleData() {
  random = mulberry32(SEED);
  const users = [...handUsers, ...generatedUsers(100)];
  const posts = [...handPosts.map((p) => ({ ...p })), ...generatedPosts(users, 274, handPosts.length + 1)];
  const userNs = users.map((u) => u.n);

  // Home areas: about 1 km from the centre of their town (only the name is ever shown).
  const homeAreas = users.map((u) => {
    const town = townByName(u.location);
    return {
      user: u.n,
      place: town.name,
      lat: +(town.lat + (random() - 0.5) * 0.02).toFixed(4),
      lng: +(town.lng + (random() - 0.5) * 0.03).toFixed(4),
    };
  });
  const homeOf = new Map(homeAreas.map((h) => [h.user, h]));

  let commentCounter = 0;
  const commentsBy = new Map(userNs.map((n) => [n, 0]));
  const repliesBy = new Map(userNs.map((n) => [n, 0]));

  for (const post of posts) {
    const maxMinute = Math.max(60, (post.ago - 1) * 1440);
    const others = userNs.filter((n) => n !== post.by);
    const minute = (from, to) => Math.min(maxMinute, int(from, to));

    // Reactions: the hand-written ones stay; generated posts get 3 to 45.
    if (!post.reactions) {
      post.reactions = {};
      for (const u of sample(others, int(3, 45))) {
        const type = weighted(REACTIONS);
        (post.reactions[type] ??= []).push(u);
      }
    }

    // Comments, flattened with ids. Hand-written ones keep their words.
    const flat = [];
    const addComment = (by, text, parent, at) => {
      const id = ids.commentId(++commentCounter);
      flat.push({ id, by, text, parent, minute: at, reactions: {} });
      if (parent) repliesBy.set(by, repliesBy.get(by) + 1);
      else commentsBy.set(by, commentsBy.get(by) + 1);
      return id;
    };
    let at = 40;
    if (post.comments) {
      for (const [by, text, replies] of post.comments) {
        at += 15;
        const parent = addComment(by, text, null, Math.min(maxMinute, at));
        for (const [rBy, rText] of replies ?? []) {
          at += 10;
          addComment(rBy, rText, parent, Math.min(maxMinute, at));
        }
      }
    } else {
      const topLevel = int(2, 8);
      for (let c = 0; c < topLevel; c++) {
        at += int(5, 240);
        const parent = addComment(pick(others), pick(COMMENTS), null, Math.min(maxMinute, at));
        if (chance(0.55)) {
          const replyCount = int(1, 3);
          for (let r = 0; r < replyCount; r++) {
            at += int(3, 90);
            const replier = chance(0.5) ? post.by : pick(userNs);
            addComment(replier, pick(REPLIES), parent, Math.min(maxMinute, at));
          }
        }
      }
    }
    post.comments = flat;

    // Votes: the kind follows the post's types; nobody votes on their own post.
    const kind = post.types.some((t) => INTERACTION.has(t)) ? "Fault" : "Severity";
    post.votes = sample(others, int(2, 40)).map((u) => ({ user: u, choice: weighted(CHOICES[kind]), minute: minute(30, 2000) }));

    // Followers: the author, everyone who commented (as the app does), and a few more.
    post.followers = [...new Set([post.by, ...flat.map((c) => c.by), ...sample(others, int(0, 4))])];

    // Views: everyone who reacted, commented or voted, plus more members and signed-out visitors.
    const engaged = new Set([
      ...Object.values(post.reactions).flat(),
      ...flat.map((c) => c.by),
      ...post.votes.map((v) => v.user),
      ...sample(others, int(5, 40)),
    ]);
    engaged.delete(post.by);
    post.views = [...engaged].map((u) => {
      const home = homeOf.get(u);
      return { key: ids.userId(u), isLocal: km(home.lat, home.lng, post.at[0], post.at[1]) <= 10, minute: minute(5, 2000) };
    });
    const anonymous = int(5, 120);
    for (let a = 0; a < anonymous; a++) {
      post.views.push({ key: viewerId(post.n, a), isLocal: false, minute: minute(5, 3000) });
    }
    post.shares = sample([...engaged], int(0, 8)).map((u) => ({ key: ids.userId(u), minute: minute(20, 3000) }));
  }

  // Every member comments and replies at least once.
  const postsWithComments = posts.filter((p) => p.comments.length > 0);
  for (const u of userNs) {
    if (commentsBy.get(u) === 0) {
      const post = pick(posts.filter((p) => p.by !== u));
      const m = Math.min(Math.max(60, (post.ago - 1) * 1440), 600);
      post.comments.push({ id: ids.commentId(++commentCounter), by: u, text: pick(COMMENTS), parent: null, minute: m, reactions: {} });
      commentsBy.set(u, 1);
    }
    if (repliesBy.get(u) === 0) {
      const post = pick(postsWithComments.filter((p) => p.comments.some((c) => !c.parent && c.by !== u)));
      const parent = pick(post.comments.filter((c) => !c.parent && c.by !== u));
      const m = Math.min(Math.max(60, (post.ago - 1) * 1440), parent.minute + 30);
      post.comments.push({ id: ids.commentId(++commentCounter), by: u, text: pick(REPLIES), parent: parent.id, minute: m, reactions: {} });
      repliesBy.set(u, 1);
    }
  }

  // Reactions on comments.
  for (const post of posts) {
    for (const c of post.comments) {
      for (const u of sample(userNs.filter((n) => n !== c.by), int(0, 12))) {
        const type = weighted(REACTIONS);
        (c.reactions[type] ??= []).push(u);
      }
    }
  }

  // Follows between members (5 to 25 each).
  const follows = [];
  for (const u of userNs) {
    for (const v of sample(userNs.filter((n) => n !== u), int(5, 25))) follows.push({ follower: u, followee: v });
  }

  // Bookmarks (0 to 10 each).
  const bookmarks = [];
  for (const u of userNs) {
    for (const post of sample(posts.filter((p) => p.by !== u), int(0, 10))) {
      bookmarks.push({ user: u, post: post.n, minute: Math.min(Math.max(60, (post.ago - 1) * 1440), int(30, 3000)) });
    }
  }

  // When votes close on each member's posts: mostly the default 7 days.
  const preferences = userNs
    .map((u) => ({ user: u, duration: weighted([["Days7", 7], ["Hours48", 2], ["Never", 1]]) }))
    .filter((p) => p.duration !== "Days7" || chance(0.2));

  // Badges: everyone here is among the first 1,000; a few trusted reporters and local regulars.
  const badges = [
    ...userNs.map((u) => ({ user: u, badge: "FoundingMember" })),
    ...sample(userNs, 8).map((u) => ({ user: u, badge: "TrustedReporter" })),
    ...sample(userNs, 18).map((u) => ({ user: u, badge: "LocalRegular" })),
  ];

  // Communities, after everything else so adding them changed none of the data above.
  const communities = buildCommunities(userNs, posts, homeOf);

  return { users, posts, homeAreas, follows, bookmarks, preferences, badges, communities };
}

/**
 * Members (place communities: mostly people whose home area is inside; topics: a sample), a moderator each, a few
 * requests waiting in private ones, posts shared by members (inside the area, for place communities), discussions
 * and replies. Minutes are before now.
 */
function buildCommunities(userNs, posts, homeOf) {
  let replyCounter = 0;
  let discussionCounter = 0;
  return handCommunities.map((c) => {
    const area = c.area ? { place: c.area[0], lat: c.area[1], lng: c.area[2], radiusKm: c.area[3] } : null;
    const inside = (lat, lng) => area && km(area.lat, area.lng, lat, lng) <= area.radiusKm;
    const others = userNs.filter((u) => u !== c.owner);
    const joined = area
      ? others.filter((u) => inside(homeOf.get(u).lat, homeOf.get(u).lng) && chance(0.7))
      : sample(others, int(15, 30));
    const moderator = joined.length > 0 ? pick(joined) : null;
    const members = [
      { user: c.owner, role: "Admin", status: "Member", minute: 60 * 24 * 30 },
      ...joined.map((u) => ({ user: u, role: u === moderator ? "Moderator" : "Member", status: "Member", minute: int(60, 60 * 24 * 28) })),
    ];
    if (c.visibility === "Private") {
      for (const u of sample(others.filter((u) => !joined.includes(u)), 3)) {
        members.push({ user: u, role: "Member", status: "Requested", minute: int(30, 60 * 24 * 3) });
      }
    }
    const memberIds = new Set(members.filter((m) => m.status === "Member").map((m) => m.user));
    const shares = posts
      .filter((p) => memberIds.has(p.by) && (area ? inside(p.at[0], p.at[1]) : chance(0.25)) && chance(0.6))
      .map((p) => ({ post: p.n, by: p.by, minute: Math.max(1, (p.ago - 1) * 1440 - 30) }));
    const people = [...memberIds];
    const discussions = c.discussions.map(([title, body], i) => {
      const n = ++discussionCounter;
      const by = i === 0 ? c.owner : pick(people);
      const started = int(60 * 24 * 2, 60 * 24 * 20);
      const replies = sample(people.filter((u) => u !== by), int(1, 6)).map((u, r) => ({
        n: ++replyCounter,
        by: u,
        text: pick(COMMUNITY_REPLIES),
        minute: Math.max(5, started - (r + 1) * int(20, 300)),
      }));
      const lastMinute = replies.length > 0 ? Math.min(...replies.map((r) => r.minute)) : started;
      return { n, by, title, body: body ?? "", minute: started, lastMinute, replies };
    });
    return { ...c, area, members, shares, discussions };
  });
}

/** A signed-out visitor's viewer key: fixed per post and visitor, inside the example id range. */
function viewerId(post, visitor) {
  return `e0000000-0000-4000-8006-${String(post * 1000 + visitor).padStart(12, "0")}`;
}

