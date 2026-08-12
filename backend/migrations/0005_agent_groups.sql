CREATE TABLE agent_groups (
  agent_id INT NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  PRIMARY KEY (agent_id, group_name),
  CONSTRAINT fk_agent_groups_agent FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO groups_list (name) VALUES ('x86'), ('x64');
