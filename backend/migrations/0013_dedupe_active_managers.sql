-- Regression: enrollManager (services/managers.service.js) never revoked the
-- previous 'active' registration for the same ip_entry_id before writing a
-- new one, so every re-enroll of the same machine (the Manager service
-- re-enrolls whenever it loses its credentials - reinstall/reprovisioning)
-- left the old registration 'active' forever. Hence listAgents's LEFT JOIN
-- on managers (agents.repo.js) duplicated the agent's row in the list for
-- every machine with 2+ active managers rows - confirmed live on the most
-- recently written agents. The code is fixed (revokeOtherActiveManagers is
-- now called after every enroll); this is a one-off cleanup of the
-- duplicates already accumulated - it keeps the newest (highest id) 'active'
-- row per ip_entry_id and moves the rest to 'revoked' (the same status a
-- normal re-enroll would produce).
UPDATE managers m
JOIN (
  SELECT ip_entry_id, MAX(id) AS keep_id
  FROM managers
  WHERE status = 'active' AND ip_entry_id IS NOT NULL
  GROUP BY ip_entry_id
) keep ON keep.ip_entry_id = m.ip_entry_id
SET m.status = 'revoked'
WHERE m.status = 'active' AND m.id <> keep.keep_id;
