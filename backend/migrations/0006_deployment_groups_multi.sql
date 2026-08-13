-- Deployment grupe postaju odvojena lista od groups_list (koja ostaje samo
-- za "Odeljenje" na Home-u) i agent sad može imati VIŠE deployment grupa
-- (umesto jedne skalarne vrednosti) - pogađa auto-update targeting, koji se
-- menja da gleda presek agent-ovih grupa i grupa koje release cilja.

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

-- Svaki agent zadržava svoju trenutnu (jedinu) deployment grupu kao prvi
-- unos u novom multi-value sistemu - "rest" isti podrazumevani fallback
-- kao stari `agent.deploymentGroup || "rest"` u kodu.
INSERT IGNORE INTO agent_deployment_groups (agent_id, group_name)
SELECT id, COALESCE(NULLIF(TRIM(deployment_group), ''), 'rest') FROM agents;

ALTER TABLE agents DROP COLUMN deployment_group;
