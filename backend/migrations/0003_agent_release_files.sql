CREATE TABLE agent_release_files (
  id INT NOT NULL AUTO_INCREMENT,
  release_id INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_release_file (release_id, file_path),
  CONSTRAINT fk_release_file_release FOREIGN KEY (release_id) REFERENCES agent_releases (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE agents ADD COLUMN service_files_mismatch TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN service_files_mismatch_details TEXT NULL;
