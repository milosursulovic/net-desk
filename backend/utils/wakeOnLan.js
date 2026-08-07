import dgram from "dgram";

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// Standard magic packet: 6 bytes 0xFF, zatim ciljna MAC adresa ponovljena 16
// puta. Nezavisno od porta na koji stiže - WoL listener na NIC-u gleda samo
// sadržaj paketa, ne odredišni port (9 je uobičajena konvencija, koristi je
// i "wakeonlan"/"wol" CLI alati).
function buildMagicPacket(mac) {
  if (!MAC_RE.test(mac)) {
    throw new Error(`Neispravna MAC adresa: ${mac}`);
  }

  const macBytes = Buffer.from(mac.replace(/[:-]/g, ""), "hex");
  const packet = Buffer.alloc(6 + 16 * 6);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6);
  }
  return packet;
}

// Šalje magic packet kao UDP broadcast - mora ići na broadcast adresu
// LOKALNOG segmenta ciljne mašine (magic packet se ne rutira preko
// podmreža/lokacija bez posebnog releja na drugoj strani).
export function sendMagicPacket(mac, broadcastAddress, port = 9) {
  return new Promise((resolve, reject) => {
    let packet;
    try {
      packet = buildMagicPacket(mac);
    } catch (err) {
      reject(err);
      return;
    }

    const socket = dgram.createSocket("udp4");
    socket.once("error", (err) => {
      socket.close();
      reject(err);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcastAddress, (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
