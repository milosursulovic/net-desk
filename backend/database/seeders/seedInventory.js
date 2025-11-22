import mongoose from "mongoose";
import dotenv from "dotenv";
import InventoryItem from "../../models/InventoryItem.js";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/inventorydb";

const data = [
  {
    type: "motherboard",
    manufacturer: "ASUS",
    model: "P8H61-M LX3",
    serialNumber: "MB-ASUS-001",
    quantity: 3,
    socket: "LGA1155 / mATX",
    location: "Magacin 1 – polica A",
    notes: "Testirano 2024-11, ispravne.",
  },
  {
    type: "motherboard",
    manufacturer: "Gigabyte",
    model: "GA-H81M-S2H",
    serialNumber: "MB-GIGA-002",
    quantity: 2,
    socket: "LGA1150 / mATX",
    location: "Magacin 1 – polica B",
    notes: "Rezervisano za nove kancelarijske PC-eve.",
  },
  {
    type: "cpu",
    manufacturer: "Intel",
    model: "Core i5-4570",
    serialNumber: "CPU-INTEL-4570-01",
    quantity: 4,
    speed: "3.2 GHz (3.6 GHz Turbo)",
    socket: "LGA1150",
    location: "Magacin 2 – kutija CPU",
  },
  {
    type: "cpu",
    manufacturer: "AMD",
    model: "Ryzen 5 2600",
    serialNumber: "CPU-AMD-R5-2600-01",
    quantity: 1,
    speed: "3.4 GHz (3.9 GHz Turbo)",
    socket: "AM4",
    location: "IT kancelarija – fioka 1",
  },
  {
    type: "ram",
    manufacturer: "Kingston",
    model: "HyperX Fury",
    serialNumber: "RAM-KHX-8G-1600-01",
    quantity: 6,
    capacity: "8 GB",
    speed: "1600 MHz",
    socket: "DDR3 DIMM",
    location: "Magacin 2 – fioka RAM",
  },
  {
    type: "ram",
    manufacturer: "Crucial",
    model: "Ballistix Sport LT",
    serialNumber: "RAM-CRU-8G-2666-01",
    quantity: 2,
    capacity: "8 GB",
    speed: "2666 MHz",
    socket: "DDR4 DIMM",
    location: "Magacin 2 – fioka RAM",
  },
  {
    type: "hdd",
    manufacturer: "Seagate",
    model: "ST1000DM010",
    serialNumber: "HDD-SEA-1TB-01",
    quantity: 5,
    capacity: "1 TB",
    speed: "7200 rpm",
    socket: '3.5" SATA',
    location: "Magacin 1 – kutija HDD",
    notes: "Dva komada imaju 30k+ sati rada (SMART).",
  },
  {
    type: "hdd",
    manufacturer: "Western Digital",
    model: "WD20EFRX Red",
    serialNumber: "HDD-WD-2TB-01",
    quantity: 2,
    capacity: "2 TB",
    speed: "5400 rpm",
    socket: '3.5" SATA',
    location: "Server soba – polica NAS",
  },
  {
    type: "ssd",
    manufacturer: "Samsung",
    model: "860 EVO",
    serialNumber: "SSD-SAM-500-01",
    quantity: 3,
    capacity: "500 GB",
    socket: '2.5" SATA',
    location: "IT kancelarija – ormar",
    notes: "SMART warning – ne koristiti za produkciju.",
  },
  {
    type: "ssd",
    manufacturer: "Kingston",
    model: "A400",
    serialNumber: "SSD-KING-240-01",
    quantity: 4,
    capacity: "240 GB",
    socket: '2.5" SATA',
    location: "Magacin 1 – kutija SSD",
  },

  {
    type: "router",
    manufacturer: "MikroTik",
    model: "RB3011UiAS-RM",
    serialNumber: "RT-MT-3011-01",
    quantity: 2,
    speed: "10x Gbps portova",
    socket: "Rack 1U",
    location: "Server soba – rack 1",
  },
  {
    type: "switch",
    manufacturer: "Cisco",
    model: "Catalyst 2960G-24TC-L",
    serialNumber: "SW-CIS-2960-01",
    quantity: 3,
    capacity: "24 porta",
    speed: "1 Gbps",
    socket: "Rack 1U",
    location: "Server soba – rack 2",
  },
  {
    type: "access-point",
    manufacturer: "Ubiquiti",
    model: "UniFi AP AC Lite",
    serialNumber: "AP-UBNT-ACL-01",
    quantity: 5,
    speed: "AC1200",
    location: "Magacin – kutija WiFi",
  },

  {
    type: "cable-network",
    manufacturer: "Digitus",
    model: "Cat6 UTP Patch",
    quantity: 20,
    capacity: "3 m",
    speed: "1/10 Gbps",
    socket: "RJ45",
    location: "Magacin – kutija LAN kablova",
  },
  {
    type: "cable-power",
    manufacturer: "Generic",
    model: "IEC C13",
    quantity: 30,
    capacity: "1.8 m",
    socket: "Schuko–C13",
    location: "Magacin – polica napojni kablovi",
  },
  {
    type: "cable-hdmi",
    manufacturer: "Delock",
    model: "HDMI 2.0",
    quantity: 10,
    capacity: "2 m",
    speed: "4K@60Hz",
    socket: "HDMI",
    location: "Magacin – kutija video kablova",
  },

  {
    type: "connector-rj45",
    manufacturer: "Legrand",
    model: "RJ45 Cat6",
    quantity: 200,
    speed: "Cat6",
    socket: "RJ45",
    location: "Magacin – fioka konektori",
  },
  {
    type: "tester-network",
    manufacturer: "Fluke",
    model: "LinkRunner AT2000",
    serialNumber: "TEST-FLUKE-AT2K-01",
    quantity: 1,
    speed: "Gigabit / PoE test",
    socket: "RJ45",
    location: "IT kancelarija – ormar sa alatima",
  },

  {
    type: "keyboard",
    manufacturer: "Logitech",
    model: "K120",
    quantity: 25,
    socket: "USB",
    location: "Magacin – kutija tastature",
  },
  {
    type: "mouse",
    manufacturer: "Logitech",
    model: "B100",
    quantity: 25,
    socket: "USB",
    location: "Magacin – kutija miševi",
  },
];

async function seed() {
  try {
    console.log("Povezivanje na Mongo...");
    await mongoose.connect(MONGO_URI);

    console.log("Brišem postojeće stavke...");
    await InventoryItem.deleteMany({});

    console.log("Ubacujem test podatke...");
    await InventoryItem.insertMany(data);

    console.log("Seeder završen!");
  } catch (err) {
    console.error("Greška:", err);
  } finally {
    mongoose.connection.close();
  }
}

seed();
