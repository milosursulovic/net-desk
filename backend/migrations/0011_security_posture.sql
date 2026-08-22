ALTER TABLE ip_entries
  ADD COLUMN trusted_root_cert_installed TINYINT(1) NULL,
  ADD COLUMN intermediate_cert_installed TINYINT(1) NULL,
  ADD COLUMN secure_dns_disabled TINYINT(1) NULL;
