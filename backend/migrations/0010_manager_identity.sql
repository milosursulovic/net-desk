CREATE TABLE managers (
  id INT NOT NULL AUTO_INCREMENT,
  manager_uid CHAR(36) NOT NULL,
  api_key_hash CHAR(64) NOT NULL,
  ip_entry_id INT NULL,
  hostname VARCHAR(255) NULL,
  manager_version VARCHAR(50) NULL,
  status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
  last_ip VARCHAR(45) NULL,
  last_heartbeat_at TIMESTAMP NULL,
  netdesk_agent_service_status VARCHAR(20) NULL,
  netdesk_agent_start_mode VARCHAR(20) NULL,
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_managers_manager_uid (manager_uid),
  KEY idx_managers_ip_entry (ip_entry_id),
  CONSTRAINT fk_managers_ip_entry FOREIGN KEY (ip_entry_id) REFERENCES ip_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE manager_jobs (
  id INT NOT NULL AUTO_INCREMENT,
  manager_id INT NOT NULL,
  command_type ENUM('start_service', 'stop_service', 'restart_service', 'set_service_start_mode', 'install_update') NOT NULL,
  payload TEXT NULL,
  status ENUM('pending', 'sent', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_by_user_id INT NULL,
  exit_code INT NULL,
  output TEXT NULL,
  error_output TEXT NULL,
  duration_ms INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_manager_jobs_manager_status (manager_id, status),
  CONSTRAINT fk_manager_jobs_manager FOREIGN KEY (manager_id) REFERENCES managers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
