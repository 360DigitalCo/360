// ══════════════════════════════════════════════════════════════════
// NYC DREAM 2.0 — EXPLORE.JS
// 2D Open World Street Explorer — activated on map location click
// ══════════════════════════════════════════════════════════════════

const EX = {
  active: false,
  canvas: null, ctx: null,
  W: 0, H: 0,
  // Player
  px: 400, py: 300,        // world position
  pVelX: 0, pVelY: 0,
  pFacing: 'down',          // up/down/left/right
  pAnimFrame: 0,
  pAnimTick: 0,
  pRunning: false,
  pSprinting: false,
  // Camera
  camX: 0, camY: 0,
  // Current neighborhood data
  neighborhood: null,
  // NPC list
  npcs: [],
  // Interactables (benches, vendors, buildings)
  objects: [],
  buildings: [],
  // Keys held
  keys: {},
  // Interaction
  nearbyObj: null,
  dialogueActive: false,
  dialogueData: null,
  dialoguePage: 0,
  // Loop
  frameId: null,
  // Ambient
  particles: [],
  ticker: 0,
  // Zone ambient info
  ambientPeople: 0,
  trafficLevel: 0,
  // Cars & pedestrians
  cars: [],
  pedestrians: [],
  // Notifications queue
  notifQueue: [],
  // Sound-like triggers (visual)
  sounds: [],
};

// ── NEIGHBORHOOD DEFINITIONS ──────────────────────────────────────────
// Each neighborhood has: streets, buildings, NPCs, atmosphere
const NEIGHBORHOOD_CONFIGS = {
  // ── MIDTOWN / TIMES SQUARE ──
  "Times Square": {
    bg: '#111108',
    streetColor: '#1A1A18',
    sidewalkColor: '#222220',
    accent: '#FF6319',
    ambiance: 'busy',
    trafficLevel: 3,
    description: 'The Crossroads of the World. Bright lights, loud horns, tourists everywhere.',
    buildings: [
      { x:60,  y:80,  w:120, h:200, floors:8,  name:'One Times Square', color:'#1A1510', roofColor:'#2A2018', type:'office',  icon:'🏢', reqRep:0,   reqPay:0 },
      { x:220, y:60,  w:100, h:220, floors:9,  name:'Hard Rock Cafe',   color:'#1A0C08', roofColor:'#2A1410', type:'dining',  icon:'🎸', reqRep:0,   reqPay:0 },
      { x:500, y:50,  w:130, h:260, floors:11, name:'Marriott Marquis', color:'#100E18', roofColor:'#1A1428', type:'hotel',   icon:'🏨', reqRep:40,  reqPay:200 },
      { x:700, y:70,  w:90,  h:180, floors:7,  name:'Conde Nast Bldg',  color:'#121212', roofColor:'#1E1E1E', type:'office',  icon:'📰', reqRep:65,  reqPay:0 },
      { x:360, y:90,  w:110, h:200, floors:8,  name:'McDonald\'s Times Sq',color:'#181008',roofColor:'#201408',type:'food',   icon:'🍔', reqRep:0,   reqPay:0 },
      { x:850, y:80,  w:100, h:160, floors:6,  name:'TKTS Booth',       color:'#0A0A10', roofColor:'#141420', type:'venue',   icon:'🎭', reqRep:0,   reqPay:0 },
    ],
    npcs: [
      { name:'Tourist Tim',   emoji:'📸', x:250, y:330, speed:0.3, patrol:true, dialogue:['Oh wow, is that the real Times Square?','Can you take my photo?','Which way to Central Park?'] },
      { name:'Street Performer',emoji:'🎸',x:400, y:360, speed:0,   patrol:false,dialogue:['Playing since 2am, bro.','Tip if you like it!','This corner is mine, move around.'] },
      { name:'Bootleg DVD Guy',  emoji:'💿',x:600, y:380, speed:0.2, patrol:true, dialogue:['Psst... movies? Five dolla.','Don\'t tell nobody.','I got everything. Disney. Marvel. Whatever.'] },
      { name:'NYPD Officer',     emoji:'👮',x:500, y:300, speed:0.8, patrol:true, dialogue:['Keep it moving.','No soliciting.','Everything alright here?'] },
      { name:'Naked Cowboy',     emoji:'🤠',x:350, y:350, speed:0,   patrol:false,dialogue:['Photo op, ten bucks!','Been doing this since \'99.','I\'m an NYC institution.'] },
    ],
    streetLabels: ['W 42nd St','W 43rd St','7th Ave','Broadway'],
    ambientSounds: ['🚗 Horn honking','📢 Street preacher','🎵 Busker playing','🚕 Cab screeching'],
  },
  "Wall Street": {
    bg: '#0A0A0C',
    streetColor: '#141416',
    sidewalkColor: '#1A1A1C',
    accent: '#C4A35A',
    ambiance: 'corporate',
    trafficLevel: 2,
    description: 'The financial heart of the world. Suits everywhere. Money moves silently.',
    buildings: [
      { x:50,  y:80,  w:150, h:280, floors:16, name:'NY Stock Exchange', color:'#0E0C08', roofColor:'#1A1610', type:'finance', icon:'🏛️', reqRep:0,   reqPay:0 },
      { x:260, y:50,  w:110, h:320, floors:18, name:'One Wall Street',   color:'#0A0A0A', roofColor:'#141414', type:'office',  icon:'🏦', reqRep:50,  reqPay:0 },
      { x:430, y:70,  w:120, h:290, floors:15, name:'JP Morgan HQ',      color:'#080C0E', roofColor:'#101618', type:'finance', icon:'💰', reqRep:70,  reqPay:0 },
      { x:610, y:60,  w:100, h:260, floors:14, name:'Federal Reserve',   color:'#0C0A08', roofColor:'#181410', type:'govt',    icon:'🏦', reqRep:80,  reqPay:0 },
      { x:760, y:90,  w:90,  h:180, floors:8,  name:'Charging Bull Plaza',color:'#101010',roofColor:'#1A1A1A', type:'landmark',icon:'🐂', reqRep:0,   reqPay:0 },
      { x:370, y:450, w:130, h:100, floors:2,  name:'Stone Street Bar',  color:'#100808', roofColor:'#1A1010', type:'food',    icon:'🍺', reqRep:0,   reqPay:0 },
    ],
    npcs: [
      { name:'Hedge Fund Kyle',  emoji:'💼', x:300, y:350, speed:0.9, patrol:true,  dialogue:['Crushed earnings today. Up 4%.','Never sleep. Always alpha.','You on Bloomberg or what?'] },
      { name:'Street Hawker',    emoji:'🗞️', x:500, y:380, speed:0,   patrol:false, dialogue:['WSJ! Get your WSJ!','Market open in 20!','Read all about it!'] },
      { name:'Lunch Cart Maria', emoji:'🌮', x:450, y:410, speed:0,   patrol:false, dialogue:['Best halal in the district.','Chicken over rice, $8.','You need energy for the hustle.'] },
      { name:'Security Guard',   emoji:'🛡️', x:100, y:300, speed:0.4, patrol:true,  dialogue:['Badge required past this point.','No photography of the Fed.','Move along.'] },
      { name:'Intern Marcus',    emoji:'👔', x:620, y:360, speed:0.7, patrol:true,  dialogue:['First week. So lost.','They made me get everyone coffee.','Is this normal?'] },
    ],
    streetLabels: ['Wall St','Broad St','Nassau St','Exchange Pl'],
    ambientSounds: ['📈 Market bell','☎️ Trader phones','🚖 Town cars'],
  },
  "Empire State Building": {
    bg: '#0C0C14',
    streetColor: '#141418',
    sidewalkColor: '#1C1C22',
    accent: '#4488FF',
    ambiance: 'iconic',
    trafficLevel: 2,
    description: 'Midtown\'s crown jewel. The mast glows over the city at night.',
    buildings: [
      { x:300, y:20,  w:200, h:400, floors:25, name:'Empire State Building',color:'#0E0E18',roofColor:'#141428', type:'landmark',icon:'🏙️', reqRep:0,   reqPay:0 },
      { x:80,  y:200, w:100, h:180, floors:9,  name:'Greens Restaurant',   color:'#0C100C', roofColor:'#141A14', type:'food',    icon:'🍽️', reqRep:0,   reqPay:0 },
      { x:580, y:180, w:110, h:160, floors:8,  name:'B&H Photo Video',     color:'#0A0A0C', roofColor:'#101014', type:'shop',    icon:'📷', reqRep:0,   reqPay:0 },
      { x:750, y:150, w:100, h:200, floors:10, name:'30 E 34th St Office', color:'#0C0C0C', roofColor:'#141414', type:'office',  icon:'🏢', reqRep:45,  reqPay:0 },
    ],
    npcs: [
      { name:'Tour Guide Lisa',  emoji:'🗽', x:350, y:450, speed:0.2, patrol:false, dialogue:['Built in 410 days!','Top deck is 1,454 ft.','Want a guided audio tour?'] },
      { name:'Postcard Vendor',  emoji:'🗺️', x:200, y:400, speed:0,   patrol:false, dialogue:['Postcards! Only $2!','Got magnets too.','Perfect for the family.'] },
      { name:'Guy on Phone',     emoji:'📱', x:450, y:350, speed:0.5, patrol:true,  dialogue:['I\'M AT THE EMPIRE STATE!','Hold on — it\'s so LOUD here.','Babe, I\'m literally here.'] },
    ],
    streetLabels: ['W 34th St','5th Ave','6th Ave','33rd St'],
    ambientSounds: ['📸 Camera clicks','🚕 Cab horns','👟 Tourist footsteps'],
  },
  "Central Park": {
    bg: '#080E08',
    streetColor: '#0E180E',
    sidewalkColor: '#101C10',
    accent: '#00933C',
    ambiance: 'peaceful',
    trafficLevel: 0,
    description: 'Manhattan\'s lungs. 843 acres of green in the concrete jungle.',
    buildings: [
      { x:100, y:300, w:120, h:80,  floors:1, name:'Bethesda Fountain',  color:'#0A140A', roofColor:'#121E12', type:'landmark',icon:'⛲', reqRep:0,  reqPay:0 },
      { x:700, y:350, w:110, h:70,  floors:1, name:'Belvedere Castle',   color:'#10140A', roofColor:'#1A1E12', type:'landmark',icon:'🏰', reqRep:0,  reqPay:0 },
      { x:350, y:150, w:100, h:60,  floors:1, name:'Tavern on the Green',color:'#0C1008', roofColor:'#141A10', type:'dining',  icon:'🌿', reqRep:30, reqPay:60 },
      { x:500, y:200, w:80,  h:50,  floors:1, name:'The Boathouse',      color:'#08100C', roofColor:'#101814', type:'dining',  icon:'🚣', reqRep:20, reqPay:40 },
      { x:200, y:450, w:90,  h:60,  floors:1, name:'Shakespeare Garden', color:'#0A0E08', roofColor:'#121610', type:'park',    icon:'🌹', reqRep:0,  reqPay:0 },
      { x:650, y:480, w:100, h:50,  floors:1, name:'Central Park Zoo',   color:'#080E08', roofColor:'#101610', type:'venue',   icon:'🦁', reqRep:0,  reqPay:15 },
    ],
    npcs: [
      { name:'Dog Walker',       emoji:'🐕', x:300, y:350, speed:0.6, patrol:true,  dialogue:['I walk 12 dogs a day.','Each one has a distinct personality.','$40/walk, you need one?'] },
      { name:'Rollerblader',     emoji:'🛼', x:500, y:300, speed:1.5, patrol:true,  dialogue:['WHOOOOO!','Out the way!','Central Park loop in 38 minutes flat!'] },
      { name:'Poet on a Bench',  emoji:'📝', x:200, y:380, speed:0,   patrol:false, dialogue:['Every tree here has seen more than us.','I wrote my first poem on this bench.','City hums if you listen.'] },
      { name:'Pretzel Cart Tony',emoji:'🥨', x:450, y:420, speed:0,   patrol:false, dialogue:['Best pretzels in the park!','$4 with mustard.','I been here 22 years.'] },
      { name:'Jogger Sarah',     emoji:'🏃', x:600, y:280, speed:1.8, patrol:true,  dialogue:['Loop 3 of 5!','Don\'t stop running!','...Morning!'] },
    ],
    streetLabels: ['The Mall','East Drive','West Drive','Transverse Rd'],
    ambientSounds: ['🐦 Birds singing','🌬️ Wind in leaves','🚲 Bikes whooshing'],
  },
  "Grand Central Terminal": {
    bg: '#0C0A08',
    streetColor: '#141210',
    sidewalkColor: '#1C1A18',
    accent: '#C4A35A',
    ambiance: 'iconic',
    trafficLevel: 2,
    description: 'The most beautiful train station in America. 44 platforms, one ceiling with stars.',
    buildings: [
      { x:200, y:80, w:500, h:300, floors:5, name:'Grand Central Terminal',color:'#100E08',roofColor:'#1A1610', type:'transit', icon:'🚆', reqRep:0,  reqPay:0 },
      { x:100, y:300,w:80,  h:120, floors:5, name:'Campbell Apartment',  color:'#0C0A08', roofColor:'#141210', type:'bar',     icon:'🍸', reqRep:50, reqPay:30 },
      { x:720, y:200,w:110, h:180, floors:8, name:'Grand Hyatt Hotel',   color:'#0A0808', roofColor:'#121010', type:'hotel',   icon:'🏨', reqRep:55, reqPay:250 },
      { x:750, y:400,w:100, h:80,  floors:2, name:'Oyster Bar',          color:'#0C0E08', roofColor:'#141610', type:'dining',  icon:'🦪', reqRep:40, reqPay:45 },
    ],
    npcs: [
      { name:'Commuter Dan',    emoji:'🏃', x:350, y:350, speed:1.2, patrol:true,  dialogue:['Metro-North in 4 minutes!','Move or lose it.','Every day. Same time. Same train.'] },
      { name:'Whispering Spot', emoji:'🎯', x:250, y:250, speed:0,   patrol:false, dialogue:['*whispers* The arches create an acoustic whispering gallery.','Stand in the corner, say something.'] },
      { name:'Lost Tourist',    emoji:'😵', x:500, y:300, speed:0.2, patrol:true,  dialogue:['Which track is the Harlem Line?','I\'ve been lost for 20 minutes.','This place is enormous.'] },
      { name:'Shoeshine Joe',   emoji:'👞', x:150, y:380, speed:0,   patrol:false, dialogue:['Polish? Five minutes, $12.','Your shoes tell your story, boss.','I can fix those.'] },
    ],
    streetLabels: ['42nd St','Park Ave','Vanderbilt Ave','Lexington Ave'],
    ambientSounds: ['🔔 Departure bells','📢 Train announcements','👣 Echoing footsteps'],
  },
  "Brooklyn Bridge Park": {
    bg: '#080A10',
    streetColor: '#10121A',
    sidewalkColor: '#181A22',
    accent: '#8B6543',
    ambiance: 'scenic',
    trafficLevel: 1,
    description: 'Under the Brooklyn Bridge. The best view of the Manhattan skyline exists here.',
    buildings: [
      { x:100, y:150, w:600, h:40,  floors:0, name:'Brooklyn Bridge',    color:'#1A1210', roofColor:'#241A18', type:'landmark',icon:'🌉', reqRep:0,  reqPay:0 },
      { x:150, y:350, w:130, h:80,  floors:2, name:'Time Out Market',    color:'#0C0C10', roofColor:'#141418', type:'food',    icon:'🍽️', reqRep:0,  reqPay:0 },
      { x:550, y:350, w:120, h:90,  floors:2, name:'Jane\'s Carousel',   color:'#100808', roofColor:'#1A1010', type:'venue',   icon:'🎠', reqRep:0,  reqPay:5 },
      { x:700, y:300, w:90,  h:120, floors:4, name:'1 Hotel Brooklyn',   color:'#080C08', roofColor:'#101410', type:'hotel',   icon:'🌿', reqRep:70, reqPay:400 },
    ],
    npcs: [
      { name:'Photographer Mike',emoji:'📷', x:400, y:280, speed:0.3, patrol:true,  dialogue:['Golden hour here is unreal.','You\'re blocking the shot, bro.','Best skyline in the world.'] },
      { name:'Couple on Bench', emoji:'💑', x:300, y:380, speed:0,   patrol:false, dialogue:['We got engaged here.','This view never gets old.','*too busy kissing to respond*'] },
      { name:'Skateboarder',    emoji:'🛹', x:600, y:400, speed:1.4, patrol:true,  dialogue:['Yo watch out!','This whole promenade is a skate park.','YEET!'] },
      { name:'Fisherman Carl',  emoji:'🎣', x:200, y:430, speed:0,   patrol:false, dialogue:['Been fishing here 30 years.','River got cleaner since the \'80s.','Don\'t eat what you catch tho.'] },
    ],
    streetLabels: ['Brooklyn Bridge Blvd','Adams St','Furman St'],
    ambientSounds: ['🌊 River lapping','🚗 Bridge traffic','🌬️ Harbor wind'],
  },
  "Harlem": {
    bg: '#0A0808',
    streetColor: '#141010',
    sidewalkColor: '#1C1818',
    accent: '#8B4513',
    ambiance: 'vibrant',
    trafficLevel: 2,
    description: 'Jazz, soul food, culture. The cultural capital of Black America.',
    buildings: [
      { x:80,  y:100, w:130, h:180, floors:8, name:'Apollo Theater',     color:'#100A08', roofColor:'#1A1210', type:'venue',   icon:'🎤', reqRep:0,  reqPay:0 },
      { x:280, y:120, w:110, h:160, floors:7, name:'Sylvia\'s Restaurant',color:'#0E0808', roofColor:'#181010', type:'dining',  icon:'🍗', reqRep:0,  reqPay:0 },
      { x:450, y:100, w:100, h:180, floors:8, name:'Strivers Row',       color:'#0C0A08', roofColor:'#141210', type:'landmark',icon:'🏡', reqRep:30, reqPay:0 },
      { x:640, y:90,  w:120, h:200, floors:9, name:'Harlem YMCA',        color:'#080C0A', roofColor:'#101410', type:'gym',     icon:'💪', reqRep:0,  reqPay:10 },
      { x:820, y:110, w:100, h:170, floors:7, name:'Red Rooster',        color:'#100808', roofColor:'#1A1010', type:'dining',  icon:'🍷', reqRep:45, reqPay:50 },
    ],
    npcs: [
      { name:'Jazz Musician Ray', emoji:'🎷', x:300, y:350, speed:0,   patrol:false, dialogue:['Bird played here. Monk. Miles.','Feel the rhythm of 125th.','Come hear us play on Friday.'] },
      { name:'Auntie on Stoop',   emoji:'👵', x:500, y:380, speed:0,   patrol:false, dialogue:['Chile, where you from?','This block been the same 40 years.','You hungry? I\'ll fix a plate.'] },
      { name:'Barber Dre',        emoji:'✂️', x:200, y:360, speed:0,   patrol:false, dialogue:['Fresh cuts, $25.','Barbershop been here since \'92.','We talk everything in here.'] },
      { name:'Preacher Jones',    emoji:'✝️', x:680, y:340, speed:0.2, patrol:true,  dialogue:['God bless you, young one.','This community is resilient.','125th Street is sacred ground.'] },
    ],
    streetLabels: ['125th St','Malcolm X Blvd','Adam Clayton Powell Jr Blvd'],
    ambientSounds: ['🎷 Jazz drifting','👟 Sneaker squeaks','📻 Old school R&B'],
  },
  "SoHo": {
    bg: '#0C0A08',
    streetColor: '#161410',
    sidewalkColor: '#201E1C',
    accent: '#8B00FF',
    ambiance: 'trendy',
    trafficLevel: 2,
    description: 'Cast-iron buildings turned luxury boutiques. Art, fashion, brunch.',
    buildings: [
      { x:80,  y:100, w:140, h:160, floors:6, name:'Prada SoHo',        color:'#0A0808', roofColor:'#121010', type:'shop',    icon:'👜', reqRep:60, reqPay:0 },
      { x:280, y:80,  w:120, h:180, floors:7, name:'McNally Jackson Books',color:'#080808',roofColor:'#101010',type:'shop',    icon:'📚', reqRep:0,  reqPay:0 },
      { x:450, y:90,  w:110, h:170, floors:7, name:'The Mercer Hotel',  color:'#0C0808', roofColor:'#141010', type:'hotel',   icon:'🏨', reqRep:80, reqPay:500 },
      { x:640, y:100, w:130, h:160, floors:6, name:'Spring Street Bar', color:'#0A0608', roofColor:'#12100A', type:'bar',     icon:'🍸', reqRep:20, reqPay:0 },
      { x:820, y:90,  w:110, h:175, floors:7, name:'Balthazar',        color:'#100808', roofColor:'#181010', type:'dining',  icon:'🥐', reqRep:35, reqPay:45 },
    ],
    npcs: [
      { name:'Fashion Influencer', emoji:'📱', x:350, y:360, speed:0.4, patrol:true,  dialogue:['Is this GRWM content?','The aesthetic here is SO curated.','My followers are gonna die.'] },
      { name:'Gallery Owner',      emoji:'🖼️', x:500, y:380, speed:0,   patrol:false, dialogue:['This piece is $40k. Firm.','Art is the only real currency.','Opening tonight, 7pm.'] },
      { name:'Delivery Cyclist',   emoji:'🚲', x:200, y:320, speed:1.6, patrol:true,  dialogue:['OUTTA THE WAY!','45 deliveries, 6 hours!','This city would stop without us.'] },
      { name:'Brunch Line Guy',    emoji:'⏳', x:600, y:400, speed:0,   patrol:false, dialogue:['Been waiting 2 hours for eggs.','The avo toast is allegedly worth it.','This is my life now.'] },
    ],
    streetLabels: ['Spring St','Prince St','Mercer St','Broadway'],
    ambientSounds: ['🛍️ Shopping bags','👠 Heels on cobblestone','☕ Coffee shop chatter'],
  },
  "default": {
    bg: '#0A0A0A',
    streetColor: '#141414',
    sidewalkColor: '#1C1C1C',
    accent: '#555555',
    ambiance: 'normal',
    trafficLevel: 1,
    description: 'A neighborhood in New York City.',
    buildings: [
      { x:100, y:100, w:120, h:160, floors:6, name:'Local Deli',        color:'#0C0C0A', roofColor:'#141410', type:'food',    icon:'🥪', reqRep:0,  reqPay:0 },
      { x:350, y:80,  w:130, h:200, floors:9, name:'Apartment Block',   color:'#0A0A0C', roofColor:'#121214', type:'housing', icon:'🏢', reqRep:20, reqPay:0 },
      { x:600, y:100, w:110, h:170, floors:7, name:'Corner Pharmacy',   color:'#080C08', roofColor:'#101410', type:'shop',    icon:'💊', reqRep:0,  reqPay:0 },
      { x:800, y:90,  w:90,  h:160, floors:7, name:'Subway Station',    color:'#0A0A10', roofColor:'#121218', type:'transit', icon:'🚇', reqRep:0,  reqPay:0 },
    ],
    npcs: [
      { name:'Old Man Lou',   emoji:'🧓', x:400, y:350, speed:0.2, patrol:false, dialogue:['This neighborhood used to be different.','Everything\'s changing too fast.','You new here?'] },
      { name:'Bodega Cat',    emoji:'🐱', x:250, y:380, speed:0.4, patrol:true,  dialogue:['...','*stares at you*','*knocks something off the shelf*'] },
      { name:'Mail Carrier',  emoji:'📬', x:550, y:340, speed:0.8, patrol:true,  dialogue:['Package for...anyone.','The Postal Service never sleeps.','Sign here, please.'] },
    ],
    streetLabels: ['Main Ave','Cross St','Local Blvd'],
    ambientSounds: ['🚗 Traffic','🐦 City birds','📻 Radio from window'],
  }
};

// ── BUILDING INTERIOR CONFIGS ─────────────────────────────────────────
const BUILDING_INTERIORS = {
  'office': {
    bg: '#0C0C10',
    icon: '🖥️',
    description: 'Corporate corridors. Fluorescent lights. Someone\'s always on a Zoom call.',
    actions: (bldg) => {
      const acts = [];
      if (!G.job) acts.push({ label:'💼 Check Job Listings', fn: 'openJobBoard' });
      if (G.job) acts.push({ label:'⚡ Work a Shift (+pay)', fn: 'exploreWork' });
      acts.push({ label:'🤝 Network in Lobby (+2 rep)', fn: 'exploreNetwork' });
      return acts;
    }
  },
  'finance': {
    bg: '#0A0A08',
    icon: '💰',
    description: 'Marble floors. Suits. The smell of money and anxiety.',
    actions: (bldg) => {
      const acts = [{ label:'📈 Check Stocks', fn: 'openStockMarket' }];
      if (G.rating >= 50) acts.push({ label:'🏦 Open Investment Account', fn: 'exploreInvest' });
      if (G.savings > 0) acts.push({ label:'💳 Access Savings', fn: 'withdrawBank' });
      return acts;
    }
  },
  'food': {
    bg: '#100808',
    icon: '🍽️',
    description: 'Smells amazing in here. Your stomach growls.',
    actions: (bldg) => [
      { label:'🥙 Buy Meal ($12, +5 energy)', fn: 'exploreBuyMeal' },
      { label:'☕ Get Coffee ($4, +2 rep)', fn: 'exploreBuyCoffee' },
      { label:'👤 Talk to Locals (+1 rep)', fn: 'talkToNPC' },
    ]
  },
  'dining': {
    bg: '#0E0808',
    icon: '🍷',
    description: 'White tablecloths. A maitre d\' eyes you judgmentally.',
    actions: (bldg) => {
      const acts = [];
      if (G.cash >= bldg.reqPay || bldg.reqPay === 0) {
        acts.push({ label:`🍽️ Dine Here ($${bldg.reqPay || 25})`, fn: 'exploreDine' });
        acts.push({ label:'👥 Business Lunch (+5 rep, $' + (bldg.reqPay || 25) + ')', fn: 'exploreBusinessLunch' });
      } else {
        acts.push({ label:`🚫 Too Expensive ($${bldg.reqPay} needed)`, fn: null });
      }
      return acts;
    }
  },
  'hotel': {
    bg: '#0C0A10',
    icon: '🛎️',
    description: 'Hushed lobby. Marble everywhere. Doorman sizing you up.',
    actions: (bldg) => {
      const acts = [];
      if (G.cash >= bldg.reqPay) {
        acts.push({ label:`🛏️ Book a Night ($${bldg.reqPay})`, fn: 'exploreBookHotel' });
      } else {
        acts.push({ label:`🚫 $${bldg.reqPay}/night — Need more cash`, fn: null });
      }
      acts.push({ label:'☕ Hotel Bar (+networking)', fn: 'exploreHotelBar' });
      return acts;
    }
  },
  'shop': {
    bg: '#0A0808',
    icon: '🛍️',
    description: 'The racks are packed. Prices on tags that make you blink.',
    actions: (bldg) => [
      { label:'🛒 Browse Items', fn: 'openShop' },
      { label:'👔 Try On Outfits (+5 style rep)', fn: 'exploreShop' },
    ]
  },
  'venue': {
    bg: '#0A0A10',
    icon: '🎭',
    description: 'Spotlights. Music. The energy is electric in here.',
    actions: (bldg) => {
      const acts = [];
      if (G.cash >= (bldg.reqPay || 0)) {
        acts.push({ label:`🎭 Buy Ticket ($${bldg.reqPay || 0})`, fn: 'exploreVenue' });
      }
      acts.push({ label:'👀 Hang by the Door (free)', fn: 'exploreHangOutside' });
      if (G.rating >= 60) acts.push({ label:'🎤 VIP Access (Rep 60+ req)', fn: 'exploreVIP' });
      return acts;
    }
  },
  'bar': {
    bg: '#080808',
    icon: '🍺',
    description: 'Dark and loud. Somebody\'s always having a crisis in here.',
    actions: (bldg) => [
      { label:'🍺 Buy a Drink ($8)', fn: 'exploreDrink' },
      { label:'🎲 Shoot Pool (+3 rep)', fn: 'exploreBilliards' },
      { label:'👥 Network at Bar (+4 rep, risky)', fn: 'exploreBarNetwork' },
    ]
  },
  'gym': {
    bg: '#080C08',
    icon: '💪',
    description: 'The smell of effort. Metal clanging. Someone grunting too loud.',
    actions: (bldg) => [
      { label:'🏋️ Work Out (+5 rep, skip 2hrs)', fn: 'exploreGym' },
      { label:'🤸 Cardio Session (+3 rep)', fn: 'exploreCardio' },
    ]
  },
  'transit': {
    bg: '#0A0A14',
    icon: '🚇',
    description: 'The subway never sleeps. It smells like subway. You know the smell.',
    actions: (bldg) => {
      const acts = [];
      if (!G.hasMetroCard && !G.hasMonthlyMetro) {
        acts.push({ label:'🎫 Buy MetroCard ($2.90)', fn: 'exploreBuyMetro' });
      }
      acts.push({ label:'🗺️ Plan a Route', fn: 'travelSubway' });
      acts.push({ label:'👀 People Watch (+1 rep)', fn: 'explorePeopleWatch' });
      return acts;
    }
  },
  'landmark': {
    bg: '#0C0A08',
    icon: '🏛️',
    description: 'History breathes here. Every corner has a story.',
    actions: (bldg) => [
      { label:'📸 Take a Photo (+1 rep)', fn: 'exploreLandmark' },
      { label:'📖 Read the History (+2 rep)', fn: 'exploreHistory' },
    ]
  },
  'govt': {
    bg: '#0A0C0E',
    icon: '🏛️',
    description: 'Stern-faced officials. Security scanners. American bureaucracy.',
    actions: (bldg) => {
      const acts = [{ label:'📋 Check Permits & Licenses', fn: 'exploreGovt' }];
      if (G.wantedLevel > 0) acts.push({ label:'⚖️ Clear Warrants (risky)', fn: 'exploreClearWarrants' });
      return acts;
    }
  },
  'park': {
    bg: '#080E08',
    icon: '🌿',
    description: 'A pocket of green. The city feels far away for a moment.',
    actions: () => [
      { label:'🌿 Sit & Relax (+3 rep)', fn: 'exploreRelax' },
      { label:'📚 Read a Book (+2 rep)', fn: 'exploreRead' },
    ]
  },
  'housing': {
    bg: '#0C0C0E',
    icon: '🏠',
    description: 'Apartments stacked on apartments. Thin walls. Everyone knows everyone\'s business.',
    actions: (bldg) => [
      { label:'🏠 Check Rental Listings', fn: 'openHousingMenu' },
      { label:'💬 Ask Neighbors (+1 rep)', fn: 'exploreNeighbors' },
    ]
  },
};

// ── GAME ACTION FUNCTIONS FOR INTERIORS ──────────────────────────────
window.exploreWork = function() {
  doWorkDay();
  closeInteriorModal();
};
window.exploreNetwork = function() {
  addRating(2);
  addLog('Networked in the lobby. +2 rep.', 'good');
  showNotif('+2 REP: Networked!', 'green');
  closeInteriorModal();
};
window.exploreInvest = function() {
  openStockMarket();
  closeInteriorModal();
};
window.exploreBuyMeal = function() {
  if (G.cash < 12) { showNotif('Not enough cash!', 'orange'); return; }
  spendCash(12);
  addRating(1);
  addLog('Had a meal. +1 rep, -$12.', 'normal');
  showNotif('Ate well. +1 rep.', 'green');
  closeInteriorModal();
};
window.exploreBuyCoffee = function() {
  if (G.cash < 4) { showNotif('Not enough cash!', 'orange'); return; }
  spendCash(4);
  addRating(2);
  addLog('Got coffee. Feeling alert. +2 rep.', 'normal');
  showNotif('Caffeinated. +2 rep.', 'green');
  closeInteriorModal();
};
window.exploreDine = function() {
  const modal = document.getElementById('ex-interior-modal');
  if (!modal) return;
  const bldg = modal._bldg;
  const cost = bldg ? (bldg.reqPay || 25) : 25;
  if (G.cash < cost) { showNotif('Not enough cash!', 'orange'); return; }
  spendCash(cost);
  addRating(4);
  addLog(`Dined at ${bldg ? bldg.name : 'restaurant'}. +4 rep, -$${cost}.`, 'good');
  showNotif(`+4 REP: Fine dining!`, 'green');
  closeInteriorModal();
};
window.exploreBusinessLunch = function() {
  const modal = document.getElementById('ex-interior-modal');
  const bldg = modal ? modal._bldg : null;
  const cost = bldg ? (bldg.reqPay || 25) : 25;
  if (G.cash < cost) { showNotif('Not enough cash!', 'orange'); return; }
  spendCash(cost);
  addRating(5);
  addLog(`Business lunch. +5 rep, -$${cost}.`, 'good');
  showNotif('+5 REP: Power lunch!', 'green');
  closeInteriorModal();
};
window.exploreBookHotel = function() {
  const modal = document.getElementById('ex-interior-modal');
  const bldg = modal ? modal._bldg : null;
  const cost = bldg ? bldg.reqPay : 200;
  if (G.cash < cost) { showNotif('Not enough cash!', 'orange'); return; }
  spendCash(cost);
  addRating(5);
  addLog(`Checked into ${bldg ? bldg.name : 'hotel'}. +5 rep, -$${cost}.`, 'good');
  showNotif(`Checked in. +5 REP.`, 'green');
  closeInteriorModal();
};
window.exploreHotelBar = function() {
  addRating(3);
  addLog('Hung at the hotel bar. Met some people. +3 rep.', 'good');
  showNotif('+3 REP: Networking!', 'green');
  closeInteriorModal();
};
window.exploreShop = function() {
  addRating(5);
  addLog('Tried on outfits. Looking fresh. +5 style rep.', 'good');
  showNotif('+5 REP: Style points!', 'green');
  closeInteriorModal();
};
window.exploreVenue = function() {
  const modal = document.getElementById('ex-interior-modal');
  const bldg = modal ? modal._bldg : null;
  const cost = bldg ? (bldg.reqPay || 0) : 0;
  if (cost > 0 && G.cash < cost) { showNotif('Not enough cash!', 'orange'); return; }
  if (cost > 0) spendCash(cost);
  addRating(6);
  addLog(`Attended event at ${bldg ? bldg.name : 'venue'}. +6 rep.`, 'good');
  showNotif('+6 REP: Cultural experience!', 'green');
  closeInteriorModal();
};
window.exploreHangOutside = function() {
  addRating(1);
  addLog('Hung outside the venue. Caught some vibes. +1 rep.', 'normal');
  closeInteriorModal();
};
window.exploreVIP = function() {
  if (G.rating < 60) { showNotif('Need 60+ rep for VIP!', 'orange'); return; }
  addRating(10);
  addLog('VIP access. Everyone knows your name. +10 rep.', 'good');
  showNotif('+10 REP: VIP!', 'green');
  closeInteriorModal();
};
window.exploreDrink = function() {
  if (G.cash < 8) { showNotif('Not enough cash!', 'orange'); return; }
  spendCash(8);
  addRating(2);
  addLog('Had a drink. NYC prices. +2 rep, -$8.', 'normal');
  closeInteriorModal();
};
window.exploreBilliards = function() {
  addRating(3);
  addLog('Shot pool with strangers. Won two games. +3 rep.', 'good');
  showNotif('+3 REP: Pool shark!', 'green');
  closeInteriorModal();
};
window.exploreBarNetwork = function() {
  if (Math.random() > 0.4) {
    addRating(4);
    addLog('Met a great contact at the bar. +4 rep.', 'good');
    showNotif('+4 REP: New contact!', 'green');
  } else {
    addRating(-2);
    addLog('Bad bar encounter. Awkward. -2 rep.', 'bad');
    showNotif('-2 REP: Rough night.', 'orange');
  }
  closeInteriorModal();
};
window.exploreGym = function() {
  addRating(5);
  advanceHours(2);
  addLog('Hard workout. Looking good. +5 rep.', 'good');
  showNotif('+5 REP: Gains!', 'green');
  closeInteriorModal();
};
window.exploreCardio = function() {
  addRating(3);
  addLog('30 min cardio. Clear head. +3 rep.', 'good');
  closeInteriorModal();
};
window.exploreBuyMetro = function() {
  if (G.cash < 2.90) { showNotif('Need $2.90!', 'orange'); return; }
  spendCash(2.90);
  G.hasMetroCard = true;
  updateMetroStatus();
  addLog('Bought a MetroCard. $2.90.', 'money');
  showNotif('MetroCard purchased!', 'green');
  closeInteriorModal();
};
window.explorePeopleWatch = function() {
  addRating(1);
  addLog('People watching in the subway. Pure NYC. +1 rep.', 'normal');
  closeInteriorModal();
};
window.exploreLandmark = function() {
  addRating(1);
  addLog('Got the photo. For the gram. +1 rep.', 'normal');
  closeInteriorModal();
};
window.exploreHistory = function() {
  addRating(2);
  addLog('Read up on the history. Fascinating. +2 rep.', 'good');
  closeInteriorModal();
};
window.exploreGovt = function() {
  addLog('Checked permits. Nothing interesting for now.', 'normal');
  closeInteriorModal();
};
window.exploreClearWarrants = function() {
  if (G.wantedLevel > 0) {
    if (Math.random() > 0.5) {
      G.wantedLevel = Math.max(0, G.wantedLevel - 1);
      updateWantedDisplay();
      addLog('Resolved one warrant. Wanted level reduced.', 'good');
      showNotif('Warrant cleared!', 'green');
    } else {
      addLog('Tried to clear warrant but got flagged. Be careful.', 'bad');
      G.wantedLevel = Math.min(5, G.wantedLevel + 1);
      updateWantedDisplay();
    }
  }
  closeInteriorModal();
};
window.exploreRelax = function() {
  addRating(3);
  addLog('Sat in the park. Cleared your head. +3 rep.', 'good');
  closeInteriorModal();
};
window.exploreRead = function() {
  addRating(2);
  addLog('Read in the park. Manhattan skyline as backdrop. +2 rep.', 'good');
  closeInteriorModal();
};
window.exploreNeighbors = function() {
  addRating(1);
  addLog('Chatted with neighbors. Decent folk. +1 rep.', 'normal');
  closeInteriorModal();
};

// ── INTERIOR MODAL ────────────────────────────────────────────────────
function openBuildingInterior(bldg, neighborhoodName) {
  const locked = bldg.reqRep > G.rating;
  const interiorType = bldg.type || 'landmark';
  const cfg = BUILDING_INTERIORS[interiorType] || BUILDING_INTERIORS['landmark'];

  let existing = document.getElementById('ex-interior-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'ex-interior-modal';
  modal._bldg = bldg;
  modal.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.92);z-index:9999;
    display:flex;align-items:center;justify-content:center;
    font-family:'IBM Plex Mono',monospace;
  `;

  if (locked) {
    modal.innerHTML = `
      <div style="background:#0A0A0A;border:1px solid #2A2A2A;max-width:420px;width:90%;padding:32px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">${bldg.icon}</div>
        <div style="font-size:14px;color:#FFD100;letter-spacing:3px;margin-bottom:8px;">${bldg.name.toUpperCase()}</div>
        <div style="font-size:10px;color:#555;margin-bottom:24px;">ACCESS DENIED</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px;">Requires: <span style="color:#E8001A">${bldg.reqRep} REP</span>${bldg.reqPay > 0 ? ` + <span style="color:#C4A35A">$${bldg.reqPay}</span>` : ''}</div>
        <div style="font-size:10px;color:#555;margin-bottom:24px;">Your rep: ${Math.floor(G.rating)}</div>
        <div style="font-size:9px;color:#333;margin-bottom:24px;">"Come back when you're somebody."</div>
        <button onclick="closeInteriorModal()" style="background:#1A1A1A;color:#888;border:1px solid #333;padding:10px 24px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;">LEAVE</button>
      </div>
    `;
  } else {
    const actions = cfg.actions(bldg);
    const actionBtns = actions.map(a => a.fn
      ? `<button onclick="${a.fn}()" style="background:#141414;color:#CCC;border:1px solid #333;padding:10px 14px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;text-align:left;width:100%;margin-bottom:6px;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#FFD100'" onmouseout="this.style.borderColor='#333'">${a.label}</button>`
      : `<button style="background:#0A0A0A;color:#444;border:1px solid #222;padding:10px 14px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;text-align:left;width:100%;margin-bottom:6px;cursor:not-allowed;">${a.label}</button>`
    ).join('');

    modal.innerHTML = `
      <div style="background:#0C0C0C;border:1px solid #2A2A2A;max-width:460px;width:90%;padding:0;overflow:hidden;">
        <div style="background:${cfg.bg};padding:24px;border-bottom:1px solid #1A1A1A;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
            <div style="font-size:40px;">${bldg.icon}</div>
            <div>
              <div style="font-size:13px;color:#FFD100;letter-spacing:3px;font-weight:700;">${bldg.name.toUpperCase()}</div>
              <div style="font-size:9px;color:#555;letter-spacing:2px;">${interiorType.toUpperCase()} • ${(bldg.floors || 1)} FL${bldg.floors > 1 ? 'OORS' : 'OOR'}</div>
              <div style="font-size:9px;color:#666;margin-top:4px;">${neighborhoodName}</div>
            </div>
          </div>
          <div style="font-size:10px;color:#888;line-height:1.6;font-style:italic;">"${cfg.description}"</div>
        </div>
        <div style="padding:20px;">
          <div style="font-size:9px;color:#444;letter-spacing:2px;margin-bottom:12px;">AVAILABLE ACTIONS</div>
          ${actionBtns}
          <button onclick="closeInteriorModal()" style="background:transparent;color:#555;border:1px solid #222;padding:8px 14px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:2px;width:100%;margin-top:4px;" onmouseover="this.style.color='#888'" onmouseout="this.style.color='#555'">← LEAVE BUILDING [ESC]</button>
        </div>
      </div>
    `;
  }

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeInteriorModal(); });
}

window.closeInteriorModal = function() {
  const m = document.getElementById('ex-interior-modal');
  if (m) m.remove();
  if (EX.active) EX.canvas && EX.canvas.focus();
};

// ── OPEN EXPLORE MODE ─────────────────────────────────────────────────
function openExplore(locationName) {
  if (EX.active) return;
  EX.active = true;
  EX.ticker = 0;

  // Get or build neighborhood config
  let cfg = NEIGHBORHOOD_CONFIGS[locationName] || NEIGHBORHOOD_CONFIGS['default'];
  EX.neighborhood = { ...cfg, name: locationName };

  // Setup NPC instances
  EX.npcs = cfg.npcs.map((n, i) => ({
    ...n,
    id: i,
    wx: n.x, wy: n.y,
    patrolBase: { x: n.x, y: n.y },
    patrolDir: Math.random() * Math.PI * 2,
    patrolTimer: 0,
    facing: 'down',
    animFrame: 0, animTick: 0,
    talking: false,
  }));

  // Setup buildings
  EX.buildings = cfg.buildings.map((b, i) => ({ ...b, id: i }));

  // Place player at entrance
  EX.px = 400; EX.py = 480;
  EX.pVelX = 0; EX.pVelY = 0;
  EX.pFacing = 'up';
  EX.camX = 0; EX.camY = 0;
  EX.nearbyObj = null;
  EX.dialogueActive = false;
  EX.particles = [];
  EX.cars = [];
  EX.pedestrians = [];

  // Spawn ambient cars based on traffic level
  for (let i = 0; i < (cfg.trafficLevel || 1) * 3; i++) {
    EX.cars.push({
      x: Math.random() * 900,
      y: [320, 430, 480][i % 3] || 400,
      speed: (0.8 + Math.random() * 1.2) * (Math.random() > 0.5 ? 1 : -1),
      emoji: ['🚕','🚗','🚙','🚌','🚚'][Math.floor(Math.random() * 5)],
      lane: i % 3,
    });
  }

  // Spawn random pedestrians
  for (let i = 0; i < 8; i++) {
    EX.pedestrians.push({
      x: 100 + Math.random() * 800,
      y: 200 + Math.random() * 350,
      speed: 0.3 + Math.random() * 0.6,
      dir: Math.random() * Math.PI * 2,
      emoji: ['🧑','👩','🧔','👴','👶','🧒','👩‍💼','👨‍🦱'][Math.floor(Math.random() * 8)],
      timer: Math.random() * 200,
    });
  }

  // Build explore screen
  buildExploreDOM();
  startExploreLoop();

  // Show intro message
  setTimeout(() => {
    showExploreNotif(`📍 ${locationName}`, 'yellow', 2500);
    const sound = cfg.ambientSounds ? cfg.ambientSounds[Math.floor(Math.random() * cfg.ambientSounds.length)] : '';
    if (sound) setTimeout(() => showExploreNotif(sound, 'muted', 2000), 1500);
  }, 400);

  addLog(`Exploring ${locationName} on foot.`, 'info');
}

function buildExploreDOM() {
  let existing = document.getElementById('explore-screen');
  if (existing) existing.remove();

  const screen = document.createElement('div');
  screen.id = 'explore-screen';
  screen.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:#000;z-index:8000;overflow:hidden;
    font-family:'IBM Plex Mono',monospace;
  `;

  screen.innerHTML = `
    <canvas id="explore-canvas" style="display:block;width:100%;height:100%;image-rendering:pixelated;"></canvas>
    <div id="explore-hud" style="position:absolute;top:0;left:0;right:0;pointer-events:none;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px;">
        <div style="background:rgba(0,0,0,0.85);border:1px solid #222;padding:8px 14px;">
          <div style="font-size:9px;color:#FFD100;letter-spacing:3px;" id="ex-location-name">LOADING...</div>
          <div style="font-size:8px;color:#555;margin-top:2px;" id="ex-location-desc"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;pointer-events:all;">
          <div style="background:rgba(0,0,0,0.85);border:1px solid #222;padding:6px 12px;font-size:9px;color:#888;">
            REP: <span style="color:#FFD100" id="ex-rep">0</span> &nbsp; CASH: <span style="color:#00C853" id="ex-cash">$0</span>
          </div>
          <button id="ex-close-btn" style="background:#0A0A0A;border:1px solid #333;color:#888;padding:8px 14px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:2px;">✕ MAP [ESC]</button>
        </div>
      </div>
    </div>
    <div id="explore-controls" style="position:absolute;bottom:0;left:0;right:0;pointer-events:none;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:10px 16px;">
        <div style="background:rgba(0,0,0,0.8);border:1px solid #1A1A1A;padding:6px 12px;font-size:8px;color:#444;letter-spacing:1px;">
          WASD / ARROW KEYS = MOVE &nbsp;|&nbsp; SHIFT = SPRINT &nbsp;|&nbsp; E / SPACE = INTERACT &nbsp;|&nbsp; ESC = MAP
        </div>
        <div id="ex-nearby-prompt" style="background:rgba(0,0,0,0.9);border:1px solid #FFD100;padding:8px 16px;font-size:10px;color:#FFD100;letter-spacing:2px;display:none;">
          [E] ENTER / INTERACT
        </div>
      </div>
    </div>
    <div id="explore-notif-area" style="position:absolute;top:64px;right:16px;pointer-events:none;"></div>
    <div id="explore-dialogue" style="display:none;position:absolute;bottom:60px;left:50%;transform:translateX(-50%);width:520px;max-width:90vw;background:rgba(0,0,0,0.96);border:1px solid #2A2A2A;padding:16px 20px;">
      <div style="font-size:9px;color:#FFD100;letter-spacing:2px;margin-bottom:8px;" id="ex-dialogue-name">NPC</div>
      <div style="font-size:11px;color:#DDD;line-height:1.6;" id="ex-dialogue-text"></div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button id="ex-dialogue-next" style="background:#141414;color:#888;border:1px solid #333;padding:6px 14px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:1px;">NEXT [E]</button>
        <button id="ex-dialogue-close" onclick="closeExploreDialogue()" style="background:transparent;color:#444;border:1px solid #1A1A1A;padding:6px 14px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:1px;">LEAVE [ESC]</button>
      </div>
    </div>
  `;

  document.body.appendChild(screen);

  // Setup canvas
  const canvas = document.getElementById('explore-canvas');
  canvas.width = screen.offsetWidth || 1000;
  canvas.height = screen.offsetHeight || 700;
  EX.canvas = canvas;
  EX.ctx = canvas.getContext('2d');
  EX.W = canvas.width;
  EX.H = canvas.height;

  // Camera follows player — center of world = center of canvas
  EX.camX = EX.px - EX.W / 2;
  EX.camY = EX.py - EX.H / 2;

  // Set HUD info
  document.getElementById('ex-location-name').textContent = '📍 ' + EX.neighborhood.name.toUpperCase();
  document.getElementById('ex-location-desc').textContent = EX.neighborhood.description;
  updateExploreHUD();

  // Close button
  document.getElementById('ex-close-btn').addEventListener('click', closeExplore);

  // Dialogue next
  document.getElementById('ex-dialogue-next').addEventListener('click', advanceDialogue);

  // Canvas focus for keyboard
  canvas.setAttribute('tabindex', '0');
  canvas.focus();

  // Keys
  canvas.addEventListener('keydown', onExploreKey);
  canvas.addEventListener('keyup',   e => { EX.keys[e.key] = false; });
  // Also listen globally
  document.addEventListener('keydown', onExploreGlobalKey);

  window.addEventListener('resize', () => {
    if (!EX.active) return;
    canvas.width  = screen.offsetWidth;
    canvas.height = screen.offsetHeight;
    EX.W = canvas.width; EX.H = canvas.height;
  });
}

function updateExploreHUD() {
  const rep  = document.getElementById('ex-rep');
  const cash = document.getElementById('ex-cash');
  if (rep)  rep.textContent  = Math.floor(G.rating);
  if (cash) cash.textContent = '$' + G.cash.toFixed(0);
}

function onExploreKey(e) {
  EX.keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D',' '].includes(e.key)) {
    e.preventDefault();
  }
  if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && !EX.dialogueActive) {
    handleExploreInteract();
  }
  if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && EX.dialogueActive) {
    advanceDialogue();
  }
}

function onExploreGlobalKey(e) {
  if (!EX.active) return;
  if (e.key === 'Escape') {
    if (EX.dialogueActive) { closeExploreDialogue(); }
    else if (document.getElementById('ex-interior-modal')) { closeInteriorModal(); }
    else { closeExplore(); }
  }
}

function handleExploreInteract() {
  if (!EX.nearbyObj) return;
  const obj = EX.nearbyObj;

  if (obj.type === 'npc') {
    // Start NPC dialogue
    const npc = obj.data;
    const lines = npc.dialogue || ['...'];
    EX.dialogueActive = true;
    EX.dialogueData = { npc, lines, page: 0 };
    showExploreDialogue(npc.name, lines[0]);
    addRating(0.5);
  } else if (obj.type === 'building') {
    // Open building interior
    openBuildingInterior(obj.data, EX.neighborhood.name);
  }
}

function showExploreDialogue(name, text) {
  const box = document.getElementById('explore-dialogue');
  const nameEl = document.getElementById('ex-dialogue-name');
  const textEl = document.getElementById('ex-dialogue-text');
  if (!box || !nameEl || !textEl) return;
  nameEl.textContent = name.toUpperCase();
  textEl.textContent = '"' + text + '"';
  box.style.display = 'block';
}

function advanceDialogue() {
  if (!EX.dialogueData) return;
  EX.dialogueData.page++;
  const { npc, lines, page } = EX.dialogueData;
  if (page >= lines.length) {
    closeExploreDialogue();
  } else {
    showExploreDialogue(npc.name, lines[page]);
  }
}

window.closeExploreDialogue = function() {
  EX.dialogueActive = false;
  EX.dialogueData = null;
  const box = document.getElementById('explore-dialogue');
  if (box) box.style.display = 'none';
};

function showExploreNotif(msg, type, duration) {
  const area = document.getElementById('explore-notif-area');
  if (!area) return;
  const colors = { yellow:'#FFD100', green:'#00C853', orange:'#FF6319', muted:'#555', bad:'#E8001A' };
  const el = document.createElement('div');
  el.style.cssText = `
    background:rgba(0,0,0,0.9);border-left:3px solid ${colors[type] || '#555'};
    padding:8px 14px;margin-bottom:8px;font-size:10px;color:${colors[type] || '#888'};
    letter-spacing:1px;opacity:1;transition:opacity 0.5s;
  `;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, duration || 2000);
}

// ── MAIN GAME LOOP ─────────────────────────────────────────────────────
function startExploreLoop() {
  if (EX.frameId) cancelAnimationFrame(EX.frameId);
  function loop() {
    if (!EX.active) return;
    EX.ticker++;
    updateExplorePhysics();
    updateExploreNPCs();
    updateExploreCars();
    updateExplorePedestrians();
    updateExploreParticles();
    renderExplore();
    updateExploreHUD();
    EX.frameId = requestAnimationFrame(loop);
  }
  EX.frameId = requestAnimationFrame(loop);
}

const WORLD_W = 1000;
const WORLD_H = 600;

function updateExplorePhysics() {
  if (EX.dialogueActive || document.getElementById('ex-interior-modal')) return;
  const spd = (EX.keys['Shift'] ? 3.2 : 1.8);
  let dx = 0, dy = 0;
  if (EX.keys['ArrowUp']    || EX.keys['w'] || EX.keys['W']) { dy = -spd; EX.pFacing = 'up'; }
  if (EX.keys['ArrowDown']  || EX.keys['s'] || EX.keys['S']) { dy =  spd; EX.pFacing = 'down'; }
  if (EX.keys['ArrowLeft']  || EX.keys['a'] || EX.keys['A']) { dx = -spd; EX.pFacing = 'left'; }
  if (EX.keys['ArrowRight'] || EX.keys['d'] || EX.keys['D']) { dx =  spd; EX.pFacing = 'right'; }

  // Diagonal normalize
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

  // Building collision
  let newX = EX.px + dx;
  let newY = EX.py + dy;
  const PR = 12; // player radius

  let blocked = false;
  for (const b of EX.buildings) {
    // Building footprint: bottom 3/4 of the building rectangle
    const bTop = b.y + b.h * 0.25;
    if (newX + PR > b.x && newX - PR < b.x + b.w &&
        newY + PR > bTop && newY - PR < b.y + b.h) {
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    EX.px = Math.max(PR, Math.min(WORLD_W - PR, newX));
    EX.py = Math.max(PR, Math.min(WORLD_H - PR, newY));
  }

  // Animation
  if (dx !== 0 || dy !== 0) {
    EX.pAnimTick++;
    if (EX.pAnimTick > 8) { EX.pAnimTick = 0; EX.pAnimFrame = (EX.pAnimFrame + 1) % 4; }
  } else {
    EX.pAnimFrame = 0;
  }

  // Smooth camera
  const targetCamX = EX.px - EX.W / 2;
  const targetCamY = EX.py - EX.H / 2;
  EX.camX += (targetCamX - EX.camX) * 0.12;
  EX.camY += (targetCamY - EX.camY) * 0.12;

  // Check nearby interactables
  detectNearby();

  // Ambient footstep particles
  if ((dx !== 0 || dy !== 0) && EX.ticker % 12 === 0) {
    EX.particles.push({
      x: EX.px + (Math.random() - 0.5) * 6,
      y: EX.py + 8,
      vx: (Math.random() - 0.5) * 0.3,
      vy: 0.2,
      life: 20, maxLife: 20,
      type: 'dust',
    });
  }
}

function detectNearby() {
  const PR = 50;
  let closest = null;
  let closestDist = 9999;

  // Check NPCs
  for (const npc of EX.npcs) {
    const dx = npc.wx - EX.px, dy = npc.wy - EX.py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < PR && d < closestDist) {
      closestDist = d;
      closest = { type: 'npc', data: npc, dist: d };
    }
  }

  // Check building entrances (front-center bottom of building)
  for (const b of EX.buildings) {
    const entX = b.x + b.w / 2;
    const entY = b.y + b.h + 4;
    const dx = entX - EX.px, dy = entY - EX.py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 44 && d < closestDist) {
      closestDist = d;
      closest = { type: 'building', data: b, dist: d };
    }
  }

  EX.nearbyObj = closest;

  const prompt = document.getElementById('ex-nearby-prompt');
  if (prompt) {
    if (closest) {
      prompt.style.display = 'block';
      if (closest.type === 'npc') {
        prompt.textContent = `[E] TALK TO ${closest.data.name.toUpperCase()}`;
      } else {
        const locked = closest.data.reqRep > G.rating;
        prompt.textContent = locked
          ? `🔒 ${closest.data.name.toUpperCase()} (REP ${closest.data.reqRep}+)`
          : `[E] ENTER ${closest.data.name.toUpperCase()}`;
        prompt.style.borderColor = locked ? '#E8001A' : '#FFD100';
        prompt.style.color       = locked ? '#E8001A' : '#FFD100';
      }
    } else {
      prompt.style.display = 'none';
    }
  }
}

function updateExploreNPCs() {
  for (const npc of EX.npcs) {
    if (!npc.patrol) continue;
    npc.patrolTimer++;
    if (npc.patrolTimer > 120 + Math.random() * 80) {
      npc.patrolDir += (Math.random() - 0.5) * 1.2;
      npc.patrolTimer = 0;
    }
    const spd = npc.speed;
    let nx = npc.wx + Math.cos(npc.patrolDir) * spd;
    let ny = npc.wy + Math.sin(npc.patrolDir) * spd;

    // Stay within patrol radius of base
    const dx = nx - npc.patrolBase.x, dy = ny - npc.patrolBase.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d > 140) { npc.patrolDir += Math.PI * 0.7; }

    nx = Math.max(20, Math.min(WORLD_W - 20, nx));
    ny = Math.max(150, Math.min(WORLD_H - 20, ny));

    npc.wx = nx; npc.wy = ny;
    if (spd > 0) {
      npc.animTick++;
      if (npc.animTick > 10) { npc.animTick = 0; npc.animFrame = (npc.animFrame + 1) % 4; }
    }
  }
}

function updateExploreCars() {
  for (const car of EX.cars) {
    car.x += car.speed;
    if (car.x > WORLD_W + 60) car.x = -60;
    if (car.x < -60) car.x = WORLD_W + 60;
  }
}

function updateExplorePedestrians() {
  for (const p of EX.pedestrians) {
    p.timer++;
    if (p.timer > 80 + Math.random() * 60) {
      p.dir += (Math.random() - 0.5) * 1.0;
      p.timer = 0;
    }
    p.x += Math.cos(p.dir) * p.speed;
    p.y += Math.sin(p.dir) * p.speed;
    p.x = Math.max(40, Math.min(WORLD_W - 40, p.x));
    p.y = Math.max(160, Math.min(WORLD_H - 30, p.y));
  }
}

function updateExploreParticles() {
  EX.particles = EX.particles.filter(p => p.life > 0);
  for (const p of EX.particles) {
    p.x += p.vx; p.y += p.vy; p.life--;
  }
}

// ── RENDER ─────────────────────────────────────────────────────────────
function renderExplore() {
  const ctx = EX.ctx;
  if (!ctx) return;
  const cfg = EX.neighborhood;
  const W = EX.W, H = EX.H;

  ctx.clearRect(0, 0, W, H);

  // Save and apply camera transform
  ctx.save();
  ctx.translate(-Math.floor(EX.camX), -Math.floor(EX.camY));

  // ── BACKGROUND ──
  ctx.fillStyle = cfg.bg || '#0A0A0A';
  ctx.fillRect(EX.camX, EX.camY, W, H);

  // ── STREET BLOCKS (sidewalks + roads) ──
  drawExploreStreets(ctx, cfg);

  // ── BUILDINGS ──
  drawExploreBuildings(ctx, cfg);

  // ── CARS ──
  for (const car of EX.cars) {
    ctx.font = '20px serif';
    ctx.save();
    if (car.speed < 0) { ctx.scale(-1, 1); ctx.fillText(car.emoji, -car.x - 20, car.y); }
    else ctx.fillText(car.emoji, car.x, car.y);
    ctx.restore();
  }

  // ── PEDESTRIANS ──
  for (const p of EX.pedestrians) {
    ctx.font = '16px serif';
    ctx.fillText(p.emoji, p.x - 8, p.y);
  }

  // ── NPCs ──
  for (const npc of EX.npcs) {
    renderNPC(ctx, npc);
  }

  // ── PARTICLES ──
  for (const p of EX.particles) {
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── PLAYER ──
  renderPlayer(ctx);

  // ── NEARBY GLOW ──
  if (EX.nearbyObj) {
    const obj = EX.nearbyObj;
    const pulse = 0.5 + 0.5 * Math.sin(EX.ticker * 0.12);
    ctx.strokeStyle = `rgba(255, 209, 0, ${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    if (obj.type === 'npc') {
      const npc = obj.data;
      ctx.beginPath();
      ctx.arc(npc.wx, npc.wy - 4, 18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (obj.type === 'building') {
      const b = obj.data;
      ctx.beginPath();
      ctx.rect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // ── NIGHT OVERLAY (time-based) ──
  const nightA = getNightAlpha() * 0.5;
  if (nightA > 0) {
    ctx.fillStyle = `rgba(5,5,25,${nightA})`;
    ctx.fillRect(EX.camX, EX.camY, W, H);
    // Street lights at night
    if (nightA > 0.1) {
      for (let lx = 120; lx < WORLD_W; lx += 120) {
        const grad = ctx.createRadialGradient(lx, 290, 0, lx, 290, 80);
        grad.addColorStop(0, `rgba(255,220,120,${nightA * 0.4})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(lx - 80, 210, 160, 160);
      }
    }
  }

  ctx.restore(); // end camera transform

  // ── SCREEN-SPACE ELEMENTS (no camera offset) ──
  // Vignette
  const vigGrad = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.75);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  // Mini compass
  drawCompass(ctx, W - 50, 110);

  // Ambient label bottom-center
  if (EX.ticker < 180) {
    const alpha = Math.min(1, (180 - EX.ticker) / 60);
    ctx.globalAlpha = alpha;
    ctx.font = '10px IBM Plex Mono';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.streetLabels ? cfg.streetLabels.join(' · ') : '', W / 2, H - 70);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

function drawExploreStreets(ctx, cfg) {
  const sw = cfg.sidewalkColor || '#1C1C1C';
  const rc = cfg.streetColor   || '#141414';

  // Full ground
  ctx.fillStyle = sw;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Horizontal road lanes
  const roads = [
    { y: 300, h: 60 },  // main street
    { y: 450, h: 50 },  // side street
  ];
  roads.forEach(r => {
    ctx.fillStyle = rc;
    ctx.fillRect(0, r.y, WORLD_W, r.h);
    // Lane markings
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([14, 18]);
    ctx.beginPath();
    ctx.moveTo(0, r.y + r.h / 2);
    ctx.lineTo(WORLD_W, r.y + r.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Crosswalk stripes
  for (let cx = 200; cx < WORLD_W; cx += 250) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let stripe = 0; stripe < 5; stripe++) {
      ctx.fillRect(cx + stripe * 6, 298, 4, 64);
    }
  }

  // Sidewalk curb lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  [299, 361, 449, 501].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
  });

  // Block/grid lines (faint)
  ctx.strokeStyle = 'rgba(255,255,255,0.015)';
  for (let x = 0; x < WORLD_W; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
  }
}

function drawExploreBuildings(ctx, cfg) {
  const blds = EX.buildings;
  const accent = cfg.accent || '#888888';

  blds.forEach(b => {
    const locked = b.reqRep > G.rating;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(b.x + 5, b.y + 5, b.w, b.h);

    // Body
    ctx.fillStyle = b.color || '#121212';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Facade detail — window grid
    const fc = locked ? 'rgba(255,0,0,0.04)' : 'rgba(255,255,255,0.04)';
    const rows = b.floors || 4;
    const cols = Math.floor(b.w / 18);
    for (let r = 0; r < rows && r < 12; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x + 6 + c * 18;
        const wy = b.y + 8 + r * (b.h / rows - 2);
        const wh = Math.max(4, b.h / rows - 8);
        const lit = Math.random() > 0.6 || G.hour >= 18 || G.hour <= 6;
        ctx.fillStyle = lit
          ? (locked ? 'rgba(255,60,60,0.15)' : 'rgba(200,180,100,0.18)')
          : 'rgba(255,255,255,0.02)';
        ctx.fillRect(wx, wy, 10, wh);
      }
    }

    // Roof accent line
    ctx.fillStyle = b.roofColor || '#1A1A1A';
    ctx.fillRect(b.x, b.y, b.w, 6);
    ctx.fillStyle = locked ? 'rgba(200,0,0,0.4)' : (accent + '44');
    ctx.fillRect(b.x, b.y, b.w, 3);

    // Entrance door
    const doorX = b.x + b.w / 2 - 8;
    const doorY = b.y + b.h - 20;
    ctx.fillStyle = locked ? '#1A0808' : '#0A1A0A';
    ctx.fillRect(doorX, doorY, 16, 20);
    ctx.strokeStyle = locked ? 'rgba(200,0,0,0.5)' : 'rgba(0,200,80,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(doorX, doorY, 16, 20);

    // Name label
    ctx.font = `bold ${Math.min(9, b.w / 10)}px IBM Plex Mono`;
    ctx.fillStyle = locked ? '#442222' : '#444';
    ctx.textAlign = 'center';
    const label = b.name.length > 16 ? b.name.slice(0, 14) + '…' : b.name;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h + 14);
    ctx.textAlign = 'left';

    // Icon on building face
    ctx.font = `${Math.min(22, b.w * 0.2)}px serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = locked ? 0.3 : 0.7;
    ctx.fillText(b.icon, b.x + b.w / 2, b.y + 30 + (b.h > 80 ? 10 : 0));
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // Lock indicator
    if (locked) {
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', b.x + b.w / 2, b.y + b.h / 2);
      ctx.textAlign = 'left';
    }
  });
}

function renderNPC(ctx, npc) {
  // Bounce animation when moving
  const bounce = npc.patrol && npc.speed > 0
    ? Math.sin(EX.ticker * 0.25 + npc.id) * 2
    : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(npc.wx, npc.wy + 4, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sprite
  ctx.font = '20px serif';
  ctx.textAlign = 'center';
  ctx.fillText(npc.emoji, npc.wx, npc.wy - bounce);
  ctx.textAlign = 'left';

  // Name tag (when close)
  const dx = npc.wx - EX.px, dy = npc.wy - EX.py;
  if (Math.sqrt(dx * dx + dy * dy) < 80) {
    ctx.font = '8px IBM Plex Mono';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText(npc.name.toUpperCase(), npc.wx, npc.wy - 18);
    ctx.textAlign = 'left';
  }
}

const PLAYER_EMOJIS = {
  1: { down: '🧑', up: '🧑', left: '🧑', right: '🧑' },
  2: { down: '🧑🏽', up: '🧑🏽', left: '🧑🏽', right: '🧑🏽' },
  3: { down: '🧑🏾', up: '🧑🏾', left: '🧑🏾', right: '🧑🏾' },
  4: { down: '🧑🏿', up: '🧑🏿', left: '🧑🏿', right: '🧑🏿' },
  5: { down: '👩🏿', up: '👩🏿', left: '👩🏿', right: '👩🏿' },
};

function renderPlayer(ctx) {
  const bounce = (EX.pAnimFrame === 1 || EX.pAnimFrame === 3) ? -2 : 0;
  const map = PLAYER_EMOJIS[G.skinTone] || PLAYER_EMOJIS[1];
  const emoji = map[EX.pFacing] || map.down;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(EX.px, EX.py + 6, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glow (player indicator)
  ctx.fillStyle = 'rgba(255,209,0,0.12)';
  ctx.beginPath();
  ctx.arc(EX.px, EX.py, 22, 0, Math.PI * 2);
  ctx.fill();

  // Sprite
  ctx.font = '26px serif';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, EX.px, EX.py - 4 + bounce);
  ctx.textAlign = 'left';

  // Name above player
  ctx.font = 'bold 9px IBM Plex Mono';
  ctx.fillStyle = '#FFD100';
  ctx.textAlign = 'center';
  ctx.fillText(G.name.toUpperCase(), EX.px, EX.py - 22 + bounce);
  ctx.textAlign = 'left';
}

function drawCompass(ctx, cx, cy) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '7px IBM Plex Mono';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E8001A';
  ctx.fillText('N', cx, cy - 18);
  ctx.fillStyle = '#555';
  ctx.fillText('S', cx, cy + 22);
  ctx.fillText('W', cx - 22, cy + 4);
  ctx.fillText('E', cx + 22, cy + 4);
  // Needle
  ctx.strokeStyle = '#E8001A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - 12);
  ctx.stroke();
  ctx.strokeStyle = '#444';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + 12);
  ctx.stroke();
  ctx.restore();
}

// ── CLOSE EXPLORE ─────────────────────────────────────────────────────
function closeExplore() {
  EX.active = false;
  if (EX.frameId) { cancelAnimationFrame(EX.frameId); EX.frameId = null; }
  document.removeEventListener('keydown', onExploreGlobalKey);
  const screen = document.getElementById('explore-screen');
  if (screen) screen.remove();
  const modal = document.getElementById('ex-interior-modal');
  if (modal) modal.remove();
  EX.keys = {};
}

// ── HOOK INTO EXISTING MAP CLICK ─────────────────────────────────────
// Patch onMapClick in map.js to launch explore instead of just traveling
const _origOnMapClick = window.onMapClick;
// We'll override the MAP object's click handler after DOM loads
window.addEventListener('load', () => {
  // Override map canvas click to open explore
  setTimeout(() => {
    if (!MAP || !MAP.canvas) return;
    MAP.canvas.removeEventListener('click', onMapClick);
    MAP.canvas.addEventListener('click', function(e) {
      if (MAP.isDragging) return;
      if (!MAP.hoveredLoc) return;

      const loc = MAP.hoveredLoc;
      if (loc.name === G.location) {
        // Already here — open explore directly
        closeFullMap();
        setTimeout(() => openExplore(loc.name), 100);
        return;
      }

      // Travel there first, then open explore
      travelTo(loc.name, loc.x, loc.y);
      setTimeout(() => openExplore(loc.name), 500);
    });
  }, 200);
});

// Also hook updateLocationContext to add "Explore on Foot" button
const _origUpdateLocCtx = window.updateLocationContext;
window.updateLocationContext = function(name) {
  _origUpdateLocCtx && _origUpdateLocCtx(name);
  const actEl = document.getElementById('loc-ctx-actions');
  if (!actEl) return;
  // Add explore button
  const exploreBtn = document.createElement('button');
  exploreBtn.className = 'action-btn primary';
  exploreBtn.innerHTML = '🚶 EXPLORE ON FOOT';
  exploreBtn.style.cssText = 'background:#141400;border-color:#FFD100;color:#FFD100;';
  exploreBtn.onclick = () => openExplore(name);
  actEl.appendChild(exploreBtn);
};
