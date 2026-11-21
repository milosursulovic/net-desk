-- Per-computer exceptions for "unwanted" software/services/drivers - the admin
-- can say "this is NOT unwanted on THIS computer" without deleting the global
-- flag (which still applies to every other computer). One table per flagged_*
-- table (not one polymorphic table) - same reason flagged_software/services/
-- drivers already exist as three separate tables rather than one with a "kind" column.
-- Same junction-table pattern as agent_deployment_groups (0006), just without a
-- surrogate id - the composite PK serves as both uniqueness and FK.

CREATE TABLE flagged_software_exceptions (
  flagged_software_id INT NOT NULL,
  ip_entry_id INT NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (flagged_software_id, ip_entry_id),
  CONSTRAINT fk_fse_flagged FOREIGN KEY (flagged_software_id) REFERENCES flagged_software (id) ON DELETE CASCADE,
  CONSTRAINT fk_fse_ip_entry FOREIGN KEY (ip_entry_id) REFERENCES ip_entries (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE flagged_services_exceptions (
  flagged_service_id INT NOT NULL,
  ip_entry_id INT NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (flagged_service_id, ip_entry_id),
  CONSTRAINT fk_fsve_flagged FOREIGN KEY (flagged_service_id) REFERENCES flagged_services (id) ON DELETE CASCADE,
  CONSTRAINT fk_fsve_ip_entry FOREIGN KEY (ip_entry_id) REFERENCES ip_entries (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE flagged_drivers_exceptions (
  flagged_driver_id INT NOT NULL,
  ip_entry_id INT NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (flagged_driver_id, ip_entry_id),
  CONSTRAINT fk_fde_flagged FOREIGN KEY (flagged_driver_id) REFERENCES flagged_drivers (id) ON DELETE CASCADE,
  CONSTRAINT fk_fde_ip_entry FOREIGN KEY (ip_entry_id) REFERENCES ip_entries (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
