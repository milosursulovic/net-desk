-- agent_groups (x86/x64 architecture + arbitrary manual tags, separate from
-- deployment groups) was dropped as an idea - only deployment groups play a
-- role for agents, so this is removed entirely.
DROP TABLE IF EXISTS agent_groups;

-- 0005_agent_groups.sql mistakenly inserted 'x86'/'x64' into groups_list
-- (the department list on Home) - cleaned up only if nobody uses them as a
-- department (same condition as the app-level guard against deleting a group in use).
DELETE FROM groups_list
WHERE name IN ('x86', 'x64')
  AND name NOT IN (
    SELECT DISTINCT department COLLATE utf8mb4_general_ci
    FROM ip_entries
    WHERE department IS NOT NULL AND department != ''
  );
