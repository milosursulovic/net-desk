-- Akt o bezbednosti informacionih sistema: zabrana samoinicijativnog
-- preuzimanja ekrana. Pre nego sto agent uopste digne VNC most, korisnik na
-- radnoj stanici mora aktivno da odobri sesiju, a ceo dogadjaj mora ostaviti
-- neizbrisiv audit trag (ime IKT radnika, ime odobravaoca, start/end vreme,
-- IP i MAC obe radne stanice). Radni/mutable deo stanja zivi ovde na
-- vnc_sessions redu; trajni neizbrisivi trag ide u activity_log (append-only).

-- consent_status: tok je pending -> (granted | denied | timeout | unavailable).
--   granted      = korisnik kliknuo "Da" u prozoru za pristanak
--   denied       = korisnik kliknuo "Ne"
--   timeout      = prozor istekao bez odgovora
--   unavailable  = nema aktivne konzolne (prijavljene) sesije kojoj se prikaze
-- Svaki ne-granted ishod ostavlja sesiju neupotrebljivom (status='rejected').
ALTER TABLE vnc_sessions
  ADD COLUMN consent_status ENUM('pending', 'granted', 'denied', 'timeout', 'unavailable')
    NOT NULL DEFAULT 'pending' AFTER status,
  ADD COLUMN approver_username VARCHAR(255) NULL AFTER consent_status,
  ADD COLUMN consent_at TIMESTAMP NULL DEFAULT NULL AFTER approver_username,
  ADD COLUMN agent_ip VARCHAR(45) NULL AFTER consent_at,
  ADD COLUMN agent_mac VARCHAR(255) NULL AFTER agent_ip,
  ADD COLUMN viewer_ip VARCHAR(45) NULL AFTER agent_mac,
  ADD COLUMN viewer_mac VARCHAR(255) NULL AFTER viewer_ip;

-- 'rejected' je novi terminalni status za sesiju kojoj je pristanak odbijen/
-- istekao/nedostupan - razlikuje se od 'ended' (normalno zavrsena sesija) da
-- izvestaji mogu da razdvoje odbijene pokusaje od odrzanih sesija. Postojece
-- vrednosti ('pending','active','ended') ostaju nepromenjene.
ALTER TABLE vnc_sessions
  MODIFY COLUMN status ENUM('pending', 'active', 'ended', 'rejected')
    NOT NULL DEFAULT 'pending';
