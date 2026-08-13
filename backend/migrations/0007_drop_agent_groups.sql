-- agent_groups (arhitektura x86/x64 + proizvoljni ručni tagovi, odvojeno od
-- deployment grupa) je odbačen kao ideja - jedino deployment grupe imaju
-- ulogu za agente, pa se ovo potpuno uklanja.
DROP TABLE IF EXISTS agent_groups;

-- 0005_agent_groups.sql je greškom ubacio 'x86'/'x64' u groups_list
-- (department listu na Home-u) - čisti se samo ako ih niko ne koristi kao
-- odeljenje (isti uslov kao app-level zaštita od brisanja grupe u upotrebi).
DELETE FROM groups_list
WHERE name IN ('x86', 'x64')
  AND name NOT IN (
    SELECT DISTINCT department COLLATE utf8mb4_general_ci
    FROM ip_entries
    WHERE department IS NOT NULL AND department != ''
  );
