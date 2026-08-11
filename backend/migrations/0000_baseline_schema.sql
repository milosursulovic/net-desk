-- Bazna sema (39 tabela) - generisano preko `mysqldump --no-data --routines --triggers`
-- sa lokalne dev baze. Do 2026-08 su sve tabele nastajale rucno direktno na
-- bazi (bez tracked SQL-a) - migrations/ sistem (schema_migrations tabela,
-- vidi scripts/migrate.js) je uveden tek naknadno, samo za INKREMENTALNE
-- izmene (0001+). Bez ovog fajla, npr. primenom SAMO 0001-0003 na praznu
-- bazu, migracija bi pukla (0001 radi ALTER TABLE ip_entries a ip_entries
-- ne bi ni postojala) - ovaj fajl je zato 0000, sortira se ISPRED njih.
--
-- VAZNO pre stvarnog produkcionog cutover-a: ovo je dump sa DEV baze, ne
-- produkcije - regenerisati isti dump sa PRAVE produkcione baze pre nego
-- sto se ovaj fajl osloni na njega za pravi restore (dev i prod mogu biti
-- blago razisli). Vidi DOCKER.md za tacan mysqldump poziv.
--
-- AUTO_INCREMENT vrednosti su namerno uklonjene iz CREATE TABLE izraza
-- (odrazavale su trenutno stanje podataka u trenutku dump-a, ne deo seme) -
-- nove instalacije krecu od 1, kao i svaka druga fresh baza.
--
-- BEZBEDNOSNA NAPOMENA: mysqldump po difoltu ispred svakog CREATE TABLE
-- stavlja `DROP TABLE IF EXISTS` - te linije su OVDE NAMERNO UKLONJENE, a
-- svaki `CREATE TABLE` prepravljen u `CREATE TABLE IF NOT EXISTS`. Bez ove
-- izmene, pokretanje ovog fajla protiv baze koja VEC ima ove tabele (npr.
-- greskom protiv postojece dev/prod baze) bi obrisalo i ponovo napravilo
-- svaku tabelu - BRISUCI SVE PODATKE. Sa IF NOT EXISTS, ovaj fajl je čist
-- no-op na bazi koja vec ima tabele, i samo gradi semu na praznoj bazi.

/*M!999999\- enable the sandbox mode */ 

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `status_code` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `details` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_activity_log_created_at` (`created_at`),
  KEY `idx_activity_log_user_id` (`user_id`),
  CONSTRAINT `fk_activity_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_jobs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `agent_id` int(11) NOT NULL,
  `batch_id` char(36) DEFAULT NULL,
  `command_type` varchar(50) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `status` enum('pending','sent','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `created_by_user_id` int(11) DEFAULT NULL,
  `exit_code` int(11) DEFAULT NULL,
  `output` mediumtext DEFAULT NULL,
  `error_output` mediumtext DEFAULT NULL,
  `duration_ms` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `sent_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_jobs_agent_status` (`agent_id`,`status`),
  KEY `fk_agent_jobs_created_by` (`created_by_user_id`),
  KEY `idx_agent_jobs_batch_id` (`batch_id`),
  CONSTRAINT `fk_agent_jobs_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_jobs_batch` FOREIGN KEY (`batch_id`) REFERENCES `job_batches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_jobs_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_monitoring` (
  `agent_id` int(11) NOT NULL,
  `cpu_load_pct` decimal(5,2) DEFAULT NULL,
  `ram_load_pct` decimal(5,2) DEFAULT NULL,
  `disk_used_pct` decimal(5,2) DEFAULT NULL,
  `disk_free_gb` decimal(10,2) DEFAULT NULL,
  `network_connected` tinyint(1) DEFAULT NULL,
  `antivirus_status` varchar(50) DEFAULT NULL,
  `firewall_status` varchar(50) DEFAULT NULL,
  `bitlocker_status` varchar(50) DEFAULT NULL,
  `temperature_c` decimal(5,2) DEFAULT NULL,
  `collected_at` datetime DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`agent_id`),
  CONSTRAINT `fk_agent_monitoring_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_monitoring_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `agent_id` int(11) NOT NULL,
  `cpu_load_pct` decimal(5,2) DEFAULT NULL,
  `ram_load_pct` decimal(5,2) DEFAULT NULL,
  `disk_used_pct` decimal(5,2) DEFAULT NULL,
  `disk_free_gb` decimal(10,2) DEFAULT NULL,
  `recorded_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_monitoring_history_agent_time` (`agent_id`,`recorded_at`),
  CONSTRAINT `fk_agent_monitoring_history_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_release_files` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `release_id` int(11) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_release_file` (`release_id`,`file_path`),
  CONSTRAINT `fk_release_file_release` FOREIGN KEY (`release_id`) REFERENCES `agent_releases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_release_groups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `release_id` int(11) NOT NULL,
  `deployment_group` varchar(150) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_release_group` (`release_id`,`deployment_group`),
  CONSTRAINT `fk_release_group_release` FOREIGN KEY (`release_id`) REFERENCES `agent_releases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_releases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` varchar(50) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` int(11) NOT NULL,
  `sha256` char(64) NOT NULL,
  `signature` text DEFAULT NULL,
  `release_notes` text DEFAULT NULL,
  `deployment_group` varchar(150) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_releases_version_group` (`version`,`deployment_group`),
  KEY `idx_agent_releases_group_active` (`deployment_group`,`is_active`),
  KEY `fk_agent_releases_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_agent_releases_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agent_update_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `agent_id` int(11) NOT NULL,
  `from_version` varchar(50) DEFAULT NULL,
  `to_version` varchar(50) DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `reason` text DEFAULT NULL,
  `reported_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_agent_update_log_agent` (`agent_id`),
  CONSTRAINT `fk_agent_update_log_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `agents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `agent_uid` char(36) NOT NULL,
  `api_key_hash` char(64) NOT NULL,
  `ip_entry_id` int(11) DEFAULT NULL,
  `hostname` varchar(255) DEFAULT NULL,
  `os_caption` varchar(255) DEFAULT NULL,
  `os_version` varchar(100) DEFAULT NULL,
  `os_build` varchar(50) DEFAULT NULL,
  `agent_version` varchar(50) DEFAULT NULL,
  `deployment_group` varchar(150) NOT NULL DEFAULT 'rest',
  `process_kill_exempt` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('active','revoked') NOT NULL DEFAULT 'active',
  `last_ip` varchar(45) DEFAULT NULL,
  `last_heartbeat_at` datetime DEFAULT NULL,
  `enrolled_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `service_files_mismatch` tinyint(1) NOT NULL DEFAULT 0,
  `service_files_mismatch_details` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agents_agent_uid` (`agent_uid`),
  KEY `idx_agents_ip_entry_id` (`ip_entry_id`),
  CONSTRAINT `fk_agents_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` varchar(255) NOT NULL,
  `updated_by_user_id` int(11) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`),
  KEY `fk_app_settings_user` (`updated_by_user_id`),
  CONSTRAINT `fk_app_settings_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_available_updates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `kb_id` varchar(50) DEFAULT NULL,
  `title` varchar(500) DEFAULT NULL,
  `severity` varchar(50) DEFAULT NULL,
  `inventory_date` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_computer_available_updates_ip_entry` (`ip_entry_id`),
  CONSTRAINT `fk_computer_available_updates_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_dns_queries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `domain` varchar(255) NOT NULL,
  `first_seen` datetime NOT NULL,
  `last_seen` datetime NOT NULL,
  `query_count` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dns_ip_entry_domain` (`ip_entry_id`,`domain`),
  KEY `idx_dns_domain` (`domain`),
  KEY `idx_dns_last_seen` (`last_seen`),
  CONSTRAINT `fk_dns_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_drivers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `device_name` varchar(255) DEFAULT NULL,
  `driver_version` varchar(100) DEFAULT NULL,
  `driver_date` date DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `driver_provider_name` varchar(255) DEFAULT NULL,
  `inventory_date` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ip_entry_id` (`ip_entry_id`),
  KEY `device_name` (`device_name`),
  KEY `idx_driver_device_version` (`device_name`,`driver_version`),
  KEY `idx_driver_date` (`driver_date`),
  KEY `idx_driver_manufacturer` (`manufacturer`),
  KEY `idx_driver_inventory_date` (`inventory_date`),
  CONSTRAINT `computer_drivers_ibfk_1` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_event_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `log_name` varchar(20) NOT NULL,
  `level` varchar(20) DEFAULT NULL,
  `source` varchar(255) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `logged_at` datetime NOT NULL,
  `received_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_computer_event_logs_dedup` (`ip_entry_id`,`log_name`,`event_id`,`logged_at`,`source`(100)),
  KEY `idx_computer_event_logs_ip_entry` (`ip_entry_id`,`logged_at`),
  CONSTRAINT `fk_computer_event_logs_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_metadata` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `collected_at` datetime DEFAULT NULL,
  `computer_name` varchar(150) DEFAULT NULL,
  `user_name` varchar(150) DEFAULT NULL,
  `os_caption` varchar(200) DEFAULT NULL,
  `os_version` varchar(100) DEFAULT NULL,
  `os_build` varchar(100) DEFAULT NULL,
  `os_install_date` datetime DEFAULT NULL,
  `system_manufacturer` varchar(150) DEFAULT NULL,
  `system_model` varchar(150) DEFAULT NULL,
  `system_total_ram_gb` decimal(10,2) DEFAULT NULL,
  `mb_manufacturer` varchar(150) DEFAULT NULL,
  `mb_product` varchar(150) DEFAULT NULL,
  `mb_serial` varchar(150) DEFAULT NULL,
  `bios_vendor` varchar(150) DEFAULT NULL,
  `bios_version` varchar(150) DEFAULT NULL,
  `bios_release_date` datetime DEFAULT NULL,
  `cpu_name` varchar(255) DEFAULT NULL,
  `cpu_cores` int(11) DEFAULT NULL,
  `cpu_logical_cpus` int(11) DEFAULT NULL,
  `cpu_max_clock_mhz` int(11) DEFAULT NULL,
  `cpu_socket` varchar(255) DEFAULT NULL,
  `psu` varchar(255) DEFAULT NULL,
  `wu_service_status` varchar(50) DEFAULT NULL,
  `wu_last_check_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_computer_metadata_ip_entry` (`ip_entry_id`),
  KEY `idx_cm_collected_at` (`collected_at`),
  KEY `idx_cm_computer_name` (`computer_name`),
  KEY `idx_cm_os_install_date` (`os_install_date`),
  KEY `idx_cm_system_total_ram_gb` (`system_total_ram_gb`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_metadata_gpus` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `metadata_id` int(11) NOT NULL,
  `name` varchar(200) DEFAULT NULL,
  `driver_vers` varchar(100) DEFAULT NULL,
  `vram_gb` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cm_gpus_metadata` (`metadata_id`),
  KEY `idx_cm_gpus_vram_gb` (`vram_gb`),
  CONSTRAINT `fk_cm_gpus_metadata` FOREIGN KEY (`metadata_id`) REFERENCES `computer_metadata` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_metadata_nics` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `metadata_id` int(11) NOT NULL,
  `name` varchar(200) DEFAULT NULL,
  `mac` varchar(50) DEFAULT NULL,
  `speed_mbps` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cm_nics_metadata` (`metadata_id`),
  KEY `idx_cm_nics_speed_mbps` (`speed_mbps`),
  CONSTRAINT `fk_cm_nics_metadata` FOREIGN KEY (`metadata_id`) REFERENCES `computer_metadata` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_metadata_ram_modules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `metadata_id` int(11) NOT NULL,
  `slot` varchar(100) DEFAULT NULL,
  `manufacturer` varchar(150) DEFAULT NULL,
  `part_number` varchar(150) DEFAULT NULL,
  `serial` varchar(150) DEFAULT NULL,
  `capacity_gb` decimal(10,2) DEFAULT NULL,
  `speed_mtps` int(11) DEFAULT NULL,
  `form_factor` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cm_ram_metadata` (`metadata_id`),
  CONSTRAINT `fk_cm_ram_metadata` FOREIGN KEY (`metadata_id`) REFERENCES `computer_metadata` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_metadata_storage` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `metadata_id` int(11) NOT NULL,
  `model` varchar(200) DEFAULT NULL,
  `serial` varchar(150) DEFAULT NULL,
  `firmware` varchar(100) DEFAULT NULL,
  `size_gb` decimal(12,2) DEFAULT NULL,
  `media_type` varchar(100) DEFAULT NULL,
  `bus_type` varchar(100) DEFAULT NULL,
  `device_id` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cm_storage_metadata` (`metadata_id`),
  KEY `idx_cm_storage_media_type` (`media_type`),
  KEY `idx_cm_storage_size_gb` (`size_gb`),
  CONSTRAINT `fk_cm_storage_metadata` FOREIGN KEY (`metadata_id`) REFERENCES `computer_metadata` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_printers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `driver_name` varchar(255) DEFAULT NULL,
  `port_name` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `inventory_date` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_computer_printers_ip_entry` (`ip_entry_id`),
  CONSTRAINT `fk_computer_printers_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_process_detections` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `process_name` varchar(255) NOT NULL,
  `first_seen` datetime NOT NULL,
  `last_seen` datetime NOT NULL,
  `detection_count` int(11) NOT NULL DEFAULT 1,
  `kill_count` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_proc_ip_entry_process` (`ip_entry_id`,`process_name`),
  KEY `idx_proc_name` (`process_name`),
  KEY `idx_proc_last_seen` (`last_seen`),
  CONSTRAINT `fk_proc_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_services` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `name` varchar(150) DEFAULT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `state` varchar(50) DEFAULT NULL,
  `start_mode` varchar(50) DEFAULT NULL,
  `start_name` varchar(255) DEFAULT NULL,
  `path_name` text DEFAULT NULL,
  `inventory_date` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ip_entry_id` (`ip_entry_id`),
  KEY `name` (`name`),
  KEY `idx_service_state_mode` (`state`,`start_mode`),
  KEY `idx_service_inventory_date` (`inventory_date`),
  CONSTRAINT `computer_services_ibfk_1` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_software` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `display_version` varchar(100) DEFAULT NULL,
  `publisher` varchar(255) DEFAULT NULL,
  `install_date` date DEFAULT NULL,
  `inventory_date` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ip_entry_id` (`ip_entry_id`),
  KEY `display_name` (`display_name`),
  KEY `idx_software_name_version` (`display_name`,`display_version`),
  KEY `idx_software_publisher` (`publisher`),
  KEY `idx_software_inventory_date` (`inventory_date`),
  CONSTRAINT `computer_software_ibfk_1` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `computer_updates` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `description` varchar(100) DEFAULT NULL,
  `hotfix_id` varchar(50) DEFAULT NULL,
  `installed_on` date DEFAULT NULL,
  `installed_by` varchar(255) DEFAULT NULL,
  `inventory_date` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ip_entry_id` (`ip_entry_id`),
  KEY `hotfix_id` (`hotfix_id`),
  KEY `idx_update_installed_on` (`installed_on`),
  KEY `idx_update_hotfix_installed` (`hotfix_id`,`installed_on`),
  KEY `idx_update_inventory_date` (`inventory_date`),
  CONSTRAINT `computer_updates_ibfk_1` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `daily_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `site` enum('bolnica','dom_zdravlja') NOT NULL DEFAULT 'bolnica',
  `period_start` datetime NOT NULL,
  `period_end` datetime NOT NULL,
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`content`)),
  `opened_at` datetime DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `flagged_domains` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `domain` varchar(255) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_flagged_domain` (`domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `flagged_drivers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `device_name` varchar(255) NOT NULL,
  `driver_provider_name` varchar(255) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_flagged_drivers_user` (`created_by_user_id`),
  CONSTRAINT `fk_flagged_drivers_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `flagged_services` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_flagged_services_user` (`created_by_user_id`),
  CONSTRAINT `fk_flagged_services_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `flagged_software` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `display_name` varchar(255) NOT NULL,
  `publisher` varchar(255) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_flagged_software_user` (`created_by_user_id`),
  CONSTRAINT `fk_flagged_software_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('motherboard','cpu','ram','hdd','ssd','psu','gpu','nic','case','other','router','switch','access-point','cable-network','cable-power','cable-hdmi','connector-rj45','tester-network','keyboard','mouse') NOT NULL,
  `manufacturer` varchar(150) DEFAULT NULL,
  `model` varchar(200) NOT NULL,
  `serial_number` varchar(200) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `status` enum('available','in-use','reserved','faulty') NOT NULL DEFAULT 'available',
  `capacity` varchar(100) DEFAULT NULL,
  `speed` varchar(100) DEFAULT NULL,
  `socket` varchar(100) DEFAULT NULL,
  `location` varchar(200) DEFAULT NULL,
  `site` enum('bolnica','dom_zdravlja') DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inventory_items_type` (`type`),
  KEY `idx_inventory_status` (`status`),
  KEY `idx_inventory_items_site` (`site`),
  CONSTRAINT `chk_inventory_items_quantity_min` CHECK (`quantity` >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `ip_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `ip_numeric` bigint(20) NOT NULL,
  `computer_name` varchar(150) DEFAULT NULL,
  `rdp_app` varchar(255) DEFAULT NULL,
  `os` varchar(255) DEFAULT NULL,
  `department` varchar(150) DEFAULT NULL,
  `site` enum('bolnica','dom_zdravlja') DEFAULT NULL,
  `entry_type` varchar(20) DEFAULT NULL,
  `metadata_id` int(11) DEFAULT NULL,
  `is_online` tinyint(1) NOT NULL DEFAULT 0,
  `last_checked` datetime DEFAULT NULL,
  `last_status_change` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `description` text DEFAULT NULL,
  `pending_repack` tinyint(1) NOT NULL DEFAULT 0,
  `os_architecture` varchar(20) DEFAULT NULL,
  `has_izvolte_folder` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ip_entries_ip` (`ip`),
  UNIQUE KEY `uq_ip_entries_ip_numeric` (`ip_numeric`),
  UNIQUE KEY `uq_ip_entries_metadata` (`metadata_id`),
  KEY `idx_ip_entries_department` (`department`),
  KEY `idx_ip_entries_computer_name` (`computer_name`),
  KEY `idx_ip_entries_is_online_last_status` (`is_online`,`last_status_change`),
  KEY `idx_ip_entries_entry_type` (`entry_type`),
  KEY `idx_ip_entries_site` (`site`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `ip_status_history` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `ip_entry_id` int(11) NOT NULL,
  `is_online` tinyint(1) NOT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ip_status_history_entry` (`ip_entry_id`,`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `job_batches` (
  `id` char(36) NOT NULL,
  `command_type` varchar(50) NOT NULL,
  `created_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_job_batches_user` (`created_by_user_id`),
  CONSTRAINT `fk_job_batches_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `printer_connected_computers` (
  `printer_id` int(11) NOT NULL,
  `ip_entry_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`printer_id`,`ip_entry_id`),
  UNIQUE KEY `uq_printer_ipentry` (`printer_id`,`ip_entry_id`),
  KEY `idx_pcc_ip_entry` (`ip_entry_id`),
  CONSTRAINT `fk_pcc_ip_entry` FOREIGN KEY (`ip_entry_id`) REFERENCES `ip_entries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pcc_printer` FOREIGN KEY (`printer_id`) REFERENCES `printers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `printers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) DEFAULT NULL,
  `manufacturer` varchar(150) DEFAULT NULL,
  `model` varchar(150) DEFAULT NULL,
  `serial` varchar(150) DEFAULT NULL,
  `department` varchar(150) DEFAULT NULL,
  `site` enum('bolnica','dom_zdravlja') DEFAULT NULL,
  `connection_type` enum('USB','Network','Other') NOT NULL DEFAULT 'Network',
  `ip` varchar(45) DEFAULT NULL,
  `ip_numeric` bigint(20) DEFAULT NULL,
  `shared` tinyint(1) NOT NULL DEFAULT 0,
  `host_computer_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_printers_serial` (`serial`),
  KEY `idx_printers_name` (`name`),
  KEY `idx_printers_department` (`department`),
  KEY `idx_printers_ip_numeric` (`ip_numeric`),
  KEY `idx_printers_ip_numeric_name` (`ip_numeric`,`name`),
  KEY `idx_printers_host_computer` (`host_computer_id`),
  KEY `idx_printers_site` (`site`),
  CONSTRAINT `fk_printers_host_computer` FOREIGN KEY (`host_computer_id`) REFERENCES `ip_entries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `endpoint` varchar(512) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_subscriptions_endpoint` (`endpoint`),
  KEY `fk_push_subscriptions_user` (`user_id`),
  CONSTRAINT `fk_push_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `server_monitoring_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `recorded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `cpu_load_pct` decimal(5,2) DEFAULT NULL,
  `ram_used_pct` decimal(5,2) DEFAULT NULL,
  `ram_used_mb` int(11) DEFAULT NULL,
  `ram_total_mb` int(11) DEFAULT NULL,
  `disk_used_pct` decimal(5,2) DEFAULT NULL,
  `process_rss_mb` int(11) DEFAULT NULL,
  `process_heap_used_mb` int(11) DEFAULT NULL,
  `db_threads_connected` int(11) DEFAULT NULL,
  `requests_per_min` int(11) DEFAULT NULL,
  `avg_response_ms` decimal(10,2) DEFAULT NULL,
  `error_rate_pct` decimal(5,2) DEFAULT NULL,
  `db_size_mb` decimal(10,2) DEFAULT NULL,
  `avg_query_ms` decimal(10,2) DEFAULT NULL,
  `p95_response_ms` decimal(10,2) DEFAULT NULL,
  `p99_response_ms` decimal(10,2) DEFAULT NULL,
  `mariadb_cpu_pct` decimal(5,2) DEFAULT NULL,
  `mariadb_mem_mb` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_server_monitoring_recorded_at` (`recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','operator','viewer') NOT NULL DEFAULT 'viewer',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `vnc_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `agent_id` int(11) NOT NULL,
  `requested_by_user_id` int(11) DEFAULT NULL,
  `status` enum('pending','active','ended') NOT NULL DEFAULT 'pending',
  `started_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `ended_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_vnc_sessions_agent` (`agent_id`),
  KEY `fk_vnc_sessions_user` (`requested_by_user_id`),
  CONSTRAINT `fk_vnc_sessions_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vnc_sessions_user` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

