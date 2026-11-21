-- Deployment groups become a list separate from groups_list (which stays only
-- for "Odeljenje" (department) on Home) and an agent can now have SEVERAL
-- deployment groups (instead of one scalar value) - affects auto-update
-- targeting, which changes to look at the intersection of the agent's groups
-- and the groups a release targets.

CREATE TABLE deployment_groups_list (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deployment_groups_list_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO deployment_groups_list (name) VALUES ('test'), ('it'), ('pilot'), ('rest');

INSERT IGNORE INTO deployment_groups_list (name)
SELECT DISTINCT deployment_group FROM agents WHERE deployment_group IS NOT NULL AND deployment_group != '';

INSERT IGNORE INTO deployment_groups_list (name)
SELECT DISTINCT deployment_group FROM agent_release_groups;

CREATE TABLE agent_deployment_groups (
  agent_id INT NOT NULL,
  group_name VARCHAR(150) NOT NULL,
  PRIMARY KEY (agent_id, group_name),
  CONSTRAINT fk_agent_deployment_groups_agent FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Every agent keeps its current (single) deployment group as the first entry
-- in the new multi-value system - "rest" is the same default fallback as the
-- old `agent.deploymentGroup || "rest"` in code.
INSERT IGNORE INTO agent_deployment_groups (agent_id, group_name)
SELECT id, COALESCE(NULLIF(TRIM(deployment_group), ''), 'rest') FROM agents;

ALTER TABLE agents DROP COLUMN deployment_group;
