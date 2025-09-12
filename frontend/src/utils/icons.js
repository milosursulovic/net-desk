export const getFieldIcon = (name) => {
  const icons = {
    ip: '🌐',
    computerName: '🖥️',
    username: '👤',
    fullName: '🙍‍♂️',
    password: '🔒',
    rdp: '🖧',
    dnsLog: '🌐',
    anyDesk: '💻',
    system: '🧩',
    department: '🏢',
  }
  return icons[name] || '📄'
}
