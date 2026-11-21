import dgram from "dgram";

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// Standard magic packet: 6 bytes 0xFF, then the target MAC address repeated 16
// times. Independent of the port it arrives on - the WoL listener on the NIC only looks at
// the packet contents, not the destination port (9 is the usual convention, also used
// by the "wakeonlan"/"wol" CLI tools).
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

// Sends the magic packet as a UDP broadcast - it must go to the broadcast address
// of the target machine's LOCAL segment (a magic packet isn't routed across
// subnets/sites without a dedicated relay on the other side).
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
