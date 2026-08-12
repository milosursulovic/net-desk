CREATE TABLE groups_list (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_groups_list_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO groups_list (name)
SELECT DISTINCT department FROM ip_entries WHERE department IS NOT NULL AND department != '';

INSERT IGNORE INTO groups_list (name)
SELECT DISTINCT deployment_group FROM agents WHERE deployment_group IS NOT NULL AND deployment_group != '';
