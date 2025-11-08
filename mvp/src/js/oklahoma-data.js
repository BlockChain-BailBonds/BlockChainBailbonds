/**
 * 918 Technologies BlockChain BailBonds
 * Oklahoma Counties and Jails Data
 * 
 * This file contains comprehensive information about Oklahoma counties
 * and detention facilities for use in the bail bonds system.
 */

// Oklahoma counties data with additional information
const OKLAHOMA_COUNTIES = [
  { 
    id: "adair", 
    name: "Adair",
    population: 23174,
    county_seat: "Stilwell",
    founded: 1907
  },
  { 
    id: "alfalfa", 
    name: "Alfalfa",
    population: 5702,
    county_seat: "Cherokee",
    founded: 1907
  },
  { 
    id: "atoka", 
    name: "Atoka",
    population: 13810,
    county_seat: "Atoka",
    founded: 1907
  },
  { 
    id: "beaver", 
    name: "Beaver",
    population: 5311,
    county_seat: "Beaver",
    founded: 1890
  },
  { 
    id: "beckham", 
    name: "Beckham",
    population: 21859,
    county_seat: "Sayre",
    founded: 1907
  },
  { 
    id: "blaine", 
    name: "Blaine",
    population: 9643,
    county_seat: "Watonga",
    founded: 1890
  },
  { 
    id: "bryan", 
    name: "Bryan",
    population: 47995,
    county_seat: "Durant",
    founded: 1907
  },
  { 
    id: "caddo", 
    name: "Caddo",
    population: 29557,
    county_seat: "Anadarko",
    founded: 1901
  },
  { 
    id: "canadian", 
    name: "Canadian",
    population: 148306,
    county_seat: "El Reno",
    founded: 1889
  },
  { 
    id: "carter", 
    name: "Carter",
    population: 48111,
    county_seat: "Ardmore",
    founded: 1907
  },
  { 
    id: "cherokee", 
    name: "Cherokee",
    population: 48657,
    county_seat: "Tahlequah",
    founded: 1907
  },
  { 
    id: "choctaw", 
    name: "Choctaw",
    population: 14672,
    county_seat: "Hugo",
    founded: 1907
  },
  { 
    id: "cimarron", 
    name: "Cimarron",
    population: 2137,
    county_seat: "Boise City",
    founded: 1907
  },
  { 
    id: "cleveland", 
    name: "Cleveland",
    population: 295528,
    county_seat: "Norman",
    founded: 1890
  },
  { 
    id: "coal", 
    name: "Coal",
    population: 5495,
    county_seat: "Coalgate",
    founded: 1907
  },
  { 
    id: "comanche", 
    name: "Comanche",
    population: 120749,
    county_seat: "Lawton",
    founded: 1901
  },
  { 
    id: "cotton", 
    name: "Cotton",
    population: 5666,
    county_seat: "Walters",
    founded: 1912
  },
  { 
    id: "craig", 
    name: "Craig",
    population: 14142,
    county_seat: "Vinita",
    founded: 1907
  },
  { 
    id: "creek", 
    name: "Creek",
    population: 71522,
    county_seat: "Sapulpa",
    founded: 1907
  },
  { 
    id: "custer", 
    name: "Custer",
    population: 29003,
    county_seat: "Arapaho",
    founded: 1892
  },
  { 
    id: "delaware", 
    name: "Delaware",
    population: 43009,
    county_seat: "Jay",
    founded: 1907
  },
  { 
    id: "dewey", 
    name: "Dewey",
    population: 4891,
    county_seat: "Taloga",
    founded: 1892
  },
  { 
    id: "ellis", 
    name: "Ellis",
    population: 3859,
    county_seat: "Arnett",
    founded: 1892
  },
  { 
    id: "garfield", 
    name: "Garfield",
    population: 62603,
    county_seat: "Enid",
    founded: 1893
  },
  { 
    id: "garvin", 
    name: "Garvin",
    population: 27711,
    county_seat: "Pauls Valley",
    founded: 1907
  },
  { 
    id: "grady", 
    name: "Grady",
    population: 55834,
    county_seat: "Chickasha",
    founded: 1907
  },
  { 
    id: "grant", 
    name: "Grant",
    population: 4333,
    county_seat: "Medford",
    founded: 1893
  },
  { 
    id: "greer", 
    name: "Greer",
    population: 5712,
    county_seat: "Mangum",
    founded: 1901
  },
  { 
    id: "harmon", 
    name: "Harmon",
    population: 2653,
    county_seat: "Hollis",
    founded: 1909
  },
  { 
    id: "harper", 
    name: "Harper",
    population: 3688,
    county_seat: "Buffalo",
    founded: 1907
  },
  { 
    id: "haskell", 
    name: "Haskell",
    population: 12627,
    county_seat: "Stigler",
    founded: 1907
  },
  { 
    id: "hughes", 
    name: "Hughes",
    population: 13279,
    county_seat: "Holdenville",
    founded: 1907
  },
  { 
    id: "jackson", 
    name: "Jackson",
    population: 25497,
    county_seat: "Altus",
    founded: 1907
  },
  { 
    id: "jefferson", 
    name: "Jefferson",
    population: 6002,
    county_seat: "Waurika",
    founded: 1907
  },
  { 
    id: "johnston", 
    name: "Johnston",
    population: 11085,
    county_seat: "Tishomingo",
    founded: 1907
  },
  { 
    id: "kay", 
    name: "Kay",
    population: 43538,
    county_seat: "Newkirk",
    founded: 1893
  },
  { 
    id: "kingfisher", 
    name: "Kingfisher",
    population: 15765,
    county_seat: "Kingfisher",
    founded: 1890
  },
  { 
    id: "kiowa", 
    name: "Kiowa",
    population: 8708,
    county_seat: "Hobart",
    founded: 1901
  },
  { 
    id: "latimer", 
    name: "Latimer",
    population: 10414,
    county_seat: "Wilburton",
    founded: 1907
  },
  { 
    id: "le_flore", 
    name: "Le Flore",
    population: 49853,
    county_seat: "Poteau",
    founded: 1907
  },
  { 
    id: "lincoln", 
    name: "Lincoln",
    population: 35090,
    county_seat: "Chandler",
    founded: 1891
  },
  { 
    id: "logan", 
    name: "Logan",
    population: 48011,
    county_seat: "Guthrie",
    founded: 1889
  },
  { 
    id: "love", 
    name: "Love",
    population: 10253,
    county_seat: "Marietta",
    founded: 1907
  },
  { 
    id: "major", 
    name: "Major",
    population: 7629,
    county_seat: "Fairview",
    founded: 1907
  },
  { 
    id: "marshall", 
    name: "Marshall",
    population: 17805,
    county_seat: "Madill",
    founded: 1907
  },
  { 
    id: "mayes", 
    name: "Mayes",
    population: 41259,
    county_seat: "Pryor",
    founded: 1907
  },
  { 
    id: "mcclain", 
    name: "McClain",
    population: 40474,
    county_seat: "Purcell",
    founded: 1907
  },
  { 
    id: "mccurtain", 
    name: "McCurtain",
    population: 32832,
    county_seat: "Idabel",
    founded: 1907
  },
  { 
    id: "mcintosh", 
    name: "McIntosh",
    population: 19456,
    county_seat: "Eufaula",
    founded: 1907
  },
  { 
    id: "murray", 
    name: "Murray",
    population: 14073,
    county_seat: "Sulphur",
    founded: 1907
  },
  { 
    id: "muskogee", 
    name: "Muskogee",
    population: 69477,
    county_seat: "Muskogee",
    founded: 1907
  },
  { 
    id: "noble", 
    name: "Noble",
    population: 11131,
    county_seat: "Perry",
    founded: 1893
  },
  { 
    id: "nowata", 
    name: "Nowata",
    population: 10076,
    county_seat: "Nowata",
    founded: 1907
  },
  { 
    id: "okfuskee", 
    name: "Okfuskee",
    population: 11993,
    county_seat: "Okemah",
    founded: 1907
  },
  { 
    id: "oklahoma", 
    name: "Oklahoma",
    population: 797434,
    county_seat: "Oklahoma City",
    founded: 1890
  },
  { 
    id: "okmulgee", 
    name: "Okmulgee",
    population: 38465,
    county_seat: "Okmulgee",
    founded: 1907
  },
  { 
    id: "osage", 
    name: "Osage",
    population: 47233,
    county_seat: "Pawhuska",
    founded: 1907
  },
  { 
    id: "ottawa", 
    name: "Ottawa",
    population: 31127,
    county_seat: "Miami",
    founded: 1907
  },
  { 
    id: "pawnee", 
    name: "Pawnee",
    population: 16376,
    county_seat: "Pawnee",
    founded: 1893
  },
  { 
    id: "payne", 
    name: "Payne",
    population: 81784,
    county_seat: "Stillwater",
    founded: 1889
  },
  { 
    id: "pittsburg", 
    name: "Pittsburg",
    population: 44173,
    county_seat: "McAlester",
    founded: 1907
  },
  { 
    id: "pontotoc", 
    name: "Pontotoc",
    population: 38284,
    county_seat: "Ada",
    founded: 1907
  },
  { 
    id: "pottawatomie", 
    name: "Pottawatomie",
    population: 72592,
    county_seat: "Shawnee",
    founded: 1891
  },
  { 
    id: "pushmataha", 
    name: "Pushmataha",
    population: 11096,
    county_seat: "Antlers",
    founded: 1907
  },
  { 
    id: "roger_mills", 
    name: "Roger Mills",
    population: 3583,
    county_seat: "Cheyenne",
    founded: 1892
  },
  { 
    id: "rogers", 
    name: "Rogers",
    population: 91766,
    county_seat: "Claremore",
    founded: 1907
  },
  { 
    id: "seminole", 
    name: "Seminole",
    population: 24258,
    county_seat: "Wewoka",
    founded: 1907
  },
  { 
    id: "sequoyah", 
    name: "Sequoyah",
    population: 41569,
    county_seat: "Sallisaw",
    founded: 1907
  },
  { 
    id: "stephens", 
    name: "Stephens",
    population: 43143,
    county_seat: "Duncan",
    founded: 1907
  },
  { 
    id: "texas", 
    name: "Texas",
    population: 19983,
    county_seat: "Guymon",
    founded: 1907
  },
  { 
    id: "tillman", 
    name: "Tillman",
    population: 7250,
    county_seat: "Frederick",
    founded: 1907
  },
  { 
    id: "tulsa", 
    name: "Tulsa",
    population: 651552,
    county_seat: "Tulsa",
    founded: 1907
  },
  { 
    id: "wagoner", 
    name: "Wagoner",
    population: 80110,
    county_seat: "Wagoner",
    founded: 1907
  },
  { 
    id: "washington", 
    name: "Washington",
    population: 52455,
    county_seat: "Bartlesville",
    founded: 1907
  },
  { 
    id: "washita", 
    name: "Washita",
    population: 11447,
    county_seat: "Cordell",
    founded: 1892
  },
  { 
    id: "woods", 
    name: "Woods",
    population: 8793,
    county_seat: "Alva",
    founded: 1893
  },
  { 
    id: "woodward", 
    name: "Woodward",
    population: 20211,
    county_seat: "Woodward",
    founded: 1893
  }
];

// Oklahoma jails and detention facilities data
const OKLAHOMA_JAILS = [
  {
    id: "oklahoma_county_jail",
    name: "Oklahoma County Detention Center",
    county: "Oklahoma",
    address: "201 N Shartel Ave, Oklahoma City, OK 73102",
    phone: "(405) 713-1000",
    type: "County",
    inmate_capacity: 2500,
    coordinates: { lat: 35.4729, lng: -97.5170 },
    booking_process: "24/7 booking available",
    visit_hours: "8:00AM - 5:00PM daily",
    bail_info: "Cash, surety bonds accepted. Bondsmen available on-site."
  },
  {
    id: "tulsa_county_jail",
    name: "David L. Moss Criminal Justice Center",
    county: "Tulsa",
    address: "300 N Denver Ave, Tulsa, OK 74103",
    phone: "(918) 596-8950",
    type: "County",
    inmate_capacity: 1800,
    coordinates: { lat: 36.1599, lng: -95.9976 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 6:00PM daily",
    bail_info: "Cash, surety bonds accepted. Video bail hearings available."
  },
  {
    id: "cleveland_county_jail",
    name: "F. DeWayne Beggs Detention Center",
    county: "Cleveland",
    address: "2550 W Franklin Rd, Norman, OK 73069",
    phone: "(405) 701-8888",
    type: "County",
    inmate_capacity: 540,
    coordinates: { lat: 35.2227, lng: -97.4986 },
    booking_process: "24/7 booking available",
    visit_hours: "8:00AM - 4:30PM Wed-Sun",
    bail_info: "Cash, surety bonds accepted. Bail hearings held Mon-Fri."
  },
  {
    id: "comanche_county_jail",
    name: "Comanche County Detention Center",
    county: "Comanche",
    address: "601 SW C Ave, Lawton, OK 73501",
    phone: "(580) 351-8720",
    type: "County",
    inmate_capacity: 420,
    coordinates: { lat: 34.6030, lng: -98.3969 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 5:00PM Tue-Sat",
    bail_info: "Cash, property, surety bonds accepted."
  },
  {
    id: "canadian_county_jail",
    name: "Canadian County Jail",
    county: "Canadian",
    address: "304 N Evans Ave, El Reno, OK 73036",
    phone: "(405) 262-3434",
    type: "County",
    inmate_capacity: 200,
    coordinates: { lat: 35.5325, lng: -97.9540 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bail hearings held within 48 hours."
  },
  {
    id: "payne_county_jail",
    name: "Payne County Jail",
    county: "Payne",
    address: "606 S Husband St, Stillwater, OK 74074",
    phone: "(405) 372-4091",
    type: "County",
    inmate_capacity: 150,
    coordinates: { lat: 36.1156, lng: -97.0584 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM daily",
    bail_info: "Cash, surety bonds accepted. Bond agents available 24/7."
  },
  {
    id: "muskogee_county_jail",
    name: "Muskogee County Jail",
    county: "Muskogee",
    address: "440 N 3rd St, Muskogee, OK 74401",
    phone: "(918) 687-0370",
    type: "County",
    inmate_capacity: 340,
    coordinates: { lat: 35.7489, lng: -95.3699 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 11:00AM, 1:00PM - 3:00PM daily",
    bail_info: "Cash, surety bonds accepted. Bond agents must be licensed."
  },
  {
    id: "carter_county_jail",
    name: "Carter County Detention Center",
    county: "Carter",
    address: "20 B St SW, Ardmore, OK 73401",
    phone: "(580) 223-6014",
    type: "County",
    inmate_capacity: 180,
    coordinates: { lat: 34.1726, lng: -97.1285 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:30PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond schedule available for minor offenses."
  },
  {
    id: "wagoner_county_jail",
    name: "Wagoner County Jail",
    county: "Wagoner",
    address: "307 E Cherokee St, Wagoner, OK 74467",
    phone: "(918) 485-3124",
    type: "County",
    inmate_capacity: 195,
    coordinates: { lat: 35.9596, lng: -95.3796 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 11:00AM, 1:00PM - 4:00PM daily",
    bail_info: "Cash, surety bonds accepted. Online inmate lookup available."
  },
  {
    id: "pottawatomie_county_jail",
    name: "Pottawatomie County Public Safety Center",
    county: "Pottawatomie",
    address: "325 N Broadway Ave, Shawnee, OK 74801",
    phone: "(405) 273-1177",
    type: "County",
    inmate_capacity: 240,
    coordinates: { lat: 35.3285, lng: -96.9239 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 11:00AM, 1:00PM - 3:00PM Wed-Sun",
    bail_info: "Cash, surety bonds accepted. Court appearances via video possible."
  },
  {
    id: "garfield_county_jail",
    name: "Garfield County Detention Facility",
    county: "Garfield",
    address: "121 W Owen K Garriott Rd, Enid, OK 73701",
    phone: "(580) 237-0244",
    type: "County",
    inmate_capacity: 275,
    coordinates: { lat: 36.3956, lng: -97.8784 },
    booking_process: "24/7 booking available",
    visit_hours: "8:00AM - 4:00PM Tue-Sun",
    bail_info: "Cash, surety bonds accepted. Bail hearings held within 72 hours."
  },
  {
    id: "cherokee_county_jail",
    name: "Cherokee County Detention Center",
    county: "Cherokee",
    address: "101 W Delaware St, Tahlequah, OK 74464",
    phone: "(918) 456-2583",
    type: "County",
    inmate_capacity: 160,
    coordinates: { lat: 35.9156, lng: -94.9697 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Tribal jurisdictional considerations."
  },
  {
    id: "pittsburg_county_jail",
    name: "Pittsburg County Justice Center",
    county: "Pittsburg",
    address: "115 E Carl Albert Pkwy, McAlester, OK 74501",
    phone: "(918) 423-5858",
    type: "County",
    inmate_capacity: 180,
    coordinates: { lat: 34.9330, lng: -95.7662 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Wed-Sun",
    bail_info: "Cash, surety bonds accepted. Bondsmen must check in at facility."
  },
  {
    id: "kay_county_jail",
    name: "Kay County Detention Center",
    county: "Kay",
    address: "1101 W Dry Rd, Newkirk, OK 74647",
    phone: "(580) 362-2517",
    type: "County",
    inmate_capacity: 170,
    coordinates: { lat: 36.8826, lng: -97.0539 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bail hearings Mon-Fri."
  },
  {
    id: "creek_county_jail",
    name: "Creek County Criminal Justice Center",
    county: "Creek",
    address: "711 E 7th St, Sapulpa, OK 74066",
    phone: "(918) 224-7915",
    type: "County",
    inmate_capacity: 120,
    coordinates: { lat: 36.0025, lng: -96.1138 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Wed, Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond schedule available."
  },
  {
    id: "okmulgee_county_jail",
    name: "Okmulgee County Jail",
    county: "Okmulgee",
    address: "314 W 7th St, Okmulgee, OK 74447",
    phone: "(918) 756-4641",
    type: "County",
    inmate_capacity: 110,
    coordinates: { lat: 35.6255, lng: -95.9633 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond hearings within 72 hours."
  },
  {
    id: "stephens_county_jail",
    name: "Stephens County Jail",
    county: "Stephens",
    address: "101 S 11th St, Duncan, OK 73533",
    phone: "(580) 255-3131",
    type: "County",
    inmate_capacity: 160,
    coordinates: { lat: 34.5022, lng: -97.9577 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 11:00AM, 1:00PM - 3:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond agents available 24/7."
  },
  {
    id: "le_flore_county_jail",
    name: "Le Flore County Detention Center",
    county: "Le Flore",
    address: "101 S Broadway, Poteau, OK 74953",
    phone: "(918) 647-2317",
    type: "County",
    inmate_capacity: 140,
    coordinates: { lat: 35.0539, lng: -94.6232 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Online inmate search available."
  },
  {
    id: "pontotoc_county_jail",
    name: "Pontotoc County Justice Center",
    county: "Pontotoc",
    address: "731 W 11th St, Ada, OK 74820",
    phone: "(580) 332-0870",
    type: "County",
    inmate_capacity: 140,
    coordinates: { lat: 34.7787, lng: -96.6783 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Wed, Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond agents must be registered."
  },
  {
    id: "woodward_county_jail",
    name: "Woodward County Jail",
    county: "Woodward",
    address: "1320 Downs Ave, Woodward, OK 73801",
    phone: "(580) 256-3010",
    type: "County",
    inmate_capacity: 90,
    coordinates: { lat: 36.4349, lng: -99.3900 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond hearings Mon-Fri mornings."
  },
  {
    id: "oklahoma_city_jail",
    name: "Oklahoma City Detention Center",
    county: "Oklahoma",
    address: "700 Colcord Drive, Oklahoma City, OK 73102",
    phone: "(405) 297-3980",
    type: "Municipal",
    inmate_capacity: 200,
    coordinates: { lat: 35.4722, lng: -97.5151 },
    booking_process: "24/7 booking available",
    visit_hours: "8:00AM - 4:00PM daily",
    bail_info: "Cash, surety bonds accepted. Municipal court arraignments daily."
  },
  {
    id: "tulsa_city_jail",
    name: "Tulsa Municipal Jail",
    county: "Tulsa",
    address: "600 Civic Center, Tulsa, OK 74103",
    phone: "(918) 596-7277",
    type: "Municipal",
    inmate_capacity: 120,
    coordinates: { lat: 36.1531, lng: -95.9944 },
    booking_process: "24/7 booking available",
    visit_hours: "9:00AM - 3:00PM daily",
    bail_info: "Cash, surety bonds accepted. Bondsmen access during business hours."
  },
  {
    id: "lawton_city_jail",
    name: "Lawton City Jail",
    county: "Comanche",
    address: "10 SW 4th St, Lawton, OK 73501",
    phone: "(580) 581-3271",
    type: "Municipal",
    inmate_capacity: 80,
    coordinates: { lat: 34.6073, lng: -98.3930 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Municipal violations only."
  },
  {
    id: "norman_city_jail",
    name: "Norman Detention Center",
    county: "Cleveland",
    address: "201 W Gray St, Norman, OK 73069",
    phone: "(405) 321-1600",
    type: "Municipal",
    inmate_capacity: 60,
    coordinates: { lat: 35.2206, lng: -97.4437 },
    booking_process: "24/7 booking available",
    visit_hours: "1:00PM - 4:00PM Sat-Sun",
    bail_info: "Cash, surety bonds accepted. Bond schedule posted online."
  },
  {
    id: "north_fork_correctional_center",
    name: "North Fork Correctional Center",
    county: "Beckham",
    address: "1605 E Main St, Sayre, OK 73662",
    phone: "(580) 928-2996",
    type: "State Prison",
    inmate_capacity: 2400,
    coordinates: { lat: 35.3041, lng: -99.6354 },
    booking_process: "Transfers from county facilities only",
    visit_hours: "8:00AM - 3:00PM Sat-Sun",
    bail_info: "Not applicable - houses sentenced inmates only"
  },
  {
    id: "lexington_assessment_center",
    name: "Lexington Assessment & Reception Center",
    county: "Cleveland",
    address: "15151 State Highway 39, Lexington, OK 73051",
    phone: "(405) 527-5676",
    type: "State Prison",
    inmate_capacity: 1400,
    coordinates: { lat: 35.0224, lng: -97.3376 },
    booking_process: "Initial classification facility for male inmates",
    visit_hours: "8:00AM - 3:00PM Sat-Sun",
    bail_info: "Not applicable - houses sentenced inmates only"
  },
  {
    id: "federal_transfer_center",
    name: "Federal Transfer Center",
    county: "Oklahoma",
    address: "7410 S Macarthur Blvd, Oklahoma City, OK 73169",
    phone: "(405) 682-4075",
    type: "Federal",
    inmate_capacity: 1200,
    coordinates: { lat: 35.4024, lng: -97.6045 },
    booking_process: "Federal custody transfers only",
    visit_hours: "8:00AM - 3:00PM Fri-Mon",
    bail_info: "Federal bail hearings through U.S. Magistrate Judge"
  }
];

// Export the data collections 
window.OklahomaData = {
  counties: OKLAHOMA_COUNTIES,
  jails: OKLAHOMA_JAILS
};
