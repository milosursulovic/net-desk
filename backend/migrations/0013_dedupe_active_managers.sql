-- Regresija: enrollManager (services/managers.service.js) nikad nije
-- revocirao prethodnu 'active' registraciju za isti ip_entry_id pre nego
-- što upiše novu, pa je svako ponovno enroll-ovanje iste mašine (Manager
-- servis se re-enroll-uje kad god izgubi svoje kredencijale - reinstall/
-- reprovizovanje) ostavljalo staru registraciju zauvek 'active'. Otud
-- listAgents-ov LEFT JOIN na managers (agents.repo.js) duplira red agenta u
-- listi za svaku mašinu sa 2+ aktivna managers reda - uživo potvrđeno na
-- najnovije upisanim agentima. Kod je popravljen (revokeOtherActiveManagers
-- se sad zove posle svakog enroll-a); ovo je jednokratno čišćenje već
-- nagomilanih duplikata - zadržava najnoviji (najveći id) 'active' red po
-- ip_entry_id, ostale prebacuje u 'revoked' (isti status koji bi normalan
-- re-enroll proizveo).
UPDATE managers m
JOIN (
  SELECT ip_entry_id, MAX(id) AS keep_id
  FROM managers
  WHERE status = 'active' AND ip_entry_id IS NOT NULL
  GROUP BY ip_entry_id
) keep ON keep.ip_entry_id = m.ip_entry_id
SET m.status = 'revoked'
WHERE m.status = 'active' AND m.id <> keep.keep_id;
