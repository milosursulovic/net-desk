-- Izuzeci po računaru za "neželjen" softver/servis/drajver - admin može da
-- kaže "ovo NIJE neželjeno na OVOM računaru" bez brisanja globalnog flag-a
-- (koji i dalje važi za sve ostale). Jedna tabela po flagged_* tabeli (ne
-- jedna polimorfna) - isti razlog kao zašto flagged_software/services/
-- drivers već postoje kao tri odvojene tabele, ne jedna sa "kind" kolonom.
-- Isti obrazac junction tabele kao agent_deployment_groups (0006), samo bez
-- surogat id-ja - kompozitni PK je i jedinstvenost i FK.

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
