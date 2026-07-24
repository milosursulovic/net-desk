// Mora da se poklapa sa backend-ovim COMMAND_TYPES (dtos/agentJobs.dto.js).
export const COMMAND_TYPES = [
  'restart_computer',
  'shutdown_computer',
  'logoff_user',
  'restart_service',
  'start_service',
  'stop_service',
  'run_powershell_script',
  'collect_inventory',
  'refresh_software_list',
  'delete_temp_files',
]

export const COMMAND_LABELS = {
  restart_computer: 'Restart računara',
  shutdown_computer: 'Gašenje računara',
  logoff_user: 'Odjava korisnika',
  restart_service: 'Restart servisa',
  start_service: 'Pokretanje servisa',
  stop_service: 'Zaustavljanje servisa',
  run_powershell_script: 'PowerShell skripta',
  collect_inventory: 'Prikupljanje inventara',
  refresh_software_list: 'Osvežavanje softverske liste',
  delete_temp_files: 'Brisanje privremenih fajlova',
}

export const SERVICE_COMMANDS = new Set(['restart_service', 'start_service', 'stop_service'])
